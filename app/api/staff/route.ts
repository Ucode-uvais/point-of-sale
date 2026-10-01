//route.ts from app/api/staff
import type { Prisma, ShopRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireStaffManagement } from "@/lib/authz";
import { apiErrorResponse } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { hashPassword } from "@/lib/auth/password";
import { staffCreateSchema } from "@/lib/auth/validation";
import { prisma } from "@/lib/prisma";
import { serializeStaffListItem } from "@/lib/serializers/staff";
import {
  canManageStaffTargetRole,
  getManagedShops,
  getStaffManagementRoleForShop,
} from "@/lib/staff";

export async function GET(request: Request) {
  try {
    const { userId } = await requireStaffManagement();
    const url = new URL(request.url);
    const query = url.searchParams.get("query")?.trim() ?? "";
    const requestedRole = url.searchParams.get("role")?.trim() ?? "";
    const role: ShopRole | null =
      requestedRole === "ADMIN" ||
      requestedRole === "MANAGER" ||
      requestedRole === "CASHIER"
        ? requestedRole
        : null;
    const status = url.searchParams.get("status")?.trim() ?? "";
    const shopId = url.searchParams.get("shopId")?.trim() ?? "";

    const managedShops = await getManagedShops(userId);
    const selectedShops = shopId
      ? managedShops.filter((shop) => shop.id === shopId)
      : managedShops;
    const staffVisibility: Prisma.UserShopWhereInput[] = [];

    for (const shop of selectedShops) {
      if (shop.managementRole === "MANAGER") {
        if (!role || role === "CASHIER") {
          staffVisibility.push({
            shopId: shop.id,
            role: "CASHIER",
          });
        }
        continue;
      }

      staffVisibility.push({
        shopId: shop.id,
        ...(role ? { role } : {}),
      });
    }

    if (!staffVisibility.length) {
      return NextResponse.json({
        items: [],
        shops: managedShops.map((shop) => ({
          id: shop.id,
          name: shop.name,
          slug: shop.slug,
        })),
      });
    }

    const searchFilter: Prisma.UserShopWhereInput | null = query
      ? {
          OR: [
            {
              user: {
                name: {
                  contains: query,
                  mode: "insensitive",
                },
              },
            },
            {
              user: {
                email: {
                  contains: query,
                  mode: "insensitive",
                },
              },
            },
            {
              shop: {
                name: {
                  contains: query,
                  mode: "insensitive",
                },
              },
            },
          ],
        }
      : null;

    const where: Prisma.UserShopWhereInput = {
      AND: [{ OR: staffVisibility }, ...(searchFilter ? [searchFilter] : [])],
      ...(status === "active"
        ? { isActive: true }
        : status === "inactive"
          ? { isActive: false }
          : {}),
    };

    const staffInclude = {
      shop: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          authAuditLogs: {
            where: { action: "LOGIN_SUCCESS" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              action: true,
              createdAt: true,
              ipAddress: true,
              userAgent: true,
            },
          },
        },
      },
    } satisfies Prisma.UserShopInclude;

    const items = await prisma.userShop.findMany({
      where,
      include: staffInclude,
      orderBy: [{ isActive: "desc" }, { assignedAt: "desc" }],
    });

    return NextResponse.json({
      items: items.map((item) => serializeStaffListItem(item)),
      shops: managedShops.map((shop) => ({
        id: shop.id,
        name: shop.name,
        slug: shop.slug,
      })),
    });
  } catch (error) {
    return apiErrorResponse(error, "Unable to load staff.");
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireStaffManagement();
    const body = await request.json();
    const parsed = staffCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid staff details." },
        { status: 400 },
      );
    }

    const managementRole = await getStaffManagementRoleForShop(
      userId,
      parsed.data.shopId,
    );

    if (!managementRole) {
      return NextResponse.json(
        { error: "You do not have access to that shop." },
        { status: 403 },
      );
    }

    if (!canManageStaffTargetRole(managementRole, parsed.data.role)) {
      return NextResponse.json(
        { error: "Managers can only create cashier staff accounts." },
        { status: 403 },
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(parsed.data.password);

    const membership = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: parsed.data.name.trim(),
          email: parsed.data.email,
          passwordHash,
          emailVerifiedAt: new Date(),
          defaultShopId: parsed.data.shopId,
        },
      });

      const createdMembership = await tx.userShop.create({
        data: {
          userId: user.id,
          shopId: parsed.data.shopId,
          role: parsed.data.role,
          isActive: true,
          assignedAt: new Date(),
        },
        include: {
          shop: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              authAuditLogs: {
                where: { action: "LOGIN_SUCCESS" },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                  id: true,
                  action: true,
                  createdAt: true,
                  ipAddress: true,
                  userAgent: true,
                },
              },
            },
          },
        },
      });

      await logActivity({
        tx,
        shopId: createdMembership.shopId,
        userId,
        action: "STAFF_CREATED",
        entityType: "UserShop",
        entityId: createdMembership.id,
        description: `Created staff account for ${createdMembership.user.name ?? createdMembership.user.email}.`,
        metadata: {
          role: createdMembership.role,
          email: createdMembership.user.email,
        },
      });

      return createdMembership;
    });

    return NextResponse.json(
      { item: serializeStaffListItem(membership) },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(error, "Unable to create staff account.");
  }
}

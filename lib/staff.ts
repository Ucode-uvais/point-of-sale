//staff.ts from lib

import { Prisma, ShopRole } from "@prisma/client";
import { hasPermission as membershipHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const STAFF_LOGIN_ACTION = "LOGIN_SUCCESS";

export function canManageStaffTargetRole(
  actorRole: ShopRole,
  targetRole: ShopRole,
) {
  return (
    actorRole === "ADMIN" ||
    (actorRole === "MANAGER" && targetRole === "CASHIER")
  );
}

export type StaffManagementRole = Extract<ShopRole, "ADMIN" | "MANAGER">;

export type ManagedStaffShop = {
  id: string;
  name: string;
  slug: string;
  managementRole: StaffManagementRole;
};

function getMembershipManagementRole(
  role: ShopRole,
  customPermissions: unknown,
): StaffManagementRole | null {
  if (role === "CASHIER") {
    return null;
  }

  return membershipHasPermission(role, customPermissions, "MANAGE_STAFF")
    ? role
    : null;
}

export async function getManagedShops(userId: string) {
  const [ownedShops, memberships] = await Promise.all([
    prisma.shop.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        name: true,
        slug: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.userShop.findMany({
      where: {
        userId,
        isActive: true,
      },
      select: {
        role: true,
        customPermissions: true,
        shop: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: { assignedAt: "asc" },
    }),
  ]);

  const deduped = new Map<string, ManagedStaffShop>();

  for (const membership of memberships) {
    const managementRole = getMembershipManagementRole(
      membership.role,
      membership.customPermissions,
    );

    if (!managementRole) {
      continue;
    }

    const existing = deduped.get(membership.shop.id);
    if (!existing || managementRole === "ADMIN") {
      deduped.set(membership.shop.id, {
        ...membership.shop,
        managementRole,
      });
    }
  }

  // Shop ownership carries admin-level staff-management authority for that shop.
  // Apply it last so an unusual lower-role membership cannot downgrade the owner.
  for (const shop of ownedShops) {
    deduped.set(shop.id, {
      ...shop,
      managementRole: "ADMIN",
    });
  }

  return [...deduped.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export async function getStaffManagementRoleForShop(
  userId: string,
  shopId: string,
): Promise<StaffManagementRole | null> {
  const [ownedShop, membership] = await Promise.all([
    prisma.shop.findFirst({
      where: {
        id: shopId,
        ownerId: userId,
      },
      select: { id: true },
    }),
    prisma.userShop.findFirst({
      where: {
        userId,
        shopId,
        isActive: true,
      },
      select: {
        role: true,
        customPermissions: true,
      },
    }),
  ]);

  if (ownedShop) {
    return "ADMIN";
  }

  if (!membership) {
    return null;
  }

  return getMembershipManagementRole(
    membership.role,
    membership.customPermissions,
  );
}

export async function assertManagedShopAccess(userId: string, shopId: string) {
  return Boolean(await getStaffManagementRoleForShop(userId, shopId));
}

export function formatRoleLabel(role: ShopRole) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

export async function syncUserDefaultShopId(
  tx: Prisma.TransactionClient,
  userId: string,
  preferredShopId?: string | null,
) {
  const [user, activeMemberships] = await Promise.all([
    tx.user.findUnique({
      where: { id: userId },
      select: { defaultShopId: true },
    }),
    tx.userShop.findMany({
      where: {
        userId,
        isActive: true,
      },
      select: { shopId: true },
      orderBy: { assignedAt: "asc" },
    }),
  ]);

  const activeShopIds = new Set(
    activeMemberships.map((membership) => membership.shopId),
  );
  const nextDefaultShopId =
    preferredShopId && activeShopIds.has(preferredShopId)
      ? preferredShopId
      : user?.defaultShopId && activeShopIds.has(user.defaultShopId)
        ? user.defaultShopId
        : (activeMemberships[0]?.shopId ?? null);

  await tx.user.update({
    where: { id: userId },
    data: { defaultShopId: nextDefaultShopId },
  });

  return nextDefaultShopId;
}

export async function countActiveAdmins(
  tx: Prisma.TransactionClient,
  shopId: string,
  excludeMembershipId?: string,
) {
  return tx.userShop.count({
    where: {
      shopId,
      role: "ADMIN",
      isActive: true,
      ...(excludeMembershipId ? { id: { not: excludeMembershipId } } : {}),
    },
  });
}

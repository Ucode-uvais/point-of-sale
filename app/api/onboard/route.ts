import { ShopRole, ShopType } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { onboardSchema } from "@/lib/auth/validation";
import { logActivity } from "@/lib/activity";
import { normalizeText } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import {
  getShopTypeDefaults,
  INVENTORY_REASON_PRESETS,
} from "@/lib/shop-config";
import { sanitizeDefaultPaymentMethods } from "@/lib/shop-settings";
import { slugify } from "@/lib/slug";
import { DEFAULT_UNITS_OF_MEASURE } from "@/lib/uom";

async function uniqueSlug(name: string) {
  const base = slugify(name) || "shop";
  let attempt = base;
  let suffix = 2;

  while (
    await prisma.shop.findUnique({
      where: { slug: attempt },
      select: { id: true },
    })
  ) {
    attempt = `${base}-${suffix++}`;
  }

  return attempt;
}

function uniqueByName<T extends { name: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.name.trim().toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // auth() validates the JWT signature, but a JWT can still refer to a user
    // from a different database after DATABASE_URL is changed. Validate that
    // the session user actually exists in the current database before using
    // the id as Shop.ownerId.
    const owner = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        emailVerifiedAt: true,
        defaultShopId: true,
      },
    });

    if (!owner) {
      return NextResponse.json(
        {
          error:
            "Your session belongs to a user that does not exist in this database. Please sign in again.",
          code: "SESSION_USER_NOT_FOUND",
        },
        { status: 401 },
      );
    }

    if (!owner.emailVerifiedAt) {
      return NextResponse.json(
        {
          error: "Verify your email address before creating your first shop.",
          code: "EMAIL_NOT_VERIFIED",
        },
        { status: 403 },
      );
    }

    const existing = await prisma.userShop.findFirst({
      where: { userId: owner.id },
      include: { shop: true },
      orderBy: { assignedAt: "asc" },
    });

    if (existing) {
      if (!existing.isActive) {
        return NextResponse.json(
          {
            error:
              "Your existing shop membership is inactive. Contact an administrator instead of creating another owner shop.",
            code: "SHOP_ACCESS_INACTIVE",
          },
          { status: 409 },
        );
      }

      if (owner.defaultShopId !== existing.shopId) {
        await prisma.user.update({
          where: { id: owner.id },
          data: { defaultShopId: existing.shopId },
        });
      }

      return NextResponse.json({
        shop: existing.shop,
        alreadyOnboarded: true,
      });
    }

    const body = await request.json();
    const parsed = onboardSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid onboarding data.",
        },
        { status: 400 },
      );
    }

    const slug = await uniqueSlug(parsed.data.shopName);
    const shopTypeDefaults = getShopTypeDefaults(parsed.data.posType);
    const categories = uniqueByName(
      parsed.data.categories.length
        ? parsed.data.categories.map((category) => ({
            name: category.name.trim(),
          }))
        : shopTypeDefaults.starterCategories.map((name) => ({ name })),
    );
    const suppliers = uniqueByName(
      (parsed.data.suppliers.length
        ? parsed.data.suppliers
        : shopTypeDefaults.starterSuppliers
      ).map((supplier) => ({
        ...supplier,
        name: supplier.name.trim(),
      })),
    );
    const products = uniqueByName(
      (parsed.data.products.length
        ? parsed.data.products
        : shopTypeDefaults.starterProducts
      ).map((product) => ({
        ...product,
        name: product.name.trim(),
      })),
    );

    const result = await prisma.$transaction(
      async (tx) => {
        const shop = await tx.shop.create({
          data: {
            name: parsed.data.shopName.trim(),
            legalBusinessName: parsed.data.legalBusinessName.trim(),
            slug,
            posType: parsed.data.posType as ShopType,
            phone: normalizeText(parsed.data.phone),
            email: normalizeText(parsed.data.email),
            address: normalizeText(parsed.data.address),
            taxId: normalizeText(parsed.data.taxId),
            ownerId: owner.id,
          },
        });

        await tx.userShop.create({
          data: {
            userId: owner.id,
            shopId: shop.id,
            role: ShopRole.ADMIN,
            isActive: true,
            assignedAt: new Date(),
          },
        });

        await tx.user.update({
          where: { id: owner.id },
          data: { defaultShopId: shop.id },
        });

        await tx.shopSetting.create({
          data: {
            shopId: shop.id,
            currencyCode: parsed.data.currencyCode.trim().toUpperCase(),
            currencySymbol: parsed.data.currencySymbol.trim(),
            timezone: parsed.data.timezone.trim(),
            taxMode: parsed.data.taxMode,
            taxRate: parsed.data.taxRate,
            defaultPaymentMethods: sanitizeDefaultPaymentMethods(
              parsed.data.defaultPaymentMethods,
            ),
            receiptHeader: normalizeText(parsed.data.receiptHeader),
            receiptFooter: normalizeText(parsed.data.receiptFooter),
            receiptWidth: parsed.data.receiptWidth,
            printerName: normalizeText(parsed.data.printerName),
            printerConnection: parsed.data.printerConnection,
            barcodeScannerNotes: normalizeText(parsed.data.barcodeScannerNotes),
            lowStockThreshold: parsed.data.lowStockThreshold,
            openingFloatRequired: parsed.data.openingFloatRequired,
            openingFloatAmount: parsed.data.openingFloatAmount,
            batchTrackingEnabled: shopTypeDefaults.batchTrackingEnabled,
            expiryTrackingEnabled: shopTypeDefaults.expiryTrackingEnabled,
            fefoEnabled: shopTypeDefaults.fefoEnabled,
            expiryAlertDays: shopTypeDefaults.expiryAlertDays,
            lowStockEnabled: true,
          },
        });

        await tx.unitOfMeasure.createMany({
          data: DEFAULT_UNITS_OF_MEASURE.map((unit) => ({
            shopId: shop.id,
            code: unit.code,
            name: unit.name,
            isBase: unit.isBase,
            isActive: true,
          })),
        });

        const pieceUnit = await tx.unitOfMeasure.findFirstOrThrow({
          where: {
            shopId: shop.id,
            code: "PIECE",
          },
        });

        await tx.inventoryReason.createMany({
          data: INVENTORY_REASON_PRESETS.map((reason) => ({
            shopId: shop.id,
            code: reason.code,
            label: reason.label,
            isActive: true,
          })),
        });

        const categoryMap = new Map<string, string>();

        for (const category of categories) {
          const record = await tx.category.create({
            data: {
              shopId: shop.id,
              name: category.name,
              slug: slugify(category.name) || crypto.randomUUID(),
            },
          });

          categoryMap.set(category.name.toLowerCase(), record.id);
          await logActivity({
            tx,
            shopId: shop.id,
            userId: owner.id,
            action: "CATEGORY_CREATED",
            entityType: "Category",
            entityId: record.id,
            description: `Created onboarding category ${record.name}.`,
          });
        }

        for (const supplier of suppliers) {
          const record = await tx.supplier.create({
            data: {
              shopId: shop.id,
              name: supplier.name,
              contactName: normalizeText(supplier.contactName),
              phone: normalizeText(supplier.phone),
            },
          });

          await logActivity({
            tx,
            shopId: shop.id,
            userId: owner.id,
            action: "SUPPLIER_CREATED",
            entityType: "Supplier",
            entityId: record.id,
            description: `Created onboarding supplier ${record.name}.`,
          });
        }

        for (const product of products) {
          const categoryId = product.categoryName
            ? (categoryMap.get(product.categoryName.toLowerCase()) ?? null)
            : null;

          const record = await tx.product.create({
            data: {
              shopId: shop.id,
              categoryId,
              baseUnitOfMeasureId: pieceUnit.id,
              name: product.name,
              sku: normalizeText(product.sku),
              barcode: normalizeText(product.barcode),
              cost: product.cost,
              price: product.price,
              stockQty: product.stockQty,
              reorderPoint: product.reorderPoint,
              trackBatches:
                product.trackBatches ?? shopTypeDefaults.batchTrackingEnabled,
              trackExpiry:
                product.trackExpiry ?? shopTypeDefaults.expiryTrackingEnabled,
            },
          });

          if (product.stockQty > 0) {
            await tx.inventoryMovement.create({
              data: {
                shopId: shop.id,
                productId: record.id,
                type: "OPENING_STOCK",
                qtyChange: product.stockQty,
                userId: owner.id,
                notes: "Opening stock during onboarding",
              },
            });
          }

          await logActivity({
            tx,
            shopId: shop.id,
            userId: owner.id,
            action: "PRODUCT_CREATED",
            entityType: "Product",
            entityId: record.id,
            description: `Created onboarding product ${record.name}.`,
          });
        }

        await logActivity({
          tx,
          shopId: shop.id,
          userId: owner.id,
          action: "SHOP_ONBOARDED",
          entityType: "Shop",
          entityId: shop.id,
          description: `Completed onboarding for ${shop.name}.`,
        });

        return shop;
      },
      {
        // Prisma interactive transactions default to a 5-second execution
        // timeout. Onboarding performs several dependent writes, and a remote
        // Neon database can legitimately take longer than that. Keep this
        // override scoped to onboarding instead of changing every transaction.
        maxWait: 5_000,
        timeout: 30_000,
      },
    );

    return NextResponse.json({ shop: result }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Unable to complete onboarding." },
      { status: 500 },
    );
  }
}

import { notFound, redirect } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import ProductManager from "@/components/products/ProductManager";
import { getActiveShopContext } from "@/lib/auth/get-active-shop";
import { prisma } from "@/lib/prisma";
import { ensureUnitsOfMeasure } from "@/lib/uom";

type ProductsPageProps = {
  searchParams: Promise<{
    edit?: string | string[];
  }>;
};

export default async function ProductsPage({
  searchParams,
}: ProductsPageProps) {
  const { shopId, permissions } = await getActiveShopContext();
  const canEditProducts = permissions.EDIT_PRODUCTS;
  const canViewPurchaseCosts =
    permissions.VIEW_PURCHASE_COSTS || permissions.EDIT_PRODUCTS;

  if (!canEditProducts) {
    if (canViewPurchaseCosts) {
      redirect("/products/product-list");
    }

    redirect("/dashboard");
  }

  const resolvedSearchParams = await searchParams;
  const rawEditId = resolvedSearchParams.edit;
  const editId = Array.isArray(rawEditId) ? rawEditId[0] : rawEditId;

  const unitsPromise = ensureUnitsOfMeasure(shopId);
  const categoriesPromise = prisma.category.findMany({
    where: { shopId },
    orderBy: [{ parentId: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      parentId: true,
      isActive: true,
    },
  });
  const settingsPromise = prisma.shopSetting.findUnique({ where: { shopId } });
  const productPromise = editId
    ? prisma.product.findFirst({
        where: {
          id: editId,
          shopId,
        },
        include: {
          category: true,
          baseUnitOfMeasure: true,
          uomConversions: {
            include: {
              unitOfMeasure: true,
            },
            orderBy: {
              ratioToBase: "asc",
            },
          },
          variants: {
            orderBy: { createdAt: "asc" },
          },
          images: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          },
          priceHistory: {
            include: {
              changedByUser: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
            orderBy: { effectiveDate: "desc" },
            take: 5,
          },
          costHistory: {
            include: {
              changedByUser: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
            orderBy: { effectiveDate: "desc" },
            take: 5,
          },
        },
      })
    : Promise.resolve(null);

  const [units, categories, settings, product] = await Promise.all([
    unitsPromise,
    categoriesPromise,
    settingsPromise,
    productPromise,
  ]);

  if (editId && !product) {
    notFound();
  }

  const initialProduct = product
    ? {
        ...product,
        cost: canViewPurchaseCosts ? product.cost.toString() : "0",
        price: product.price.toString(),
        baseUnitOfMeasure: product.baseUnitOfMeasure,
        variants: product.variants.map((variant) => ({
          ...variant,
          priceOverride: variant.priceOverride?.toString() ?? null,
          costOverride: canViewPurchaseCosts
            ? (variant.costOverride?.toString() ?? null)
            : null,
          createdAt: variant.createdAt.toISOString(),
          updatedAt: variant.updatedAt.toISOString(),
        })),
        images: product.images.map((image) => ({
          ...image,
          createdAt: image.createdAt.toISOString(),
        })),
        priceHistory: product.priceHistory.map((entry) => ({
          ...entry,
          previousPrice: entry.previousPrice.toString(),
          newPrice: entry.newPrice.toString(),
          effectiveDate: entry.effectiveDate.toISOString(),
          createdAt: entry.createdAt.toISOString(),
        })),
        costHistory: canViewPurchaseCosts
          ? product.costHistory.map((entry) => ({
              ...entry,
              previousCost: entry.previousCost.toString(),
              newCost: entry.newCost.toString(),
              effectiveDate: entry.effectiveDate.toISOString(),
              createdAt: entry.createdAt.toISOString(),
            }))
          : [],
        uomConversions: product.uomConversions.map((conversion) => ({
          id: conversion.id,
          unitOfMeasureId: conversion.unitOfMeasureId,
          ratioToBase: conversion.ratioToBase,
          unitOfMeasure: conversion.unitOfMeasure,
        })),
        batches: [],
      }
    : null;

  return (
    <div className="space-y-6">
      <AppHeader
        title={editId ? "Edit Product" : "Add Product"}
        subtitle={
          editId
            ? "Update product details, pricing, variants, media, and merchandising settings."
            : "Create a product with pricing, variants, media, and inventory defaults."
        }
      />
      <ProductManager
        key={`${shopId}:${editId ?? "new"}`}
        initialProduct={initialProduct}
        categories={categories}
        units={units}
        canEditProducts={canEditProducts}
        canViewPurchaseCosts={canViewPurchaseCosts}
        currencySymbol={settings?.currencySymbol ?? "₱"}
        inventoryDefaults={{
          batchTrackingEnabled: settings?.batchTrackingEnabled ?? false,
          expiryTrackingEnabled: settings?.expiryTrackingEnabled ?? false,
          expiryAlertDays: settings?.expiryAlertDays ?? 30,
        }}
      />
    </div>
  );
}

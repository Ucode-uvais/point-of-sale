import { redirect } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import ProductList from "@/components/products/ProductList";
import { getActiveShopContext } from "@/lib/auth/get-active-shop";
import { prisma } from "@/lib/prisma";

export default async function ProductListPage() {
  const { shopId, permissions } = await getActiveShopContext();
  const canEditProducts = permissions.EDIT_PRODUCTS;
  const canViewPurchaseCosts =
    permissions.VIEW_PURCHASE_COSTS || permissions.EDIT_PRODUCTS;

  if (!canEditProducts && !canViewPurchaseCosts) {
    redirect("/dashboard");
  }

  const [products, categories, settings] = await Promise.all([
    prisma.product.findMany({
      where: { shopId },
      select: {
        id: true,
        categoryId: true,
        sku: true,
        barcode: true,
        name: true,
        description: true,
        cost: true,
        price: true,
        stockQty: true,
        reorderPoint: true,
        isActive: true,
        category: {
          select: {
            id: true,
            name: true,
            parentId: true,
            isActive: true,
          },
        },
        baseUnitOfMeasure: {
          select: {
            id: true,
            name: true,
          },
        },
        uomConversions: {
          select: {
            id: true,
            ratioToBase: true,
            unitOfMeasure: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            ratioToBase: "asc",
          },
        },
        variants: {
          select: {
            id: true,
            color: true,
            size: true,
            flavor: true,
            model: true,
            sku: true,
            barcode: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
        images: {
          select: {
            id: true,
            imageUrl: true,
            altText: true,
          },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          take: 1,
        },
        batches: {
          where: {
            quantity: { gt: 0 },
            expiryDate: { not: null },
          },
          select: {
            id: true,
            expiryDate: true,
          },
          orderBy: {
            expiryDate: "asc",
          },
          take: 1,
        },
        _count: {
          select: {
            variants: true,
            images: true,
            batches: true,
          },
        },
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    }),
    prisma.category.findMany({
      where: { shopId },
      select: {
        id: true,
        name: true,
        parentId: true,
        isActive: true,
      },
      orderBy: [{ parentId: "asc" }, { name: "asc" }],
    }),
    prisma.shopSetting.findUnique({
      where: { shopId },
      select: {
        currencySymbol: true,
        lowStockThreshold: true,
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <AppHeader
        title="Product List"
        subtitle="Browse, search, and manage product catalog records without entering the product editor."
      />

      <ProductList
        key={shopId}
        initialProducts={products.map((product) => ({
          id: product.id,
          categoryId: product.categoryId,
          sku: product.sku,
          barcode: product.barcode,
          name: product.name,
          description: product.description,
          cost: canViewPurchaseCosts ? product.cost.toString() : "0",
          price: product.price.toString(),
          stockQty: product.stockQty,
          reorderPoint: product.reorderPoint,
          isActive: product.isActive,
          category: product.category,
          baseUnitOfMeasure: product.baseUnitOfMeasure,
          uomConversions: product.uomConversions,
          variants: product.variants,
          images: product.images,
          batches: product.batches.map((batch) => ({
            id: batch.id,
            expiryDate: batch.expiryDate?.toISOString() ?? null,
          })),
          variantCount: product._count.variants,
          imageCount: product._count.images,
          batchCount: product._count.batches,
        }))}
        categories={categories}
        canEditProducts={canEditProducts}
        canViewPurchaseCosts={canViewPurchaseCosts}
        currencySymbol={settings?.currencySymbol ?? "₱"}
        lowStockThreshold={settings?.lowStockThreshold ?? 5}
      />
    </div>
  );
}

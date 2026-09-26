import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { productUpdateSchema } from "@/lib/auth/validation";
import { requireAnyPermission, requirePermission } from "@/lib/authz";
import { apiErrorResponse } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { validateAssignableCategory } from "@/lib/category-hierarchy";
import { normalizeText } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import {
  extractLocalProductUploadPaths,
  deleteLocalProductUploads,
} from "@/lib/product-images";
import { ensureUnitsOfMeasure } from "@/lib/uom";

function serializeProduct(
  product: {
    cost: { toString(): string };
    price: { toString(): string };
    createdAt: Date;
    updatedAt: Date;
    variants: Array<{
      priceOverride: { toString(): string } | null;
      costOverride: { toString(): string } | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
    priceHistory: Array<{
      previousPrice: { toString(): string };
      newPrice: { toString(): string };
      effectiveDate: Date;
      createdAt: Date;
    }>;
    costHistory: Array<{
      previousCost: { toString(): string };
      newCost: { toString(): string };
      effectiveDate: Date;
      createdAt: Date;
    }>;
    images: Array<{ createdAt: Date }>;
    batches?: Array<{
      expiryDate: Date | null;
      receivedAt: Date;
      createdAt: Date;
      updatedAt: Date;
    }>;
  },
  { includePurchaseCosts = true }: { includePurchaseCosts?: boolean } = {},
) {
  const { cost, costHistory, variants, batches, ...rest } = product;

  return {
    ...rest,
    ...(includePurchaseCosts ? { cost: cost.toString() } : {}),
    price: product.price.toString(),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    variants: variants.map((variant) => {
      const { costOverride, ...variantRest } = variant;

      return {
        ...variantRest,
        priceOverride: variant.priceOverride?.toString() ?? null,
        ...(includePurchaseCosts
          ? { costOverride: costOverride?.toString() ?? null }
          : {}),
        createdAt: variant.createdAt.toISOString(),
        updatedAt: variant.updatedAt.toISOString(),
      };
    }),
    priceHistory: product.priceHistory.map((entry) => ({
      ...entry,
      previousPrice: entry.previousPrice.toString(),
      newPrice: entry.newPrice.toString(),
      effectiveDate: entry.effectiveDate.toISOString(),
      createdAt: entry.createdAt.toISOString(),
    })),
    ...(includePurchaseCosts
      ? {
          costHistory: costHistory.map((entry) => ({
            ...entry,
            previousCost: entry.previousCost.toString(),
            newCost: entry.newCost.toString(),
            effectiveDate: entry.effectiveDate.toISOString(),
            createdAt: entry.createdAt.toISOString(),
          })),
        }
      : {}),
    images: product.images.map((image) => ({
      ...image,
      createdAt: image.createdAt.toISOString(),
    })),
    ...(batches
      ? {
          batches: batches.map((batch) => ({
            ...batch,
            expiryDate: batch.expiryDate?.toISOString() ?? null,
            receivedAt: batch.receivedAt.toISOString(),
            createdAt: batch.createdAt.toISOString(),
            updatedAt: batch.updatedAt.toISOString(),
          })),
        }
      : {}),
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireAnyPermission([
      "EDIT_PRODUCTS",
      "VIEW_PURCHASE_COSTS",
    ]);
    const { id } = await params;
    const canViewPurchaseCosts =
      context.permissions.VIEW_PURCHASE_COSTS ||
      context.permissions.EDIT_PRODUCTS;

    const product = await prisma.product.findFirst({
      where: {
        id,
        shopId: context.shopId,
      },
      include: {
        category: {
          select: { id: true, name: true },
        },
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
          orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
        },
        images: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
        batches: {
          orderBy: [{ expiryDate: "asc" }, { receivedAt: "desc" }],
        },
        priceHistory: {
          include: {
            changedByUser: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { effectiveDate: "desc" },
          take: 10,
        },
        costHistory: {
          include: {
            changedByUser: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { effectiveDate: "desc" },
          take: 10,
        },
      },
    });

    if (!product) {
      return NextResponse.json(
        { error: "Product not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      product: serializeProduct(product, {
        includePurchaseCosts: canViewPurchaseCosts,
      }),
    });
  } catch (error) {
    return apiErrorResponse(error, "Unable to load product.");
  }
}

const productMutationInclude = {
  category: {
    select: {
      id: true,
      name: true,
    },
  },
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
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { effectiveDate: "desc" },
    take: 5,
  },
  costHistory: {
    include: {
      changedByUser: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { effectiveDate: "desc" },
    take: 5,
  },
} satisfies Prisma.ProductInclude;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { shopId, userId } = await requirePermission("EDIT_PRODUCTS");
    const { id } = await params;
    const body = await request.json();
    const parsed = productUpdateSchema.safeParse({ ...body, id });

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid update." },
        { status: 400 },
      );
    }

    const changedFields = Object.entries(parsed.data)
      .filter(([key, value]) => key !== "id" && value !== undefined)
      .map(([key]) => key);
    const nextIsActive = parsed.data.isActive;
    const isStatusOnlyUpdate =
      changedFields.length === 1 &&
      changedFields[0] === "isActive" &&
      nextIsActive !== undefined;

    if (isStatusOnlyUpdate) {
      const existingStatus = await prisma.product.findFirst({
        where: { id, shopId },
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      });

      if (!existingStatus) {
        return NextResponse.json(
          { error: "Product not found." },
          { status: 404 },
        );
      }

      const updatedProduct = await prisma.$transaction(async (tx) => {
        const product = await tx.product.update({
          where: { id },
          data: { isActive: nextIsActive },
          include: productMutationInclude,
        });

        await logActivity({
          tx,
          shopId,
          userId,
          action:
            existingStatus.isActive !== product.isActive
              ? product.isActive
                ? "PRODUCT_UNARCHIVED"
                : "PRODUCT_ARCHIVED"
              : "PRODUCT_UPDATED",
          entityType: "Product",
          entityId: product.id,
          description:
            existingStatus.isActive !== product.isActive
              ? `${product.isActive ? "Restored" : "Archived"} product ${product.name}.`
              : `Updated product ${product.name}.`,
          metadata: {
            previousName: existingStatus.name,
            isActive: product.isActive,
            baseUnit: product.baseUnitOfMeasure?.code ?? null,
            variantCount: product.variants.length,
            imageCount: product.images.length,
            priceChanged: false,
            costChanged: false,
            trackBatches: product.trackBatches,
            trackExpiry: product.trackExpiry,
          },
        });

        return product;
      });

      return NextResponse.json({ product: serializeProduct(updatedProduct) });
    }

    const units = await ensureUnitsOfMeasure(shopId);

    const existing = await prisma.product.findFirst({
      where: { id, shopId },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        baseUnitOfMeasure: true,
        uomConversions: true,
        variants: true,
        images: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Product not found." },
        { status: 404 },
      );
    }

    const nextName = parsed.data.name?.trim() ?? existing.name;
    const nextBaseUnitId =
      parsed.data.baseUnitOfMeasureId ?? existing.baseUnitOfMeasureId;
    const nextCategoryId =
      parsed.data.categoryId === undefined
        ? existing.categoryId
        : normalizeText(parsed.data.categoryId);
    const categoryChanged = nextCategoryId !== existing.categoryId;
    const nextSku =
      parsed.data.sku === undefined
        ? existing.sku
        : normalizeText(parsed.data.sku);
    const nextBarcode =
      parsed.data.barcode === undefined
        ? existing.barcode
        : normalizeText(parsed.data.barcode);
    const nextChangeNote =
      parsed.data.changeNote === undefined
        ? null
        : normalizeText(parsed.data.changeNote);
    const nextVariants =
      parsed.data.variants === undefined
        ? existing.variants.map((variant) => ({
            color: variant.color,
            size: variant.size,
            flavor: variant.flavor,
            model: variant.model,
            sku: variant.sku,
            barcode: variant.barcode,
            priceOverride: variant.priceOverride
              ? Number(variant.priceOverride)
              : null,
            costOverride: variant.costOverride
              ? Number(variant.costOverride)
              : null,
            isActive: variant.isActive,
          }))
        : parsed.data.variants.map((variant) => ({
            color: normalizeText(variant.color),
            size: normalizeText(variant.size),
            flavor: normalizeText(variant.flavor),
            model: normalizeText(variant.model),
            sku: normalizeText(variant.sku),
            barcode: normalizeText(variant.barcode),
            priceOverride: variant.priceOverride ?? null,
            costOverride: variant.costOverride ?? null,
            isActive: variant.isActive,
          }));
    const nextImages =
      parsed.data.images === undefined
        ? existing.images.map((image) => ({
            imageUrl: image.imageUrl,
            altText: image.altText,
            sortOrder: image.sortOrder,
          }))
        : parsed.data.images.map((image) => ({
            imageUrl: image.imageUrl.trim(),
            altText: normalizeText(image.altText),
            sortOrder: image.sortOrder,
          }));

    const unitMap = new Map(units.map((unit) => [unit.id, unit]));
    const normalizedConversions =
      parsed.data.uomConversions === undefined
        ? existing.uomConversions.map((conversion) => ({
            unitOfMeasureId: conversion.unitOfMeasureId,
            ratioToBase: conversion.ratioToBase,
          }))
        : parsed.data.uomConversions
            .filter(
              (conversion) => conversion.unitOfMeasureId !== nextBaseUnitId,
            )
            .filter(
              (conversion, index, array) =>
                array.findIndex(
                  (entry) =>
                    entry.unitOfMeasureId === conversion.unitOfMeasureId,
                ) === index,
            );

    if (
      parsed.data.stockQty !== undefined &&
      parsed.data.stockQty !== existing.stockQty
    ) {
      return NextResponse.json(
        {
          error:
            "Change stock using inventory adjustments or purchases instead.",
        },
        { status: 400 },
      );
    }

    if (!nextBaseUnitId || !unitMap.has(nextBaseUnitId)) {
      return NextResponse.json(
        { error: "Selected base unit was not found." },
        { status: 404 },
      );
    }

    for (const conversion of normalizedConversions) {
      if (!unitMap.has(conversion.unitOfMeasureId)) {
        return NextResponse.json(
          { error: "One or more selected units were not found." },
          { status: 404 },
        );
      }
    }

    const variantSkus = nextVariants
      .map((variant) => variant.sku)
      .filter(Boolean) as string[];
    const variantBarcodes = nextVariants
      .map((variant) => variant.barcode)
      .filter(Boolean) as string[];

    if (
      new Set(variantSkus.map((value) => value.toLowerCase())).size !==
      variantSkus.length
    ) {
      return NextResponse.json(
        { error: "Variant SKUs must be unique." },
        { status: 409 },
      );
    }

    if (new Set(variantBarcodes).size !== variantBarcodes.length) {
      return NextResponse.json(
        { error: "Variant barcodes must be unique." },
        { status: 409 },
      );
    }

    if (
      nextSku &&
      variantSkus.some((value) => value.toLowerCase() === nextSku.toLowerCase())
    ) {
      return NextResponse.json(
        { error: "Base product SKU conflicts with a variant SKU." },
        { status: 409 },
      );
    }

    if (nextBarcode && variantBarcodes.includes(nextBarcode)) {
      return NextResponse.json(
        { error: "Base product barcode conflicts with a variant barcode." },
        { status: 409 },
      );
    }

    const [
      categoryValidation,
      duplicateByName,
      duplicateBySku,
      duplicateByBarcode,
      duplicateVariantSku,
      duplicateVariantBarcode,
      productSkuConflictWithVariant,
      productBarcodeConflictWithVariant,
    ] = await Promise.all([
      categoryChanged
        ? validateAssignableCategory(shopId, nextCategoryId)
        : Promise.resolve({ category: null, issue: null }),
      prisma.product.findFirst({
        where: {
          shopId,
          id: { not: id },
          name: {
            equals: nextName,
            mode: "insensitive",
          },
        },
        select: { id: true },
      }),
      nextSku
        ? prisma.product.findFirst({
            where: { shopId, id: { not: id }, sku: nextSku },
            select: { id: true },
          })
        : Promise.resolve(null),
      nextBarcode
        ? prisma.product.findFirst({
            where: { shopId, id: { not: id }, barcode: nextBarcode },
            select: { id: true },
          })
        : Promise.resolve(null),
      variantSkus.length
        ? prisma.productVariant.findFirst({
            where: {
              sku: { in: variantSkus },
              product: {
                shopId,
                id: { not: id },
              },
            },
            select: { id: true },
          })
        : Promise.resolve(null),
      variantBarcodes.length
        ? prisma.productVariant.findFirst({
            where: {
              barcode: { in: variantBarcodes },
              product: {
                shopId,
                id: { not: id },
              },
            },
            select: { id: true },
          })
        : Promise.resolve(null),
      variantSkus.length
        ? prisma.product.findFirst({
            where: {
              shopId,
              id: { not: id },
              sku: { in: variantSkus },
            },
            select: { id: true },
          })
        : Promise.resolve(null),
      variantBarcodes.length
        ? prisma.product.findFirst({
            where: {
              shopId,
              id: { not: id },
              barcode: { in: variantBarcodes },
            },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    if (categoryValidation.issue) {
      return NextResponse.json(
        { error: categoryValidation.issue.error },
        { status: categoryValidation.issue.status },
      );
    }

    if (duplicateByName) {
      return NextResponse.json(
        { error: "A product with this name already exists in this shop." },
        { status: 409 },
      );
    }

    if (duplicateBySku) {
      return NextResponse.json(
        { error: "A product with this SKU already exists." },
        { status: 409 },
      );
    }

    if (duplicateByBarcode) {
      return NextResponse.json(
        { error: "A product with this barcode already exists." },
        { status: 409 },
      );
    }

    if (duplicateVariantSku || productSkuConflictWithVariant) {
      return NextResponse.json(
        { error: "A variant SKU already exists in this shop." },
        { status: 409 },
      );
    }

    if (duplicateVariantBarcode || productBarcodeConflictWithVariant) {
      return NextResponse.json(
        { error: "A variant barcode already exists in this shop." },
        { status: 409 },
      );
    }

    const priceChanged =
      parsed.data.price !== undefined &&
      Number(existing.price) !== parsed.data.price;
    const costChanged =
      parsed.data.cost !== undefined &&
      Number(existing.cost) !== parsed.data.cost;

    const previousLocalImagePaths = extractLocalProductUploadPaths(
      existing.images.map((image) => image.imageUrl),
    );
    const nextLocalImagePaths = extractLocalProductUploadPaths(
      nextImages.map((image) => image.imageUrl),
    );
    const localImagePathsToDelete =
      parsed.data.images === undefined
        ? []
        : previousLocalImagePaths.filter(
            (imagePath) => !nextLocalImagePaths.includes(imagePath),
          );

    const updatedProduct = await prisma.$transaction(async (tx) => {
      if (priceChanged) {
        await tx.productPriceHistory.create({
          data: {
            productId: existing.id,
            previousPrice: existing.price,
            newPrice: parsed.data.price!,
            effectiveDate: new Date(),
            changedByUserId: userId,
            note: nextChangeNote,
          },
        });

        await logActivity({
          tx,
          shopId,
          userId,
          action: "PRODUCT_PRICE_CHANGED",
          entityType: "Product",
          entityId: existing.id,
          description: `Changed selling price for ${existing.name}.`,
          metadata: {
            previousPrice: Number(existing.price),
            nextPrice: parsed.data.price!,
            note: nextChangeNote,
          },
        });
      }

      if (costChanged) {
        await tx.productCostHistory.create({
          data: {
            productId: existing.id,
            previousCost: existing.cost,
            newCost: parsed.data.cost!,
            effectiveDate: new Date(),
            changedByUserId: userId,
            note: nextChangeNote,
          },
        });

        await logActivity({
          tx,
          shopId,
          userId,
          action: "PRODUCT_COST_CHANGED",
          entityType: "Product",
          entityId: existing.id,
          description: `Changed cost basis for ${existing.name}.`,
          metadata: {
            previousCost: Number(existing.cost),
            nextCost: parsed.data.cost!,
            note: nextChangeNote,
          },
        });
      }

      const product = await tx.product.update({
        where: { id },
        data: {
          categoryId: nextCategoryId,
          baseUnitOfMeasureId: nextBaseUnitId,
          sku: nextSku,
          barcode: nextBarcode,
          name: nextName,
          description:
            parsed.data.description === undefined
              ? existing.description
              : normalizeText(parsed.data.description),
          cost: parsed.data.cost ?? existing.cost,
          price: parsed.data.price ?? existing.price,
          reorderPoint: parsed.data.reorderPoint ?? existing.reorderPoint,
          trackBatches: parsed.data.trackBatches ?? existing.trackBatches,
          trackExpiry: parsed.data.trackExpiry ?? existing.trackExpiry,
          ...(parsed.data.uomConversions !== undefined
            ? {
                uomConversions: {
                  deleteMany: {},
                  create: normalizedConversions.map((conversion) => ({
                    unitOfMeasureId: conversion.unitOfMeasureId,
                    ratioToBase: conversion.ratioToBase,
                  })),
                },
              }
            : {}),
          ...(parsed.data.variants !== undefined
            ? {
                variants: {
                  deleteMany: {},
                  create: nextVariants.map((variant) => ({
                    color: variant.color,
                    size: variant.size,
                    flavor: variant.flavor,
                    model: variant.model,
                    sku: variant.sku,
                    barcode: variant.barcode,
                    priceOverride: variant.priceOverride,
                    costOverride: variant.costOverride,
                    isActive: variant.isActive,
                  })),
                },
              }
            : {}),
          ...(parsed.data.images !== undefined
            ? {
                images: {
                  deleteMany: {},
                  create: nextImages.map((image) => ({
                    imageUrl: image.imageUrl,
                    altText: image.altText,
                    sortOrder: image.sortOrder,
                  })),
                },
              }
            : {}),
          isActive: parsed.data.isActive ?? existing.isActive,
        },
        include: productMutationInclude,
      });

      await logActivity({
        tx,
        shopId,
        userId,
        action:
          existing.isActive !== product.isActive
            ? product.isActive
              ? "PRODUCT_UNARCHIVED"
              : "PRODUCT_ARCHIVED"
            : "PRODUCT_UPDATED",
        entityType: "Product",
        entityId: product.id,
        description:
          existing.isActive !== product.isActive
            ? `${product.isActive ? "Restored" : "Archived"} product ${product.name}.`
            : `Updated product ${product.name}.`,
        metadata: {
          previousName: existing.name,
          isActive: product.isActive,
          baseUnit: product.baseUnitOfMeasure?.code ?? null,
          variantCount: product.variants.length,
          imageCount: product.images.length,
          categoryChanged,
          previousCategoryId: existing.categoryId,
          categoryId: product.categoryId,
          categoryName:
            categoryValidation.category?.name ??
            (categoryChanged ? null : (existing.category?.name ?? null)),
          priceChanged,
          costChanged,
          trackBatches: product.trackBatches,
          trackExpiry: product.trackExpiry,
        },
      });

      return product;
    });

    if (localImagePathsToDelete.length) {
      try {
        await deleteLocalProductUploads(localImagePathsToDelete);
      } catch (cleanupError) {
        console.error(
          "Failed to remove replaced product images:",
          cleanupError,
        );
      }
    }

    return NextResponse.json({ product: serializeProduct(updatedProduct) });
  } catch (error) {
    return apiErrorResponse(error, "Unable to update product.");
  }
}

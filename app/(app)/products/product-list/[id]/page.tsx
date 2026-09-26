import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import BarcodeLabelPreview from "@/components/products/BarcodeLabelPreview";
import ProductDetailsActions from "@/components/products/ProductDetailsActions";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { getActiveShopContext } from "@/lib/auth/get-active-shop";
import { money, shortDate } from "@/lib/format";
import { getStockLevel, stockLevelLabel } from "@/lib/inventory";
import {
  buildVariantLabel,
  getMarginSummary,
} from "@/lib/product-merchandising";
import { prisma } from "@/lib/prisma";
import { summarizeConversions } from "@/lib/uom";
import { ArrowLeftIcon } from "lucide-react";

type ProductDetailsPageProps = {
  params: Promise<{
    id: string;
  }>;
};

const backLinkClassName =
  "inline-flex h-10 items-center justify-center rounded-xl border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-700 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 hover:text-stone-950 focus:outline-none focus:ring-4 focus:ring-emerald-500/10";

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[20px] border border-stone-200 bg-stone-50/70 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
        {label}
      </div>
      <div className="mt-1.5 wrap-break-word text-sm font-semibold text-stone-900">
        {value}
      </div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-400">
        {eyebrow}
      </div>
      <h2 className="mt-1 text-xl font-black text-stone-950">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-stone-500">{description}</p>
      ) : null}
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
      {children}
    </div>
  );
}

export default async function ProductDetailsPage({
  params,
}: ProductDetailsPageProps) {
  const { shopId, permissions } = await getActiveShopContext();
  const canEditProducts = permissions.EDIT_PRODUCTS;
  const canViewPurchaseCosts =
    permissions.VIEW_PURCHASE_COSTS || permissions.EDIT_PRODUCTS;

  if (!canEditProducts && !canViewPurchaseCosts) {
    redirect("/dashboard");
  }

  const { id } = await params;

  const [product, settings] = await Promise.all([
    prisma.product.findFirst({
      where: {
        id,
        shopId,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        baseUnitOfMeasure: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        uomConversions: {
          include: {
            unitOfMeasure: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
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
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { effectiveDate: "desc" },
          take: 10,
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
          take: 10,
        },
      },
    }),
    prisma.shopSetting.findUnique({
      where: { shopId },
      select: {
        currencySymbol: true,
        lowStockThreshold: true,
        expiryAlertDays: true,
      },
    }),
  ]);

  if (!product) {
    notFound();
  }

  const currencySymbol = settings?.currencySymbol ?? "₱";
  const lowStockThreshold = settings?.lowStockThreshold ?? 5;
  const stockLevel = getStockLevel(
    product.stockQty,
    product.reorderPoint,
    lowStockThreshold,
  );
  const margin = canViewPurchaseCosts
    ? getMarginSummary(Number(product.price), Number(product.cost))
    : null;
  const primaryImage = product.images[0] ?? null;
  const baseUnitName = product.baseUnitOfMeasure?.name ?? "Unit";
  const baseUnitCode = product.baseUnitOfMeasure?.code ?? null;
  const nextExpiringBatch = product.batches.find(
    (batch) => batch.quantity > 0 && batch.expiryDate,
  );
  const conversionSummary = summarizeConversions(
    product.uomConversions.map((conversion) => ({
      unitName: conversion.unitOfMeasure.name,
      ratioToBase: conversion.ratioToBase,
    })),
    product.baseUnitOfMeasure?.name,
  );
  const barcodeEntries = [
    product.barcode || product.sku
      ? {
          key: `product-${product.id}`,
          code: product.barcode || product.sku,
          name: product.name,
          variantId: null,
          variantLabel: null,
          sku: product.sku,
        }
      : null,
    ...product.variants
      .filter((variant) => Boolean(variant.barcode || variant.sku))
      .map((variant) => ({
        key: `variant-${variant.id}`,
        code: variant.barcode || variant.sku,
        name: product.name,
        variantId: variant.id,
        variantLabel: buildVariantLabel({
          color: variant.color,
          size: variant.size,
          flavor: variant.flavor,
          model: variant.model,
        }),
        sku: variant.sku,
      })),
  ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  return (
    <div className="space-y-6">
      <AppHeader
        title="Product Details"
        subtitle="Review product identity, merchandising, inventory, variants, batches, and change history."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/products/product-list" className={backLinkClassName}>
          <ArrowLeftIcon /> Back to Product list
        </Link>

        {canEditProducts ? (
          <ProductDetailsActions
            productId={product.id}
            productName={product.name}
            isActive={product.isActive}
          />
        ) : null}
      </div>

      <Card>
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
          <div className="relative aspect-square overflow-hidden rounded-[28px] border border-stone-200 bg-stone-50">
            {primaryImage ? (
              <Image
                src={primaryImage.imageUrl}
                alt={primaryImage.altText ?? product.name}
                fill
                priority
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
                No product image
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={product.isActive ? "emerald" : "stone"}>
                {product.isActive ? "Active" : "Archived"}
              </Badge>
              <Badge
                tone={
                  stockLevel === "OUT_OF_STOCK"
                    ? "red"
                    : stockLevel === "LOW_STOCK"
                      ? "amber"
                      : "blue"
                }
              >
                {stockLevelLabel(stockLevel)}
              </Badge>
              {product.category ? (
                <Badge tone="stone">{product.category.name}</Badge>
              ) : null}
            </div>

            <h1 className="mt-4 text-3xl font-black tracking-tight text-stone-950 sm:text-4xl">
              {product.name}
            </h1>
            <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-stone-600">
              {product.description ||
                "No description has been added for this product."}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <DetailItem label="SKU" value={product.sku || "Not assigned"} />
              <DetailItem
                label="Barcode"
                value={product.barcode || "Not assigned"}
              />
              <DetailItem
                label="Selling price"
                value={money(product.price.toString(), currencySymbol)}
              />
              <DetailItem
                label="Current stock"
                value={`${product.stockQty} ${baseUnitName}`}
              />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <SectionHeading eyebrow="Overview" title="Product information" />
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailItem
              label="Category"
              value={product.category?.name ?? "Uncategorized"}
            />
            <DetailItem
              label="Base unit"
              value={
                baseUnitCode
                  ? `${baseUnitName} (${baseUnitCode})`
                  : baseUnitName
              }
            />
            <DetailItem
              label="Status"
              value={product.isActive ? "Active" : "Archived"}
            />
            <DetailItem
              label="Created"
              value={shortDate(product.createdAt.toISOString())}
            />
            <DetailItem
              label="Last updated"
              value={shortDate(product.updatedAt.toISOString())}
            />
          </div>
        </Card>

        <Card>
          <SectionHeading
            eyebrow="Pricing"
            title="Commercial details"
            description="Selling price and permission-aware purchase cost information."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailItem
              label="Selling price"
              value={money(product.price.toString(), currencySymbol)}
            />
            {canViewPurchaseCosts ? (
              <DetailItem
                label="Purchase cost"
                value={money(product.cost.toString(), currencySymbol)}
              />
            ) : (
              <DetailItem label="Purchase cost" value="Restricted" />
            )}
          </div>

          {canViewPurchaseCosts && margin ? (
            <div
              className={`mt-4 rounded-[20px] border px-4 py-3 text-sm ${
                margin.tone === "red"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : margin.tone === "amber"
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {margin.message} Current margin {margin.percentage.toFixed(1)}%.
            </div>
          ) : null}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <SectionHeading
            eyebrow="Inventory"
            title="Stock and tracking"
            description="Current stock controls and product-level tracking settings."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailItem
              label="Current stock"
              value={`${product.stockQty} ${baseUnitName}`}
            />
            <DetailItem label="Reorder point" value={product.reorderPoint} />
            <DetailItem
              label="Stock level"
              value={stockLevelLabel(stockLevel)}
            />
            <DetailItem
              label="Batch records"
              value={`${product.batches.length} record(s)`}
            />
            <DetailItem
              label="Batch tracking"
              value={product.trackBatches ? "Enabled" : "Disabled"}
            />
            <DetailItem
              label="Expiry tracking"
              value={product.trackExpiry ? "Enabled" : "Disabled"}
            />
          </div>

          {nextExpiringBatch?.expiryDate ? (
            <div className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Next recorded expiry:{" "}
              {shortDate(nextExpiringBatch.expiryDate.toISOString())}
              {settings?.expiryAlertDays
                ? ` · Shop expiry alert window: ${settings.expiryAlertDays} day(s).`
                : null}
            </div>
          ) : null}
        </Card>

        <Card>
          <SectionHeading
            eyebrow="Units of measure"
            title="Packaging and conversions"
            description={conversionSummary}
          />
          <div className="rounded-[20px] border border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-700">
            <span className="font-semibold text-stone-950">Base unit:</span>{" "}
            {baseUnitName}
            {baseUnitCode ? ` (${baseUnitCode})` : ""}
          </div>

          <div className="mt-3 space-y-3">
            {product.uomConversions.length ? (
              product.uomConversions.map((conversion) => (
                <div
                  key={conversion.id}
                  className="flex flex-col gap-1 rounded-[20px] border border-stone-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="font-semibold text-stone-900">
                    {conversion.unitOfMeasure.name} (
                    {conversion.unitOfMeasure.code})
                  </div>
                  <div className="text-sm text-stone-500">
                    1 {conversion.unitOfMeasure.name.toLowerCase()} ={" "}
                    <span className="font-semibold text-stone-900">
                      {conversion.ratioToBase}
                    </span>{" "}
                    {baseUnitName.toLowerCase()}
                  </div>
                </div>
              ))
            ) : (
              <EmptyState>
                No additional UOM conversions are configured.
              </EmptyState>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <SectionHeading
          eyebrow="Variants"
          title="Product variants"
          description="Variant identity, overrides, and availability state."
        />

        {product.variants.length ? (
          <div className="overflow-hidden rounded-3xl border border-stone-200">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-stone-50 text-stone-500">
                  <tr>
                    <th className="px-4 py-3.5">Variant</th>
                    <th className="px-4 py-3.5">SKU / Barcode</th>
                    <th className="px-4 py-3.5">Selling price</th>
                    {canViewPurchaseCosts ? (
                      <th className="px-4 py-3.5">Cost</th>
                    ) : null}
                    <th className="px-4 py-3.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {product.variants.map((variant) => {
                    const label = buildVariantLabel({
                      color: variant.color,
                      size: variant.size,
                      flavor: variant.flavor,
                      model: variant.model,
                    });

                    return (
                      <tr
                        key={variant.id}
                        className="border-t border-stone-200 bg-white"
                      >
                        <td className="px-4 py-4">
                          <div className="font-semibold text-stone-900">
                            {label || "Variant"}
                          </div>
                          <div className="mt-1 text-xs text-stone-500">
                            {[
                              variant.color,
                              variant.size,
                              variant.flavor,
                              variant.model,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "No descriptors"}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-stone-600">
                          <div>{variant.sku || "No SKU"}</div>
                          <div className="mt-1 text-xs text-stone-500">
                            {variant.barcode || "No barcode"}
                          </div>
                        </td>
                        <td className="px-4 py-4 font-semibold text-stone-900">
                          {variant.priceOverride
                            ? money(
                                variant.priceOverride.toString(),
                                currencySymbol,
                              )
                            : `${money(product.price.toString(), currencySymbol)} base`}
                        </td>
                        {canViewPurchaseCosts ? (
                          <td className="px-4 py-4 text-stone-600">
                            {variant.costOverride
                              ? money(
                                  variant.costOverride.toString(),
                                  currencySymbol,
                                )
                              : `${money(product.cost.toString(), currencySymbol)} base`}
                          </td>
                        ) : null}
                        <td className="px-4 py-4">
                          <Badge tone={variant.isActive ? "emerald" : "stone"}>
                            {variant.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState>This product does not have any variants.</EmptyState>
        )}
      </Card>

      <Card>
        <SectionHeading
          eyebrow="Images"
          title="Product gallery"
          description={`${product.images.length} image(s) attached to this product.`}
        />

        {product.images.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {product.images.map((image, index) => (
              <figure
                key={image.id}
                className="overflow-hidden rounded-3xl border border-stone-200 bg-white"
              >
                <div className="relative aspect-square bg-stone-50">
                  <Image
                    src={image.imageUrl}
                    alt={image.altText ?? product.name}
                    fill
                    className="object-cover"
                  />
                </div>
                <figcaption className="px-4 py-3 text-xs text-stone-500">
                  {index === 0 ? "Primary · " : ""}
                  {image.altText || `Product image ${index + 1}`}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <EmptyState>No product images have been uploaded.</EmptyState>
        )}
      </Card>

      {product.trackBatches ||
      product.trackExpiry ||
      product.batches.length > 0 ? (
        <Card>
          <SectionHeading
            eyebrow="Batches and expiry"
            title="Lot records"
            description="Recorded lots, quantities, received dates, and expiry dates."
          />

          {product.batches.length ? (
            <div className="overflow-hidden rounded-3xl border border-stone-200">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-stone-50 text-stone-500">
                    <tr>
                      <th className="px-4 py-3.5">Lot number</th>
                      <th className="px-4 py-3.5">Quantity</th>
                      <th className="px-4 py-3.5">Expiry</th>
                      <th className="px-4 py-3.5">Received</th>
                      <th className="px-4 py-3.5">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.batches.map((batch) => (
                      <tr
                        key={batch.id}
                        className="border-t border-stone-200 bg-white"
                      >
                        <td className="px-4 py-4 font-semibold text-stone-900">
                          {batch.lotNumber}
                        </td>
                        <td className="px-4 py-4 text-stone-700">
                          {batch.quantity}
                        </td>
                        <td className="px-4 py-4 text-stone-700">
                          {batch.expiryDate
                            ? shortDate(batch.expiryDate.toISOString())
                            : "No expiry"}
                        </td>
                        <td className="px-4 py-4 text-stone-700">
                          {shortDate(batch.receivedAt.toISOString())}
                        </td>
                        <td className="max-w-md px-4 py-4 text-stone-500">
                          {batch.notes || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState>
              Tracking is enabled, but no batch records exist for this product
              yet.
            </EmptyState>
          )}
        </Card>
      ) : null}

      <Card>
        <SectionHeading
          eyebrow="Barcode"
          title="Barcode labels"
          description="Preview labels here and open the dedicated label-print view when you need a clean printout."
        />

        {barcodeEntries.length ? (
          <>
            <div className="flex flex-wrap items-start gap-4">
              {barcodeEntries.map((entry) => (
                <BarcodeLabelPreview
                  key={entry.key}
                  code={entry.code}
                  productName={entry.name}
                  variantLabel={entry.variantLabel}
                  sku={entry.sku}
                  size="medium"
                />
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {barcodeEntries.map((entry) => (
                <Link
                  key={`print-${entry.key}`}
                  href={`/print/barcode-labels?productId=${encodeURIComponent(product.id)}${
                    entry.variantId
                      ? `&variantId=${encodeURIComponent(entry.variantId)}`
                      : ""
                  }&size=medium`}
                  target="_blank"
                  className={backLinkClassName}
                >
                  {entry.variantId
                    ? `Print ${entry.variantLabel || entry.sku || "variant"}`
                    : "Print product labels"}
                </Link>
              ))}
            </div>
          </>
        ) : (
          <EmptyState>No base or variant barcode/SKU is configured.</EmptyState>
        )}
      </Card>

      <div
        className={`grid gap-6 ${canViewPurchaseCosts ? "xl:grid-cols-2" : ""}`}
      >
        <Card>
          <SectionHeading
            eyebrow="Price history"
            title="Recent selling-price changes"
          />
          <div className="space-y-3">
            {product.priceHistory.length ? (
              product.priceHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-[20px] border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600"
                >
                  <div className="font-semibold text-stone-900">
                    {money(entry.previousPrice.toString(), currencySymbol)} →{" "}
                    {money(entry.newPrice.toString(), currencySymbol)}
                  </div>
                  <div className="mt-1 text-xs text-stone-500">
                    {shortDate(entry.effectiveDate.toISOString())} by{" "}
                    {entry.changedByUser.name ?? entry.changedByUser.email}
                  </div>
                  {entry.note ? (
                    <div className="mt-2 text-xs text-stone-500">
                      {entry.note}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <EmptyState>No price changes have been recorded yet.</EmptyState>
            )}
          </div>
        </Card>

        {canViewPurchaseCosts ? (
          <Card>
            <SectionHeading
              eyebrow="Cost history"
              title="Recent purchase-cost changes"
            />
            <div className="space-y-3">
              {product.costHistory.length ? (
                product.costHistory.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-[20px] border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600"
                  >
                    <div className="font-semibold text-stone-900">
                      {money(entry.previousCost.toString(), currencySymbol)} →{" "}
                      {money(entry.newCost.toString(), currencySymbol)}
                    </div>
                    <div className="mt-1 text-xs text-stone-500">
                      {shortDate(entry.effectiveDate.toISOString())} by{" "}
                      {entry.changedByUser.name ?? entry.changedByUser.email}
                    </div>
                    {entry.note ? (
                      <div className="mt-2 text-xs text-stone-500">
                        {entry.note}
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <EmptyState>No cost changes have been recorded yet.</EmptyState>
              )}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

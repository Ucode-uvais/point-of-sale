"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { money, shortDate } from "@/lib/format";
import {
  buildCategoryFilterOptions,
  getCategoryFilterIds,
  getCategoryPathLabel,
} from "@/lib/category-presentation";
import { getStockLevel, stockLevelLabel } from "@/lib/inventory";
import {
  buildVariantLabel,
  getMarginSummary,
} from "@/lib/product-merchandising";
import { summarizeConversions } from "@/lib/uom";

type Category = {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
};

type UnitOfMeasure = {
  id: string;
  name: string;
};

type ProductListVariant = {
  id: string;
  color: string | null;
  size: string | null;
  flavor: string | null;
  model: string | null;
  sku: string | null;
  barcode: string | null;
};

type ProductListItem = {
  id: string;
  categoryId: string | null;
  sku: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  cost: string;
  price: string;
  stockQty: number;
  reorderPoint: number;
  isActive: boolean;
  category: Category | null;
  baseUnitOfMeasure: UnitOfMeasure | null;
  uomConversions: Array<{
    id: string;
    ratioToBase: number;
    unitOfMeasure: UnitOfMeasure;
  }>;
  variants: ProductListVariant[];
  images: Array<{
    id: string;
    imageUrl: string;
    altText: string | null;
  }>;
  batches: Array<{
    id: string;
    expiryDate: string | null;
  }>;
  variantCount: number;
  imageCount: number;
  batchCount: number;
};

const selectClassName =
  "h-11 w-full rounded-2xl border border-stone-200 bg-white/88 px-4 text-sm text-stone-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] outline-none transition hover:border-stone-300 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10";

const actionLinkClassName =
  "inline-flex h-9 items-center justify-center rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 hover:text-stone-950 focus:outline-none focus:ring-4 focus:ring-emerald-500/10";

function variantLabel(variant: ProductListVariant) {
  return buildVariantLabel({
    color: variant.color,
    size: variant.size,
    flavor: variant.flavor,
    model: variant.model,
  });
}

export default function ProductList({
  initialProducts,
  categories,
  canEditProducts,
  canViewPurchaseCosts,
  currencySymbol,
  lowStockThreshold,
}: {
  initialProducts: ProductListItem[];
  categories: Category[];
  canEditProducts: boolean;
  canViewPurchaseCosts: boolean;
  currencySymbol: string;
  lowStockThreshold: number;
}) {
  const [statusOverrides, setStatusOverrides] = useState<
    Record<string, boolean>
  >({});
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const [confirmationProduct, setConfirmationProduct] =
    useState<ProductListItem | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const products = useMemo(
    () =>
      initialProducts.map((product) => {
        const overriddenStatus = statusOverrides[product.id];

        return typeof overriddenStatus === "boolean"
          ? { ...product, isActive: overriddenStatus }
          : product;
      }),
    [initialProducts, statusOverrides],
  );

  const categoryOptions = useMemo(
    () => buildCategoryFilterOptions(categories),
    [categories],
  );
  const selectedCategoryIds = useMemo(
    () => new Set(getCategoryFilterIds(categoryFilter, categories)),
    [categories, categoryFilter],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();

    return products.filter((product) => {
      const variantSearch = product.variants
        .map((variant) =>
          [
            variant.sku ?? "",
            variant.barcode ?? "",
            variantLabel(variant),
          ].join(" "),
        )
        .join(" ");

      const matchesTerm =
        !term ||
        [
          product.name,
          product.description ?? "",
          product.sku ?? "",
          product.barcode ?? "",
          getCategoryPathLabel(product.categoryId, categories),
          variantSearch,
        ]
          .join(" ")
          .toLowerCase()
          .includes(term);

      const matchesCategory =
        !categoryFilter ||
        (product.categoryId
          ? selectedCategoryIds.has(product.categoryId)
          : false);

      return matchesTerm && matchesCategory;
    });
  }, [categories, categoryFilter, products, query, selectedCategoryIds]);

  const activeCount = products.filter((product) => product.isActive).length;
  const archivedCount = products.length - activeCount;
  const lowStockCount = products.filter(
    (product) =>
      getStockLevel(
        product.stockQty,
        product.reorderPoint,
        lowStockThreshold,
      ) !== "IN_STOCK",
  ).length;

  function requestArchiveToggle(product: ProductListItem) {
    if (pendingProductId) {
      return;
    }

    setError("");
    setSuccess("");
    setConfirmationProduct(product);
  }

  async function confirmArchiveToggle() {
    const product = confirmationProduct;

    if (!product || pendingProductId) {
      return;
    }

    setError("");
    setSuccess("");
    setPendingProductId(product.id);

    try {
      const response = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isActive: !product.isActive,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.product) {
        setError(data?.error ?? "Unable to update product status.");
        setConfirmationProduct(null);
        return;
      }

      setStatusOverrides((currentOverrides) => ({
        ...currentOverrides,
        [product.id]: Boolean(data.product.isActive),
      }));
      setSuccess(
        `${product.name} ${data.product.isActive ? "restored" : "archived"} successfully.`,
      );
      setConfirmationProduct(null);
    } catch {
      setError("Unable to update product status. Please try again.");
      setConfirmationProduct(null);
    } finally {
      setPendingProductId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[22px] border border-stone-200 bg-white px-4 py-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
            Active
          </div>
          <div className="mt-1 text-2xl font-black text-stone-950">
            {activeCount}
          </div>
        </div>
        <div className="rounded-[22px] border border-stone-200 bg-white px-4 py-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
            Low stock
          </div>
          <div className="mt-1 text-2xl font-black text-amber-700">
            {lowStockCount}
          </div>
        </div>
        <div className="rounded-[22px] border border-stone-200 bg-white px-4 py-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
            Archived
          </div>
          <div className="mt-1 text-2xl font-black text-stone-950">
            {archivedCount}
          </div>
        </div>
      </div>

      <Card>
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-black text-stone-900">
              Product catalog
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Search and review products, stock status, variants, pricing, and
              archive state.
            </p>
          </div>

          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              placeholder="Search products or variants..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="md:w-72"
            />
            <select
              className={`${selectClassName} md:w-56`}
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="">All categories</option>
              {categoryOptions.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-[26px] border border-stone-200">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-stone-50 text-stone-500">
                <tr>
                  <th className="px-4 py-3.5">Product</th>
                  <th className="px-4 py-3.5">Category</th>
                  <th className="px-4 py-3.5">Commercial data</th>
                  <th className="px-4 py-3.5">Variants</th>
                  <th className="px-4 py-3.5">Pricing</th>
                  <th className="px-4 py-3.5">Stock</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => {
                  const level = getStockLevel(
                    product.stockQty,
                    product.reorderPoint,
                    lowStockThreshold,
                  );
                  const margin = getMarginSummary(
                    Number(product.price),
                    Number(product.cost),
                  );
                  const nextExpiryBatch = product.batches[0] ?? null;
                  const pending = pendingProductId === product.id;

                  return (
                    <tr
                      key={product.id}
                      className="border-t border-stone-200 bg-white transition hover:bg-stone-50/70"
                    >
                      <td className="px-4 py-4">
                        <div className="flex min-w-60 gap-3">
                          <div className="relative h-14 w-14 flex-none overflow-hidden rounded-[18px] border border-stone-200 bg-stone-50">
                            {product.images[0] ? (
                              <Image
                                src={product.images[0].imageUrl}
                                alt={product.images[0].altText ?? product.name}
                                fill
                                className="object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">
                                No image
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-stone-900">
                              {product.name}
                            </div>
                            <div className="mt-1 max-w-xs truncate text-xs text-stone-500">
                              {product.description ?? "No description"}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <div className="max-w-56 font-medium text-stone-800">
                          {getCategoryPathLabel(product.categoryId, categories)}
                        </div>
                        {product.categoryId ? (
                          <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-stone-400">
                            {categories.find(
                              (category) => category.id === product.categoryId,
                            )?.parentId
                              ? "Subcategory assignment"
                              : "Main category assignment"}
                          </div>
                        ) : null}
                      </td>

                      <td className="px-4 py-4 text-stone-600">
                        <div>
                          {product.sku || "N/A"} / {product.barcode || "N/A"}
                        </div>
                        <div className="mt-2 text-xs text-stone-500">
                          Base:{" "}
                          {product.baseUnitOfMeasure?.name ?? "Unit not set"}
                        </div>
                        <div className="mt-1 max-w-xs text-xs text-stone-500">
                          {summarizeConversions(
                            product.uomConversions.map((conversion) => ({
                              unitName: conversion.unitOfMeasure.name,
                              ratioToBase: conversion.ratioToBase,
                            })),
                            product.baseUnitOfMeasure?.name,
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <Badge tone="blue">
                            {product.variantCount} variant(s)
                          </Badge>
                          {product.imageCount ? (
                            <Badge tone="stone">
                              {product.imageCount} image(s)
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-2 max-w-xs text-xs text-stone-500">
                          {product.variants
                            .slice(0, 2)
                            .map(
                              (variant) =>
                                variantLabel(variant) ||
                                variant.sku ||
                                variant.barcode ||
                                "Variant",
                            )
                            .join(" | ") || "No variants"}
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-semibold text-stone-900">
                          {money(product.price, currencySymbol)}
                        </div>
                        {canViewPurchaseCosts ? (
                          <>
                            <div className="text-xs text-stone-500">
                              Cost {money(product.cost, currencySymbol)}
                            </div>
                            <div
                              className={`mt-2 text-xs ${
                                margin.tone === "red"
                                  ? "text-red-700"
                                  : margin.tone === "amber"
                                    ? "text-amber-700"
                                    : "text-emerald-700"
                              }`}
                            >
                              {margin.message}
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-stone-500">
                            Cost visibility is restricted for this account.
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-semibold text-stone-900">
                          {product.stockQty}
                        </div>
                        <div className="mt-1 text-xs text-stone-500">
                          {nextExpiryBatch?.expiryDate
                            ? `Next expiry ${shortDate(nextExpiryBatch.expiryDate)}`
                            : product.batchCount
                              ? `${product.batchCount} batch record(s)`
                              : "No batch records"}
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex min-w-32.5 flex-wrap gap-2">
                          <Badge tone={product.isActive ? "emerald" : "stone"}>
                            {product.isActive ? "Active" : "Archived"}
                          </Badge>
                          <Badge
                            tone={
                              level === "OUT_OF_STOCK"
                                ? "red"
                                : level === "LOW_STOCK"
                                  ? "amber"
                                  : "blue"
                            }
                          >
                            {stockLevelLabel(level)}
                          </Badge>
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex min-w-max flex-wrap gap-2">
                          <Link
                            href={`/products/product-list/${encodeURIComponent(product.id)}`}
                            className={actionLinkClassName}
                          >
                            View
                          </Link>

                          {canEditProducts ? (
                            <>
                              <Link
                                href={`/products?edit=${encodeURIComponent(product.id)}`}
                                className={actionLinkClassName}
                              >
                                Edit
                              </Link>
                              <Button
                                type="button"
                                variant="ghost"
                                className="text-xs uppercase tracking-[0.14em]"
                                disabled={pendingProductId !== null}
                                onClick={() => requestArchiveToggle(product)}
                              >
                                {pending
                                  ? "Updating..."
                                  : product.isActive
                                    ? "Archive"
                                    : "Restore"}
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!filtered.length ? (
            <div className="border-t border-stone-200 bg-stone-50 py-10 text-center text-sm text-stone-500">
              No products matched that filter.
            </div>
          ) : null}
        </div>
      </Card>

      <ConfirmDialog
        open={Boolean(confirmationProduct)}
        title={
          confirmationProduct?.isActive
            ? "Archive product?"
            : "Restore product?"
        }
        description={
          confirmationProduct ? (
            <>
              {confirmationProduct.isActive ? "Archive" : "Restore"}{" "}
              <span className="font-semibold text-stone-900">
                {confirmationProduct.name}
              </span>
              ?
            </>
          ) : null
        }
        confirmLabel={confirmationProduct?.isActive ? "Archive" : "Restore"}
        pending={
          Boolean(confirmationProduct) &&
          pendingProductId === confirmationProduct?.id
        }
        onConfirm={confirmArchiveToggle}
        onCancel={() => setConfirmationProduct(null)}
      />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import AdjustmentForm from "@/components/inventory/AdjustmentForm";
import InventoryMovementTable from "@/components/inventory/InventoryMovementTable";
import ProductBatchManager from "@/components/inventory/ProductBatchManager";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { money } from "@/lib/format";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  stockQty: number;
  reorderPoint: number;
  baseUnitOfMeasure?: {
    id: string;
    code: string;
    name: string;
    isBase: boolean;
  } | null;
  variants: Array<{
    id: string;
    color: string | null;
    size: string | null;
    flavor: string | null;
    model: string | null;
    sku: string | null;
    barcode: string | null;
  }>;
  uomConversions: Array<{
    id: string;
    unitOfMeasureId: string;
    ratioToBase: number;
    unitOfMeasure: { id: string; code: string; name: string; isBase: boolean };
  }>;
  trackBatches: boolean;
  trackExpiry: boolean;
  batches: Array<{
    id: string;
    lotNumber: string;
    expiryDate: string | null;
    quantity: number;
  }>;
  isActive: boolean;
};

type InventoryReason = {
  id: string;
  code: string;
  label: string;
};

type Batch = {
  id: string;
  lotNumber: string;
  expiryDate: string | null;
  quantity: number;
  receivedAt: string;
  notes: string | null;
  product: {
    id: string;
    name: string;
    sku: string | null;
    trackBatches: boolean;
    trackExpiry: boolean;
  };
};

type Movement = {
  id: string;
  type: string;
  qtyChange: number;
  referenceId: string | null;
  notes: string | null;
  reasonLabel: string | null;
  reasonCode: string | null;
  createdAt: string;
  product: {
    id: string;
    name: string;
    sku: string | null;
    barcode: string | null;
  };
};

type ReorderSuggestion = {
  productId: string;
  productName: string;
  sku: string | null;
  currentStock: number;
  avgDailySales: number;
  leadTimeDays: number;
  safetyStock: number;
  reorderPoint: number;
  targetStock: number;
  suggestedQty: number;
  unitCost: number;
  suggestedCost: number;
  supplierId: string | null;
  supplierName: string;
  stockoutEvents: number;
  sellThroughPercent: number;
  baseUnitOfMeasureId: string;
  baseUnitName: string;
};

type ReorderGroup = {
  supplierId: string | null;
  supplierName: string;
  totalUnits: number;
  totalCost: number;
  items: ReorderSuggestion[];
};

type ReorderSuggestions = {
  generatedAt: string;
  safetyStock: number;
  summary: {
    itemsNeedingAction: number;
    suppliersImpacted: number;
    projectedCost: number;
    projectedUnits: number;
  };
  items: ReorderSuggestion[];
  groups: ReorderGroup[];
};

export default function InventoryManager({
  products,
  reasons,
  batches,
  movements,
  lowStockThreshold,
  currencySymbol,
  reorderSuggestions,
  inventoryFeatures,
}: {
  products: Product[];
  reasons: InventoryReason[];
  batches: Batch[];
  movements: Movement[];
  lowStockThreshold: number;
  currencySymbol: string;
  reorderSuggestions: ReorderSuggestions;
  inventoryFeatures: {
    batchTrackingEnabled: boolean;
    expiryTrackingEnabled: boolean;
    fefoEnabled: boolean;
    expiryAlertDays: number;
  };
}) {
  const [busySupplierId, setBusySupplierId] = useState<string | null>(null);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [createdSupplierIds, setCreatedSupplierIds] = useState<string[]>([]);

  async function createSuggestedPurchase(group: ReorderGroup) {
    if (!group.supplierId) {
      setError(
        "This recommendation group has no supplier history yet, so a purchase order cannot be generated safely.",
      );
      return;
    }

    setBusySupplierId(group.supplierId);
    setError("");
    setSuccess("");

    const response = await fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId: group.supplierId,
        status: "DRAFT",
        notes: `Smart reorder draft generated from the inventory queue on ${new Date().toLocaleDateString("en-PH")}.`,
        items: group.items.map((item) => ({
          productId: item.productId,
          unitOfMeasureId: item.baseUnitOfMeasureId,
          qty: item.suggestedQty,
          unitCost: item.unitCost,
        })),
      }),
    });

    const data = await response.json().catch(() => ({
      error: "Unable to create the suggested purchase order.",
    }));
    setBusySupplierId(null);

    if (!response.ok) {
      setError(data.error ?? "Unable to create the suggested purchase order.");
      return;
    }

    setCreatedSupplierIds((current) => [
      ...new Set([...current, group.supplierId!]),
    ]);
    setSuccess(
      `Created draft purchase ${data.purchase?.purchaseNumber ?? ""} for ${group.supplierName}.`,
    );
  }

  const needsAttention = reorderSuggestions.summary.itemsNeedingAction > 0;

  return (
    <div className="min-w-0 space-y-6">
      <div className="grid min-w-0 gap-6 xl:grid-cols-2 xl:items-stretch">
        <Card className="h-full">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
              Replenishment planning
            </div>
            <h2 className="mt-2 text-xl font-black text-stone-900">
              Smart reorder suggestions
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-500">
              Suggested quantities combine recent sales velocity, supplier lead
              time, branch safety stock, current stock, and stockout pressure
              before reusing the standard purchase order flow.
            </p>
          </div>

          <div
            className={`mt-5 flex flex-col gap-4 rounded-3xl border px-4 py-4 sm:flex-row sm:items-center sm:justify-between ${
              needsAttention
                ? "border-amber-200 bg-amber-50/80"
                : "border-emerald-200 bg-emerald-50/80"
            }`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl font-black ${
                  needsAttention
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {reorderSuggestions.summary.itemsNeedingAction}
              </div>
              <div className="min-w-0">
                <div
                  className={`text-sm font-black ${
                    needsAttention ? "text-amber-900" : "text-emerald-900"
                  }`}
                >
                  {needsAttention
                    ? "Products need reorder attention"
                    : "Reorder queue is clear"}
                </div>
                <div className="mt-1 text-xs text-stone-600">
                  {needsAttention
                    ? "Suggested quantities are ready for review below."
                    : "No lead-time-aware reorder draft is currently required."}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:min-w-[250px] sm:border-l sm:border-black/5 sm:pl-5">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">
                  Suggested units
                </div>
                <div className="mt-1 text-base font-black text-stone-900">
                  {reorderSuggestions.summary.projectedUnits}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">
                  Projected value
                </div>
                <div className="mt-1 text-base font-black text-stone-900">
                  {money(
                    reorderSuggestions.summary.projectedCost,
                    currencySymbol,
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] border border-stone-200 bg-stone-50/70 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                Safety stock
              </div>
              <div className="mt-2 text-2xl font-black text-stone-950">
                {reorderSuggestions.safetyStock}
              </div>
              <div className="mt-1 text-xs text-stone-500">branch default</div>
            </div>
            <div className="rounded-[22px] border border-stone-200 bg-stone-50/70 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                Suppliers impacted
              </div>
              <div className="mt-2 text-2xl font-black text-stone-950">
                {reorderSuggestions.summary.suppliersImpacted}
              </div>
              <div className="mt-1 text-xs leading-5 text-stone-500">
                with draftable recommendations
              </div>
            </div>
            <div className="rounded-[22px] border border-stone-200 bg-stone-50/70 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                Generated
              </div>
              <div className="mt-2 text-lg font-black text-stone-950">
                {new Date(reorderSuggestions.generatedAt).toLocaleDateString(
                  "en-PH",
                )}
              </div>
              <div className="mt-1 text-xs text-stone-500">
                live inventory snapshot
              </div>
            </div>
          </div>

          {success ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {success}{" "}
              <Link href="/purchases" className="font-semibold underline">
                Open purchases
              </Link>
            </div>
          ) : null}
          {error ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mt-6 space-y-4 xl:max-h-[430px] xl:overflow-y-auto xl:pr-2">
            {reorderSuggestions.groups.length ? (
              reorderSuggestions.groups.map((group) => {
                const alreadyCreated = Boolean(
                  group.supplierId &&
                  createdSupplierIds.includes(group.supplierId),
                );

                return (
                  <section
                    key={`${group.supplierId ?? "none"}-${group.supplierName}`}
                    className={`overflow-hidden rounded-[30px] border ${
                      group.supplierId
                        ? "border-stone-200 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,249,0.9))]"
                        : "border-amber-200 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(255,251,235,0.7))]"
                    }`}
                  >
                    <div className="border-b border-stone-200/80 px-5 py-5 sm:px-6">
                      <div className="flex flex-col gap-4">
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-400">
                            Supplier reorder pack
                          </div>
                          <h3 className="mt-2 wrap-break-word text-xl font-black text-stone-950">
                            {group.supplierName}
                          </h3>
                          <p className="mt-1 text-sm leading-6 text-stone-500">
                            Review the recommended quantities below before
                            creating a draft purchase order.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {group.supplierId ? (
                            <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-700">
                              Supplier matched
                            </div>
                          ) : (
                            <div className="rounded-full border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-700">
                              Supplier history required
                            </div>
                          )}

                          {group.supplierId ? (
                            <Button
                              type="button"
                              onClick={() => createSuggestedPurchase(group)}
                              disabled={
                                busySupplierId === group.supplierId ||
                                alreadyCreated
                              }
                            >
                              {alreadyCreated
                                ? "Draft created"
                                : busySupplierId === group.supplierId
                                  ? "Creating draft..."
                                  : "Create PO draft"}
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-3 divide-x divide-stone-200 overflow-hidden rounded-[22px] border border-stone-200 bg-white/90">
                        <div className="px-3 py-3.5 sm:px-4">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">
                            Lines
                          </div>
                          <div className="mt-1.5 text-lg font-black text-stone-950">
                            {group.items.length}
                          </div>
                        </div>
                        <div className="px-3 py-3.5 sm:px-4">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">
                            Suggested units
                          </div>
                          <div className="mt-1.5 text-lg font-black text-stone-950">
                            {group.totalUnits}
                          </div>
                        </div>
                        <div className="px-3 py-3.5 sm:px-4">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">
                            Projected cost
                          </div>
                          <div className="mt-1.5 wrap-break-word text-lg font-black text-stone-950">
                            {money(group.totalCost, currencySymbol)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 p-4 sm:p-5">
                      {group.items.map((item) => {
                        const coveragePercent = Math.max(
                          0,
                          Math.min(
                            100,
                            item.targetStock > 0
                              ? (item.currentStock / item.targetStock) * 100
                              : 0,
                          ),
                        );

                        return (
                          <article
                            key={item.productId}
                            className="rounded-3xl border border-stone-200 bg-white p-4 shadow-[0_1px_0_rgba(28,25,23,0.02)] sm:p-5"
                          >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="text-base font-black text-stone-950">
                                  {item.productName}
                                </div>
                                <div className="mt-1 text-xs text-stone-500">
                                  {item.sku ? `${item.sku} · ` : ""}
                                  {item.baseUnitName}
                                </div>
                              </div>

                              <div className="min-w-[150px] rounded-[20px] border border-emerald-200 bg-emerald-50/80 px-4 py-3 sm:text-right">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                                  Suggested order
                                </div>
                                <div className="mt-1 flex items-baseline gap-1 sm:justify-end">
                                  <span className="text-2xl font-black text-stone-950">
                                    {item.suggestedQty}
                                  </span>
                                  <span className="text-xs font-semibold text-stone-500">
                                    {item.baseUnitName}
                                  </span>
                                </div>
                                <div className="mt-1 text-xs font-semibold text-stone-600">
                                  {money(item.suggestedCost, currencySymbol)}
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                              <div className="rounded-2xl bg-stone-50 px-3 py-3">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">
                                  On hand
                                </div>
                                <div className="mt-1 text-sm font-black text-stone-900">
                                  {item.currentStock}
                                </div>
                              </div>
                              <div className="rounded-2xl bg-stone-50 px-3 py-3">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">
                                  Sales velocity
                                </div>
                                <div className="mt-1 text-sm font-black text-stone-900">
                                  {item.avgDailySales.toFixed(1)} / day
                                </div>
                              </div>
                              <div className="rounded-2xl bg-stone-50 px-3 py-3">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">
                                  Lead time
                                </div>
                                <div className="mt-1 text-sm font-black text-stone-900">
                                  {item.leadTimeDays} day(s)
                                </div>
                              </div>
                              <div className="rounded-2xl bg-stone-50 px-3 py-3">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">
                                  Reorder point
                                </div>
                                <div className="mt-1 text-sm font-black text-stone-900">
                                  {item.reorderPoint}
                                </div>
                              </div>
                              <div className="rounded-2xl bg-stone-50 px-3 py-3">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">
                                  Stockouts
                                </div>
                                <div className="mt-1 text-sm font-black text-stone-900">
                                  {item.stockoutEvents}
                                </div>
                              </div>
                              <div className="rounded-2xl bg-stone-50 px-3 py-3">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">
                                  Sell-through
                                </div>
                                <div className="mt-1 text-sm font-black text-stone-900">
                                  {item.sellThroughPercent.toFixed(1)}%
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-3">
                              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-stone-500">
                                <span>
                                  Target stock{" "}
                                  <strong className="font-semibold text-stone-800">
                                    {item.targetStock}
                                  </strong>
                                </span>
                                <span>
                                  Safety stock{" "}
                                  <strong className="font-semibold text-stone-800">
                                    {item.safetyStock}
                                  </strong>
                                </span>
                                <span>
                                  Current coverage{" "}
                                  <strong className="font-semibold text-stone-800">
                                    {coveragePercent.toFixed(0)}%
                                  </strong>
                                </span>
                              </div>
                              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-200">
                                <div
                                  className={`h-full rounded-full ${
                                    coveragePercent >= 100
                                      ? "bg-emerald-500"
                                      : coveragePercent >= 60
                                        ? "bg-amber-500"
                                        : "bg-red-500"
                                  }`}
                                  style={{ width: `${coveragePercent}%` }}
                                />
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })
            ) : (
              <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-5 text-sm text-stone-500">
                No products currently need a lead-time-aware reorder draft.
              </div>
            )}
          </div>
        </Card>

        <Card className="h-full">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
            Exception handling
          </div>
          <h2
            id="adjust-stock"
            className="mt-2 text-xl font-black text-stone-900"
          >
            Stock corrections and write-offs
          </h2>
          <p className="mt-2 text-sm text-stone-500">
            Use this screen only for exceptional corrections. Stock counts,
            supplier returns, customer return restocks, and branch transfers
            remain the preferred business workflows whenever they apply.
          </p>
          <div className="mt-6">
            <AdjustmentForm products={products} reasons={reasons} />
          </div>
        </Card>
      </div>

      <Card>
        <ProductBatchManager
          products={products}
          initialBatches={batches}
          inventoryFeatures={inventoryFeatures}
        />
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
              Inventory ledger
            </div>
            <h2 className="mt-2 text-xl font-black text-stone-900">
              Inventory movement history
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-500">
              Track purchases, sales, counts, transfers, returns, and
              reason-coded corrections in one chronological ledger.
            </p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-500">
            Showing latest {movements.length} movements
          </div>
        </div>
        <div className="mt-5">
          <InventoryMovementTable
            movements={movements}
            lowStockThreshold={lowStockThreshold}
          />
        </div>
      </Card>
    </div>
  );
}

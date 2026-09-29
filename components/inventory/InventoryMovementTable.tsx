"use client";

import { useMemo, useState } from "react";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import { getInventoryMovementTypeLabel } from "@/lib/business-labels";
import { dateTime } from "@/lib/format";

type Movement = {
  id: string;
  type: string;
  qtyChange: number;
  referenceId?: string | null;
  notes?: string | null;
  reasonLabel?: string | null;
  reasonCode?: string | null;
  createdAt: string;
  product: {
    name: string;
    sku?: string | null;
    barcode?: string | null;
  };
};

const PAGE_SIZE = 20;

function toneForType(type: string) {
  const normalized = type.toUpperCase();

  if (normalized.includes("SALE")) {
    return "red";
  }

  if (
    normalized.includes("SUPPLIER_RETURN") ||
    normalized.includes("TRANSFER_OUT")
  ) {
    return "red";
  }

  if (
    normalized.includes("PURCHASE") ||
    normalized.includes("OPENING") ||
    normalized.includes("TRANSFER_IN") ||
    normalized.includes("CUSTOMER_RETURN")
  ) {
    return "emerald";
  }

  if (normalized.includes("COUNT")) {
    return "blue";
  }

  if (normalized.includes("ADJUSTMENT") || normalized.includes("CORRECTION")) {
    return "amber";
  }

  return "stone";
}

function quantityClass(qtyChange: number) {
  if (qtyChange > 0) return "text-emerald-700";
  if (qtyChange < 0) return "text-red-600";
  return "text-stone-600";
}

function formatQty(qtyChange: number) {
  return qtyChange > 0 ? `+${qtyChange}` : String(qtyChange);
}

export default function InventoryMovementTable({
  movements,
}: {
  movements: Movement[];
  lowStockThreshold: number;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);

  const movementTypes = useMemo(
    () => [...new Set(movements.map((movement) => movement.type))].sort(),
    [movements],
  );

  const filteredMovements = useMemo(() => {
    const term = query.trim().toLowerCase();

    return movements.filter((movement) => {
      const matchesType = !typeFilter || movement.type === typeFilter;
      if (!matchesType) return false;

      if (!term) return true;

      return [
        movement.product.name,
        movement.product.sku ?? "",
        movement.product.barcode ?? "",
        movement.type,
        getInventoryMovementTypeLabel(movement.type),
        movement.reasonLabel ?? "",
        movement.reasonCode ?? "",
        movement.referenceId ?? "",
        movement.notes ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [movements, query, typeFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredMovements.length / PAGE_SIZE),
  );
  const safePage = Math.min(page, totalPages);
  const visibleMovements = filteredMovements.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const firstVisible = filteredMovements.length
    ? (safePage - 1) * PAGE_SIZE + 1
    : 0;
  const lastVisible = Math.min(safePage * PAGE_SIZE, filteredMovements.length);

  if (!movements.length) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-sm text-stone-500">
        No inventory movement records yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search product, SKU, barcode, reference, reason, or notes..."
          />
          <select
            value={typeFilter}
            onChange={(event) => {
              setTypeFilter(event.target.value);
              setPage(1);
            }}
            className="h-11 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm text-stone-700 outline-none transition hover:border-stone-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
          >
            <option value="">All movement types</option>
            {movementTypes.map((type) => (
              <option key={type} value={type}>
                {getInventoryMovementTypeLabel(type)}
              </option>
            ))}
          </select>
        </div>

        <div className="shrink-0 text-xs font-medium text-stone-500">
          {filteredMovements.length} of {movements.length} records
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-[24px] border border-stone-200 md:block">
        <div className="overflow-x-auto">
          <table className="min-w-[1040px] w-full table-fixed text-left text-sm">
            <thead className="bg-stone-50 text-stone-500">
              <tr>
                <th className="w-[150px] px-4 py-3.5 font-semibold">
                  Date / Time
                </th>
                <th className="w-[190px] px-4 py-3.5 font-semibold">Product</th>
                <th className="w-[150px] px-4 py-3.5 font-semibold">
                  Movement
                </th>
                <th className="w-[170px] px-4 py-3.5 font-semibold">Reason</th>
                <th className="w-[95px] px-4 py-3.5 text-right font-semibold">
                  Qty
                </th>
                <th className="w-[190px] px-4 py-3.5 font-semibold">
                  Reference
                </th>
                <th className="px-4 py-3.5 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody>
              {visibleMovements.map((movement) => (
                <tr
                  key={movement.id}
                  className="border-t border-stone-200 bg-white align-top transition hover:bg-stone-50/70"
                >
                  <td className="px-4 py-4 text-stone-600">
                    <div className="whitespace-nowrap text-xs font-medium">
                      {dateTime(movement.createdAt)}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="truncate font-semibold text-stone-900">
                      {movement.product.name}
                    </div>
                    {movement.product.sku || movement.product.barcode ? (
                      <div className="mt-1 truncate text-xs text-stone-500">
                        {movement.product.sku ?? movement.product.barcode}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-4">
                    <Badge tone={toneForType(movement.type)}>
                      {getInventoryMovementTypeLabel(movement.type)}
                    </Badge>
                  </td>
                  <td className="px-4 py-4">
                    {movement.reasonLabel ? (
                      <div>
                        <div className="truncate font-medium text-stone-800">
                          {movement.reasonLabel}
                        </div>
                        <div className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">
                          {movement.reasonCode?.replaceAll("_", " ") ??
                            "Reason"}
                        </div>
                      </div>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </td>
                  <td
                    className={`px-4 py-4 text-right font-black tabular-nums ${quantityClass(movement.qtyChange)}`}
                  >
                    {formatQty(movement.qtyChange)}
                  </td>
                  <td className="px-4 py-4">
                    {movement.referenceId ? (
                      <div
                        className="truncate font-mono text-[11px] text-stone-600"
                        title={movement.referenceId}
                      >
                        {movement.referenceId}
                      </div>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-stone-600">
                    <div className="max-h-10 overflow-hidden leading-5">
                      {movement.notes ?? "—"}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!visibleMovements.length ? (
          <div className="border-t border-stone-200 bg-stone-50 px-6 py-10 text-center text-sm text-stone-500">
            No inventory movements match the current search or filter.
          </div>
        ) : null}
      </div>

      <div className="space-y-3 md:hidden">
        {visibleMovements.map((movement) => (
          <article
            key={movement.id}
            className="rounded-[22px] border border-stone-200 bg-white p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-semibold text-stone-900">
                  {movement.product.name}
                </div>
                <div className="mt-1 text-xs text-stone-500">
                  {dateTime(movement.createdAt)}
                </div>
              </div>
              <div
                className={`shrink-0 text-base font-black tabular-nums ${quantityClass(movement.qtyChange)}`}
              >
                {formatQty(movement.qtyChange)}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={toneForType(movement.type)}>
                {getInventoryMovementTypeLabel(movement.type)}
              </Badge>
              {movement.reasonLabel ? (
                <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-600">
                  {movement.reasonLabel}
                </span>
              ) : null}
            </div>

            {movement.referenceId || movement.notes ? (
              <div className="mt-3 space-y-2 border-t border-stone-100 pt-3 text-xs text-stone-500">
                {movement.referenceId ? (
                  <div className="break-all">
                    <span className="font-semibold text-stone-700">Ref:</span>{" "}
                    {movement.referenceId}
                  </div>
                ) : null}
                {movement.notes ? (
                  <div className="leading-5">{movement.notes}</div>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}

        {!visibleMovements.length ? (
          <div className="rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-5 py-8 text-center text-sm text-stone-500">
            No inventory movements match the current search or filter.
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 border-t border-stone-100 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-stone-500">
          Showing {firstVisible}-{lastVisible} of {filteredMovements.length}
        </div>

        {totalPages > 1 ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <span className="px-2 text-xs font-semibold text-stone-500">
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

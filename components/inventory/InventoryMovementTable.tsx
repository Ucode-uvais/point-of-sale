"use client";

import { useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import { getInventoryMovementTypeLabel } from "@/lib/business-labels";
import { dateTime } from "@/lib/format";

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

type MovementResponse = {
  items: Movement[];
  pagination: {
    pageSize: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
  filters: {
    range: string;
    from: string | null;
    to: string | null;
    type: string | null;
    query: string;
  };
};

const MOVEMENT_TYPES = [
  "PURCHASE_RECEIVED",
  "SUPPLIER_RETURN_POSTED",
  "SALE_COMPLETED",
  "SALE_VOIDED",
  "RETURN_RESTOCKED",
  "EXCHANGE_ISSUED",
  "STOCK_COUNT_POSTED",
  "MANUAL_ADJUSTMENT",
  "OPENING_STOCK",
  "TRANSFER_OUT",
  "TRANSFER_IN",
] as const;

const RANGE_OPTIONS = [
  { value: "30d", label: "Last 30 days" },
  { value: "60d", label: "Last 60 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "365d", label: "Last 12 months" },
  { value: "all", label: "All history" },
  { value: "custom", label: "Custom dates" },
] as const;

function toneForType(type: string) {
  const normalized = type.toUpperCase();

  if (
    normalized.includes("SALE_COMPLETED") ||
    normalized.includes("SUPPLIER_RETURN") ||
    normalized.includes("TRANSFER_OUT")
  ) {
    return "red";
  }

  if (
    normalized.includes("PURCHASE") ||
    normalized.includes("OPENING") ||
    normalized.includes("TRANSFER_IN") ||
    normalized.includes("RETURN_RESTOCKED") ||
    normalized.includes("SALE_VOIDED")
  ) {
    return "emerald";
  }

  if (normalized.includes("COUNT")) return "blue";
  if (normalized.includes("ADJUSTMENT") || normalized.includes("CORRECTION"))
    return "amber";
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

function todayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function thirtyDaysAgoInputValue() {
  const date = new Date();
  date.setDate(date.getDate() - 29);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function InventoryMovementTable() {
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [range, setRange] = useState("30d");
  const [customFrom, setCustomFrom] = useState(thirtyDaysAgoInputValue);
  const [customTo, setCustomTo] = useState(todayInputValue);
  const [pageSize, setPageSize] = useState(25);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([
    null,
  ]);
  const [requestCursor, setRequestCursor] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQuery = queryInput.trim();
      if (nextQuery === query) return;

      setQuery(nextQuery);
      setPage(1);
      setCursorHistory([null]);
      setRequestCursor(null);
      setLoading(true);
      setError("");
    }, 350);

    return () => window.clearTimeout(timer);
  }, [queryInput, query]);

  function resetPagination() {
    setPage(1);
    setCursorHistory([null]);
    setRequestCursor(null);
    setLoading(true);
    setError("");
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadMovements() {
      try {
        const params = new URLSearchParams({
          range,
          pageSize: String(pageSize),
        });

        if (query) params.set("q", query);
        if (typeFilter) params.set("type", typeFilter);
        if (requestCursor) params.set("cursor", requestCursor);

        if (range === "custom") {
          params.set("from", customFrom);
          params.set("to", customTo);
        }

        const response = await fetch(
          `/api/inventory/movements?${params.toString()}`,
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );

        const data = (await response.json().catch(() => ({
          error: "Unable to load inventory movement history.",
        }))) as MovementResponse & { error?: string };

        if (!response.ok) {
          throw new Error(
            data.error ?? "Unable to load inventory movement history.",
          );
        }

        setMovements(data.items);
        setHasMore(data.pagination.hasMore);
        setNextCursor(data.pagination.nextCursor);
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        )
          return;
        setMovements([]);
        setHasMore(false);
        setNextCursor(null);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load inventory movement history.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadMovements();
    return () => controller.abort();
  }, [query, typeFilter, range, customFrom, customTo, pageSize, requestCursor]);

  function goToNextPage() {
    if (!nextCursor || loading) return;
    setLoading(true);
    setError("");
    setCursorHistory((current) => {
      const next = current.slice(0, page);
      next[page] = nextCursor;
      return next;
    });
    setPage((current) => current + 1);
    setRequestCursor(nextCursor);
  }

  function goToPreviousPage() {
    if (page <= 1 || loading) return;
    setLoading(true);
    setError("");
    const previousPage = page - 1;
    const previousCursor = cursorHistory[previousPage - 1] ?? null;
    setPage(previousPage);
    setRequestCursor(previousCursor);
  }

  function goToFirstPage() {
    if (page === 1 || loading) return;
    setLoading(true);
    setError("");
    setPage(1);
    setRequestCursor(null);
  }

  function resetFilters() {
    setQueryInput("");
    setQuery("");
    setTypeFilter("");
    setRange("30d");
    setCustomFrom(thirtyDaysAgoInputValue());
    setCustomTo(todayInputValue());
    setPageSize(25);
    resetPagination();
  }

  const rangeLabel =
    RANGE_OPTIONS.find((option) => option.value === range)?.label ??
    "Movement history";

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-stone-200 bg-stone-50/70 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.5fr)_minmax(180px,0.8fr)_minmax(180px,0.8fr)_130px]">
          <Input
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="Search product, SKU, barcode, reference, reason, or notes..."
          />

          <select
            value={typeFilter}
            onChange={(event) => {
              setTypeFilter(event.target.value);
              resetPagination();
            }}
            className="h-11 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm text-stone-700 outline-none transition hover:border-stone-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
          >
            <option value="">All movement types</option>
            {MOVEMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {getInventoryMovementTypeLabel(type)}
              </option>
            ))}
          </select>

          <select
            value={range}
            onChange={(event) => {
              setRange(event.target.value);
              resetPagination();
            }}
            className="h-11 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm text-stone-700 outline-none transition hover:border-stone-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              resetPagination();
            }}
            className="h-11 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm text-stone-700 outline-none transition hover:border-stone-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
            aria-label="Rows per page"
          >
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
        </div>

        {range === "custom" ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:max-w-xl">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-stone-600">From</span>
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(event) => {
                  setCustomFrom(event.target.value);
                  resetPagination();
                }}
                className="h-11 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm text-stone-700 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-stone-600">To</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(event) => {
                  setCustomTo(event.target.value);
                  resetPagination();
                }}
                className="h-11 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm text-stone-700 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              />
            </label>
          </div>
        ) : null}

        <div className="mt-3 flex flex-col gap-2 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="font-semibold text-stone-700">{rangeLabel}</span>
            {query ? ` · Search: “${query}”` : ""}
            {typeFilter
              ? ` · ${getInventoryMovementTypeLabel(typeFilter)}`
              : ""}
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="self-start font-semibold text-emerald-700 hover:text-emerald-800 sm:self-auto"
          >
            Reset filters
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="hidden overflow-hidden rounded-3xl border border-stone-200 md:block">
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
              {movements.map((movement) => (
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

        {!loading && !movements.length && !error ? (
          <div className="border-t border-stone-200 bg-stone-50 px-6 py-10 text-center text-sm text-stone-500">
            No inventory movements match this date range or filter.
          </div>
        ) : null}

        {loading ? (
          <div className="border-t border-stone-200 bg-white px-6 py-10 text-center text-sm font-medium text-stone-500">
            Loading movement history…
          </div>
        ) : null}
      </div>

      <div className="space-y-3 md:hidden">
        {movements.map((movement) => (
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

            {movement.product.sku || movement.product.barcode ? (
              <div className="mt-3 text-xs text-stone-500">
                {movement.product.sku
                  ? `SKU ${movement.product.sku}`
                  : `Barcode ${movement.product.barcode}`}
              </div>
            ) : null}

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

        {!loading && !movements.length && !error ? (
          <div className="rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-5 py-8 text-center text-sm text-stone-500">
            No inventory movements match this date range or filter.
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-[22px] border border-stone-200 bg-white px-5 py-8 text-center text-sm font-medium text-stone-500">
            Loading movement history…
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 border-t border-stone-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-stone-500">
          Page <span className="font-semibold text-stone-700">{page}</span>
          {" · "}
          {movements.length} record{movements.length === 1 ? "" : "s"} on this
          page
          {hasMore
            ? " · More records available"
            : page > 1
              ? " · End of results"
              : ""}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={goToPreviousPage}
            className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={!hasMore || !nextCursor || loading}
            onClick={goToNextPage}
            className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
          {page > 2 ? (
            <button
              type="button"
              disabled={loading}
              onClick={goToFirstPage}
              className="col-span-2 text-xs font-semibold text-emerald-700 hover:text-emerald-800 sm:col-auto sm:px-2"
            >
              Back to first page
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

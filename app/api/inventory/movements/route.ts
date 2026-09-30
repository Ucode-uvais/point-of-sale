import { InventoryMovementType, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api";
import { requirePermission } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const DEFAULT_RANGE = "30d";

const RANGE_DAYS: Record<string, number> = {
  "30d": 30,
  "60d": 60,
  "90d": 90,
  "365d": 365,
};

function clampPageSize(value: string | null) {
  const parsed = Number(value ?? DEFAULT_PAGE_SIZE);
  if (!Number.isFinite(parsed)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(10, Math.trunc(parsed)));
}

function startOfUtcDay(value: Date) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function endOfUtcDay(value: Date) {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

function parseDateInput(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveDateFilter(params: URLSearchParams) {
  const requestedRange = params.get("range") ?? DEFAULT_RANGE;

  if (requestedRange === "all") {
    return {
      preset: "all",
      createdAt: undefined as Prisma.DateTimeFilter | undefined,
      from: null as Date | null,
      to: null as Date | null,
    };
  }

  if (requestedRange === "custom") {
    const fromInput = parseDateInput(params.get("from"));
    const toInput = parseDateInput(params.get("to"));

    if (!fromInput || !toInput) {
      throw new Error(
        "Choose both a start date and an end date for a custom range.",
      );
    }

    const from = startOfUtcDay(fromInput);
    const to = endOfUtcDay(toInput);

    if (from.getTime() > to.getTime()) {
      throw new Error(
        "The movement history start date cannot be after the end date.",
      );
    }

    return {
      preset: "custom",
      createdAt: { gte: from, lte: to },
      from,
      to,
    };
  }

  const days = RANGE_DAYS[requestedRange] ?? RANGE_DAYS[DEFAULT_RANGE];
  const to = new Date();
  const from = startOfUtcDay(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));

  return {
    preset: RANGE_DAYS[requestedRange] ? requestedRange : DEFAULT_RANGE,
    createdAt: { gte: from, lte: to },
    from,
    to,
  };
}

function normalizeMovementType(value: string | null) {
  if (!value) return null;
  const values = Object.values(InventoryMovementType) as string[];
  return values.includes(value) ? (value as InventoryMovementType) : null;
}

export async function GET(request: Request) {
  try {
    const { shopId } = await requirePermission("ADJUST_INVENTORY");
    const url = new URL(request.url);
    const params = url.searchParams;

    const pageSize = clampPageSize(params.get("pageSize"));
    const cursor = params.get("cursor")?.trim() || null;
    const type = normalizeMovementType(params.get("type"));
    const query = (params.get("q") ?? "").trim().slice(0, 120);
    const dateFilter = resolveDateFilter(params);

    const where: Prisma.InventoryMovementWhereInput = {
      shopId,
      ...(dateFilter.createdAt ? { createdAt: dateFilter.createdAt } : {}),
      ...(type ? { type } : {}),
      ...(query
        ? {
            OR: [
              { referenceId: { contains: query, mode: "insensitive" } },
              { notes: { contains: query, mode: "insensitive" } },
              {
                product: {
                  is: {
                    OR: [
                      { name: { contains: query, mode: "insensitive" } },
                      { sku: { contains: query, mode: "insensitive" } },
                      { barcode: { contains: query, mode: "insensitive" } },
                    ],
                  },
                },
              },
              {
                reason: {
                  is: {
                    OR: [
                      { label: { contains: query, mode: "insensitive" } },
                      { code: { contains: query, mode: "insensitive" } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };

    const rows = await prisma.inventoryMovement.findMany({
      where,
      select: {
        id: true,
        type: true,
        qtyChange: true,
        referenceId: true,
        notes: true,
        createdAt: true,
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
          },
        },
        reason: {
          select: {
            label: true,
            code: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
    });

    const hasMore = rows.length > pageSize;
    const visibleRows = hasMore ? rows.slice(0, pageSize) : rows;
    const lastItem = visibleRows.at(-1);

    return NextResponse.json(
      {
        items: visibleRows.map((movement) => ({
          id: movement.id,
          type: movement.type,
          qtyChange: movement.qtyChange,
          referenceId: movement.referenceId,
          notes: movement.notes,
          reasonLabel: movement.reason?.label ?? null,
          reasonCode: movement.reason?.code ?? null,
          createdAt: movement.createdAt.toISOString(),
          product: movement.product,
        })),
        pagination: {
          pageSize,
          hasMore,
          nextCursor: hasMore && lastItem ? lastItem.id : null,
        },
        filters: {
          range: dateFilter.preset,
          from: dateFilter.from?.toISOString() ?? null,
          to: dateFilter.to?.toISOString() ?? null,
          type,
          query,
        },
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Choose both")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (
      error instanceof Error &&
      error.message.startsWith("The movement history start date")
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return apiErrorResponse(
      error,
      "Unable to load inventory movement history.",
    );
  }
}

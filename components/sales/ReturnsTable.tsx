"use client";

import Link from "next/link";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { dateTime, money } from "@/lib/format";

type ReturnRecord = {
  id: string;
  adjustmentNumber: string;
  type: string;
  saleId: string;
  saleNumber: string;
  reason: string;
  totalAmount: string;
  subtotal: string;
  createdAt: string;
  createdBy: string;
  approvedBy: string;
  itemCount: number;
};

function toneForType(type: string) {
  if (type === "VOID") return "red";
  if (type === "EXCHANGE") return "blue";
  return "amber";
}

export default function ReturnsTable({
  items,
  currencySymbol,
}: {
  items: ReturnRecord[];
  currencySymbol: string;
}) {
  return (
    <Card>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Returns history
          </div>
          <h2 className="mt-2 text-xl font-black text-stone-900">
            Refunds, voids, and exchanges
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Every adjustment is linked back to the sale, reason, operator,
            approver, and printable receipt.
          </p>
        </div>
        <div className="rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
          {items.length} record(s)
        </div>
      </div>

      <div className="overflow-hidden rounded-[26px] border border-stone-200">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-stone-50 text-stone-500">
              <tr>
                <th className="px-4 py-3.5">Adjustment</th>
                <th className="px-4 py-3.5">Sale</th>
                <th className="px-4 py-3.5">Reason</th>
                <th className="px-4 py-3.5">Amount</th>
                <th className="px-4 py-3.5">Users</th>
                <th className="px-4 py-3.5">When</th>
                <th className="px-4 py-3.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-stone-200 bg-white transition hover:bg-stone-50/70"
                >
                  <td className="px-4 py-4">
                    <div className="font-semibold text-stone-900">
                      {item.adjustmentNumber}
                    </div>
                    <div className="mt-1">
                      <Badge tone={toneForType(item.type)}>{item.type}</Badge>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <Link
                      href={`/sales/${item.saleId}`}
                      className="font-semibold text-emerald-700"
                    >
                      {item.saleNumber}
                    </Link>
                    <div className="mt-1 text-xs text-stone-500">
                      {item.itemCount} item(s)
                    </div>
                  </td>
                  <td className="max-w-sm px-4 py-4 text-stone-700">
                    {item.reason}
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-semibold text-stone-900">
                      {money(item.totalAmount, currencySymbol)}
                    </div>
                    <div className="mt-1 text-xs text-stone-500">
                      Credit {money(item.subtotal, currencySymbol)}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-stone-600">
                    <div>{item.createdBy}</div>
                    <div className="mt-1 text-xs text-stone-500">
                      Approved by {item.approvedBy}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-stone-600">
                    {dateTime(item.createdAt)}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex min-w-[88px] flex-col gap-2">
                      <Link
                        href={`/print/refund/${item.id}`}
                        className="inline-flex min-h-9 w-full items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
                      >
                        Receipt
                      </Link>
                      <Link
                        href={`/sales/${item.saleId}`}
                        className="inline-flex min-h-9 w-full items-center justify-center rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:border-stone-300 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
                      >
                        Sale
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!items.length ? (
          <div className="border-t border-stone-200 bg-stone-50 py-8 text-center text-sm text-stone-500">
            No return activity yet.
          </div>
        ) : null}
      </div>
    </Card>
  );
}

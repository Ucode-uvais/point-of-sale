import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { getSaleStatusLabel } from "@/lib/business-labels";
import { dateTime, money } from "@/lib/format";

type Sale = {
  id: string;
  saleNumber: string;
  receiptNumber: string;
  paymentMethod: string;
  cashierName: string | null;
  createdAt: string;
  totalAmount: string;
  customerName: string | null;
  status: string;
  isCreditSale?: boolean;
};

export default function SalesTable({
  sales,
  currencySymbol,
  canRefundSales,
  canVoidSales,
}: {
  sales: Sale[];
  currencySymbol: string;
  canRefundSales: boolean;
  canVoidSales: boolean;
}) {
  return (
    <Card>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Transactions
          </div>
          <h2 className="mt-2 text-xl font-black text-stone-900">
            Sales history
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Completed sales with receipt access and cashier context.
          </p>
        </div>
        <div className="rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
          {sales.length} record(s)
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-[26px] border border-stone-200">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-stone-50 text-stone-500">
              <tr>
                <th className="px-4 py-3.5">Sale</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Customer</th>
                <th className="px-4 py-3.5">Payment</th>
                <th className="px-4 py-3.5">Cashier</th>
                <th className="px-4 py-3.5">Date</th>
                <th className="px-4 py-3.5">Total</th>
                <th className="px-4 py-3.5">Actions</th>
              </tr>
            </thead>

            <tbody>
              {sales.map((sale) => (
                <tr
                  key={sale.id}
                  className="border-t border-stone-200 bg-white transition hover:bg-stone-50/70"
                >
                  <td className="px-4 py-4">
                    <Link
                      href={`/sales/${sale.id}`}
                      className="font-semibold text-emerald-700"
                    >
                      {sale.saleNumber}
                    </Link>
                    <div className="mt-1 text-xs text-stone-500">
                      {sale.receiptNumber}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <Badge tone={sale.status === "VOIDED" ? "red" : "emerald"}>
                      {getSaleStatusLabel(sale.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-4">
                    {sale.customerName ?? "Walk-in customer"}
                  </td>
                  <td className="px-4 py-4">
                    <Badge tone="blue">{sale.paymentMethod}</Badge>
                    {sale.isCreditSale ? (
                      <div className="mt-2">
                        <Badge tone="amber">Credit</Badge>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-4">{sale.cashierName ?? "Cashier"}</td>
                  <td className="px-4 py-4">{dateTime(sale.createdAt)}</td>
                  <td className="px-4 py-4 font-semibold text-stone-900">
                    {money(sale.totalAmount, currencySymbol)}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex min-w-[88px] flex-col gap-2">
                      <Link
                        href={`/sales/${sale.id}`}
                        className="inline-flex min-h-9 w-full items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
                      >
                        View
                      </Link>
                      <Link
                        href={`/sales/${sale.id}/receipt`}
                        className="inline-flex min-h-9 w-full items-center justify-center rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:border-stone-300 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
                      >
                        Reprint
                      </Link>
                      {canRefundSales ? (
                        <Link
                          href={`/sales/${sale.id}/refund`}
                          className="inline-flex min-h-9 w-full items-center justify-center rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:border-stone-300 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
                        >
                          Refund
                        </Link>
                      ) : null}
                      {canVoidSales ? (
                        <Link
                          href={`/sales/${sale.id}/void`}
                          className="inline-flex min-h-9 w-full items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/70"
                        >
                          Void
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!sales.length ? (
          <div className="border-t border-stone-200 bg-stone-50 px-6 py-8 text-center text-sm text-stone-500">
            <div className="font-semibold text-stone-900">No sales yet.</div>
            <div className="mt-2">
              Start a checkout to generate the first receipt, then reprints and
              refund history will appear here automatically.
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

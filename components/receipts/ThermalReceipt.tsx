"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { openCashDrawer } from "@/lib/cash-drawer";
import { dateTime, money, shortDate } from "@/lib/format";

type ReceiptWidth = "58mm" | "80mm";

type ReceiptItem = {
  id: string;
  productName: string;
  qty: number;
  unitPrice: string;
  lineTotal: string;
};

type ReceiptPayment = {
  id: string;
  method: string;
  amount: string;
  referenceNumber: string | null;
  createdAt: string;
};

type ReceiptSale = {
  id: string;
  saleNumber: string;
  receiptNumber: string;
  paymentMethod: string;
  cashierName: string | null;
  customerEmail?: string | null;
  customerBusinessName?: string | null;
  customerName: string | null;
  customerPhone: string | null;
  isCreditSale: boolean;
  creditDueDate: string | null;
  loyaltyPointsEarned: number;
  loyaltyPointsRedeemed: number;
  loyaltyDiscountAmount: string;
  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  totalAmount: string;
  totalPaid: string;
  cashReceived: string;
  changeDue: string;
  notes: string | null;
  createdAt: string;
  payments: ReceiptPayment[];
  items: ReceiptItem[];
};

type ReceiptShop = {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
};

const CODE39_PATTERNS: Record<string, string> = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  A: "wnnnnwnnw",
  B: "nnwnnwnnw",
  C: "wnwnnwnnn",
  D: "nnnnwwnnw",
  E: "wnnnwwnnn",
  F: "nnwnwwnnn",
  G: "nnnnnwwnw",
  H: "wnnnnwwnn",
  I: "nnwnnwwnn",
  J: "nnnnwwwnn",
  K: "wnnnnnnww",
  L: "nnwnnnnww",
  M: "wnwnnnnwn",
  N: "nnnnwnnww",
  O: "wnnnwnnwn",
  P: "nnwnwnnwn",
  Q: "nnnnnnwww",
  R: "wnnnnnwwn",
  S: "nnwnnnwwn",
  T: "nnnnwnwwn",
  U: "wwnnnnnnw",
  V: "nwwnnnnnw",
  W: "wwwnnnnnn",
  X: "nwnnwnnnw",
  Y: "wwnnwnnnn",
  Z: "nwwnwnnnn",
  "-": "nwnnnnwnw",
  ".": "wwnnnnwnn",
  " ": "nwwnnnwnn",
  $: "nwnwnwnnn",
  "/": "nwnwnnnwn",
  "+": "nwnnnwnwn",
  "%": "nnnwnwnwn",
  "*": "nwnnwnwnn",
};

function sanitizeBarcodeValue(value: string) {
  const sanitized = value
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z.\- $/+%]/g, "-");
  return sanitized || "RECEIPT";
}

function buildCode39Bars(value: string) {
  const encoded = `*${sanitizeBarcodeValue(value)}*`;

  return encoded
    .split("")
    .map((character, index) => ({
      id: `${character}-${index}`,
      pattern: CODE39_PATTERNS[character] ?? CODE39_PATTERNS["-"],
    }))
    .flatMap((segment, segmentIndex) =>
      segment.pattern.split("").map((token, tokenIndex) => ({
        id: `${segment.id}-${tokenIndex}`,
        isBar: tokenIndex % 2 === 0,
        width: token === "w" ? 3 : 1,
        addGap:
          tokenIndex === segment.pattern.length - 1 &&
          segmentIndex < encoded.length - 1,
      })),
    );
}

function buildBrandMark(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "VP"
  );
}

export default function ThermalReceipt({
  sale,
  shop,
  currencySymbol,
  receiptHeader,
  receiptFooter,
  receiptWidth = "80mm",
  receiptShowBrandMark = false,
  printerSafeMode = true,
  cashDrawerKickEnabled = false,
  autoprint = false,
  testMode = false,
}: {
  sale: ReceiptSale;
  shop: ReceiptShop;
  currencySymbol: string;
  receiptHeader?: string | null;
  receiptFooter?: string | null;
  receiptWidth?: ReceiptWidth;
  receiptShowBrandMark?: boolean;
  printerSafeMode?: boolean;
  cashDrawerKickEnabled?: boolean;
  autoprint?: boolean;
  testMode?: boolean;
}) {
  const paperWidth = receiptWidth === "58mm" ? "58mm" : "80mm";
  const compact = paperWidth === "58mm" || printerSafeMode;
  const brandMark = useMemo(
    () => buildBrandMark(receiptHeader || shop.name),
    [receiptHeader, shop.name],
  );
  const barcodeBars = useMemo(
    () => buildCode39Bars(sale.receiptNumber),
    [sale.receiptNumber],
  );
  const [drawerMessage, setDrawerMessage] = useState("");
  const [drawerBusy, setDrawerBusy] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);
  const printInFlightRef = useRef(false);

  const printReceipt = useCallback(() => {
    const receiptElement = receiptRef.current;
    if (!receiptElement || printInFlightRef.current) {
      return;
    }

    printInFlightRef.current = true;

    const runtimeStyleId = "thermal-receipt-runtime-print-style";
    const printHostId = "thermal-receipt-print-host";

    document.getElementById(runtimeStyleId)?.remove();
    document.getElementById(printHostId)?.remove();

    // Clone the receipt into a temporary element that is a DIRECT child of
    // <body>. This is important for checkout: the on-screen receipt is nested
    // deep inside cards/layout containers, and positioning that nested node for
    // print can leave the first thermal page completely blank.
    const printHost = document.createElement("div");
    printHost.id = printHostId;
    printHost.setAttribute("aria-hidden", "true");
    printHost.style.position = "fixed";
    printHost.style.left = "-10000px";
    printHost.style.top = "0";
    printHost.style.width = paperWidth;
    printHost.style.maxWidth = paperWidth;
    printHost.style.margin = "0";
    printHost.style.padding = "0";
    printHost.style.background = "#fff";
    printHost.style.opacity = "0";
    printHost.style.pointerEvents = "none";

    const clonedReceipt = receiptElement.cloneNode(true) as HTMLDivElement;
    clonedReceipt.style.position = "static";
    clonedReceipt.style.left = "auto";
    clonedReceipt.style.top = "auto";
    clonedReceipt.style.width = paperWidth;
    clonedReceipt.style.maxWidth = paperWidth;
    clonedReceipt.style.boxSizing = "border-box";
    clonedReceipt.style.margin = "0";
    clonedReceipt.style.padding = printerSafeMode ? "2.5mm" : "4mm";
    clonedReceipt.style.overflow = "visible";
    clonedReceipt.style.border = "0";
    clonedReceipt.style.borderRadius = "0";
    clonedReceipt.style.boxShadow = "none";
    clonedReceipt.style.background = "#fff";

    printHost.appendChild(clonedReceipt);
    document.body.appendChild(printHost);

    // Chrome does not reliably support `@page size: 80mm auto`. Measure the
    // actual print clone and use an explicit roll-paper height instead.
    const renderedHeightPx = Math.max(
      clonedReceipt.getBoundingClientRect().height,
      clonedReceipt.scrollHeight,
    );
    const cssPxToMm = 25.4 / 96;
    const safetyBufferMm = 12;
    const pageHeightMm = Math.max(
      80,
      Math.ceil(renderedHeightPx * cssPxToMm + safetyBufferMm),
    );

    const runtimeStyle = document.createElement("style");
    runtimeStyle.id = runtimeStyleId;
    runtimeStyle.textContent = `
      @page {
        size: ${paperWidth} ${pageHeightMm}mm;
        margin: 0;
      }

      @media print {
        html,
        body {
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
          overflow: visible !important;
        }

        body > *:not(#${printHostId}) {
          display: none !important;
        }

        #${printHostId} {
          display: block !important;
          position: static !important;
          left: auto !important;
          top: auto !important;
          width: ${paperWidth} !important;
          max-width: ${paperWidth} !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
          opacity: 1 !important;
          visibility: visible !important;
          pointer-events: auto !important;
        }

        #${printHostId} .receipt-root,
        #${printHostId} .receipt-root * {
          visibility: visible !important;
        }

        #${printHostId} .receipt-root {
          display: block !important;
          position: static !important;
          left: auto !important;
          top: auto !important;
          width: ${paperWidth} !important;
          max-width: ${paperWidth} !important;
          min-width: 0 !important;
          box-sizing: border-box !important;
          margin: 0 !important;
          padding: ${printerSafeMode ? "2.5mm" : "4mm"} !important;
          overflow: visible !important;
          border: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          background: #fff !important;
        }

        #${printHostId} .receipt-print-hide {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(runtimeStyle);

    let cleaned = false;
    const cleanupPrintJob = () => {
      if (cleaned) return;
      cleaned = true;
      window.removeEventListener("afterprint", cleanupPrintJob);
      runtimeStyle.remove();
      printHost.remove();
      printInFlightRef.current = false;
    };

    window.addEventListener("afterprint", cleanupPrintJob, { once: true });

    // Let Chrome commit the temporary print tree and @page rule before opening
    // the preview. Two frames are enough without introducing a visible delay.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.print();
      });
    });

    // Safety cleanup for browsers that fail to dispatch afterprint.
    window.setTimeout(cleanupPrintJob, 60_000);
  }, [paperWidth, printerSafeMode]);

  useEffect(() => {
    if (!autoprint) {
      return;
    }

    const timer = window.setTimeout(printReceipt, 450);
    return () => window.clearTimeout(timer);
  }, [autoprint, printReceipt]);

  async function handleDrawerKick() {
    if (drawerBusy) {
      return;
    }

    setDrawerBusy(true);
    setDrawerMessage("");

    try {
      const result = await openCashDrawer({
        source: testMode ? "print-test" : "receipt-print",
        saleId: sale.id,
        receiptNumber: sale.receiptNumber,
        triggeredAt: new Date().toISOString(),
      });

      setDrawerMessage(result.message);
    } catch (error) {
      setDrawerMessage(
        error instanceof Error
          ? `Unable to trigger the cash drawer: ${error.message}`
          : "Unable to trigger the cash drawer.",
      );
    } finally {
      setDrawerBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <style jsx global>{`
        @media print {
          .receipt-print-hide {
            display: none !important;
          }
        }
      `}</style>

      <div className="receipt-print-hide flex flex-wrap gap-3">
        <Button type="button" onClick={printReceipt}>
          {testMode ? "Print test page" : "Print receipt"}
        </Button>
        {cashDrawerKickEnabled ? (
          <Button
            type="button"
            variant="secondary"
            onClick={handleDrawerKick}
            disabled={drawerBusy}
          >
            {drawerBusy ? "Triggering drawer…" : "Open cash drawer"}
          </Button>
        ) : null}
        {drawerMessage ? (
          <div
            className={`max-w-xl rounded-2xl px-4 py-3 text-sm ${
              drawerMessage.toLowerCase().includes("unreachable") ||
              drawerMessage.toLowerCase().includes("unable") ||
              drawerMessage.toLowerCase().includes("rejected")
                ? "border border-red-200 bg-red-50 text-red-800"
                : drawerMessage.toLowerCase().includes("fallback")
                  ? "border border-amber-200 bg-amber-50 text-amber-800"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {drawerMessage}
          </div>
        ) : null}
      </div>

      <div
        ref={receiptRef}
        className={`receipt-root mx-auto border border-stone-200 bg-white ${
          printerSafeMode ? "font-mono shadow-none" : "shadow-sm"
        } ${compact ? "rounded-2xl p-3.5" : "rounded-3xl p-5"}`}
        style={{ width: paperWidth, maxWidth: paperWidth }}
      >
        <div className="border-b border-dashed border-stone-300 pb-4 text-center">
          {receiptShowBrandMark ? (
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-stone-900 text-sm font-black tracking-[0.18em] text-stone-950">
              {brandMark}
            </div>
          ) : null}
          <div
            className={`${compact ? "text-sm" : "text-base"} font-black text-stone-900`}
          >
            {receiptHeader || shop.name}
          </div>
          {shop.address ? (
            <div
              className={`mt-1 ${compact ? "text-[10px]" : "text-[11px]"} text-stone-600`}
            >
              {shop.address}
            </div>
          ) : null}
          <div
            className={`mt-1 ${compact ? "text-[10px]" : "text-[11px]"} text-stone-600`}
          >
            {shop.phone || "N/A"}
            {shop.email ? ` | ${shop.email}` : ""}
          </div>
          {printerSafeMode ? (
            <div
              className={`mt-2 ${
                compact ? "text-[10px]" : "text-[11px]"
              } font-semibold uppercase tracking-[0.18em] text-stone-500`}
            >
              Printer-safe thermal layout
            </div>
          ) : null}
        </div>

        <div
          className={`space-y-1 border-b border-dashed border-stone-300 py-4 ${
            compact ? "text-[10px]" : "text-[11px]"
          } text-stone-700`}
        >
          <div className="flex justify-between gap-3">
            <span>Receipt No.</span>
            <span className="text-right">{sale.receiptNumber}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Sale No.</span>
            <span className="text-right">{sale.saleNumber}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Date</span>
            <span className="text-right">{dateTime(sale.createdAt)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Cashier</span>
            <span className="text-right">{sale.cashierName ?? "Cashier"}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Payment</span>
            <span className="text-right">{sale.paymentMethod}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Customer</span>
            <span className="text-right">{sale.customerName ?? "Walk-in"}</span>
          </div>
          {sale.customerBusinessName ? (
            <div className="flex justify-between gap-3">
              <span>Business</span>
              <span className="text-right">{sale.customerBusinessName}</span>
            </div>
          ) : null}
          {sale.customerPhone ? (
            <div className="flex justify-between gap-3">
              <span>Phone</span>
              <span className="text-right">{sale.customerPhone}</span>
            </div>
          ) : null}
          {sale.customerEmail ? (
            <div className="flex justify-between gap-3">
              <span>Email</span>
              <span className="text-right">{sale.customerEmail}</span>
            </div>
          ) : null}
          {sale.isCreditSale && sale.creditDueDate ? (
            <div className="flex justify-between gap-3">
              <span>Due</span>
              <span className="text-right">
                {shortDate(sale.creditDueDate)}
              </span>
            </div>
          ) : null}
        </div>

        <div className="space-y-2 border-b border-dashed border-stone-300 py-4">
          {sale.items.map((item) => (
            <div
              key={item.id}
              className={compact ? "text-[10px]" : "text-[11px]"}
            >
              <div className="font-medium text-stone-900">
                {item.productName}
              </div>
              <div className="mt-1 flex justify-between gap-3 text-stone-600">
                <span>
                  {item.qty} x {money(item.unitPrice, currencySymbol)}
                </span>
                <span className="text-right">
                  {money(item.lineTotal, currencySymbol)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div
          className={`space-y-1 border-b border-dashed border-stone-300 py-4 ${
            compact ? "text-[10px]" : "text-[11px]"
          } text-stone-700`}
        >
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{money(sale.subtotal, currencySymbol)}</span>
          </div>
          <div className="flex justify-between">
            <span>Tax</span>
            <span>{money(sale.taxAmount, currencySymbol)}</span>
          </div>
          <div className="flex justify-between">
            <span>Discount</span>
            <span>-{money(sale.discountAmount, currencySymbol)}</span>
          </div>
          {Number(sale.loyaltyDiscountAmount) > 0 ? (
            <div className="flex justify-between">
              <span>Loyalty discount</span>
              <span>-{money(sale.loyaltyDiscountAmount, currencySymbol)}</span>
            </div>
          ) : null}
          <div className="flex justify-between pt-2 text-sm font-black text-stone-900">
            <span>Total</span>
            <span>{money(sale.totalAmount, currencySymbol)}</span>
          </div>
        </div>

        {sale.loyaltyPointsEarned > 0 || sale.loyaltyPointsRedeemed > 0 ? (
          <div
            className={`space-y-1 border-b border-dashed border-stone-300 py-4 ${
              compact ? "text-[10px]" : "text-[11px]"
            } text-stone-700`}
          >
            <div className="font-semibold text-stone-900">Loyalty</div>
            {sale.loyaltyPointsEarned > 0 ? (
              <div className="flex justify-between">
                <span>Points earned</span>
                <span>{sale.loyaltyPointsEarned}</span>
              </div>
            ) : null}
            {sale.loyaltyPointsRedeemed > 0 ? (
              <div className="flex justify-between">
                <span>Points redeemed</span>
                <span>{sale.loyaltyPointsRedeemed}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div
          className={`space-y-2 border-b border-dashed border-stone-300 py-4 ${
            compact ? "text-[10px]" : "text-[11px]"
          } text-stone-700`}
        >
          <div className="font-semibold text-stone-900">Payment summary</div>
          {sale.payments.map((payment) => (
            <div
              key={payment.id}
              className="rounded-2xl border border-stone-200 px-3 py-2"
            >
              <div className="flex justify-between gap-3">
                <span>{payment.method}</span>
                <span className="text-right">
                  {money(payment.amount, currencySymbol)}
                </span>
              </div>
              {payment.referenceNumber ? (
                <div className="mt-1 text-stone-500">
                  Ref: {payment.referenceNumber}
                </div>
              ) : null}
            </div>
          ))}
          <div className="flex justify-between">
            <span>Paid total</span>
            <span>{money(sale.totalPaid, currencySymbol)}</span>
          </div>
          {Number(sale.cashReceived) > 0 ? (
            <div className="flex justify-between">
              <span>Cash received</span>
              <span>{money(sale.cashReceived, currencySymbol)}</span>
            </div>
          ) : null}
          {Number(sale.changeDue) > 0 ? (
            <div className="flex justify-between font-semibold text-emerald-700">
              <span>Change due</span>
              <span>{money(sale.changeDue, currencySymbol)}</span>
            </div>
          ) : null}
        </div>

        <div
          className={`border-b border-dashed border-stone-300 py-4 text-center ${
            compact ? "text-[10px]" : "text-[11px]"
          }`}
        >
          <div className="font-semibold text-stone-900">Receipt barcode</div>
          <div className="mt-3 flex h-14 items-end justify-center gap-px rounded-xl border border-stone-200 bg-white px-3 py-2">
            {barcodeBars.map((bar) => (
              <span
                key={bar.id}
                className={
                  bar.isBar
                    ? "inline-block bg-stone-950"
                    : "inline-block bg-transparent"
                }
                style={{
                  width: `${bar.width}px`,
                  height: bar.isBar ? "36px" : "1px",
                  marginRight: bar.addGap ? "1px" : 0,
                }}
              />
            ))}
          </div>
          <div className="mt-2 font-mono tracking-[0.24em] text-stone-700">
            {sale.receiptNumber}
          </div>
          <div className="mt-2 text-[9px] uppercase tracking-[0.16em] text-stone-400">
            {testMode
              ? "Thermal alignment and barcode test"
              : "Use this identifier for reprints, audit lookup, and manual scanner checks"}
          </div>
        </div>

        {sale.notes ? (
          <div
            className={`border-b border-dashed border-stone-300 py-4 ${
              compact ? "text-[10px]" : "text-[11px]"
            } text-stone-600`}
          >
            <div className="font-semibold text-stone-900">Notes</div>
            <div className="mt-1">{sale.notes}</div>
          </div>
        ) : null}

        <div
          className={`pt-4 text-center ${compact ? "text-[10px]" : "text-[11px]"} text-stone-600`}
        >
          <div className="font-semibold text-stone-900">
            Return policy / footer
          </div>
          <div className="mt-2">
            {receiptFooter || "Thank you for your purchase."}
          </div>
        </div>
      </div>
    </div>
  );
}

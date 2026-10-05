import AppHeader from "@/components/layout/AppHeader";
import SalesTable from "@/components/sales/SalesTable";
import { getActiveShopContext } from "@/lib/auth/get-active-shop";
import { prisma } from "@/lib/prisma";

export default async function SalesPage() {
  const { shopId, permissions } = await getActiveShopContext();
  const settings = await prisma.shopSetting.findUnique({ where: { shopId } });

  return (
    <div className="space-y-6">
      <AppHeader
        title="Sales history"
        subtitle="Review transactions, inspect payment details, and reopen receipt pages without leaving the audit trail."
      />
      <SalesTable
        currencySymbol={settings?.currencySymbol ?? "₱"}
        canRefundSales={permissions.REFUND_SALES}
        canVoidSales={permissions.VOID_SALES}
      />
    </div>
  );
}

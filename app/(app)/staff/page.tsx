//page.tsx from app/(app)/staff
import AppHeader from "@/components/layout/AppHeader";
import StaffListManager from "@/components/staff/StaffListManager";
import { requirePagePermission } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { serializeStaffListItem } from "@/lib/serializers/staff";
import { getManagedShops } from "@/lib/staff";

export default async function StaffPage() {
  const { userId, shopId } = await requirePagePermission(
    "MANAGE_STAFF",
    "MANAGER",
  );
  const shops = await getManagedShops(userId);
  const showRoleControls = shops.some(
    (shop) => shop.managementRole === "ADMIN",
  );
  const staffVisibility = shops.map((shop) =>
    shop.managementRole === "ADMIN"
      ? { shopId: shop.id }
      : { shopId: shop.id, role: "CASHIER" as const },
  );

  const items = await prisma.userShop.findMany({
    where: {
      OR: staffVisibility,
    },
    include: {
      shop: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          authAuditLogs: {
            where: { action: "LOGIN_SUCCESS" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              action: true,
              createdAt: true,
              ipAddress: true,
              userAgent: true,
            },
          },
        },
      },
    },
    orderBy: [{ isActive: "desc" }, { assignedAt: "desc" }],
  });

  return (
    <div className="space-y-6">
      <AppHeader
        title="Staff"
        subtitle={
          showRoleControls
            ? "Manage employee accounts, role assignments, active shop access, and sign-in visibility across the shops you administer."
            : "Manage cashier accounts, active shop access, and sign-in visibility across the shops you manage."
        }
      />
      <StaffListManager
        initialItems={items.map(serializeStaffListItem)}
        shops={shops}
        defaultShopId={shopId}
        showRoleControls={showRoleControls}
      />
    </div>
  );
}

"use client";

import { ShopRole } from "@prisma/client";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useMemo, useState } from "react";
import type { PermissionKey, PermissionState } from "@/lib/permissions";
import {
  Sidebar,
  SidebarBody,
  SidebarLink,
  useSidebar,
} from "@/components/ui/Sidebar";
import { AnimatePresence, motion } from "framer-motion";
import { TbCashRegister } from "react-icons/tb";
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Undo2,
  ClipboardList,
  Package,
  Tags,
  Users,
  Boxes,
  Truck,
  Factory,
  ShoppingBag,
  LineChart,
  Activity,
  Settings,
  UserCircle,
  LogOut,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import Link from "next/link";

type SidebarProps = {
  shopName: string;
  shopType: string;
  role: ShopRole;
  permissions: PermissionState;
  activeShopId: string;
  availableShops: Array<{
    id: string;
    name: string;
    posType: string;
    role: ShopRole;
  }>;
};

type IconName =
  | "dashboard"
  | "checkout"
  | "registers"
  | "sales"
  | "returns"
  | "stock-counts"
  | "products"
  | "categories"
  | "customers"
  | "inventory"
  | "transfers"
  | "suppliers"
  | "purchases"
  | "reports"
  | "settings"
  | "activity"
  | "staff";

type NavLink = {
  href?: string;
  label: string;
  description: string;
  icon: IconName;
  minRole: ShopRole;
  requiredPermission?: PermissionKey;
  subLinks?: Array<{
    href: string;
    label: string;
    minRole: ShopRole;
  }>;
};

const ROLE_WEIGHT: Record<ShopRole, number> = {
  CASHIER: 1,
  MANAGER: 2,
  ADMIN: 3,
};

const sections: Array<{ title: string; links: NavLink[] }> = [
  {
    title: "Overview",
    links: [
      {
        href: "/dashboard",
        label: "Dashboard",
        description: "Live business pulse.",
        icon: "dashboard",
        minRole: "CASHIER",
      },
      {
        href: "/sales",
        label: "Sales",
        description: "Completed transactions.",
        icon: "sales",
        minRole: "CASHIER",
      },
      {
        href: "/returns",
        label: "Returns",
        description: "Adjustments.",
        icon: "returns",
        minRole: "CASHIER",
      },
      {
        href: "/stock-counts",
        label: "Stock counts",
        description: "Audits.",
        icon: "stock-counts",
        minRole: "CASHIER",
      },
    ],
  },
  {
    title: "Operations",
    links: [
      {
        href: "/checkout",
        label: "Checkout",
        description: "Start a sale.",
        icon: "checkout",
        minRole: "CASHIER",
      },
      {
        href: "/parked-sales",
        label: "Saved carts",
        description: "Held carts.",
        icon: "sales",
        minRole: "CASHIER",
      },
      {
        label: "Registers",
        description: "Shift management.",
        icon: "registers",
        minRole: "CASHIER",
        subLinks: [
          {
            href: "/register/open",
            label: "Open register",
            minRole: "CASHIER",
          },
          {
            href: "/register/close",
            label: "Close register",
            minRole: "CASHIER",
          },
          {
            href: "/register/history",
            label: "Register history",
            minRole: "CASHIER",
          },
        ],
      },
      {
        href: "/inventory",
        label: "Inventory",
        description: "Track stock.",
        icon: "inventory",
        minRole: "MANAGER",
        requiredPermission: "ADJUST_INVENTORY",
      },
      {
        href: "/transfers",
        label: "Transfers",
        description: "Branch moves.",
        icon: "transfers",
        minRole: "MANAGER",
      },
      {
        href: "/purchases",
        label: "Purchases",
        description: "Orders.",
        icon: "purchases",
        minRole: "MANAGER",
      },
      {
        href: "/activity",
        label: "Activity",
        description: "Audit trail.",
        icon: "activity",
        minRole: "MANAGER",
      },
      {
        href: "/staff",
        label: "Staff",
        description: "Manage access.",
        icon: "staff",
        minRole: "ADMIN",
        requiredPermission: "MANAGE_STAFF",
      },
    ],
  },
  {
    title: "Catalog",
    links: [
      {
        href: "/products",
        label: "Products",
        description: "Manage items.",
        icon: "products",
        minRole: "MANAGER",
      },
      {
        href: "/categories",
        label: "Categories",
        description: "Organization.",
        icon: "categories",
        minRole: "MANAGER",
      },
      {
        href: "/customers",
        label: "Customers",
        description: "Loyalty.",
        icon: "customers",
        minRole: "MANAGER",
      },
      {
        href: "/suppliers",
        label: "Suppliers",
        description: "Vendors.",
        icon: "suppliers",
        minRole: "MANAGER",
      },
    ],
  },
  {
    title: "Workspace",
    links: [
      {
        href: "/reports",
        label: "Reports",
        description: "Owner reporting.",
        icon: "reports",
        minRole: "ADMIN",
        requiredPermission: "VIEW_REPORTS",
      },
      {
        href: "/settings",
        label: "Settings",
        description: "Shop rules.",
        icon: "settings",
        minRole: "MANAGER",
      },
    ],
  },
];

function getLucideIcon(name: IconName, active: boolean) {
  const common = `h-[18px] w-[18px] flex-shrink-0 transition-colors ${
    active
      ? "text-emerald-700"
      : "text-stone-500 group-hover:text-emerald-700 group-hover/sidebar:text-emerald-700"
  }`;
  switch (name) {
    case "dashboard":
      return <LayoutDashboard className={common} />;
    case "checkout":
      return <ShoppingCart className={common} />;
    case "registers":
      return <TbCashRegister className={common} />;
    case "sales":
      return <Receipt className={common} />;
    case "returns":
      return <Undo2 className={common} />;
    case "stock-counts":
      return <ClipboardList className={common} />;
    case "products":
      return <Package className={common} />;
    case "categories":
      return <Tags className={common} />;
    case "customers":
      return <Users className={common} />;
    case "inventory":
      return <Boxes className={common} />;
    case "transfers":
      return <Truck className={common} />;
    case "suppliers":
      return <Factory className={common} />;
    case "purchases":
      return <ShoppingBag className={common} />;
    case "reports":
      return <LineChart className={common} />;
    case "activity":
      return <Activity className={common} />;
    case "settings":
      return <Settings className={common} />;
    case "staff":
      return <UserCircle className={common} />;
    default:
      return <LayoutDashboard className={common} />;
  }
}

const ShopHeader = ({
  shopName,
  role,
  activeShopId,
  availableShops,
  switchShop,
  switchingShop,
  switchError,
}: any) => {
  const { open, setOpen } = useSidebar();

  const hasMultipleShops = availableShops.length > 1;

  if (!open) {
    return (
      <div className="flex flex-col items-center gap-4 py-2">
        <button
          onClick={() => setOpen(true)}
          className="hidden md:inline-flex h-10 w-10 items-center justify-center rounded-xl text-stone-500 hover:bg-stone-100 hover:text-stone-900 transition-colors focus:outline-none"
          aria-label="Open sidebar"
        >
          <PanelLeftOpen className="h-5 w-5 text-black" />
        </button>
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-lg font-black text-white shadow-sm">
          V
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm"
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-lg font-black text-white shadow-sm">
            V
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-black text-stone-950">
              {shopName}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">
              {role}
            </div>
          </div>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="hidden md:inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-900 transition-colors focus:outline-none"
          aria-label="Close sidebar"
        >
          <PanelLeftClose className="h-5 w-5 text-black" />
        </button>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.15em] text-stone-400">
          {hasMultipleShops ? "Active Branch" : "Assigned Branch"}
        </div>
        {hasMultipleShops ? (
          <>
            <select
              className="h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium text-stone-800 outline-none transition-colors hover:border-stone-300 focus:border-emerald-500 disabled:opacity-50"
              value={activeShopId}
              onChange={(event) => void switchShop(event.target.value)}
              disabled={switchingShop}
            >
              {availableShops.map((entry: any) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
            {switchError ? (
              <div className="mt-1 text-[10px] font-medium text-red-600">
                {switchError}
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex h-10 w-full items-center rounded-xl border border-stone-100 bg-stone-50 px-3 text-sm font-semibold text-stone-600">
            <span className="truncate">{shopName}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
};

const SidebarAccordion = ({
  item,
  pathname,
}: {
  item: NavLink;
  pathname: string;
}) => {
  const { open, setOpen } = useSidebar();
  const isActiveChild =
    item.subLinks?.some(
      (sub) => pathname === sub.href || pathname.startsWith(`${sub.href}/`),
    ) || false;

  const [isOpen, setIsOpen] = useState(isActiveChild);

  const toggle = () => {
    if (!open) {
      setOpen(true);
      setIsOpen(true);
    } else {
      setIsOpen(!isOpen);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={toggle}
        title={!open ? item.label : undefined}
        className={`group flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-emerald-50/60 ${
          isActiveChild
            ? "bg-emerald-50 text-emerald-800 border border-emerald-100/50"
            : "border border-transparent"
        }`}
      >
        <div className="flex items-center gap-3">
          {getLucideIcon(item.icon, isActiveChild)}
          <motion.span
            animate={{
              display: open ? "inline-block" : "none",
              opacity: open ? 1 : 0,
            }}
            className={`text-sm font-semibold whitespace-pre ${
              isActiveChild
                ? "text-emerald-800"
                : "text-stone-600 group-hover:text-emerald-800"
            }`}
          >
            {item.label}
          </motion.span>
        </div>
        <motion.div
          animate={{
            display: open ? "block" : "none",
            opacity: open ? 1 : 0,
            rotate: isOpen ? 180 : 0,
          }}
        >
          <ChevronDown
            className={`h-4 w-4 transition-colors ${
              isActiveChild
                ? "text-emerald-700"
                : "text-stone-400 group-hover:text-emerald-600"
            }`}
          />
        </motion.div>
      </button>
      <AnimatePresence>
        {isOpen && open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden pl-9 pr-2"
          >
            <div className="mt-1 flex flex-col gap-1 border-l-[1.5px] border-stone-200 py-1 pl-2">
              {item.subLinks?.map((sub) => {
                const isSubActive =
                  pathname === sub.href || pathname.startsWith(`${sub.href}/`);
                return (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                      isSubActive
                        ? "bg-emerald-100/60 text-emerald-800"
                        : "text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                    }`}
                  >
                    {sub.label}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function AppSidebar(props: SidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sidebar open={open} setOpen={setOpen}>
      <SidebarBody className="justify-between gap-4">
        <SidebarContent {...props} />
      </SidebarBody>
    </Sidebar>
  );
}

function SidebarContent({
  shopName,
  role,
  permissions,
  activeShopId,
  availableShops,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { open } = useSidebar();
  const [switchingShop, setSwitchingShop] = useState(false);
  const [switchError, setSwitchError] = useState("");

  const visibleSections = useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          links: section.links.filter(
            (link) =>
              ROLE_WEIGHT[role] >= ROLE_WEIGHT[link.minRole] &&
              (!link.requiredPermission ||
                permissions[link.requiredPermission]),
          ),
        }))
        .filter((section) => section.links.length > 0),
    [permissions, role],
  );

  async function switchShop(nextShopId: string) {
    if (!nextShopId || nextShopId === activeShopId) return;
    setSwitchError("");
    setSwitchingShop(true);
    const response = await fetch("/api/user-shops/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId: nextShopId }),
    });
    const data = await response
      .json()
      .catch(() => ({ error: "Unable to switch branches." }));
    if (!response.ok) {
      setSwitchError(data.error ?? "Unable to switch branches.");
      setSwitchingShop(false);
      return;
    }
    router.refresh();
    setSwitchingShop(false);
  }

  return (
    <>
      <div className="flex flex-1 flex-col overflow-y-auto no-scrollbar">
        <ShopHeader
          shopName={shopName}
          role={role}
          activeShopId={activeShopId}
          availableShops={availableShops}
          switchShop={switchShop}
          switchingShop={switchingShop}
          switchError={switchError}
        />

        <div className="mt-6 flex flex-col gap-6">
          {visibleSections.map((section) => (
            <div key={section.title} className="flex flex-col gap-1">
              {open && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400"
                >
                  {section.title}
                </motion.div>
              )}
              {section.links.map((link) => {
                const active =
                  pathname === link.href ||
                  (link.href && pathname.startsWith(`${link.href}/`)) ||
                  false;

                if (link.subLinks) {
                  return (
                    <SidebarAccordion
                      key={link.label}
                      item={link}
                      pathname={pathname}
                    />
                  );
                }

                return (
                  <SidebarLink
                    key={link.href}
                    link={{
                      label: link.label,
                      href: link.href!,
                      icon: getLucideIcon(link.icon, active),
                    }}
                    className={
                      active
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-100/50"
                        : "border border-transparent"
                    }
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-stone-200/60 pt-4 pb-2">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="group flex w-full items-center justify-start gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-stone-600 transition-colors hover:bg-red-100 hover:text-red-500 relative"
        >
          <LogOut className="h-4.5 w-4.5 shrink-0 text-stone-500 transition-colors group-hover:text-red-500" />
          <motion.span
            animate={{
              display: open ? "inline-block" : "none",
              opacity: open ? 1 : 0,
            }}
            className="whitespace-pre"
          >
            Sign out
          </motion.span>
          {!open && (
            <div className="absolute left-full ml-4 hidden md:block rounded-md bg-stone-800 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 z-50 whitespace-nowrap pointer-events-none">
              Sign out
            </div>
          )}
        </button>
      </div>
    </>
  );
}

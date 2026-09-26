"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

const actionLinkClassName =
  "inline-flex h-10 items-center justify-center rounded-xl border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-700 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 hover:text-stone-950 focus:outline-none focus:ring-4 focus:ring-emerald-500/10";

export default function ProductDetailsActions({
  productId,
  productName,
  isActive,
}: {
  productId: string;
  productName: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");

  async function confirmArchiveToggle() {
    if (pending) {
      return;
    }

    setError("");
    setPending(true);

    try {
      const response = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isActive: !isActive,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.product) {
        setError(data?.error ?? "Unable to update product status.");
        setConfirmOpen(false);
        return;
      }

      setConfirmOpen(false);
      router.refresh();
    } catch {
      setError("Unable to update product status. Please try again.");
      setConfirmOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/products?edit=${encodeURIComponent(productId)}`}
          className={actionLinkClassName}
        >
          Edit Product
        </Link>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setError("");
            setConfirmOpen(true);
          }}
        >
          {pending ? "Updating..." : isActive ? "Archive" : "Restore"}
        </Button>
      </div>

      {error ? (
        <div className="max-w-sm text-right text-xs font-medium text-red-700">
          {error}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title={isActive ? "Archive product?" : "Restore product?"}
        description={
          <>
            {isActive ? "Archive" : "Restore"}{" "}
            <span className="font-semibold text-stone-900">{productName}</span>?
          </>
        }
        confirmLabel={isActive ? "Archive" : "Restore"}
        pending={pending}
        onConfirm={confirmArchiveToggle}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

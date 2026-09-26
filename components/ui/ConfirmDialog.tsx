"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CircleHelp, X } from "lucide-react";
import Button from "@/components/ui/Button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  pending?: boolean;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  pending = false,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const animationFrame = window.requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) {
        event.preventDefault();
        onCancel();
      }
    }

    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("keydown", handleDocumentKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, pending, onCancel]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  function closeDialog() {
    if (!pending) {
      onCancel();
    }
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ??
        [],
    );

    if (!focusableElements.length) {
      event.preventDefault();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey) {
      if (
        activeElement === firstElement ||
        !dialogRef.current?.contains(activeElement)
      ) {
        event.preventDefault();
        lastElement.focus();
      }
      return;
    }

    if (activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  const dialog = (
    <div
      className="fixed inset-0 z-9999 isolate flex min-h-dvh items-center justify-center overflow-y-auto p-4 sm:p-6"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close confirmation dialog"
        className="absolute inset-0 h-full w-full cursor-default bg-stone-950/55 backdrop-blur-[3px]"
        onClick={closeDialog}
        disabled={pending}
      />

      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={pending}
        onKeyDown={handleDialogKeyDown}
        tabIndex={-1}
        className="relative z-10 my-auto w-full max-w-md rounded-[28px] border border-white/70 bg-white p-5 shadow-[0_24px_80px_rgba(28,25,23,0.32)] sm:p-6"
      >
        <div className="flex items-start gap-4">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${
              destructive
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {destructive ? (
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            ) : (
              <CircleHelp className="h-5 w-5" aria-hidden="true" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-black text-stone-950">
              {title}
            </h2>
            <div
              id={descriptionId}
              className="mt-2 text-sm leading-6 text-stone-600"
            >
              {description}
            </div>
          </div>

          <button
            type="button"
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={closeDialog}
            disabled={pending}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div
          className={`mt-5 rounded-2xl border px-4 py-3 text-xs leading-5 ${
            destructive
              ? "border-red-100 bg-red-50/70 text-red-700"
              : "border-stone-200 bg-stone-50 text-stone-600"
          }`}
        >
          {destructive
            ? "This action is permanent and cannot be undone."
            : "You can change this status again later if needed."}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={closeDialog}
            disabled={pending}
            className="w-full sm:w-auto"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "danger" : "primary"}
            onClick={() => void onConfirm()}
            disabled={pending}
            className="w-full sm:w-auto"
          >
            {pending ? "Please wait..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}

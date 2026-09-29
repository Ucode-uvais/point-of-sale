"use client";

import { AlertTriangle } from "lucide-react";
import { Modal } from "rizzui";
import Button from "@/components/ui/Button";

export default function UnsavedCustomerChangesDialog({
  open,
  pending = false,
  onKeepEditing,
  onDiscardChanges,
  onSaveAndContinue,
}: {
  open: boolean;
  pending?: boolean;
  onKeepEditing: () => void;
  onDiscardChanges: () => void;
  onSaveAndContinue: () => void;
}) {
  return (
    <Modal
      isOpen={open}
      onClose={() => {
        if (!pending) {
          onKeepEditing();
        }
      }}
      size="md"
      className="z-9999"
      overlayClassName="bg-stone-950/60 backdrop-blur-[3px]"
      containerClassName="!w-[calc(100vw-2rem)] !max-w-[560px] overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_28px_90px_rgba(28,25,23,0.34)]"
    >
      <div>
        <div className="px-5 pb-5 pt-6 sm:px-7 sm:pb-6 sm:pt-7">
          <div className="flex items-start gap-4 sm:gap-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-700 sm:h-14 sm:w-14">
              <AlertTriangle
                className="h-5 w-5 sm:h-6 sm:w-6"
                aria-hidden="true"
              />
            </div>

            <div className="min-w-0 flex-1 pt-0.5">
              <h2 className="text-xl font-black tracking-tight text-stone-950 sm:text-2xl">
                Unsaved customer changes
              </h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-stone-600">
                You have changes that haven&apos;t been saved yet. Save them
                before switching customers, or discard them and continue.
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-stone-100 bg-stone-50/70 px-5 py-4 sm:px-7 sm:py-5">
          <div className="grid gap-2.5 sm:grid-cols-[1fr_1fr_1.2fr]">
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={onKeepEditing}
              className="min-h-11 w-full whitespace-nowrap"
            >
              Keep editing
            </Button>

            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={onDiscardChanges}
              className="min-h-11 w-full whitespace-nowrap"
            >
              Discard changes
            </Button>

            <Button
              type="button"
              disabled={pending}
              onClick={onSaveAndContinue}
              className="min-h-11 w-full whitespace-nowrap"
            >
              {pending ? "Saving..." : "Save & continue"}
            </Button>
          </div>

          <p className="mt-3 text-center text-xs leading-5 text-stone-400 sm:text-left">
            Your current customer remains open until you choose an action.
          </p>
        </div>
      </div>
    </Modal>
  );
}

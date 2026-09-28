"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import {
  classifyCustomerContactMatch,
  getCustomerDisplayName,
  getCustomerTypeLabel,
  isValidCustomerEmailInput,
  isValidCustomerPhoneInput,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
} from "@/lib/customers";

type QuickCustomerType = "INDIVIDUAL" | "BUSINESS";

export type QuickCustomerExisting = {
  id: string;
  type: string;
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  phone: string | null;
  email: string | null;
};

export type QuickCreatedCustomer = {
  id: string;
  type: string;
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
};

type QuickCustomerForm = {
  type: QuickCustomerType;
  firstName: string;
  businessName: string;
  phone: string;
  email: string;
};

const EMPTY_FORM: QuickCustomerForm = {
  type: "INDIVIDUAL",
  firstName: "",
  businessName: "",
  phone: "",
  email: "",
};

export default function QuickCustomerCreateModal({
  isOnline,
  existingCustomers,
  onClose,
  onCreated,
  onUseExisting,
}: {
  isOnline: boolean;
  existingCustomers: QuickCustomerExisting[];
  onClose: () => void;
  onCreated: (customer: QuickCreatedCustomer) => void;
  onUseExisting: (customerId: string) => void;
}) {
  const [form, setForm] = useState<QuickCustomerForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, saving]);

  const candidate = useMemo(
    () => ({
      type: form.type,
      firstName: form.type === "INDIVIDUAL" ? form.firstName : null,
      lastName: null,
      businessName: form.type === "BUSINESS" ? form.businessName : null,
      phone: form.phone,
      email: form.email,
    }),
    [form.businessName, form.email, form.firstName, form.phone, form.type],
  );

  const contactMatches = useMemo(
    () =>
      existingCustomers.flatMap((customer) => {
        const match = classifyCustomerContactMatch(customer, candidate);
        return match ? [{ customer, ...match }] : [];
      }),
    [candidate, existingCustomers],
  );

  const likelyDuplicates = contactMatches.filter(
    (match) => match.kind === "LIKELY_DUPLICATE",
  );
  const sharedContacts = contactMatches.filter(
    (match) => match.kind === "SHARED_CONTACT",
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!isOnline) {
      setError(
        "New customers can be registered when the terminal is back online.",
      );
      return;
    }

    const phone = normalizeCustomerPhone(form.phone);
    const email = normalizeCustomerEmail(form.email);

    if (!phone && !email) {
      setError("Enter at least a phone number or email address.");
      return;
    }

    if (form.phone.trim() && !isValidCustomerPhoneInput(form.phone)) {
      setError(
        "Enter a valid phone number using 7 to 20 digits. Spaces, dashes, parentheses, and a leading + are allowed.",
      );
      return;
    }

    if (form.email.trim() && !isValidCustomerEmailInput(form.email)) {
      setError("Enter a valid email address.");
      return;
    }

    if (likelyDuplicates.length) {
      setError(
        "A likely duplicate customer already exists. Use the existing customer or add identifying information that distinguishes this as a separate customer.",
      );
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/checkout/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          firstName:
            form.type === "INDIVIDUAL" ? form.firstName.trim() || null : null,
          businessName:
            form.type === "BUSINESS" ? form.businessName.trim() || null : null,
          phone,
          email,
        }),
      });

      const data = await response
        .json()
        .catch(() => ({ error: "Unable to register customer." }));

      if (!response.ok || !data?.customer) {
        setError(data?.error ?? "Unable to register customer.");
        return;
      }

      onCreated(data.customer as QuickCreatedCustomer);
      onClose();
    } catch {
      setError(
        "Unable to register customer right now. Check the connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-120 flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-customer-title"
        className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-[30px] border border-white/80 bg-white p-5 shadow-[0_30px_90px_-25px_rgba(15,23,42,0.55)] sm:p-6"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
              Checkout customer
            </div>
            <h2
              id="quick-customer-title"
              className="mt-2 text-2xl font-black text-stone-950"
            >
              Quick create customer
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              Register and attach the customer without leaving the active sale.
              More details can be added later from the Customers workspace.
            </p>
          </div>

          <button
            type="button"
            aria-label="Close quick customer modal"
            disabled={saving}
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-stone-50 text-xl leading-none text-stone-500 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ×
          </button>
        </div>

        {!isOnline ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            New customers can be registered when the terminal is back online.
          </div>
        ) : null}

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm font-semibold text-stone-800">
              Customer type
            </label>
            <select
              value={form.type}
              onChange={(event) => {
                const type = event.target.value as QuickCustomerType;
                setForm((current) => ({
                  ...current,
                  type,
                  firstName: type === "INDIVIDUAL" ? current.firstName : "",
                  businessName: type === "BUSINESS" ? current.businessName : "",
                }));
                setError("");
              }}
              className="h-11 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="INDIVIDUAL">Individual</option>
              <option value="BUSINESS">Business</option>
            </select>
          </div>

          {form.type === "INDIVIDUAL" ? (
            <div>
              <label className="mb-2 block text-sm font-semibold text-stone-800">
                First name
                <span className="ml-1 font-normal text-stone-400">
                  optional
                </span>
              </label>
              <Input
                autoFocus
                placeholder="First name"
                value={form.firstName}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    firstName: event.target.value,
                  }));
                  setError("");
                }}
              />
            </div>
          ) : (
            <div>
              <label className="mb-2 block text-sm font-semibold text-stone-800">
                Business name
                <span className="ml-1 font-normal text-stone-400">
                  optional
                </span>
              </label>
              <Input
                autoFocus
                placeholder="Business name"
                value={form.businessName}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    businessName: event.target.value,
                  }));
                  setError("");
                }}
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-stone-800">
                Phone
              </label>
              <Input
                inputMode="tel"
                placeholder="Phone"
                value={form.phone}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    phone: event.target.value,
                  }));
                  setError("");
                }}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-stone-800">
                Email
              </label>
              <Input
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }));
                  setError("");
                }}
              />
            </div>
          </div>

          <div className="text-xs leading-5 text-stone-500">
            Enter at least a phone number or email address.
          </div>

          {likelyDuplicates.length ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              <div className="font-semibold">Customer already exists</div>
              <p className="mt-1 text-red-800">
                A customer of the same type already uses this contact and the
                new record does not have enough identifying information to
                distinguish it.
              </p>
              <div className="mt-3 space-y-2">
                {likelyDuplicates.slice(0, 3).map((match) => (
                  <div
                    key={match.customer.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-white/80 px-3 py-2"
                  >
                    <div>
                      <div className="font-semibold text-stone-900">
                        {getCustomerDisplayName(match.customer)}
                      </div>
                      <div className="text-xs text-stone-600">
                        {getCustomerTypeLabel(match.customer.type)}
                        {match.phoneMatch && match.emailMatch
                          ? " · same phone and email"
                          : match.phoneMatch
                            ? " · same phone"
                            : " · same email"}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        onUseExisting(match.customer.id);
                        onClose();
                      }}
                    >
                      Use existing
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : sharedContacts.length ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="font-semibold">Shared contact detected</div>
              <p className="mt-1 text-amber-800">
                Another customer uses this phone or email, but the customer type
                or identifying name is different. You can still create a
                separate customer when this is intentional.
              </p>
              <div className="mt-3 space-y-2">
                {sharedContacts.slice(0, 3).map((match) => (
                  <div
                    key={match.customer.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white/80 px-3 py-2"
                  >
                    <div>
                      <div className="font-semibold text-stone-900">
                        {getCustomerDisplayName(match.customer)}
                      </div>
                      <div className="text-xs text-stone-600">
                        {getCustomerTypeLabel(match.customer.type)}
                        {match.phoneMatch && match.emailMatch
                          ? " · same phone and email"
                          : match.phoneMatch
                            ? " · same phone"
                            : " · same email"}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        onUseExisting(match.customer.id);
                        onClose();
                      }}
                    >
                      Use existing
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!isOnline || saving || likelyDuplicates.length > 0}
            >
              {saving ? "Creating..." : "Create & attach"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

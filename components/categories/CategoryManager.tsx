"use client";

import { useMemo, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Input from "@/components/ui/Input";

type Category = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  isActive: boolean;
  parent?: {
    id: string;
    name: string;
    isActive: boolean;
  } | null;
  _count?: { products: number; children: number };
};

type CategoryConfirmation =
  | {
      action: "toggle";
      category: Category;
    }
  | {
      action: "delete";
      category: Category;
    }
  | null;

type EditorMode = "main" | "subcategory";

const selectClassName =
  "h-11 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm text-stone-900 outline-none transition hover:border-stone-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400";

function sortByName<T extends { name: string }>(items: T[]) {
  return [...items].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
  );
}

export default function CategoryManager({
  initialCategories,
}: {
  initialCategories: Category[];
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [editorMode, setEditorMode] = useState<EditorMode>("main");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmation, setConfirmation] = useState<CategoryConfirmation>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const topLevelCategories = useMemo(
    () => sortByName(categories.filter((category) => !category.parentId)),
    [categories],
  );

  const activeTopLevelCategories = useMemo(
    () => topLevelCategories.filter((category) => category.isActive),
    [topLevelCategories],
  );

  const topLevelIds = useMemo(
    () => new Set(topLevelCategories.map((category) => category.id)),
    [topLevelCategories],
  );

  const childrenByParentId = useMemo(() => {
    const grouped = new Map<string, Category[]>();

    for (const category of categories) {
      if (!category.parentId || !topLevelIds.has(category.parentId)) {
        continue;
      }

      const children = grouped.get(category.parentId) ?? [];
      children.push(category);
      grouped.set(category.parentId, children);
    }

    for (const [key, children] of grouped) {
      grouped.set(key, sortByName(children));
    }

    return grouped;
  }, [categories, topLevelIds]);

  const hierarchyIssues = useMemo(
    () =>
      sortByName(
        categories.filter(
          (category) =>
            category.parentId && !topLevelIds.has(category.parentId),
        ),
      ),
    [categories, topLevelIds],
  );

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const confirmationPending = pendingAction !== null;
  const activeSubcategoryCount = categories.filter(
    (category) => category.parentId && category.isActive,
  ).length;
  const archivedCount = categories.filter(
    (category) => !category.isActive,
  ).length;

  function clearMessages() {
    setError("");
    setSuccess("");
  }

  function beginMainCategory() {
    clearMessages();
    setEditorMode("main");
    setParentId("");
    setName("");
  }

  function beginSubcategory(parent?: Category) {
    clearMessages();
    setEditorMode("subcategory");
    setParentId(parent?.id ?? activeTopLevelCategories[0]?.id ?? "");
    setName("");

    if (typeof document !== "undefined") {
      window.requestAnimationFrame(() => {
        document.getElementById("new-category")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  }

  function getChildren(categoryId: string) {
    return childrenByParentId.get(categoryId) ?? [];
  }

  function getDirectChildCount(category: Category) {
    if (!category.parentId) {
      return getChildren(category.id).length;
    }

    return category._count?.children ?? 0;
  }

  function getActiveChildren(categoryId: string) {
    return getChildren(categoryId).filter((category) => category.isActive);
  }

  async function addCategory() {
    if (creating || confirmationPending) {
      return;
    }

    clearMessages();
    const trimmedName = name.trim();

    if (trimmedName.length < 2) {
      setError("Enter a category name with at least 2 characters.");
      return;
    }

    const selectedParentId = editorMode === "subcategory" ? parentId : null;
    if (editorMode === "subcategory" && !selectedParentId) {
      setError("Choose the main category this subcategory belongs to.");
      return;
    }

    setCreating(true);

    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          parentId: selectedParentId,
        }),
      });

      const data = await response
        .json()
        .catch(() => ({ error: "Failed to create category." }));

      if (!response.ok || !data?.category) {
        setError(data?.error ?? "Failed to create category.");
        return;
      }

      setCategories((current) => [...current, data.category]);
      setName("");

      if (editorMode === "subcategory") {
        const parent = categoryById.get(selectedParentId ?? "");
        setSuccess(
          `${data.category.name} was added under ${parent?.name ?? "the selected main category"}.`,
        );
      } else {
        setSuccess(`${data.category.name} was created as a main category.`);
      }
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  function requestToggleActive(category: Category) {
    if (confirmationPending || creating) {
      return;
    }

    clearMessages();

    if (category.isActive && !category.parentId) {
      const activeChildren = getActiveChildren(category.id);
      if (activeChildren.length) {
        setError(
          `Archive ${activeChildren.length === 1 ? "the active subcategory" : `the ${activeChildren.length} active subcategories`} under ${category.name} first.`,
        );
        return;
      }
    }

    if (!category.isActive && category.parentId) {
      const parent = categoryById.get(category.parentId);
      if (parent && !parent.isActive) {
        setError(`Restore ${parent.name} before restoring ${category.name}.`);
        return;
      }
    }

    setConfirmation({ action: "toggle", category });
  }

  function requestDelete(category: Category) {
    if (confirmationPending || creating) {
      return;
    }

    clearMessages();

    const productCount = category._count?.products ?? 0;
    const childCount = getDirectChildCount(category);
    if (productCount > 0 || childCount > 0) {
      const blockers = [
        productCount > 0
          ? `${productCount} linked product${productCount === 1 ? "" : "s"}`
          : null,
        childCount > 0
          ? `${childCount} subcategor${childCount === 1 ? "y" : "ies"}`
          : null,
      ].filter(Boolean);

      setError(
        `${category.name} cannot be deleted while it has ${blockers.join(" and ")}. Move or remove those links first.`,
      );
      return;
    }

    setConfirmation({ action: "delete", category });
  }

  async function confirmCategoryAction() {
    if (!confirmation || confirmationPending) {
      return;
    }

    const { action, category } = confirmation;
    clearMessages();
    setPendingAction(`${action}:${category.id}`);

    try {
      if (action === "toggle") {
        const response = await fetch(`/api/categories/${category.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isActive: !category.isActive,
          }),
        });

        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.category) {
          setError(data?.error ?? "Failed to update category.");
          return;
        }

        setCategories((current) =>
          current.map((entry) =>
            entry.id === category.id ? data.category : entry,
          ),
        );
        setSuccess(
          `${category.name} was ${data.category.isActive ? "restored" : "archived"}.`,
        );
        return;
      }

      const response = await fetch(`/api/categories/${category.id}`, {
        method: "DELETE",
      });
      const data = await response
        .json()
        .catch(() => ({ error: "Failed to delete category." }));

      if (!response.ok) {
        setError(data.error ?? "Failed to delete category.");
        return;
      }

      setCategories((current) =>
        current.filter((entry) => entry.id !== category.id),
      );
      setSuccess(`${category.name} was deleted.`);
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setPendingAction(null);
      setConfirmation(null);
    }
  }

  const confirmationCategory = confirmation?.category ?? null;
  const confirmationIsDelete = confirmation?.action === "delete";
  const confirmationIsRestore =
    confirmation?.action === "toggle" && confirmationCategory
      ? !confirmationCategory.isActive
      : false;

  const selectedParent = parentId ? (categoryById.get(parentId) ?? null) : null;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[22px] border border-stone-200 bg-white px-4 py-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
            Main categories
          </div>
          <div className="mt-1 text-2xl font-black text-stone-950">
            {topLevelCategories.length}
          </div>
        </div>
        <div className="rounded-[22px] border border-stone-200 bg-white px-4 py-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
            Active subcategories
          </div>
          <div className="mt-1 text-2xl font-black text-emerald-700">
            {activeSubcategoryCount}
          </div>
        </div>
        <div className="rounded-[22px] border border-stone-200 bg-white px-4 py-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
            Archived
          </div>
          <div className="mt-1 text-2xl font-black text-stone-950">
            {archivedCount}
          </div>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}

      {success ? (
        <div
          role="status"
          className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          {success}
        </div>
      ) : null}

      <div className="mt-6 space-y-6">
        <Card>
          <div id="new-category" className="scroll-mt-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Catalog structure
                </div>
                <h2 className="mt-2 text-xl font-black text-stone-900 sm:text-2xl">
                  {editorMode === "main"
                    ? "Create main category"
                    : "Create subcategory"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-stone-500">
                  {editorMode === "main"
                    ? "Main categories are the top level of your catalog. Products can be assigned directly to them or to one of their subcategories."
                    : "Every subcategory belongs to exactly one main category. Products assigned to it still inherit that catalog path."}
                </p>
              </div>

              <div className="grid w-full grid-cols-2 gap-1.5 rounded-2xl bg-stone-100 p-1.5 lg:max-w-md">
                <button
                  type="button"
                  aria-pressed={editorMode === "main"}
                  onClick={beginMainCategory}
                  className={`cursor-pointer rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    editorMode === "main"
                      ? "bg-white text-stone-950 shadow-sm"
                      : "text-stone-500 hover:text-stone-900"
                  }`}
                >
                  Main category
                </button>
                <button
                  type="button"
                  aria-pressed={editorMode === "subcategory"}
                  onClick={() => beginSubcategory()}
                  className={`cursor-pointer rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    editorMode === "subcategory"
                      ? "bg-white text-stone-950 shadow-sm"
                      : "text-stone-500 hover:text-stone-900"
                  }`}
                >
                  Subcategory
                </button>
              </div>
            </div>

            <div
              className={`mt-6 grid gap-4 ${
                editorMode === "subcategory"
                  ? "md:grid-cols-2 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto] xl:items-end"
                  : "md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
              }`}
            >
              {editorMode === "subcategory" ? (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-stone-700">
                    Main category
                  </label>
                  <select
                    className={selectClassName}
                    value={parentId}
                    disabled={!activeTopLevelCategories.length || creating}
                    onChange={(event) => setParentId(event.target.value)}
                  >
                    <option value="">Select a main category</option>
                    {activeTopLevelCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  {!activeTopLevelCategories.length ? (
                    <div className="mt-2 text-xs leading-5 text-amber-700">
                      Create or restore a main category before adding
                      subcategories.
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div>
                <label className="mb-2 block text-sm font-semibold text-stone-700">
                  {editorMode === "main"
                    ? "Main category name"
                    : "Subcategory name"}
                </label>
                <Input
                  value={name}
                  disabled={creating}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={
                    editorMode === "main" ? "e.g. Medicines" : "e.g. Cappuccino"
                  }
                />
              </div>

              <div
                className={
                  editorMode === "subcategory"
                    ? "md:col-span-2 xl:col-span-1"
                    : ""
                }
              >
                <Button
                  type="button"
                  disabled={
                    creating ||
                    confirmationPending ||
                    (editorMode === "subcategory" && !parentId)
                  }
                  onClick={addCategory}
                >
                  {creating
                    ? "Saving..."
                    : editorMode === "main"
                      ? "Create main category"
                      : "Add subcategory"}
                </Button>
              </div>
            </div>

            {editorMode === "subcategory" && selectedParent ? (
              <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-sm text-sky-800">
                This subcategory will appear under{" "}
                <span className="font-semibold">{selectedParent.name}</span>.
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <div className="flex flex-col gap-2 border-b border-stone-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                Catalog organization
              </div>
              <h2 className="mt-2 text-xl font-black text-stone-900 sm:text-2xl">
                Category hierarchy
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-500">
                Main categories stay visually separate from their subcategories,
                with all category actions kept in one consistent place.
              </p>
            </div>
            <div className="text-sm font-medium text-stone-500">
              {topLevelCategories.length} main · {activeSubcategoryCount} active
              subcategor
              {activeSubcategoryCount === 1 ? "y" : "ies"}
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {topLevelCategories.length ? (
              topLevelCategories.map((category) => {
                const children = getChildren(category.id);
                const activeChildren = children.filter(
                  (child) => child.isActive,
                );
                const categoryPending =
                  pendingAction?.endsWith(`:${category.id}`) ?? false;

                return (
                  <section
                    key={category.id}
                    className="overflow-hidden rounded-2xl border border-stone-200 bg-white"
                  >
                    <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-black text-stone-950 sm:text-lg">
                            {category.name}
                          </div>
                          <Badge tone={category.isActive ? "emerald" : "stone"}>
                            {category.isActive ? "Active" : "Archived"}
                          </Badge>
                          <Badge tone="blue">Main category</Badge>
                        </div>
                        <div className="mt-1.5 text-sm text-stone-500">
                          {category._count?.products ?? 0} direct product(s) ·{" "}
                          {children.length} subcategor
                          {children.length === 1 ? "y" : "ies"}
                        </div>
                        {category.isActive && activeChildren.length ? (
                          <div className="mt-2 text-xs leading-5 text-stone-400">
                            Archive active subcategories before archiving this
                            main category.
                          </div>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        {category.isActive ? (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={creating || confirmationPending}
                            onClick={() => beginSubcategory(category)}
                          >
                            Add subcategory
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={creating || confirmationPending}
                          onClick={() => requestToggleActive(category)}
                        >
                          {categoryPending && confirmation?.action === "toggle"
                            ? "Updating..."
                            : category.isActive
                              ? "Archive"
                              : "Restore"}
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          disabled={creating || confirmationPending}
                          onClick={() => requestDelete(category)}
                        >
                          {categoryPending && confirmation?.action === "delete"
                            ? "Deleting..."
                            : "Delete"}
                        </Button>
                      </div>
                    </div>

                    <div className="border-t border-stone-200 bg-stone-50/60 px-4 py-3 sm:px-5 sm:py-4">
                      {children.length ? (
                        <div className="space-y-2">
                          {children.map((child) => {
                            const childPending =
                              pendingAction?.endsWith(`:${child.id}`) ?? false;

                            return (
                              <div
                                key={child.id}
                                className="grid gap-3 rounded-xl border border-stone-200 bg-white px-3.5 py-3 sm:px-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                              >
                                <div className="min-w-0 border-l-2 border-emerald-200 pl-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="font-semibold text-stone-900">
                                      {child.name}
                                    </div>
                                    <Badge
                                      tone={
                                        child.isActive ? "emerald" : "stone"
                                      }
                                    >
                                      {child.isActive ? "Active" : "Archived"}
                                    </Badge>
                                    <Badge tone="blue">Subcategory</Badge>
                                  </div>
                                  <div className="mt-1 text-xs text-stone-500">
                                    {child._count?.products ?? 0} product(s) ·{" "}
                                    {category.name}
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2 lg:justify-end">
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    disabled={creating || confirmationPending}
                                    onClick={() => requestToggleActive(child)}
                                  >
                                    {childPending &&
                                    confirmation?.action === "toggle"
                                      ? "Updating..."
                                      : child.isActive
                                        ? "Archive"
                                        : "Restore"}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="danger"
                                    disabled={creating || confirmationPending}
                                    onClick={() => requestDelete(child)}
                                  >
                                    {childPending &&
                                    confirmation?.action === "delete"
                                      ? "Deleting..."
                                      : "Delete"}
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-stone-300 bg-white/70 px-4 py-3 text-sm leading-6 text-stone-500">
                          No subcategories yet. Products can still be assigned
                          directly to {category.name}. Use the category action
                          above when you need another level.
                        </div>
                      )}
                    </div>
                  </section>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-sm leading-6 text-stone-500">
                No main categories yet. Create one first, then add subcategories
                only where the catalog needs another level.
              </div>
            )}

            {hierarchyIssues.length ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5">
                <div className="font-semibold text-amber-900">
                  Hierarchy needs attention
                </div>
                <p className="mt-1 text-sm leading-6 text-amber-800">
                  These older records do not fit the two-level Main Category →
                  Subcategory structure. They remain visible so they can be
                  corrected instead of disappearing from the UI.
                </p>
                <div className="mt-3 space-y-2">
                  {hierarchyIssues.map((category) => {
                    const parent = category.parentId
                      ? categoryById.get(category.parentId)
                      : null;

                    return (
                      <div
                        key={category.id}
                        className="rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm"
                      >
                        <div className="font-semibold text-stone-900">
                          {category.name}
                        </div>
                        <div className="mt-1 text-xs text-stone-500">
                          Parent: {parent?.name ?? "Missing category"}. This
                          parent is not a valid top-level category.
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={Boolean(confirmationCategory)}
        title={
          confirmationIsDelete
            ? "Delete category?"
            : confirmationIsRestore
              ? "Restore category?"
              : "Archive category?"
        }
        description={
          confirmationCategory ? (
            <>
              <span className="font-semibold text-stone-900">
                {confirmationCategory.name}
              </span>
              {confirmationIsDelete ? (
                <span className="mt-2 block">
                  This permanently removes the category. Deletion is only
                  allowed when no products or subcategories are linked to it.
                </span>
              ) : confirmationIsRestore ? (
                <span className="mt-2 block">
                  Restoring it makes the category available for catalog
                  assignment again.
                </span>
              ) : (
                <span className="mt-2 block">
                  Existing product links are preserved, but the category will no
                  longer be available for new catalog assignments.
                </span>
              )}
            </>
          ) : null
        }
        confirmLabel={
          confirmationIsDelete
            ? "Delete"
            : confirmationIsRestore
              ? "Restore"
              : "Archive"
        }
        destructive={confirmationIsDelete}
        pending={confirmationPending}
        onCancel={() => setConfirmation(null)}
        onConfirm={confirmCategoryAction}
      />
    </>
  );
}

export type CatalogCategory = {
  id: string;
  name: string;
  parentId: string | null;
  isActive?: boolean;
};

export type CategoryFilterOption = {
  value: string;
  label: string;
  level: "main" | "subcategory" | "legacy";
  parentId: string | null;
  isActive: boolean;
};

function sortByName<T extends { name: string }>(items: T[]) {
  return [...items].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
  );
}

function isActive(category: CatalogCategory) {
  return category.isActive !== false;
}

export function buildCategoryFilterOptions(
  categories: CatalogCategory[],
  {
    activeOnly = false,
    includeLegacy = true,
  }: { activeOnly?: boolean; includeLegacy?: boolean } = {},
): CategoryFilterOption[] {
  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const topLevelCategories = sortByName(
    categories.filter(
      (category) => !category.parentId && (!activeOnly || isActive(category)),
    ),
  );
  const options: CategoryFilterOption[] = [];

  for (const mainCategory of topLevelCategories) {
    options.push({
      value: mainCategory.id,
      label: `${mainCategory.name}${isActive(mainCategory) ? "" : " (Archived)"}`,
      level: "main",
      parentId: null,
      isActive: isActive(mainCategory),
    });

    const children = sortByName(
      categories.filter(
        (category) =>
          category.parentId === mainCategory.id &&
          (!activeOnly || isActive(category)),
      ),
    );

    for (const child of children) {
      options.push({
        value: child.id,
        label: `${mainCategory.name} → ${child.name}${isActive(child) ? "" : " (Archived)"}`,
        level: "subcategory",
        parentId: mainCategory.id,
        isActive: isActive(child),
      });
    }
  }

  if (!includeLegacy) {
    return options;
  }

  const representedIds = new Set(options.map((option) => option.value));
  const legacyCategories = sortByName(
    categories.filter((category) => !representedIds.has(category.id)),
  );

  for (const category of legacyCategories) {
    if (activeOnly && !isActive(category)) {
      continue;
    }

    const parent = category.parentId
      ? (categoryById.get(category.parentId) ?? null)
      : null;
    const parentLabel = parent ? `${parent.name} → ` : "";

    options.push({
      value: category.id,
      label: `${parentLabel}${category.name} (Legacy hierarchy${isActive(category) ? "" : ", archived"})`,
      level: "legacy",
      parentId: category.parentId,
      isActive: isActive(category),
    });
  }

  return options;
}

export function getCategoryFilterIds(
  categoryId: string,
  categories: CatalogCategory[],
) {
  if (!categoryId) {
    return [];
  }

  const category = categories.find((item) => item.id === categoryId);
  if (!category || category.parentId) {
    return [categoryId];
  }

  return [
    category.id,
    ...categories
      .filter((item) => item.parentId === category.id)
      .map((item) => item.id),
  ];
}

export function getCategoryPathLabel(
  categoryId: string | null | undefined,
  categories: CatalogCategory[],
) {
  if (!categoryId) {
    return "Uncategorized";
  }

  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const path: string[] = [];
  const visited = new Set<string>();
  let current = categoryById.get(categoryId) ?? null;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current.name);
    current = current.parentId
      ? (categoryById.get(current.parentId) ?? null)
      : null;
  }

  return path.length ? path.join(" → ") : "Uncategorized";
}

export function formatCategoryRelationPath(
  category:
    | {
        name: string;
        parent?: { name: string } | null;
      }
    | null
    | undefined,
) {
  if (!category) {
    return "Uncategorized";
  }

  return category.parent
    ? `${category.parent.name} → ${category.name}`
    : category.name;
}

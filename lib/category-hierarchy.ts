import { prisma } from "@/lib/prisma";

export const CATEGORY_MAX_DEPTH = 2 as const;

type CategoryParent = {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
};

type CategoryHierarchyIssue = {
  status: 400 | 404;
  error: string;
};

type ParentValidationResult = {
  parent: CategoryParent | null;
  issue: CategoryHierarchyIssue | null;
};

type AssignableCategory = CategoryParent & {
  parent: CategoryParent | null;
};

type AssignmentValidationResult = {
  category: AssignableCategory | null;
  issue: CategoryHierarchyIssue | null;
};

export async function validateCategoryParent({
  shopId,
  parentId,
  categoryId,
  requireActive = true,
}: {
  shopId: string;
  parentId: string | null;
  categoryId?: string;
  requireActive?: boolean;
}): Promise<ParentValidationResult> {
  if (!parentId) {
    return { parent: null, issue: null };
  }

  if (categoryId && parentId === categoryId) {
    return {
      parent: null,
      issue: {
        status: 400,
        error: "A category cannot be its own parent.",
      },
    };
  }

  const parent = await prisma.category.findFirst({
    where: { id: parentId, shopId },
    select: {
      id: true,
      name: true,
      parentId: true,
      isActive: true,
    },
  });

  if (!parent) {
    return {
      parent: null,
      issue: {
        status: 404,
        error: "Parent category was not found.",
      },
    };
  }

  if (parent.parentId) {
    return {
      parent: null,
      issue: {
        status: 400,
        error:
          "Subcategories cannot contain child categories. Choose a top-level category as the parent.",
      },
    };
  }

  if (requireActive && !parent.isActive) {
    return {
      parent: null,
      issue: {
        status: 400,
        error: "Archived categories cannot be used as a parent.",
      },
    };
  }

  return { parent, issue: null };
}

export async function validateAssignableCategory(
  shopId: string,
  categoryId: string | null,
): Promise<AssignmentValidationResult> {
  if (!categoryId) {
    return { category: null, issue: null };
  }

  const category = await prisma.category.findFirst({
    where: { id: categoryId, shopId },
    select: {
      id: true,
      name: true,
      parentId: true,
      isActive: true,
      parent: {
        select: {
          id: true,
          name: true,
          parentId: true,
          isActive: true,
        },
      },
    },
  });

  if (!category) {
    return {
      category: null,
      issue: {
        status: 404,
        error: "Selected category was not found.",
      },
    };
  }

  if (!category.isActive) {
    return {
      category: null,
      issue: {
        status: 400,
        error: "Selected category is archived.",
      },
    };
  }

  if (!category.parentId) {
    return { category, issue: null };
  }

  if (!category.parent) {
    return {
      category: null,
      issue: {
        status: 400,
        error: "Selected subcategory does not have a valid main category.",
      },
    };
  }

  if (category.parent.parentId) {
    return {
      category: null,
      issue: {
        status: 400,
        error:
          "Selected category is nested deeper than the supported main category and subcategory structure.",
      },
    };
  }

  if (!category.parent.isActive) {
    return {
      category: null,
      issue: {
        status: 400,
        error: "Selected subcategory belongs to an archived main category.",
      },
    };
  }

  return { category, issue: null };
}

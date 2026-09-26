import { NextResponse } from "next/server";
import { categoryUpdateSchema } from "@/lib/auth/validation";
import { requireRole } from "@/lib/authz";
import { apiErrorResponse } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { validateCategoryParent } from "@/lib/category-hierarchy";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";

async function uniqueCategorySlug(
  shopId: string,
  name: string,
  categoryId: string,
) {
  const base = slugify(name) || "category";
  let attempt = base;
  let suffix = 2;

  while (
    await prisma.category.findFirst({
      where: {
        shopId,
        slug: attempt,
        id: { not: categoryId },
      },
      select: { id: true },
    })
  ) {
    attempt = `${base}-${suffix++}`;
  }

  return attempt;
}

const categoryInclude = {
  parent: {
    select: {
      id: true,
      name: true,
      parentId: true,
      isActive: true,
    },
  },
  _count: {
    select: {
      products: true,
      children: true,
    },
  },
} as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { shopId, userId } = await requireRole("MANAGER");
    const { id } = await params;
    const body = await request.json();
    const parsed = categoryUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid category update.",
        },
        { status: 400 },
      );
    }

    const existing = await prisma.category.findFirst({
      where: { id, shopId },
      include: categoryInclude,
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Category not found." },
        { status: 404 },
      );
    }

    const name = parsed.data.name?.trim() ?? existing.name;
    const parentId =
      parsed.data.parentId === undefined
        ? existing.parentId
        : parsed.data.parentId?.trim() || null;
    const nextIsActive = parsed.data.isActive ?? existing.isActive;
    const parentChanged = parentId !== existing.parentId;

    if (parentChanged && parentId && (existing._count.children ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            "A main category with subcategories cannot be converted into a subcategory. Move or remove its subcategories first.",
        },
        { status: 400 },
      );
    }

    const shouldCheckActiveChildren =
      existing.isActive && !nextIsActive && parentId === null;

    const [parentValidation, duplicateByName, activeChildCount] =
      await Promise.all([
        validateCategoryParent({
          shopId,
          parentId,
          categoryId: id,
          requireActive: nextIsActive || parentChanged,
        }),
        prisma.category.findFirst({
          where: {
            shopId,
            id: { not: id },
            name: {
              equals: name,
              mode: "insensitive",
            },
          },
          select: { id: true },
        }),
        shouldCheckActiveChildren
          ? prisma.category.count({
              where: {
                shopId,
                parentId: id,
                isActive: true,
              },
            })
          : Promise.resolve(0),
      ]);

    if (parentValidation.issue) {
      return NextResponse.json(
        { error: parentValidation.issue.error },
        { status: parentValidation.issue.status },
      );
    }

    if (duplicateByName) {
      return NextResponse.json(
        { error: "A category with this name already exists in this shop." },
        { status: 409 },
      );
    }

    if (activeChildCount > 0) {
      return NextResponse.json(
        {
          error:
            "Archive the active subcategories first. A main category cannot be archived while it still has active subcategories.",
        },
        { status: 400 },
      );
    }

    const slug =
      name === existing.name
        ? existing.slug
        : await uniqueCategorySlug(shopId, name, id);

    const category = await prisma.$transaction(async (tx) => {
      const updatedCategory = await tx.category.update({
        where: { id },
        data: {
          name,
          slug,
          parentId,
          isActive: nextIsActive,
        },
        include: categoryInclude,
      });

      await logActivity({
        tx,
        shopId,
        userId,
        action:
          existing.isActive !== updatedCategory.isActive
            ? updatedCategory.isActive
              ? "CATEGORY_UNARCHIVED"
              : "CATEGORY_ARCHIVED"
            : "CATEGORY_UPDATED",
        entityType: "Category",
        entityId: updatedCategory.id,
        description:
          existing.isActive !== updatedCategory.isActive
            ? `${updatedCategory.isActive ? "Restored" : "Archived"} category ${updatedCategory.name}.`
            : `Updated category ${updatedCategory.name}.`,
        metadata: {
          level: updatedCategory.parentId ? "SUBCATEGORY" : "MAIN_CATEGORY",
          previousParentId: existing.parentId,
          parentId: updatedCategory.parentId,
          parentName: updatedCategory.parent?.name ?? null,
          isActive: updatedCategory.isActive,
        },
      });

      return updatedCategory;
    });

    return NextResponse.json({ category });
  } catch (error) {
    return apiErrorResponse(error, "Unable to update category.");
  }
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { shopId, userId } = await requireRole("MANAGER");
    const { id } = await params;

    const category = await prisma.category.findFirst({
      where: { id, shopId },
      include: categoryInclude,
    });

    if (!category) {
      return NextResponse.json(
        { error: "Category not found." },
        { status: 404 },
      );
    }

    if (category._count.products > 0 || category._count.children > 0) {
      return NextResponse.json(
        {
          error:
            "Archive or move linked products and subcategories before deleting this category.",
        },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.category.delete({ where: { id } });
      await logActivity({
        tx,
        shopId,
        userId,
        action: "CATEGORY_DELETED",
        entityType: "Category",
        entityId: id,
        description: `Deleted category ${category.name}.`,
        metadata: {
          level: category.parentId ? "SUBCATEGORY" : "MAIN_CATEGORY",
          parentId: category.parentId,
          parentName: category.parent?.name ?? null,
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "Unable to delete category.");
  }
}

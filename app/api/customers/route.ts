import { NextResponse } from "next/server";
import { customerSchema } from "@/lib/auth/validation";
import { requireRole } from "@/lib/authz";
import { apiErrorResponse } from "@/lib/api";
import {
  createCustomerRecord,
  customerDetailInclude,
  CustomerOperationError,
} from "@/lib/customer-operations";
import { serializeCustomer } from "@/lib/customers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const { shopId } = await requireRole("MANAGER");
    const customers = await prisma.customer.findMany({
      where: { shopId },
      include: customerDetailInclude,
      orderBy: [
        { isActive: "desc" },
        { updatedAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json({
      customers: customers.map(serializeCustomer),
    });
  } catch (error) {
    return apiErrorResponse(error, "Unable to load customers.");
  }
}

export async function POST(request: Request) {
  try {
    const { shopId, userId } = await requireRole("MANAGER");
    const body = await request.json();
    const parsed = customerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid customer payload.",
        },
        { status: 400 },
      );
    }

    const customer = await createCustomerRecord({
      shopId,
      userId,
      input: parsed.data,
      source: "CUSTOMERS",
    });

    return NextResponse.json(
      {
        customer: serializeCustomer(customer),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof CustomerOperationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    return apiErrorResponse(error, "Unable to create customer.");
  }
}

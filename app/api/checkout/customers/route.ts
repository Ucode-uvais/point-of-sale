import { NextResponse } from "next/server";
import { checkoutCustomerCreateSchema } from "@/lib/auth/validation";
import { requireRole } from "@/lib/authz";
import { apiErrorResponse } from "@/lib/api";
import {
  createCustomerRecord,
  CustomerOperationError,
} from "@/lib/customer-operations";
import { serializeCustomer } from "@/lib/customers";

export async function POST(request: Request) {
  try {
    const { shopId, userId } = await requireRole("CASHIER");
    const body = await request.json().catch(() => ({}));
    const parsed = checkoutCustomerCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            "Invalid checkout customer details.",
        },
        { status: 400 },
      );
    }

    const customer = await createCustomerRecord({
      shopId,
      userId,
      input: {
        type: parsed.data.type,
        firstName:
          parsed.data.type === "INDIVIDUAL" ? parsed.data.firstName : null,
        lastName: null,
        businessName:
          parsed.data.type === "BUSINESS" ? parsed.data.businessName : null,
        contactPerson: null,
        taxId: null,
        phone: parsed.data.phone,
        email: parsed.data.email,
        address: null,
        notes: null,
        isActive: true,
      },
      source: "CHECKOUT",
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

    return apiErrorResponse(
      error,
      "Unable to register customer from checkout.",
    );
  }
}

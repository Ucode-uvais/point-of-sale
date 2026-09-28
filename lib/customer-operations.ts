import { Prisma, PrismaClient, type CustomerType } from "@prisma/client";
import { logActivity } from "@/lib/activity";
import {
  classifyCustomerContactMatch,
  getCustomerDisplayName,
  normalizeCustomerCreditStatus,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
  type CustomerContactIdentity,
} from "@/lib/customers";
import { normalizeText, roundCurrency } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";

type DbClient = PrismaClient | Prisma.TransactionClient;

export class CustomerOperationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CustomerOperationError";
    this.status = status;
  }
}

export const customerDetailInclude = {
  sales: {
    where: {
      status: "COMPLETED",
    },
    select: {
      id: true,
      saleNumber: true,
      receiptNumber: true,
      paymentMethod: true,
      isCreditSale: true,
      totalAmount: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }],
  },
  loyaltyLedger: {
    include: {
      sale: {
        select: {
          id: true,
          saleNumber: true,
          totalAmount: true,
          createdAt: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  },
  creditLedgers: {
    include: {
      sale: {
        select: {
          id: true,
          saleNumber: true,
          receiptNumber: true,
          totalAmount: true,
          createdAt: true,
        },
      },
      payments: {
        include: {
          createdByUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  },
} satisfies Prisma.CustomerInclude;

export type CustomerDetail = Prisma.CustomerGetPayload<{
  include: typeof customerDetailInclude;
}>;

export type CustomerCreateSource = "CUSTOMERS" | "CHECKOUT";

export type CreateCustomerInput = {
  type: CustomerType;
  firstName?: string | null;
  lastName?: string | null;
  businessName?: string | null;
  contactPerson?: string | null;
  taxId?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive?: boolean;
};

export async function createCustomerRecord({
  shopId,
  userId,
  input,
  source,
}: {
  shopId: string;
  userId: string;
  input: CreateCustomerInput;
  source: CustomerCreateSource;
}) {
  const normalizedInput: CreateCustomerInput = {
    ...input,
    firstName: normalizeText(input.firstName),
    lastName: normalizeText(input.lastName),
    businessName: normalizeText(input.businessName),
    contactPerson: normalizeText(input.contactPerson),
    taxId: normalizeText(input.taxId),
    phone: normalizeCustomerPhone(input.phone),
    email: normalizeCustomerEmail(input.email),
    address: normalizeText(input.address),
    notes: normalizeText(input.notes),
    isActive: input.isActive ?? true,
  };

  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await assertCustomerNotLikelyDuplicate(tx, shopId, normalizedInput);

          const createdCustomer = await tx.customer.create({
            data: {
              shopId,
              type: normalizedInput.type,
              firstName: normalizedInput.firstName,
              lastName: normalizedInput.lastName,
              businessName: normalizedInput.businessName,
              contactPerson: normalizedInput.contactPerson,
              taxId: normalizedInput.taxId,
              phone: normalizedInput.phone,
              email: normalizedInput.email,
              address: normalizedInput.address,
              notes: normalizedInput.notes,
              isActive: normalizedInput.isActive ?? true,
            },
            include: customerDetailInclude,
          });

          await logActivity({
            tx,
            shopId,
            userId,
            action: "CUSTOMER_CREATED",
            entityType: "Customer",
            entityId: createdCustomer.id,
            description: `Created customer ${getCustomerDisplayName(createdCustomer)}.`,
            metadata: {
              customerType: createdCustomer.type,
              source,
            },
          });

          return createdCustomer;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      const isWriteConflict =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034";

      if (isWriteConflict && attempt < maxAttempts) {
        continue;
      }

      if (isWriteConflict) {
        throw new CustomerOperationError(
          "Customer information changed while saving. Please try again.",
          409,
        );
      }

      throw error;
    }
  }

  throw new CustomerOperationError(
    "Unable to create customer right now. Please try again.",
    409,
  );
}

export async function assertCustomerNotLikelyDuplicate(
  db: DbClient,
  shopId: string,
  candidate: CustomerContactIdentity,
  excludeCustomerId?: string,
) {
  const phone = normalizeCustomerPhone(candidate.phone);
  const email = normalizeCustomerEmail(candidate.email);

  const contactFilters: Prisma.CustomerWhereInput[] = [];

  if (phone) {
    contactFilters.push({ phone });
  }

  if (email) {
    contactFilters.push({
      email: {
        equals: email,
        mode: "insensitive",
      },
    });
  }

  if (!contactFilters.length) {
    return;
  }

  const existingCustomers = await db.customer.findMany({
    where: {
      shopId,
      ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {}),
      OR: contactFilters,
    },
    select: {
      id: true,
      type: true,
      firstName: true,
      lastName: true,
      businessName: true,
      phone: true,
      email: true,
    },
  });

  for (const existingCustomer of existingCustomers) {
    const match = classifyCustomerContactMatch(existingCustomer, candidate);

    if (match?.kind !== "LIKELY_DUPLICATE") {
      continue;
    }

    const matchedContact =
      match.phoneMatch && match.emailMatch
        ? "phone number and email address"
        : match.phoneMatch
          ? "phone number"
          : "email address";

    const customerType =
      candidate.type === "BUSINESS" ? "business" : "individual";

    throw new CustomerOperationError(
      `An ${customerType} customer using this ${matchedContact} already exists. Select the existing customer or provide identifying information that distinguishes this as a separate customer.`,
      409,
    );
  }
}

export async function getCustomerDetailOrThrow(
  db: DbClient,
  customerId: string,
  shopId: string,
) {
  const customer = await db.customer.findFirst({
    where: { id: customerId, shopId },
    include: customerDetailInclude,
  });

  if (!customer) {
    throw new CustomerOperationError("Customer not found.", 404);
  }

  return customer;
}

export async function getCustomerLoyaltyBalance(
  db: DbClient,
  customerId: string,
) {
  const latestEntry = await db.customerLoyaltyLedger.findFirst({
    where: { customerId },
    orderBy: [{ createdAt: "desc" }],
  });

  return latestEntry?.balanceAfter ?? 0;
}

export async function recordReceivablePayment({
  tx,
  shopId,
  customer,
  customerCreditLedgerId,
  amount,
  method,
  referenceNumber,
  paidAt,
  userId,
}: {
  tx: Prisma.TransactionClient;
  shopId: string;
  customer: CustomerDetail;
  customerCreditLedgerId: string;
  amount: number;
  method: string;
  referenceNumber?: string | null;
  paidAt: Date;
  userId: string;
}) {
  const ledger = customer.creditLedgers.find(
    (entry) => entry.id === customerCreditLedgerId,
  );

  if (!ledger) {
    throw new CustomerOperationError(
      "Receivable entry not found for this customer.",
      404,
    );
  }

  if (ledger.status === "VOIDED") {
    throw new CustomerOperationError(
      "Voided receivable entries cannot accept payments.",
    );
  }

  const currentBalance = Number(ledger.balance.toString());
  const normalizedAmount = roundCurrency(amount);

  if (normalizedAmount <= 0) {
    throw new CustomerOperationError(
      "Payment amount must be greater than zero.",
    );
  }

  if (normalizedAmount > currentBalance) {
    throw new CustomerOperationError(
      "Payment amount cannot exceed the remaining receivable balance.",
    );
  }

  await tx.receivablePayment.create({
    data: {
      shopId,
      customerCreditLedgerId: ledger.id,
      amount: normalizedAmount,
      method,
      referenceNumber: normalizeText(referenceNumber),
      paidAt,
      createdByUserId: userId,
    },
  });

  const nextBalance = roundCurrency(currentBalance - normalizedAmount);
  const nextStatus = normalizeCustomerCreditStatus(
    nextBalance <= 0 ? "PAID" : "PARTIALLY_PAID",
    ledger.dueDate,
    nextBalance,
  );

  await tx.customerCreditLedger.update({
    where: { id: ledger.id },
    data: {
      balance: nextBalance,
      status: nextStatus,
    },
  });

  await logActivity({
    tx,
    shopId,
    userId,
    action: "RECEIVABLE_PAYMENT_POSTED",
    entityType: "CustomerCreditLedger",
    entityId: ledger.id,
    description: `Posted receivable payment for ${getCustomerDisplayName(customer)}.`,
    metadata: {
      customerId: customer.id,
      customerName: getCustomerDisplayName(customer),
      saleNumber: ledger.sale?.saleNumber ?? null,
      amount: normalizedAmount,
      method,
      balanceAfter: nextBalance,
    },
  });
}

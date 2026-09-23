import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { getRequestMetadata, logAuthAudit } from "@/lib/auth/audit";
import { loginSchema } from "@/lib/auth/validation";
import { verifyPassword } from "@/lib/auth/password";
import { ShopRole } from "@prisma/client";

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MINUTES = 15;

function normalizeRole(value: unknown): ShopRole {
  if (value === "ADMIN" || value === "MANAGER" || value === "CASHIER") {
    return value;
  }
  return "CASHIER";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: process.env.AUTH_TRUST_HOST === "true",
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const metadata = getRequestMetadata(request);
        const email = parsed.data.email;

        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            memberships: {
              where: { isActive: true },
              include: { shop: true },
              orderBy: { assignedAt: "asc" },
            },
          },
        });

        if (!user) {
          await logAuthAudit({
            action: "LOGIN_FAILURE",
            email,
            ...metadata,
            metadata: { reason: "USER_NOT_FOUND" },
          }).catch(() => null);

          return null;
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          await logAuthAudit({
            action: "LOGIN_BLOCKED_LOCKED",
            userId: user.id,
            email: user.email,
            ...metadata,
            metadata: {
              lockedUntil: user.lockedUntil.toISOString(),
            },
          }).catch(() => null);

          return null;
        }

        const valid = await verifyPassword(
          parsed.data.password,
          user.passwordHash,
        );
        if (!valid) {
          const nextFailedAttempts = user.failedLoginAttempts + 1;
          const nextLockedUntil =
            nextFailedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS
              ? new Date(Date.now() + LOGIN_LOCKOUT_MINUTES * 60 * 1000)
              : null;

          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: nextFailedAttempts,
              lockedUntil: nextLockedUntil,
            },
          });

          await logAuthAudit({
            action: "LOGIN_FAILURE",
            userId: user.id,
            email: user.email,
            ...metadata,
            metadata: {
              reason: "INVALID_PASSWORD",
              failedLoginAttempts: nextFailedAttempts,
              lockedUntil: nextLockedUntil?.toISOString() ?? null,
            },
          }).catch(() => null);

          return null;
        }

        const primary =
          user.memberships.find((m) => m.shopId === user.defaultShopId) ??
          user.memberships[0];

        // Email verification belongs to the user account, so check it before
        // requiring a shop membership. A newly registered owner has no
        // membership until onboarding creates the first shop.
        if (!user.emailVerifiedAt) {
          await logAuthAudit({
            action: "LOGIN_BLOCKED_UNVERIFIED",
            userId: user.id,
            shopId: primary?.shopId ?? null,
            email: user.email,
            ...metadata,
          }).catch(() => null);

          return null;
        }

        if (user.forcePasswordReset) {
          await logAuthAudit({
            action: "LOGIN_BLOCKED_PASSWORD_RESET_REQUIRED",
            userId: user.id,
            shopId: primary?.shopId ?? null,
            email: user.email,
            ...metadata,
          }).catch(() => null);

          return null;
        }

        if (!primary) {
          // No active membership can mean either:
          // 1) a brand-new self-registered owner who still needs onboarding, or
          // 2) an existing staff member whose shop access was disabled.
          // Only case (1) is allowed to sign in and continue to /onboard.
          const existingMembership = await prisma.userShop.findFirst({
            where: { userId: user.id },
            select: { id: true, shopId: true },
          });

          if (existingMembership) {
            await logAuthAudit({
              action: "LOGIN_BLOCKED_INACTIVE",
              userId: user.id,
              shopId: existingMembership.shopId,
              email: user.email,
              ...metadata,
              metadata: { reason: "NO_ACTIVE_SHOP_MEMBERSHIP" },
            }).catch(() => null);

            return null;
          }
        }

        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
          },
        });

        await logAuthAudit({
          action: "LOGIN_SUCCESS",
          userId: user.id,
          shopId: primary?.shopId ?? null,
          email: user.email,
          ...metadata,
          metadata: primary ? undefined : { onboardingRequired: true },
        }).catch(() => null);

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.email.split("@")[0],
          role: normalizeRole(primary?.role),
          defaultShopId: user.defaultShopId ?? primary?.shopId ?? null,
        };
      },
    }),
  ],
  events: {
    async signOut(message) {
      if (!("token" in message)) {
        return;
      }

      const userId =
        typeof message.token?.sub === "string" ? message.token.sub : null;
      if (!userId) {
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          defaultShopId: true,
        },
      });

      // A JWT can outlive the database row it was issued for (for example,
      // after switching DATABASE_URL during development). Do not try to write
      // an audit row with a non-existent user foreign key.
      if (!user) {
        return;
      }

      await logAuthAudit({
        action: "LOGOUT",
        userId,
        shopId: user.defaultShopId ?? null,
        email: user.email,
      }).catch(() => null);
    },
  },
  callbacks: {
    async authorized({ auth, request }) {
      const pathname = request.nextUrl.pathname;
      const isPublicRoute =
        pathname === "/" ||
        pathname === "/login" ||
        pathname === "/signup" ||
        pathname === "/verify-email" ||
        pathname === "/reset-password" ||
        pathname === "/api/cron/worker" ||
        pathname.startsWith("/api/auth");
      return isPublicRoute ? true : !!auth;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = normalizeRole((user as { role?: unknown }).role);
        token.defaultShopId =
          (user as { defaultShopId?: string | null }).defaultShopId ?? null;
      }
      if (trigger === "update" && session?.user) {
        token.role = normalizeRole(session.user.role);
        token.defaultShopId = session.user.defaultShopId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.sub ?? "");
        session.user.role = normalizeRole(token.role);
        session.user.defaultShopId =
          typeof token.defaultShopId === "string" ? token.defaultShopId : null;
      }
      return session;
    },
  },
});

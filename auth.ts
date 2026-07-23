import NextAuth from "next-auth";
import Auth0 from "next-auth/providers/auth0";
import {
  getAuth0Config,
  getAuthSecret,
  resolveAuthRuntimeMode,
} from "@/lib/auth/auth-config";
import {
  resolveUserByExternalId,
  touchLastLogin,
} from "@/lib/auth/identity-mapping";

/**
 * Auth.js (NextAuth v5) configuration — Auth0 OIDC.
 * Provider remains swappable later (e.g. Keycloak) via OIDC without changing
 * ClientShield User mapping (externalId → User).
 *
 * Authorization (org/role) is NEVER taken from IdP claims — only from Prisma User.
 */
const auth0 = getAuth0Config();
const secret = getAuthSecret();
const mode = resolveAuthRuntimeMode();

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: secret ?? "dev-only-placeholder-not-for-production",
  providers:
    mode === "auth0" && auth0
      ? [
          Auth0({
            clientId: auth0.clientId,
            clientSecret: auth0.clientSecret,
            issuer: auth0.issuer,
            allowDangerousEmailAccountLinking: false,
          }),
        ]
      : [],
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: {
    signIn: "/login",
    error: "/unauthorized",
  },
  callbacks: {
    async signIn({ account }) {
      if (mode !== "auth0") return false;
      const subject = account?.providerAccountId;
      if (!subject) return false;
      try {
        await resolveUserByExternalId(subject);
        return true;
      } catch {
        // Reject unknown / disabled users — no auto-provision, no email link.
        return "/unauthorized?reason=not_provisioned";
      }
    },
    async jwt({ token, account }) {
      if (account?.providerAccountId) {
        token.sub = account.providerAccountId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        // Expose IdP subject only; ClientShield AuthSession is built in requireSession.
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },
  events: {
    async signIn({ account }) {
      const subject = account?.providerAccountId;
      if (!subject) return;
      try {
        const user = await resolveUserByExternalId(subject);
        await touchLastLogin(user.id);
      } catch {
        // Already rejected in signIn callback when applicable.
      }
    },
  },
  trustHost: true,
});

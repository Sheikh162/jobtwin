import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  DomainVerificationStatus,
  VerificationTier,
  ListingSource,
  CompanyVerificationStatus,
} from "@/generated/prisma/enums";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/** Split an email like "person@sub.corp.com" into (local, domain). */
function splitEmail(email: string): { local: string; domain: string } | null {
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return { local: email.slice(0, at), domain: email.slice(at + 1).toLowerCase() };
}

function normalizeDomain(domain: string): string {
  return domain.toLowerCase().replace(/^\.+|\.+$/g, "");
}

/**
 * Resolve the most specific domain of a company. Companies sometimes only store
 * a bare name or a careers URL; we derive a domain from either the stored
 * `domain` field or the careers-page host.
 */
export function companyDomains(company: { domain?: string | null; careersPageUrl?: string | null }): string[] {
  const out = new Set<string>();
  if (company.domain) out.add(normalizeDomain(company.domain));
  if (company.careersPageUrl) {
    try {
      const host = new URL(company.careersPageUrl).hostname;
      if (host && host !== "localhost") out.add(normalizeDomain(host));
    } catch {
      // ignore unparseable URL
    }
  }
  return [...out];
}

/**
 * Start a domain-email verification: create a PENDING DomainVerification row
 * with a one-time token. The verification "email" is a link the user must open
 * from a mailbox at that domain. For the MVP (no email provider), the link is
 * returned so the caller can log it / surface it for manual delivery.
 *
 * Returns a human message plus the verification URL (dev/demo only — in a real
 * deployment the URL would be emailed, not shown to the requester).
 */
export async function startDomainVerification(input: {
  userId: string;
  companyId: string;
  email: string;
}): Promise<{ ok: true; verificationUrl: string; expiresAt: Date } | { ok: false; error: string }> {
  const company = await prisma.company.findUnique({ where: { id: input.companyId } });
  if (!company) return { ok: false, error: "Company not found" };

  const parts = splitEmail(input.email);
  if (!parts) return { ok: false, error: "Invalid email address" };

  const candidateDomains = companyDomains(company).map(normalizeDomain);
  if (candidateDomains.length === 0) {
    // No known domain for this company — can't verify ownership against it.
    return { ok: false, error: "This company has no known domain to verify against." };
  }

  // The claimed email's domain must match one of the company's domains (or be
  // a subdomain of it, e.g. mail.linear.app for linear.app).
  const domainMatches = candidateDomains.some((d) => parts.domain === d || parts.domain.endsWith(`.${d}`));
  if (!domainMatches) {
    return {
      ok: false,
      error: `Email domain "${parts.domain}" does not match "${candidateDomains.join(", ")}". Use a work email from one of these.`,
    };
  }

  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + VERIFY_TTL_MS);

  await prisma.domainVerification.upsert({
    where: { userId_companyId: { userId: input.userId, companyId: input.companyId } },
    create: {
      userId: input.userId,
      companyId: input.companyId,
      email: input.email,
      domain: parts.domain,
      token,
      status: DomainVerificationStatus.PENDING,
      expiresAt,
    },
    update: {
      email: input.email,
      domain: parts.domain,
      token,
      status: DomainVerificationStatus.PENDING,
      expiresAt,
      usedAt: null,
    },
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return {
    ok: true,
    verificationUrl: `${base}/verify/email?token=${token}`,
    expiresAt,
  };
}

/**
 * Confirm a verification token. On success returns the (userId, companyId, domain).
 * The token is single-use and expires after TTL.
 */
export async function confirmVerification(
  token: string
): Promise<
  | { ok: true; userId: string; companyId: string; domain: string }
  | { ok: false; error: string }
> {
  const row = await prisma.domainVerification.findUnique({ where: { token } });
  if (!row) return { ok: false, error: "Invalid verification link." };
  if (row.status !== DomainVerificationStatus.PENDING) {
    return { ok: false, error: "This verification link was already used." };
  }
  if (row.expiresAt < new Date()) {
    return { ok: false, error: "This verification link has expired." };
  }

  await prisma.$transaction([
    prisma.domainVerification.update({
      where: { id: row.id },
      data: { status: DomainVerificationStatus.VERIFIED, usedAt: new Date() },
    }),
    // Mark the company domain-verified once ANY user proves mailbox access at it.
    prisma.company.update({
      where: { id: row.companyId },
      data: { verificationStatus: CompanyVerificationStatus.DOMAIN_VERIFIED },
    }),
  ]);

  return { ok: true, userId: row.userId, companyId: row.companyId, domain: row.domain };
}

/** Does this user have a successful domain verification for the company? */
export async function hasVerifiedDomain(
  userId: string,
  companyId: string
): Promise<boolean> {
  const row = await prisma.domainVerification.findFirst({
    where: {
      userId,
      companyId,
      status: DomainVerificationStatus.VERIFIED,
    },
  });
  return !!row;
}

// Local helper used by postJobListing/createPost to assign tiers server-side.
export { VerificationTier, ListingSource };
import { llmText } from "@/lib/llm";

/**
 * Agent-drafts a referral ask message. The candidate reviews and sends it —
 * the agent does the drafting labor, the human keeps authorship control.
 *
 * Demonstrates the referral-ask drafting part of the product; polish on the
 * referral marketplace itself is an explicit non-goal for the MVP.
 */
export async function draftReferralAsk(input: {
  referrerName?: string;
  referralCompany: string;
  listingTitle: string;
  candidateSkills?: string[];
  candidateHeadline?: string;
}): Promise<string> {
  try {
    return await llmText({
      system:
        "You draft a short, specific, non-pushy referral request message from a job seeker to an employee at the same company. Match their tone to the referrer. Max 180 words. Do not fabricate experience.",
      user: [
        `Referrer: ${input.referrerName ?? "a current employee"}`,
        `Company: ${input.referralCompany}`,
        `Role: ${input.listingTitle}`,
        `Candidate headline: ${input.candidateHeadline ?? "n/a"}`,
        `Candidate skills: ${input.candidateSkills?.join(", ") ?? "n/a"}`,
      ].join("\n"),
      maxTokens: 300,
    });
  } catch {
    return `Hi${input.referrerName ? " " + input.referrerName : ""}, I'm applying for the ${input.listingTitle} role at ${input.referralCompany} and would really appreciate a referral. Happy to chat further. Thank you!`;
  }
}
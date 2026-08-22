# Jobtwin

A **digital-twin agent** for job search. Your twin watches company career pages, fills application forms, and drafts outreach — you keep only the decisions that need a human.

The product is agent-first, not feature-first: every feature either (a) gives the agent something useful to do, or (b) gives the human a fast, low-friction way to make the one decision the agent can't make.

## Core loop

```
agent finds a job → user gets pinged (Telegram) → user swipes right → application goes out autofilled
```

## MVP features (all built here)

1. **Auth + resume-parsed profile** — Auth.js (NextAuth) with GitHub OAuth; resume upload → AI-parsed structured profile; GitHub connect.
2. **Company registry + sourcing agent** — BullMQ worker crawls a seed list of careers pages, detects the ATS (Greenhouse/Ashby/Lever) and pulls listings from its public job-board API, falling back to Playwright + LLM extraction for bespoke pages. Diffs against the last snapshot to catch new/closed listings.
3. **Matching engine** — every fresh listing is checked against each user's saved criteria; creates bounded `Match` rows and pings the user in real time (see #5).
4. **Swipe review queue UI** — a bounded queue of pre-vetted matches (not an infinite discovery feed). Approve chains straight into the apply flow.
5. **Telegram bot** — the instant a new match is created the user is notified (real-time, not batched), via a pluggable notification service (WhatsApp/email can be added without a rewrite). A second confirmation ping fires when the user approves.
6. **Autofill browser extension** — WebExtension (MV3) that fills saved profile data into Greenhouse/Lever forms, password-manager style.
7. **Manual job-posting flow** — tiered provenance labels: *sourced from careers page* > *posted by verified employee* > *employer-submitted, presence confirmed* > *employer-submitted, unverified*. Every listing shows its label. The tier is assigned **server-side** from a real check — a work-email domain verification and an agent presence check (DNS/HTTP) — never a client-supplied value.
8. **Native community threads** — pseudonymous, scoped by company/role, with the same server-side verification tiering as job posting (domain-verified posts carry the trusted tier).
9. **Application status tracking** — applied → screened → interview → outcome, feeding transparency stats (response rate, avg. time-to-response, ghosting rate) shown on listings **and on the swipe card at decision time**.

### Verification & provenance (what the tiers actually mean)

- **Domain verification**: a user adds a company work email; the app issues a one-time verification link that only a mailbox at that domain can open. Success marks the (user, company) domain-verified and upgrades the company to `DOMAIN_VERIFIED`.
- **Agent presence check**: for "presence confirmed", the app resolves the company's domain and confirms a live DNS record / reachable origin before applying that tier.
- **MVP caveat (stub)**: there is **no email-sending provider** wired up. The verification link is surfaced in the UI (demo mode) rather than emailed. In production you'd send it via an email provider; the click-confirm logic is real either way.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript, mobile-first PWA |
| Backend | Next.js API routes |
| Database | PostgreSQL + Prisma 7 (Prisma Client generated into `src/generated/prisma`), pgvector for semantic search |
| Background jobs | BullMQ (Redis) for the sourcing agent's scheduled crawls |
| Page fetching | Playwright (Chromium) |
| LLM | OpenRouter → `deepseek/deepseek-v4-flash-0731`, structured/tool-based outputs |
| Notifications | Telegram Bot API (pluggable service) |
| Auth | Auth.js (NextAuth), GitHub OAuth |
| Browser extension | WebExtension, Manifest V3, TypeScript |

## Getting started

Requires Node 20+, Docker (Postgres + Redis).

```bash
# 1. Database + Redis
docker compose up -d

# 2. Environment
cp .env.example .env
#   fill in AUTH_GITHUB_ID/SECRET, OPENROUTER_API_KEY, TELEGRAM_BOT_TOKEN
#   (optional) PAYLOAD of a deployed URL in NEXT_PUBLIC_APP_URL for webhook + links

# 3. Migrate + seed
npm run db:migrate
npm run db:seed

# 4. Run the app and the agent
npm run dev                                   # web app on :3000
npm run agent                                 # sourcing agent (crawl + match), exits after one cycle
```

Register the Telegram webhook once (needs a public HTTPS URL, e.g. cloudflared/ngrok):

```bash
curl -F "url=$NEXT_PUBLIC_APP_URL/api/telegram/webhook" \
  "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook"
```

### Project layout

```
prisma/            schema, migrations, seed, inspect (DB inspector)
src/agent/         BullMQ queues, ATS fetcher, crawler, differ, matcher, worker entry
src/app/           Next.js App Router — queue at /, plus /criteria /post /referrals
                   /community /applications /profile /verify/email and API routes
src/components/    design-system app components + shadcn/ui
src/lib/           prisma client, llm provider, notifications, resume parsing,
                   verification, extension-token, referral drafting, actions, queue helpers
extension/         WebExtension (Manifest V3) Greenhouse/Lever autofill, builds to .js via its own tsc
```

### Architecture diagram

A Mermaid architecture diagram of the current system lives at [`docs/architecture.mmd`](docs/architecture.mmd) — it maps the client pages, server actions, the agent worker, the data layer, and external sources (careers pages, Telegram, OpenRouter, GitHub OAuth). Render it with any Mermaid viewer (GitHub renders `.mmd` natively, or `npx @mermaid-js/mermaid-cli -i docs/architecture.mmd -o architecture.png`).

## Env vars

See `.env.example` — the only secrets you must supply are `OPENROUTER_API_KEY`, `AUTH_GITHUB_ID/SECRET`, and `TELEGRAM_BOT_TOKEN`. Generate `AUTH_SECRET` with `npx auth secret`.

## Architecture awareness — non-goals (documented, not built)

- **No multi-tenant crawl infrastructure.** One crawler on a small seed list proves the mechanism. Scaling (per-domain headers, response caching, crawl scheduling hosts) is future work and will not retrofit into the current consumer-model design without a rework — the queue interface stays stable regardless.
- **No production-grade prompt-injection defenses or sandboxing.** The sourcing agent parses arbitrary third-party HTML and feeds it to an LLM. For the MVP this is accepted: output is schema-validated before it touches the DB, and listings are never executed. Hardening (HTML sanitization, tool-use sandboxing, allow-list guards) is explicitly deferred.
- **No WhatsApp integration** — Telegram alone proves the real-time notification story. The `notifyUser` service is the seam where WhatsApp would plug in.
- **No Reddit/Discord aggregation in scope** — the native community layer proves the trust mechanism.
- **No referral-marketplace polish** — a working referral flow exists (verified referrers opt in → the agent drafts the ask → the candidate approves and sends → the referrer is notified), but matching/curation and a routed inbox are minimal. Referrals are a demonstrated idea, not a marketplace.

## LLM provider

The product talks to OpenRouter using `deepseek/deepseek-v4-flash-0731` for extraction, resume parsing, matching, and referral drafting. It uses **tool-based structured output** (`src/lib/llm.ts`: `llmStructured`) so messy career-page HTML yields schema-validated listings. Swap models via `OPENROUTER_MODEL` / `LLM_EXTRACTION_MODEL` with no code changes.

## Project structure notes

- Prisma 7: schema at `prisma/schema.prisma`, config at `prisma.config.ts`, client generated to `src/generated/prisma`.
- Design system is the tweakcn **Vercel** preset (via shadcn registry), consumed as CSS variables in `globals.css` — no hex colors in components.
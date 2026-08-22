# Jobtwin

A **digital-twin agent** for job search. Your twin watches company career pages, fills application forms, and drafts outreach — you keep only the decisions that need a human.

The product is agent-first, not feature-first: every feature either (a) gives the agent something useful to do, or (b) gives the human a fast, low-friction way to make the one decision the agent can't make.

## Core loop

```
agent finds a job → user gets pinged (Telegram) → user swipes right → application goes out autofilled
```

## MVP features (all built here)

1. **Auth + resume-parsed profile** — Auth.js (NextAuth) with GitHub OAuth; resume upload → AI-parsed structured profile; GitHub connect.
2. **Company registry + sourcing agent** — BullMQ worker crawls a seed list of careers pages with Playwright, LLM-extracts structured listings (title, location, apply link, posted date), diffs against the last snapshot to catch new/closed listings.
3. **Matching engine** — every fresh listing is checked against each user's saved criteria; creates bounded `Match` rows.
4. **Swipe review queue UI** — a bounded queue of pre-vetted matches (not an infinite discovery feed). Approve chains straight into the apply flow.
5. **Telegram bot** — real-time push the moment a match is decided, via a pluggable notification service (WhatsApp/email can be added without a rewrite).
6. **Autofill browser extension** — WebExtension (MV3) that fills saved profile data into Greenhouse/Lever forms, password-manager style.
7. **Manual job-posting flow** — tiered provenance labels: *sourced from careers page* > *posted by verified employee* > *employer-submitted, presence confirmed* > *employer-submitted, unverified*. Every listing shows its label.
8. **Native community threads** — pseudonymous, scoped by company/role, same verification tiering as job posting.
9. **Application status tracking** — applied → screened → interview → outcome, feeding transparency stats (response rate, avg. time-to-response, ghosting rate) shown on listings.

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

# 3. Migrate + seed
npm run db:migrate
npm run db:seed

# 4. Run the app and the agent
npm run dev                                   # web app on :3000
npm run agent                                 # sourcing agent (crawl + match), exits after one cycle
```

Register the Telegram webhook once:

```bash
curl -F "url=$NEXT_PUBLIC_APP_URL/api/telegram/webhook" \
  "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook"
```

### Project layout

```
prisma/            schema, migrations, seed
src/agent/         BullMQ queues, crawler (Playwright + LLM), differ, matcher, worker entry
src/app/           Next.js App Router (queue, criteria, community, applications, post, profile)
src/components/    design-system app components + shadcn/ui
src/lib/           prisma client, llm provider, notifications, resume parsing, actions, queue helpers
extension/         WebExtension (Manifest V3) Greenhouse/Lever autofill, builds to .js via its own tsc
```

## Env vars

See `.env.example` — the only secrets you must supply are `OPENROUTER_API_KEY`, `AUTH_GITHUB_ID/SECRET`, and `TELEGRAM_BOT_TOKEN`. Generate `AUTH_SECRET` with `npx auth secret`.

## Architecture awareness — non-goals (documented, not built)

- **No multi-tenant crawl infrastructure.** One crawler on a small seed list proves the mechanism. Scaling (per-domain headers, response caching, crawl scheduling hosts) is future work and will not retrofit into the current consumer-model design without a rework — the queue interface stays stable regardless.
- **No production-grade prompt-injection defenses or sandboxing.** The sourcing agent parses arbitrary third-party HTML and feeds it to an LLM. For the MVP this is accepted: output is schema-validated before it touches the DB, and listings are never executed. Hardening (HTML sanitization, tool-use sandboxing, allow-list guards) is explicitly deferred.
- **No WhatsApp integration** — Telegram alone proves the real-time notification story. The `notifyUser` service is the seam where WhatsApp would plug in.
- **No Reddit/Discord aggregation in scope** — the native community layer proves the trust mechanism.
- **No referral-marketplace polish** — the schema and status model are in place; a working agent-drafted-ask flow is wired to demonstrate the idea.

## LLM provider

The product talks to OpenRouter using `deepseek/deepseek-v4-flash-0731` for extraction, resume parsing, matching, and referral drafting. It uses **tool-based structured output** (`src/lib/llm.ts`: `llmStructured`) so messy career-page HTML yields schema-validated listings. Swap models via `OPENROUTER_MODEL` / `LLM_EXTRACTION_MODEL` with no code changes.

## Project structure notes

- Prisma 7: schema at `prisma/schema.prisma`, config at `prisma.config.ts`, client generated to `src/generated/prisma`.
- Design system is the tweakcn **Vercel** preset (via shadcn registry), consumed as CSS variables in `globals.css` — no hex colors in components.
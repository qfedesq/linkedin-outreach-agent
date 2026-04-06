# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Version increments by +0.1 on every merge to `main`.

## [1.1.3] - 2026-04-06

### Added
- **Auto-retry on cooldown**: When send_invites hits a cooldown (≤6 min), it now auto-waits for the remaining time and retries instead of stopping. Shows "⏱️ Auto-waiting Xs..." status. Only gives up on hard daily/weekly limits.

### Verified
- **Campaign isolation**: All campaign queries (CRUD, contacts, scoring, invites) already filter by userId. Each user only sees/uses their own campaigns.

## [1.1.2] - 2026-04-06

### Fixed
- **Campaign ID validation**: LLM sometimes passes campaign name ("LST") instead of ID. discover_prospects and prepare_invites now validate campaign_id — if it's a name, auto-resolves to the real ID. If not found, returns clear error.
- **Data fix**: Reassigned 56 contacts with campaignId="LST" and 10 contacts with phantom campaign ID to their correct campaign records.

## [1.1.1] - 2026-04-06

### Fixed
- **Chat hanging on LLM call** — 171 chat messages in history caused token overflow. Reduced history from 20 to 10 messages. Added 60s timeout on all LLM fetch calls so they fail fast instead of hanging forever.
- Timeout-specific error message: "The LLM took too long to respond. Try again."
- Summary call also has 45s timeout.

## [1.1.0] - 2026-04-06

### Added
- **ARCHITECTURAL: Hallucination Guard** — Post-response validator scans LLM output for action claims ("sent successfully", "enviado", etc.) and cross-checks against actual tool calls. If the LLM claims an action that wasn't executed, the response is replaced with a correction showing what tools were actually called.
- **ARCHITECTURAL: Send Intent Detection** — Detects when user says "send/dale/envía/go/hazlo" and the LLM didn't call send_invites. Automatically finds the latest pending batch and executes send_invites as a safety net.
- Tool call tracking: every tool called during a chat turn is recorded with its result, enabling post-turn validation.

### Changed
- Minor version bump to 1.1.0 — this is an architectural change to prevent hallucinated action claims.

## [1.0.9] - 2026-04-06

### Fixed
- **CRITICAL: send_invites 400 "Invalid parameters"** — stored `urn:li:member:xxx` LinkedIn URN was sent as Unipile `provider_id` which expects a different format. Now detects URNs and looks up the correct Unipile provider_id via profile lookup before sending.

### Added
- **Admin Knowledge Base**: Full knowledge base viewer in admin panel showing all entries from all users — category, content, user email, date. Enables admin to review learnings and apply improvements to the app.

## [1.0.8] - 2026-04-05

### Fixed
- **"No pending invites" bug**: Batch items now auto-approved on creation so send_invites finds them.
- **422 "Cannot resend"**: Now skips that contact and continues the batch instead of stopping.
- **Cooldown UX**: Shows batch ID and retry instructions ("come back in X minutes and say: send invites batch XYZ").

### Changed
- **System prompt hardened** with 8 critical anti-hallucination rules from user feedback:
  - NEVER claim success without calling the tool
  - NEVER simulate results — always use real tool responses
  - Report exact numbers from tool results
  - Warn about TO_CONTACT not guaranteeing no prior LinkedIn invite
  - Stateless: cannot wait/delay — tell user to return manually
  - Always investigate with evidence before reporting
- Pre-send warning in send_invites about potential prior LinkedIn invites.
- send_invites result includes batch ID for easy retry.

## [1.0.7] - 2026-04-05

### Fixed
- **CRITICAL: Unipile search 400 "Invalid parameters"** — location was sent as text string ("United States") but API expects numeric LinkedIn IDs. Now appended to keywords instead.

## [1.0.6] - 2026-04-05

### Changed
- Thinking steps collapsed by default after agent responds. Toggle arrow to expand/collapse.

## [1.0.5] - 2026-04-05

### Fixed
- **Chat silent failures** — user always sees a message now, never blank chat.
- Safety net: forced final LLM call without tools when loop exhausts 8 iterations.

### Added
- Debug logging to every chat loop iteration (`chat_debug` in Logs page): model, finish_reason, tool_calls count, content length, loop exit reason.
- Log Unipile search params (keywords, location) on failure for debugging.
- Filter model selector to only show models with tool/function calling support.

## [1.0.4] - 2026-04-05

### Fixed
- Default LLM model changed to `anthropic/claude-sonnet-4` (claude-3.5-sonnet removed from OpenRouter).

## [1.0.3] - 2026-04-05

### Added
- Rebuilt admin panel: full user table (email, name, LinkedIn/OpenRouter status, campaigns, contacts, invites, connections, responses, follow-ups, chat msgs, tokens, cost).
- Real token/cost data from ExecutionLog (replaced placeholders).
- KPI cards, ratio cards, smart alerts, active-only filter, CSV export button.

## [1.0.2] - 2026-04-05

### Fixed
- OpenRouter test button was pointing to removed Apify endpoint.

## [1.0.1] - 2026-04-05

### Added
- **Admin Panel** (`/admin`): Exclusive dashboard for federico.ledesma@protofire.io with aggregated user statistics (tokens, contacts by stage, usage time, campaigns, invites, connections, responses)
- Charts using Recharts (line for tokens, bar for stages, pie for users)
- Period filters (month/quarter)
- Access logs for admin panel
- Serverless compatible with Vercel

### Changed
- Updated versions to 1.0.1 across package.json, constants, and changelog

## [1.0.0] - 2026-04-05

### Security
- Removed legacy LinkedIn Voyager code (src/lib/linkedin/)
- Eliminated DEV_BYPASS_AUTH for production stability
- Strengthened authentication and credential handling
- Updated version to 1.0.0 for stable release

### Changed
- Migrated LinkedIn integration to Unipile only
- Improved rate limiter and self-heal robustness

## [Unreleased]

## [0.7.0] - 2026-04-03

### Added
- **Command Center** (`/command`): Unified 7-step pipeline in one screen
  - Step 1: Discover (Apify async scrape with polling)
  - Step 2: Enrich (LinkedIn profile data)
  - Step 3: Score (LLM ICP classification)
  - Step 4: Prepare Invites (LLM connection notes)
  - Steps 5-7: Check Connections, Follow-ups, Inbox Scan
  - "Run Full Daily Cycle" button executes steps 5-7 sequentially
  - Live Feed panel shows all activity in real-time (auto-refresh 5s)
  - Pipeline stats bar showing counts per stage
- **Follow-up preparation endpoint** (`POST /api/followups/prepare`): Generates follow-up messages via LLM for connected contacts 3+ days old
- **Granular logging**: Score, Enrich, Follow-up generation endpoints all log step-by-step activity

### Changed
- Apify route split into POST (start) + GET (poll) for async operation from Vercel
- ICP Scoring endpoint logs each contact result to execution logs
- Contact enrichment logs each profile fetch with timing

## [0.4.0] - 2026-04-03

### Added
- **Live Watch page** (`/live`): Real-time execution monitor with auto-refresh (3s), uptime counter, stats bar (total/success/errors), color-coded action badges, duration tracking, and live/pause toggle
- **Granular execution logging**: All API endpoints (LinkedIn search, Apify scrape, LinkedIn test, connection checks, inbox scan) now log detailed step-by-step activity with timing
- **Activity log utility** (`lib/activity-log.ts`): Centralized logging function used by all endpoints

### Changed
- **Topbar**: Shows all 3 service connection statuses (LinkedIn/Apify/OpenRouter) with individual green dots. Displays "Connected" when all 3 are configured, "X/3" for partial
- **Sidebar**: Added "Live Watch" navigation item with Activity icon

## [0.3.0] - 2026-04-03

### Fixed
- **Topbar**: Cookie status now shows "Connected" when li_at exists (was showing "Expired" incorrectly)
- **LinkedIn Search**: Simplified Voyager search URL encoding, added proper error handling for non-JSON responses
- **Apify**: Added debug info when actor returns 0 results
- **Rate limiter**: Reduced search delays to prevent Vercel function timeouts

### Changed
- **Settings**: Eye toggle now fetches decrypted values from server to verify stored credentials
- **Version**: Display V0.3 in sidebar

## [0.2.0] - 2026-04-03

### Changed
- **Database**: Migrated from SQLite to PostgreSQL via Neon (Vercel integration)
- **Prisma adapter**: Replaced dual libSQL/Pg adapter with Pg-only (`@prisma/adapter-pg`)
- **Schema provider**: Changed from `sqlite` to `postgresql` in Prisma schema
- **Env vars**: App reads `DATABASE1_DATABASE_URL` (Neon/Vercel) with fallback to `DATABASE_URL`

### Removed
- SQLite/libSQL adapter dependency for production (local dev now uses Neon too)

## [0.1.0] - 2026-04-02

### Added
- **App Scaffold**: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + Prisma 7
- **Authentication**: Google OAuth via NextAuth.js, restricted to @protofire.io domain
- **Proxy middleware**: JWT-based route protection with dev bypass option
- **LinkedIn Voyager Client** (`lib/linkedin/`):
  - Base HTTP client with auth headers and CSRF token management
  - Profile fetching and enrichment (full + mini profiles)
  - Connection invitations (send, list sent, withdraw)
  - Direct messaging (send to connection, send to conversation, read inbox)
  - Connection status checking (batch and individual)
  - People search via Voyager search API
  - Token bucket rate limiter (per-endpoint limits, randomized delays)
- **LLM Integration**: OpenRouter API wrapper with 3 specialized prompts:
  - ICP scoring prompt (HIGH/MEDIUM/LOW fit classification)
  - Connection note generator (personalized, <=300 chars)
  - Follow-up message generator (with calendar link injection)
- **Database Schema** (Prisma + SQLite):
  - User, UserSettings, Contact, DailyRun, InviteBatch, InviteBatchItem, ExecutionLog
  - AES-256-GCM encryption for all stored credentials
- **10 Dashboard Pages**:
  - `/` Dashboard with pipeline stats, quick actions, activity feed
  - `/run` Daily cycle orchestrator with live execution log
  - `/discover` Prospect discovery (Apify scrape, LinkedIn search, manual add)
  - `/invites` Invite batch preparation with LLM messages + approval gate
  - `/followups` Connection checking + follow-up generation + sending
  - `/responses` Inbox scanning + reply detection
  - `/contacts` Full CRUD table with search, filter, sort, CSV export
  - `/sync` Google Sheets import/export
  - `/logs` Execution log viewer with filters
  - `/settings` Credential management with test buttons
- **27 API Routes** covering: auth, contacts CRUD, discovery, scoring, invite batches, follow-ups, inbox scanning, daily runs, sync, logs, settings with test endpoints
- **Safety Guardrails**: 20 invite/day hard cap, rate limiting, cookie health monitor, execution logging, 300-char message enforcement, deduplication
- **Google Sheets Sync**: Two-way import/export with column mapping
- **UI**: shadcn/ui components, sidebar navigation, responsive layout, dark mode support
- **Google OAuth**: GCP project "LinkedIn Outreach Agent" under protofire.io org
- **GitHub Repository**: qfedesq/linkedin-outreach-agent

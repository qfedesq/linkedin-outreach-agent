# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Version increments by +0.1 on every merge to `main`.

## [Unreleased]

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

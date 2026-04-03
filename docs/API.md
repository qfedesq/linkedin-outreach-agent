# API Reference — V0.1

All routes require authentication (JWT via NextAuth) unless noted. When `DEV_BYPASS_AUTH=true`, a dev user is created automatically.

## Auth

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/auth/[...nextauth]` | NextAuth handler (login, callback, session) |

## Settings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/settings` | Get user settings (secrets masked) |
| PUT | `/api/settings` | Save user settings (auto-encrypts secrets) |
| POST | `/api/settings/test-linkedin` | Test LinkedIn li_at cookie validity |
| POST | `/api/settings/test-apify` | Test Apify API token |
| POST | `/api/settings/test-openrouter` | Test OpenRouter API key |
| POST | `/api/settings/test-sheets` | Test Google Sheets connection |

## Contacts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/contacts?status=&fit=&search=&page=&limit=` | List contacts with filters |
| POST | `/api/contacts` | Create contact(s) — accepts single or array |
| PATCH | `/api/contacts/[id]` | Update contact fields |
| DELETE | `/api/contacts/[id]` | Delete contact |
| POST | `/api/contacts/enrich` | Enrich contacts via LinkedIn Voyager (body: `{contactIds}`) |

## Discovery

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/discover/apify` | Run Apify scrape (body: `{keywords, geography}`) |
| POST | `/api/discover/linkedin-search` | Search via Voyager API (body: `{keywords, filters}`) |
| POST | `/api/discover/score` | LLM-score contacts (body: `{contactIds}`) |

## Invite Batches

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/invites/prepare` | Generate batch with LLM messages (max 20) |
| GET | `/api/invites/[batchId]` | Get batch details with items |
| PATCH | `/api/invites/[batchId]` | Update batch (approve/edit/cancel items) |
| POST | `/api/invites/[batchId]/send-next` | Send next unsent approved item (queue pattern) |

## Follow-ups

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/followups/check-connections` | Batch check all INVITED contacts via Voyager |
| GET | `/api/followups/due` | Get contacts due for follow-up (connected 3+ days) |
| POST | `/api/followups/generate` | Generate follow-up messages via LLM (body: `{contactIds}`) |
| POST | `/api/followups/send` | Send follow-up messages via Voyager (body: `{messages}`) |

## Inbox

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/inbox/scan` | Scan LinkedIn inbox, match with tracked contacts |
| GET | `/api/inbox/matches` | Get contacts with status REPLIED or MEETING_BOOKED |

## Runs

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/run/start` | Create new DailyRun record |
| GET | `/api/run/[runId]/status` | Get run status and metrics |
| PATCH | `/api/run/[runId]/status` | Update run status/metrics |
| GET | `/api/runs` | List past 20 runs |

## Sync

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sync/import` | Import contacts from Google Sheet |
| POST | `/api/sync/export` | Export contacts to Google Sheet |

## Logs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/logs?action=&success=&page=&limit=` | List execution logs with filters |

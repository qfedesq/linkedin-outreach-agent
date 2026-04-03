# Architecture — V0.1

## System Overview

The LinkedIn Outreach Agent is a Next.js webapp that automates B2B LinkedIn outreach. It operates as a single-tenant SaaS app where authenticated users manage a pipeline of prospects through automated connection requests and follow-up messaging.

## Data Flow

```mermaid
flowchart LR
    A[Discover] -->|Apify / Voyager Search| B[New Contacts]
    B -->|Voyager getProfile| C[Enriched Contacts]
    C -->|OpenRouter LLM| D[Scored Contacts<br/>HIGH/MED/LOW]
    D -->|OpenRouter LLM| E[Invite Batch<br/>Personalized Notes]
    E -->|User Approval| F[Send Invites<br/>via Voyager API]
    F -->|Rate Limited<br/>30-60s gaps| G[Invited Contacts]
    G -->|Voyager checkConnection| H{Connected?}
    H -->|Yes, 3+ days| I[Follow-up<br/>via Voyager Message]
    H -->|No, 30+ days| J[Unresponsive]
    I -->|Voyager Inbox Scan| K{Reply?}
    K -->|Yes| L[Meeting Booked]
    K -->|No, 14+ days| J
```

## Authentication Flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant P as Proxy (middleware)
    participant NA as NextAuth
    participant G as Google OAuth
    participant DB as Database

    B->>P: Request any page
    P->>P: Check JWT token
    alt No token
        P->>B: Redirect to /login
        B->>NA: Click "Sign in with Google"
        NA->>G: OAuth redirect
        G->>NA: Auth code + user info
        NA->>NA: Check email ends with @protofire.io
        alt Valid domain
            NA->>DB: Upsert user
            NA->>B: Set JWT cookie, redirect to /
        else Invalid domain
            NA->>B: Access denied
        end
    else Valid token
        P->>B: Allow request
    end
```

## Database Schema (ERD)

```mermaid
erDiagram
    User ||--o| UserSettings : has
    User ||--o{ Contact : owns
    User ||--o{ DailyRun : runs
    User ||--o{ InviteBatch : creates
    User ||--o{ ExecutionLog : generates
    InviteBatch ||--o{ InviteBatchItem : contains

    User {
        string id PK
        string email UK
        string name
        string image
    }

    UserSettings {
        string id PK
        string userId FK
        string linkedinLiAt "encrypted"
        string linkedinCsrfToken "encrypted"
        string linkedinProfileUrn
        boolean linkedinCookieValid
        string apifyApiToken "encrypted"
        string openrouterApiKey "encrypted"
        string googleSheetsId
        string googleServiceAccount "encrypted"
        string calendarBookingUrl
        string preferredModel
    }

    Contact {
        string id PK
        string name
        string position
        string company
        string linkedinUrl UK
        string linkedinSlug
        string linkedinProfileId
        string profileFit "HIGH/MED/LOW"
        string status "pipeline stage"
        datetime inviteSentDate
        datetime connectedDate
        datetime followupSentDate
    }

    InviteBatch {
        string id PK
        string status "PENDING/APPROVED/SENT"
        string userId FK
    }

    InviteBatchItem {
        string id PK
        string batchId FK
        string contactId
        string draftMessage "LLM generated"
        boolean approved
        boolean sent
        string sendResult
    }

    ExecutionLog {
        string id PK
        string action
        string contactId
        boolean success
        string errorCode
        int duration
    }
```

## Security Architecture

- **Auth**: Google OAuth with @protofire.io domain restriction
- **Sessions**: JWT strategy (stateless, no session DB)
- **Credentials**: AES-256-GCM encrypted at rest (12-byte IV, 16-byte auth tag)
- **Proxy**: All routes except `/login`, `/api/auth`, `/_next` require valid JWT
- **Rate Limiting**: Token bucket per endpoint type (invitations: 30-60s, profiles: 2.4-3.6s)
- **Daily Cap**: Hard limit of 20 invites per day, enforced at DB level

## Project Structure

```
src/
├── app/
│   ├── layout.tsx                    # Root: fonts, metadata, Providers
│   ├── login/page.tsx                # Login page
│   ├── (dashboard)/
│   │   ├── layout.tsx                # Sidebar + TopBar wrapper
│   │   ├── page.tsx                  # Dashboard
│   │   ├── contacts/page.tsx
│   │   ├── discover/page.tsx
│   │   ├── invites/page.tsx
│   │   ├── followups/page.tsx
│   │   ├── responses/page.tsx
│   │   ├── run/page.tsx
│   │   ├── sync/page.tsx
│   │   ├── logs/page.tsx
│   │   └── settings/page.tsx
│   └── api/                          # 27 API routes
├── components/
│   ├── layout/ (sidebar, topbar)
│   ├── providers.tsx
│   └── ui/ (19 shadcn components)
├── lib/
│   ├── auth.ts                       # NextAuth config
│   ├── auth-helpers.ts               # getAuthUser, unauthorized
│   ├── constants.ts                  # APP_VERSION, APP_NAME
│   ├── encryption.ts                 # AES-256-GCM
│   ├── prisma.ts                     # DB client factory
│   ├── llm.ts                        # OpenRouter + prompts
│   ├── sheets.ts                     # Google Sheets API
│   └── linkedin/                     # Voyager API client
│       ├── client.ts, profiles.ts, invitations.ts
│       ├── messaging.ts, connections.ts, search.ts
│       ├── rate-limiter.ts, types.ts
│       └── index.ts
└── proxy.ts                          # Auth middleware
```

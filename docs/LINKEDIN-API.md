# LinkedIn Voyager API Reference — V0.1

## Overview

The app uses LinkedIn's internal Voyager API (`https://www.linkedin.com/voyager/api`) for all LinkedIn operations. This is an undocumented, unofficial API — endpoints may change without notice.

## Authentication

Every request requires:
- `li_at` session cookie (extracted from browser, lasts 6-12 months on Premium)
- `JSESSIONID` (CSRF token, extracted on first validation or generated as `ajax:{random}`)

```
Cookie: li_at={cookie}; JSESSIONID="{csrfToken}"
csrf-token: {csrfToken}
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...
Accept: application/vnd.linkedin.normalized+json+2.1
x-restli-protocol-version: 2.0.0
```

### Cookie Lifecycle
1. User extracts `li_at` from Chrome DevTools > Application > Cookies > linkedin.com
2. App validates via `GET /voyager/api/me`
3. CSRF token extracted from response or generated
4. Cookie health checked on page load + every 6 hours
5. If 401/403: cookie marked expired, user notified

## Endpoints Used

### Profile
| Method | Endpoint | Rate Limit |
|--------|----------|-----------|
| GET | `/identity/dash/profiles?q=memberIdentity&memberIdentity={slug}` | 1 per 3s |
| GET | `/identity/profiles/{slug}/profileView` | 1 per 3s |

### Invitations
| Method | Endpoint | Rate Limit |
|--------|----------|-----------|
| POST | `/growth/normInvitations` | 1 per 45s |
| GET | `/relationships/sentInvitationViewsByInvitationType` | global |
| DELETE | `/growth/normInvitations/{urn}` | global |

### Messaging
| Method | Endpoint | Rate Limit |
|--------|----------|-----------|
| POST | `/messaging/conversations` | 1 per 30s |
| POST | `/messaging/conversations/{id}/events` | 1 per 30s |
| GET | `/messaging/conversations` | global |
| GET | `/messaging/conversations/{id}/events` | global |

### Connections
| Method | Endpoint | Rate Limit |
|--------|----------|-----------|
| GET | `/identity/profiles/{slug}/networkinfo` | 1 per 3s |
| GET | `/relationships/dash/connections` | global |

### Search
| Method | Endpoint | Rate Limit |
|--------|----------|-----------|
| GET | `/search/dash/clusters?...` | 1 per 5s |

## Rate Limiting Strategy

Token bucket algorithm with per-endpoint limits:

| Type | Max Tokens | Refill Rate | Min Delay | Max Delay |
|------|-----------|-------------|-----------|-----------|
| profile | 5 | 0.33/s | 2.4s | 3.6s |
| invitation | 2 | 0.022/s | 30s | 60s |
| message | 3 | 0.033/s | 24s | 36s |
| search | 3 | 0.2/s | 4s | 6s |
| global | 100 | 0.028/s | 0.5s | 1.5s |

All delays are randomized +-20% to appear human-like.

### Error Handling
- **429**: Rate limited — halt all operations, log, notify user
- **401/403**: Cookie expired — mark invalid, stop operations
- **CAPTCHA response**: Halt everything, log, notify user

## Safety Limits

- **20 invites/day**: Hard cap enforced at DB level
- **1 follow-up per contact**: Never double-follow-up
- **300 char limit**: Connection notes validated at prompt, UI, and API level
- **Execution logging**: Every Voyager API call logged to ExecutionLog table

## Important Notes

- Voyager API is unofficial and may break at any time
- The `profileId` and `trackingId` (needed for invite API) are NOT in the LinkedIn URL — they must be fetched from the profile endpoint first
- Always enrich contacts before attempting to send invitations
- The `li_at` cookie is the single point of failure — if it expires, all LinkedIn operations stop

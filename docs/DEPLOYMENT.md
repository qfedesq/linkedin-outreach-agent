# Deployment Guide — V0.1

## Vercel + PostgreSQL

### Prerequisites
- Vercel account connected to GitHub
- PostgreSQL database (Vercel Postgres, Neon, or Supabase)
- Google Cloud OAuth credentials with production redirect URI

### Step 1: Connect Repository
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import `qfedesq/linkedin-outreach-agent`
3. Framework preset: Next.js (auto-detected)

### Step 2: Provision Database
1. In Vercel dashboard > Storage > Create Database > Postgres
2. Copy the `DATABASE_URL` (starts with `postgresql://`)

### Step 3: Set Environment Variables

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | PostgreSQL connection string |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `NEXTAUTH_SECRET` | Generate: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `https://your-app.vercel.app` |
| `ENCRYPTION_KEY` | Generate: `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` |
| `DEV_BYPASS_AUTH` | `false` |

### Step 4: Google OAuth Redirect URI
1. Go to [Google Cloud Console > APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)
2. Edit your OAuth 2.0 Client ID
3. Add authorized redirect URI: `https://your-app.vercel.app/api/auth/callback/google`
4. Add authorized JavaScript origin: `https://your-app.vercel.app`

### Step 5: Deploy
1. Vercel will auto-deploy on push to `main`
2. Prisma migrations run via `prisma migrate deploy` in the build step
3. The build command in `package.json` handles everything

### Step 6: Run Database Migration
After first deploy, run migrations via Vercel CLI:
```bash
npx vercel env pull .env.production
DATABASE_URL=<prod_url> npx prisma migrate deploy
```

### Local Development with Postgres
To test with Postgres locally:
```bash
# .env
DATABASE_URL="postgresql://user:pass@localhost:5432/linkedin_agent"
```

The app auto-detects the URL scheme and uses the appropriate Prisma adapter.

## Database Provider Switch

The app supports both SQLite (local dev) and PostgreSQL (production):
- URLs starting with `file:` or `libsql:` use the libSQL adapter
- URLs starting with `postgres://` or `postgresql://` use the pg adapter

See `src/lib/prisma.ts` for the adapter selection logic.

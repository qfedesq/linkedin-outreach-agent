# Contributing to LinkedIn Outreach Agent

## Version & Changelog Policy

Every merge to `main` **must** follow these rules, regardless of who contributes:

### 1. Update the Changelog

Edit `CHANGELOG.md` and add your changes under the `[Unreleased]` section using [Keep a Changelog](https://keepachangelog.com/) categories:

| Category | Use for |
|----------|---------|
| **Added** | New features, pages, API routes |
| **Changed** | Modifications to existing functionality |
| **Fixed** | Bug fixes |
| **Removed** | Deleted features or files |
| **Security** | Security-related changes |
| **Deprecated** | Features marked for future removal |

### 2. Increment the Version

On each merge to `main`, bump the version by **+0.1** in **both** of these files:

- `src/lib/constants.ts` — update `APP_VERSION`
- `package.json` — update `"version"`

Example: `0.1` becomes `0.2`, then `0.3`, etc.

The maintainer moves items from `[Unreleased]` to a new version header (e.g., `## [0.2.0] - 2026-04-05`) at merge time.

### 3. Update Documentation

If your change affects any of the following, update the corresponding doc:

| What changed | Update |
|---|---|
| New/modified API route | `docs/API.md` |
| Architecture or data flow | `docs/ARCHITECTURE.md` |
| Deployment config or env vars | `docs/DEPLOYMENT.md` |
| LinkedIn Voyager API usage | `docs/LINKEDIN-API.md` |
| Project overview or setup | `README.md` |

### 4. PR Checklist

Before submitting a PR, verify:

- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] `APP_VERSION` in `src/lib/constants.ts` incremented
- [ ] `version` in `package.json` incremented
- [ ] Relevant docs updated
- [ ] `npm run build` passes
- [ ] No secrets committed (check `.env` is in `.gitignore`)

## Development Setup

```bash
git clone https://github.com/qfedesq/linkedin-outreach-agent.git
cd linkedin-outreach-agent
cp .env.example .env  # Fill in your credentials
npm install
npx prisma migrate dev
npm run dev
```

## Branch Strategy

- `main` — production (auto-deploys to Vercel)
- Feature branches: `feature/<description>`
- Bug fixes: `fix/<description>`

# Zervia — Production App (Phase 0: Foundation)

The production build of Zervia — *"Anything and everything, in one place."*
Founder-owned, no hired developers. See `../ARCHITECTURE.md` for the full plan.

## Stack

- **Next.js 15** (App Router) + **TypeScript** (strict)
- **Tailwind CSS v4** — blue-and-white brand theme tokens in `app/globals.css`
- **next-intl** — 10 locales: `en tl es fr yo ig ha zh ar pt` (Arabic renders RTL)
- **PWA** — `public/manifest.webmanifest` + brand icon (service worker lands in Phase 6)

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 — English homepage.
Try http://localhost:3000/tl (Tagalog), http://localhost:3000/ar (Arabic, right-to-left).

Health check: http://localhost:3000/api/health → `{"ok":true,"phase":0}`

## Build & verify

```bash
npm run build   # must pass with zero TypeScript errors
```

## Project structure

```
app/
  [locale]/
    layout.tsx        # <html lang dir> + next-intl provider (RTL flips for ar)
    (marketing)/
      page.tsx        # public homepage: hero, features, languages, join
    (app)/
      layout.tsx      # logged-in shell (stub until Phase 1)
  api/
    health/route.ts   # GET /api/health → { ok: true, phase: 0 }
components/
  ZMark.tsx           # brand "Z" logo mark
  Button.tsx          # primary/secondary brand buttons (56px tap targets)
  Card.tsx            # white feature card
  LanguageSwitcher.tsx# all 10 locales
i18n/
  routing.ts          # locale list, default 'en', prefix as-needed
  request.ts          # loads messages/{locale}.json
lib/
  locales.ts          # locale codes, native names, RTL helper
messages/
  en.json tl.json …   # translation files (en complete, others drafted)
public/
  manifest.webmanifest
  icon.svg
middleware.ts         # next-intl locale routing (skips /api and static files)
```

## Phase plan

| Phase | Delivers |
|---|---|
| **0 — Foundation** (this) | Repo, brand theme, 10-language plumbing, PWA manifest, health check |
| 1 — Accounts | Real signup/login (Supabase Auth), country + language at signup |
| 2 — Listings | Provider onboarding, listing CRUD, Discover with Worldwide / Near me |
| 3 — Bookings | Booking flow, messaging, reviews, rating aggregates |
| 4 — Rewards | Points ledger (100 signup / 200 referral), referral codes, redemptions |
| 5 — Money | Stripe: Pro/Business subscriptions, $9 boosts, lead fees |
| 6 — Hardening | Verification queue, support hub, rate limits, service worker, launch |

## What's stubbed vs real (Phase 0)

| Real | Stubbed (later phases) |
|---|---|
| Locale routing + 10 translation files | Auth — no signup/login yet (Phase 1) |
| Brand theme, ZMark, Button, Card | Database — no Supabase wired yet (Phase 1) |
| Marketing homepage, all 10 languages | Listings/bookings — no marketplace yet (Phases 2–3) |
| PWA manifest + theme-color | Service worker (Phase 6) |
| `/api/health` | Payments (Phase 5) |

The "Join the waitlist" button scrolls to a section that honestly states
the waitlist opens soon — there is no fake signup form in Phase 0.
<!-- deploy trigger -->

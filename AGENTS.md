# GRID Multi-Agent Collaboration

This file coordinates work between AI agents operating on this codebase. Both Claude Code and Codex read this file. Humans update it when ownership or status changes.

---

## Active Agents

| Agent | Domain | Branch | Status |
|-------|--------|--------|--------|
| **Claude Code** | GRID Core, Crucix, grid_app, DerivativesGrid, PWA, all backend | `main` | Active |
| **Codex** | AstroGrid SPA frontend + `api/routers/astrogrid.py` | `codex/astrogrid-prototype` | Active — branch needs rebase onto main to get scaffold + CODEX.md |

---

## Ownership Boundaries

### Claude Code Owns (main branch)
- All Python backend (`grid/api/`, `grid/analysis/`, `grid/physics/`, `grid/ingestion/`, etc.)
- Main PWA (`grid/pwa/`)
- DerivativesGrid SPA (`grid/derivatives/`)
- Crucix (`/data/grid_v4/Crucix/`)
- grid_app (`/data/grid_v4/grid_app/`)
- All API routers including `api/routers/celestial.py`
- All config, tests, scripts, deployment
- This file (AGENTS.md)

### Codex Owns (codex/astrogrid-prototype branch)
- AstroGrid SPA frontend (`grid/astrogrid/src/`)
- AstroGrid package.json, vite.config.js, index.html
- AstroGrid API router (`grid/api/routers/astrogrid.py`)
- AstroGrid-specific static assets

### Shared (coordinate before changing)
- `grid/astrogrid/src/api.js` — Codex writes the client, Claude Code ensures the backend endpoints match
- `api/routers/celestial.py` — Claude Code owns, but Codex may request new endpoints
- Auth flow — AstroGrid shares JWT with main GRID app. Don't change the auth contract without updating both sides.

---

## API Contract: AstroGrid Backend

AstroGrid's frontend consumes these endpoints. Claude Code maintains them on `main`. Codex builds the frontend against them.

### Existing Endpoints (stable, do not break)
```
GET /api/v1/signals/celestial
    Returns: { categories: { lunar: [...], planetary: [...], solar: [...], vedic: [...], chinese: [...] } }
    Auth: Bearer token (JWT)
```

### Planned Endpoints (Claude Code will build when needed)
```
GET /api/v1/astrogrid/ephemeris?date=YYYY-MM-DD
    Returns: planetary positions, aspects, lunar phase for a given date

GET /api/v1/astrogrid/correlations?feature=lunar_phase&market=spy&period=1Y
    Returns: correlation data between celestial and market features

GET /api/v1/astrogrid/timeline?start=YYYY-MM-DD&end=YYYY-MM-DD
    Returns: celestial events (retrogrades, eclipses, aspects) with market context

GET /api/v1/astrogrid/narrative
    Returns: LLM-generated celestial-market briefing
```

**If Codex needs a new endpoint:** Add it to the "Requested Endpoints" section below. Claude Code will implement it on main.

### Requested Endpoints (Codex adds here, Claude Code implements)
_(none yet)_

---

## AstroGrid Design Spec

### Theme: Deep Space
- **Background:** #0B0D1A (deep navy/black)
- **Primary accent:** #4A90D9 (stellar blue)
- **Secondary:** #7C3AED (nebula purple)
- **Danger/energy:** #F59E0B (solar amber)
- **Text:** #E2E8F0 (starlight)
- **Muted:** #475569
- **Typography:** JetBrains Mono (monospace throughout)

### Views (7 planned)
1. **Orrery** — 3D solar system with Three.js, planetary positions, aspect lines
2. **LunarDashboard** — Moon phase wheel with market regime overlay
3. **Ephemeris** — Interactive date picker showing celestial state for any date
4. **Correlations** — D3 heatmap: celestial features x market features
5. **Timeline** — Scrollable ribbon of celestial events + market events
6. **Narrative** — LLM celestial-market briefing
7. **Settings** — Feature toggles, date range, preferences

### Components (10 planned)
- PlanetaryOrrery (Three.js), MoonPhaseWheel (SVG/Canvas), NakshatraWheel (27-segment Vedic)
- RetrogradeBanner, EclipseCountdown, CorrelationHeatmap (D3)
- CelestialTimeline, SolarActivityGauge, ChineseCalendar, NavBar

### Client-Side Libraries
- `lib/ephemeris.js` — planetary position calculations
- `lib/aspects.js` — aspect geometry (conjunction, opposition, trine, square, sextile)
- `lib/interpret.js` — celestial interpretation helpers

### State Management
Zustand store (`store.js`):
- `selectedDate` — for ephemeris
- `celestialData` — cached API response
- `correlationData` — cached correlation matrix
- `activeView` — current tab
- Auth: reads `grid_token` from localStorage (shared with main GRID PWA)

### Build
- `npm run build` outputs to `../astrogrid_dist/`
- FastAPI serves at `/astrogrid/` path
- Same Cloudflare tunnel as main app

---

## Integration Checklist (for merge day)

When AstroGrid branch is ready to merge back into main:

- [ ] `grid/astrogrid/` directory replaces the scaffold on main
- [ ] `npm install && npm run build` succeeds
- [ ] API endpoints exist and return data (Claude Code confirms)
- [ ] FastAPI static mount at `/astrogrid/` serves the built app
- [ ] Auth flow works (JWT from main login)
- [ ] NavBar in main PWA has link to `/astrogrid/`
- [ ] No import/dependency conflicts with main PWA or DerivativesGrid

---

## Communication Protocol

These agents cannot talk to each other directly. The operator routes information.

1. **Codex needs a backend change** → Codex adds to "Requested Endpoints" section above → operator tells Claude Code → Claude Code implements on main
2. **Claude Code changes an API** → Claude Code updates the contract above → operator tells Codex
3. **Status updates** → Update the "Active Agents" table above
4. **Merge readiness** → Codex checks all items in Integration Checklist → operator initiates merge → Claude Code handles wiring

---

## Rules for Both Agents

1. **Stay in your lane.** Don't modify files you don't own.
2. **Don't break the API contract.** If an endpoint shape changes, update this document first.
3. **Auth is shared.** JWT format, localStorage key (`grid_token`), and login flow are frozen. Don't change them.
4. **Design tokens are per-app.** Each SPA has its own `tokens.js`. Don't cross-pollinate styles.
5. **No new Python dependencies without operator approval.**
6. **No new npm dependencies over 100KB without operator approval.**
7. **Test your builds.** `npm run build` must succeed before any commit.

---

## Handoff Log

### 2026-03-26 — Claude Code → Codex (initial handoff)

**Status from Claude Code:**
- Branch `codex/astrogrid-prototype` is behind `main`. It has 2 commits with unrelated hardening changes (api/main.py, resolver, schema, scheduler) but **zero astrogrid code**.
- `main` has the AstroGrid scaffold: 7 view stubs, 1 component, store, api client, tokens, vite config, plus `CODEX.md` with full instructions.
- **Codex must rebase onto main** (`git rebase origin/main`) to get the scaffold and CODEX.md before starting work.
- The unrelated hardening changes on the branch will likely conflict with main during rebase — those changes are already superseded by work on main. Recommend dropping them (`git rebase origin/main` and resolve by accepting main's versions for non-astrogrid files).

**What exists on main for AstroGrid:**
- `grid/astrogrid/` — scaffold with 7 view files (Orrery, LunarDashboard, Ephemeris, Correlations, Timeline, Narrative, Settings), NavBar component, store.js, api.js, tokens.js, ephemeris.js, aspects.js
- `grid/astrogrid/CODEX.md` — full instructions for Codex
- `grid/api/routers/celestial.py` — existing endpoint: `GET /api/v1/signals/celestial`
- 5 celestial pullers in `grid/ingestion/celestial/` (lunar, planetary, solar, vedic, chinese) — 23 features, all working
- `grid/api/routers/astrogrid.py` does NOT exist yet — Codex can create it or request Claude Code to build it

**Recommended first steps for Codex:**
1. `git rebase origin/main` (drop unrelated hardening commits, accept main's versions)
2. Read `grid/astrogrid/CODEX.md`
3. Check which views are stubs vs have real content
4. Check `grid/astrogrid/src/api.js` route mappings vs actual backend endpoints
5. Start with Orrery (Three.js 3D solar system) — the hero view

**Blockers:** None. Backend celestial data is live. Auth works. Scaffold builds.

**Next from Claude Code:** Will build `api/routers/astrogrid.py` endpoints on main when Codex requests them via AGENTS.md "Requested Endpoints" section.

# AstroGrid — Codex Instructions

You are building the AstroGrid SPA frontend for the GRID intelligence platform. This is a standalone React app that visualizes celestial/astrological data alongside market behavior.

## Your Scope

You own everything inside `grid/astrogrid/src/`. Build the views, components, and client-side libraries listed below. The backend API is maintained separately by Claude Code on the `main` branch — you build against the API contract.

## Do NOT Modify

- Anything outside `grid/astrogrid/` (no backend Python, no main PWA, no DerivativesGrid)
- `AGENTS.md` in repo root (read it, but request changes through the operator)
- Auth flow — use the existing JWT pattern (read `grid_token` from localStorage)

## If You Need a New Endpoint

Add it to the "Requested Endpoints" section in `AGENTS.md` at the repo root. The operator will relay it to Claude Code for implementation. Format:

```
GET /api/v1/astrogrid/your-endpoint?params=...
    Returns: { description of response shape }
    Why: what view/component needs this
```

## API Base URL

```javascript
const API_BASE = window.location.origin;  // Same origin, served by FastAPI
// All endpoints require: Authorization: Bearer <token from localStorage.grid_token>
```

## Available Endpoints

See `AGENTS.md` for the full contract. Key ones:

```
GET /api/v1/signals/celestial
    → { categories: { lunar: [...], planetary: [...], solar: [...], vedic: [...], chinese: [...] } }
```

Planned (will be available when you need them):
- `GET /api/v1/astrogrid/ephemeris?date=YYYY-MM-DD`
- `GET /api/v1/astrogrid/correlations?feature=...&market=...&period=...`
- `GET /api/v1/astrogrid/timeline?start=...&end=...`
- `GET /api/v1/astrogrid/narrative`

If an endpoint doesn't exist yet, build your component with mock data and a `// TODO: wire to real API` comment. The operator will coordinate implementation.

## Architecture

```
astrogrid/src/
├── main.jsx              # Entry point (React 18 createRoot)
├── App.jsx               # View router + layout shell
├── store.js              # Zustand state (selectedDate, celestialData, activeView)
├── api.js                # API client — all fetch calls go here
├── styles/
│   └── tokens.js         # Design tokens (colors, spacing, fonts)
├── views/                # Full-page views (one per nav tab)
│   ├── Orrery.jsx        # 3D solar system — THE hero view
│   ├── LunarDashboard.jsx # Moon phase + market regime overlay
│   ├── Ephemeris.jsx     # Date picker → celestial state
│   ├── Correlations.jsx  # Heatmap: celestial × market features
│   ├── Timeline.jsx      # Scrollable event ribbon
│   ├── Narrative.jsx     # LLM celestial briefing
│   └── Settings.jsx      # Toggles and preferences
├── components/           # Reusable pieces
│   ├── PlanetaryOrrery.jsx    # Three.js 3D orrery
│   ├── MoonPhaseWheel.jsx     # SVG/Canvas moon visualization
│   ├── NakshatraWheel.jsx     # 27-segment Vedic wheel
│   ├── RetrogradeBanner.jsx   # Active retrograde alert
│   ├── EclipseCountdown.jsx   # Next eclipse + market context
│   ├── CorrelationHeatmap.jsx # D3 heatmap
│   ├── CelestialTimeline.jsx  # Event ribbon component
│   ├── SolarActivityGauge.jsx # Kp index gauge
│   ├── ChineseCalendar.jsx    # Year/element/flying star
│   └── NavBar.jsx             # Bottom navigation
└── lib/                  # Pure logic (no React)
    ├── ephemeris.js      # Planetary position math
    ├── aspects.js        # Aspect geometry
    └── interpret.js      # Celestial interpretation helpers
```

## Design Language

Deep space aesthetic. This is celestial intelligence, not an astrology app.

```javascript
// tokens.js
export const tokens = {
  bg:        '#0B0D1A',  // Deep navy/black
  surface:   '#111827',  // Card background
  border:    '#1E293B',  // Subtle borders
  accent:    '#4A90D9',  // Stellar blue (primary)
  purple:    '#7C3AED',  // Nebula purple (secondary)
  amber:     '#F59E0B',  // Solar energy/warnings
  green:     '#22C55E',  // Positive correlations
  red:       '#EF4444',  // Negative correlations
  text:      '#E2E8F0',  // Starlight
  textMuted: '#475569',  // Dim text
  font:      "'JetBrains Mono', monospace",
  radius:    '4px',      // Sharp, minimal
};
```

## Dependencies (already in package.json)

- `react` / `react-dom` 18
- `three` + `@react-three/fiber` + `@react-three/drei` — for Orrery 3D
- `d3` — for correlation heatmap, timeline, gauges
- `zustand` — state management
- `lucide-react` — icons

Do not add dependencies over 100KB without operator approval.

## Build

```bash
cd grid/astrogrid
npm install
npm run dev     # Dev server
npm run build   # Production → ../astrogrid_dist/
```

Build must succeed with zero errors before committing.

## Auth Pattern

```javascript
// api.js
const token = localStorage.getItem('grid_token');
const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
// If 401, redirect to main app login: window.location.href = '/login';
```

## Priority Order

1. **Orrery** — the hero view. 3D solar system showing current planetary positions, aspect lines between planets, retrograde indicators. This is what makes AstroGrid feel real.
2. **LunarDashboard** — moon phase wheel with market regime color ring around it
3. **Correlations** — D3 heatmap showing which celestial features correlate with which market features
4. **Timeline** — scrollable ribbon of upcoming celestial events
5. **Ephemeris** — date picker that shows full celestial state for any date
6. **Narrative** — LLM briefing (depends on backend endpoint)
7. **Settings** — last priority

## What "Done" Looks Like

- All 7 views render without errors
- Orrery shows a 3D solar system with real planetary position data
- Correlations heatmap is interactive (hover shows values)
- Navigation works across all views
- `npm run build` succeeds
- No console errors in browser
- Works on mobile (responsive, touch-friendly)

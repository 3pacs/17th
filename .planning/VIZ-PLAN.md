# GRID Visualization System — Complete Agent Handoff Plan

## Vision

GRID's data tells a story. The visualization system's job is to make that story **legible at a glance and explorable in depth**. Every chart must answer a question the operator is already asking. No decoration. No chart-for-chart's-sake.

The system has three layers:
1. **VizSpec Intelligence** (backend) — an engine that knows which chart type best reveals a given data pattern
2. **LivingGraph** (frontend) — a universal renderer that takes a VizSpec and draws it with animation, time-scrubbing, and weight-pulsing
3. **Data APIs** — endpoints that shape raw DB data into the format each renderer needs

Layer 1 and the framework of Layer 2 exist. Most of Layer 2's renderers are placeholders. Layer 3 is partially built — some endpoints exist, others need creation.

---

## What Exists Today

### Backend (complete)
| File | Lines | What it does |
|------|-------|-------------|
| `analysis/viz_intelligence.py` | 524 | 13 visualization rules, 21 ChartType enum, VizSpec dataclass (30+ fields), WeightSchedule, AnimationConfig, `select_visualization()` |
| `api/routers/viz.py` | 244 | 6 pre-built VizSpec endpoints + `/recommend` + `/rules` + `/weights` |

### Frontend — Implemented Renderers
| Component | File | Library | What it renders |
|-----------|------|---------|----------------|
| PhaseSpace | `LivingGraph.jsx` | D3 | 2D trajectory with trails, regime coloring, time scrubber |
| ForceNetwork | `LivingGraph.jsx` | D3 | Force-directed graph with drag, importance-sized nodes |
| Orbital | `LivingGraph.jsx` | Canvas | Sectors orbiting SPY center, distance = relative perf |
| TimeScrubber | `LivingGraph.jsx` | CSS | Play/pause + range slider shared by time-based charts |
| WeightIndicator | `LivingGraph.jsx` | CSS | Pulsing dots showing data freshness per family |
| CapitalFlowSankey | standalone 465L | D3 | 4-level Sankey: Market→Sector→Subsector→Actor, time slider |

### Frontend — Existing Standalone Viz Components
| Component | File | What |
|-----------|------|------|
| FearGreedGauge | 179L | SVG semicircle gauge, 5 zones, needle animation |
| RegimeThermometer | 142L | Gradient bar with 4 regime zones, floating indicator |
| MomentumSparks | 121L | 6 key asset cards with center-pivot z-score bars |
| ConfidenceMeter | 34L | Horizontal progress bar with color thresholds |
| TransitionGauge | 41L | Percentage bar with red/amber/green |
| TimeframeComparison | ~200L | 5-panel sparklines (5d/5w/3m/1y/5y) |
| MarketPulse | ~150L | Family signal heatmap with expandable movers |
| CapitalFlowAnalysis | ~100L | Sector rotation research panel with LLM narrative |

### Frontend — NOT Yet Implemented (Placeholders in LivingGraph)
These chart types are defined in the ChartType enum and have pre-built VizSpecs but **no renderer code**:
- SANKEY_TEMPORAL (separate from existing Sankey — needs temporal morphing)
- PARTICLE_SYSTEM (energy dynamics)
- RIVER_FLOW (lead/lag causation)
- RIDGELINE (z-score distribution evolution)
- CHORD (correlation flow across regimes)
- HEATMAP (options vol surface)
- SMALL_MULTIPLES (multi-timeframe side-by-side)
- DASHBOARD_GRID (composite weight cadence view)

### Data APIs — Exist but Need Adaptation
| Endpoint | Exists? | Needs work? |
|----------|---------|-------------|
| `/api/v1/flows/sankey` | YES | Already consumed by CapitalFlowSankey |
| `/api/v1/regime/trajectory` | NO | Needs PCA projection endpoint |
| `/api/v1/discovery/smart-heatmap` | YES | Needs nodes+links transform for ForceNetwork |
| `/api/v1/physics/dashboard` | YES | Needs KE/PE time series for ParticleSystem |
| `/api/v1/flows/sectors` | YES | Needs snapshots array for Orbital time scrubber |
| `/api/v1/associations/lag-analysis` | YES | Needs upstream/downstream format for RiverFlow |

---

## The Work — 5 Parallel Agent Tracks

### Agent 1: Data API Shaping (Backend Python)

**Goal:** Every pre-built VizSpec has a working data endpoint that returns data in the exact format the renderer expects.

#### Task 1A: Regime Trajectory Endpoint
**File:** `api/routers/regime.py` (add endpoint)
**Endpoint:** `GET /api/v1/regime/trajectory?days=365`
**Returns:**
```json
{
  "trajectory": [
    {
      "date": "2025-04-01",
      "pc1": -1.23,
      "pc2": 0.45,
      "regime_state": "GROWTH",
      "confidence": 0.92,
      "stress_index": -0.85
    }
  ],
  "explained_variance": [0.42, 0.23],
  "feature_loadings": { "vix": [-0.8, 0.1], "sp500": [0.7, 0.3] }
}
```
**Implementation:**
1. Query `resolved_series` for all regime-weighted features (from `auto_regime.py` DEFAULT_FEATURE_WEIGHTS keys)
2. Build date × feature matrix (same as auto_regime does)
3. Run sklearn PCA(n_components=2) on the z-scored matrix
4. For each date, look up regime from `decision_journal` (nearest prior entry)
5. Return trajectory array + explained_variance + loadings
6. Cache result for 1 hour (regime doesn't change faster than that)

**Test:** Hit endpoint, verify trajectory length matches days param, pc1/pc2 are floats, regime_state is valid enum.

#### Task 1B: Feature Network Transform
**File:** `api/routers/discovery.py` (add endpoint or modify smart-heatmap)
**Endpoint:** `GET /api/v1/discovery/feature-network?family=&min_correlation=0.3&max_nodes=50`
**Returns:**
```json
{
  "nodes": [
    { "id": "vix", "name": "VIX", "importance": 0.85, "family": "vol", "z_score": 1.2 }
  ],
  "links": [
    { "source": "vix", "target": "hy_spread", "weight": 0.72 }
  ]
}
```
**Implementation:**
1. Use existing `smart-heatmap` logic to get correlation matrix + z-scores
2. Get feature importance from `feature_importance_log` (latest run)
3. Build nodes: one per feature, importance from importance log, z_score from current snapshot
4. Build links: for each pair with |correlation| > min_correlation, create edge
5. Filter to top max_nodes by importance (to keep the graph readable)

**Test:** Nodes have required fields. Links reference valid node IDs. No self-loops.

#### Task 1C: Orbital Snapshots
**File:** `api/routers/flows.py` (add endpoint)
**Endpoint:** `GET /api/v1/flows/orbital-data?period=6M&interval=weekly`
**Returns:**
```json
{
  "center": { "name": "SPY", "price": 585.0 },
  "snapshots": [
    {
      "date": "2025-10-01",
      "sectors": {
        "XLK": { "relative_strength": 2.3, "volume": 45000000, "etf": "XLK", "name": "Technology" },
        "XLE": { "relative_strength": -1.8, "volume": 32000000, "etf": "XLE", "name": "Energy" }
      }
    }
  ]
}
```
**Implementation:**
1. Get SPY and 11 sector ETFs from `resolved_series` (XLK, XLF, XLE, XLV, XLY, XLP, XLI, XLB, XLRE, XLU, XLC)
2. For each interval date: compute 30-day rolling return for each ETF minus SPY return = relative_strength
3. Get volume from raw_series (YF:XLK:volume etc.)
4. Package as snapshots array

**Test:** Snapshots array not empty. Each snapshot has all 11 sectors. relative_strength is a float.

#### Task 1D: Physics Time Series for ParticleSystem
**File:** `api/routers/physics.py` (add endpoint)
**Endpoint:** `GET /api/v1/physics/energy-trajectory?days=90`
**Returns:**
```json
{
  "trajectory": [
    {
      "date": "2026-03-01",
      "kinetic_energy": 0.65,
      "potential_energy": 0.30,
      "total_energy": 0.95,
      "momentum": 0.42,
      "regime": "GROWTH"
    }
  ]
}
```
**Implementation:**
1. Use existing `physics/momentum.py` to compute KE (momentum magnitude), PE (mean-reversion distance)
2. For each date in range, compute both energy components from resolved_series features
3. Total = KE + PE. Momentum = rolling slope from momentum.py.
4. Join regime from decision_journal.

**Test:** Trajectory dates are sequential. Energy values are bounded 0-2. Total ≈ KE + PE.

#### Task 1E: Lead-Lag River Data
**File:** `api/routers/associations.py` (add endpoint)
**Endpoint:** `GET /api/v1/associations/lead-lag-river?min_correlation=0.3&max_pairs=20`
**Returns:**
```json
{
  "streams": [
    {
      "leader": "vix",
      "follower": "hy_spread",
      "lag_days": 3,
      "correlation": 0.68,
      "leader_family": "vol",
      "follower_family": "credit",
      "direction": "positive"
    }
  ]
}
```
**Implementation:**
1. Query `hypothesis_registry` for PASSED/TESTING hypotheses with lag_structure
2. Extract leader/follower/lag from each
3. Alternatively, run `hypothesis_tester.compute_lagged_correlation()` on top feature pairs
4. Filter by min_correlation, sort by |correlation| desc, take top max_pairs

**Test:** Each stream has both leader and follower. lag_days > 0. correlation is bounded -1 to 1.

---

### Agent 2: Core LivingGraph Renderers (Frontend React/D3)

**Goal:** Implement the 4 highest-value missing renderers in LivingGraph.jsx.

**Architecture rule:** Every renderer receives `{ spec, data, width, height }` and renders into the existing LivingGraph container. Use the COLORS constant already defined in LivingGraph.jsx. Support spec.animation config. Support time scrubbing via the existing TimeScrubber component.

#### Task 2A: ParticleSystem Renderer
**Chart type:** `PARTICLE_SYSTEM`
**Data format:** `{ trajectory: [{ date, kinetic_energy, potential_energy, total_energy, momentum, regime }] }`
**What it shows:** Market energy as a physics simulation. Each date is a particle position. KE maps to velocity (horizontal motion speed), PE maps to displacement from equilibrium (vertical position). The particle traces a path through energy space.
**Rendering:**
- Canvas-based (like Orbital) for smooth animation
- X-axis: kinetic_energy (momentum). Y-axis: potential_energy (mean reversion tension)
- Current position: large bright circle with glow
- Trail: last `trail_length` positions with fading opacity
- Equilibrium line: horizontal dashed line at PE=0
- Energy conservation boundary: elliptical envelope when total energy is roughly constant
- Color: regime-based (GROWTH=green, NEUTRAL=blue, FRAGILE=amber, CRISIS=red)
- Time scrubber controls which point is "current"
**Interactions:** Play/pause animation, hover shows date + energy values
**Size:** ~150 lines

#### Task 2B: RiverFlow Renderer
**Chart type:** `RIVER_FLOW`
**Data format:** `{ streams: [{ leader, follower, lag_days, correlation, leader_family, follower_family, direction }] }`
**What it shows:** Lead-lag causation as rivers flowing from upstream (leaders) to downstream (followers). Width = correlation strength. Flow speed suggests lag time.
**Rendering:**
- SVG-based
- Left column: leader features (upstream). Right column: follower features (downstream).
- Curved paths connect leaders to followers (cubic bezier)
- Path width = |correlation| × max_width
- Path color: positive correlation = blue gradient, negative = red gradient
- Animated flow: dashed stroke-dashoffset animation simulating flow direction
- Dash speed inversely proportional to lag_days (shorter lag = faster flow)
- Labels on both sides with family color coding
**Interactions:** Hover a stream highlights leader and follower. Click shows full correlation details.
**Size:** ~180 lines

#### Task 2C: Ridgeline Renderer
**Chart type:** `RIDGELINE`
**Data format:** `{ ridges: [{ date, distribution: [{ value, density }] }], feature_name, overall_stats: { mean, std, min, max } }`
**What it shows:** How a feature's distribution shape changes over time. Each ridge is one time period's distribution, stacked vertically with overlap. Reveals regime shifts as distribution shape changes.
**Rendering:**
- SVG-based
- Each ridge: area chart (d3.area) with slight vertical offset
- Latest at bottom (most prominent), oldest at top (most faded)
- Color: regime-based fill OR gradient from cold (low values) to hot (high values)
- Current value marked with a vertical line across all ridges
- Y-axis labels: dates for each ridge
**Interactions:** Hover ridge shows date + distribution stats. Click isolates single ridge.
**Size:** ~160 lines
**Data API needed:** `GET /api/v1/signals/distribution?feature=vix&periods=12&interval=monthly` — Agent 1 adds this (or Agent 2 can shape from existing timeseries endpoint)

#### Task 2D: Chord Renderer
**Chart type:** `CHORD`
**Data format:** `{ groups: [{ id, name, family, color }], matrix: [[0.1, 0.5, ...], [...]], regime: "GROWTH" }`
**What it shows:** Pairwise correlation flows between feature families. The chord diagram reorganizes across regimes — in GROWTH, equities and credit are tightly linked; in CRISIS, everything correlates to VIX.
**Rendering:**
- SVG-based, D3 chord layout
- Outer ring: feature families as arcs (colored by family)
- Inner chords: thickness = |correlation|, color = blend of source and target
- Only show chords above min_correlation (e.g. 0.3)
- Regime label in center
**Interactions:** Hover arc highlights all connected chords. Click arc isolates one family.
**Size:** ~200 lines
**Data API needed:** Uses existing `/api/v1/discovery/smart-heatmap` with family grouping

---

### Agent 3: Composite Views + Dashboard Grid (Frontend React)

**Goal:** Build the high-level composite views that combine multiple renderers into coherent analytical dashboards.

#### Task 3A: VizDashboard View
**File:** NEW `pwa/src/views/VizDashboard.jsx`
**Purpose:** The "living intelligence" view. A 2×2 or 3×2 grid of LivingGraph instances, each showing a different aspect of the market in real-time.
**Layout:**
```
┌─────────────────┬─────────────────┐
│  Phase Space    │  Orbital        │
│  (regime)       │  (sector rot.)  │
├─────────────────┼─────────────────┤
│  Force Network  │  Particle Sys.  │
│  (correlations) │  (energy)       │
├─────────────────┴─────────────────┤
│  River Flow (lead/lag causation)  │
└───────────────────────────────────┘
```
**Implementation:**
1. On mount, fetch all 5 pre-built VizSpecs from `/api/v1/viz/spec/*`
2. For each spec, fetch data from `spec.data_endpoint`
3. Render each in a LivingGraph with responsive sizing
4. Add a master time control that syncs all time scrubbers
5. Add a regime banner at top showing current state
**Responsive:** On mobile, stack vertically (1 column). On tablet, 2 columns. On desktop, layout as shown.
**Route:** Add to routes as `viz-dashboard` in the INTELLIGENCE nav section.

#### Task 3B: SmallMultiples Renderer
**Chart type:** `SMALL_MULTIPLES`
**Data format:** `{ panels: [{ period: "5D", data: [{ date, value }], change_pct, interpretation }] }`
**What it shows:** Same feature across 5 timeframes (5D, 5W, 3M, 1Y, 5Y) side by side.
**Rendering:**
- 5 equal-width panels in a row
- Each panel: mini area chart (SVG) with period label + change % + interpretation
- Shared y-axis scale across all panels (or auto-scale per panel with toggle)
- Current value line across all panels
**This already exists as TimeframeComparison component.** Refactor it into LivingGraph-compatible form:
1. Accept VizSpec props
2. Support animation config
3. Support weight indicators
4. Keep existing sparkline rendering (it works well)

#### Task 3C: DASHBOARD_GRID Renderer
**Chart type:** `DASHBOARD_GRID`
**Data format:** `{ children: [VizSpec, VizSpec, ...], grid_cols: 2, grid_gap: "16px" }`
**What it shows:** A composite dashboard where each cell is itself a LivingGraph.
**Implementation:**
- CSS Grid layout driven by spec.grid_cols and spec.grid_gap
- Each child VizSpec is rendered as a nested LivingGraph
- Supports responsive column count
- Master time sync: if any child has time_scrubber, sync them all
- Weight indicators aggregate across all children

#### Task 3D: Wire VizDashboard into Navigation
1. Add route to `app.jsx` (or routes.js if Agent creates it)
2. Add to NavBar under INTELLIGENCE section: `{ id: 'viz-dashboard', icon: Activity, label: 'Living Intel', desc: 'Real-time multi-chart intelligence' }`
3. Add as primary tab option (consider replacing one of the existing 7 tabs or adding to "More")

---

### Agent 4: Options Vol Surface Visualization (Frontend + Backend)

**Goal:** The derivatives system has a full SVI vol surface engine. Build the visual layer.

#### Task 4A: Vol Surface 3D Heatmap
**File:** NEW `pwa/src/components/VolSurface3D.jsx`
**Data source:** `GET /api/v1/derivatives/svi-surface/{ticker}` (already exists)
**What it shows:** Implied volatility as a color-mapped surface across strike × DTE.
**Rendering options (pick one):**
- **Option A: Three.js** — True 3D surface with rotation, zoom. Most impressive. ~300 lines. Adds ~200KB to bundle.
- **Option B: D3 contour** — 2D heatmap with contour lines. Lighter weight. ~150 lines.
- **Option C: Canvas gradient** — Grid of colored cells. Simplest. ~100 lines.

**Recommended: Option B** (D3 contour). Matches existing codebase style. No new dependencies.

**Implementation:**
1. Fetch surface data: array of `{ strike, expiry, dte, iv, oi, volume, type }`
2. Build 2D grid: X = moneyness (strike/spot), Y = DTE
3. Interpolate IV onto grid using d3.contourDensity or manual bilinear interpolation
4. Color scale: d3.scaleSequential(d3.interpolateInferno) mapped to IV range
5. Overlay: current spot price as vertical line, ATM IV as horizontal highlight
6. Contour lines at key IV levels (10%, 20%, 30%, etc.)
7. Skew visualization: side panel showing call IV - put IV at each DTE

**Interactions:** Hover shows exact strike/DTE/IV/OI. Click DTE slice to show skew curve.

#### Task 4B: Skew Evolution Chart
**File:** Same component or new `VolSkewChart.jsx`
**Data source:** `GET /api/v1/derivatives/skew/{ticker}` (already exists)
**What it shows:** How the vol skew changes across expiries. Each expiry is a curve of IV vs strike.
**Rendering:** Multi-line chart. X = strike (or moneyness). Y = IV. One line per expiry, color-coded by DTE (near=bright, far=dim).

#### Task 4C: Term Structure Chart
**Data source:** `GET /api/v1/derivatives/term-structure/{ticker}` (already exists)
**What it shows:** ATM IV across expiration dates. Reveals contango/backwardation in vol.
**Rendering:** Line chart with area fill. X = DTE. Y = ATM IV. Highlight current spot vol.

#### Task 4D: Derivatives View Integration
**File:** Modify `pwa/src/views/Options.jsx` OR create new `pwa/src/views/Derivatives.jsx`
**Layout:**
```
┌─────────────────────────────────────┐
│  Ticker selector + current Greeks   │
├──────────────────┬──────────────────┤
│  Vol Surface     │  Skew Curves     │
│  (2D heatmap)    │  (multi-line)    │
├──────────────────┼──────────────────┤
│  Term Structure  │  GEX Profile     │
│  (line + area)   │  (bar chart)     │
└──────────────────┴──────────────────┘
```
**GEX data:** Already at `/api/v1/derivatives/gex/{ticker}`. Bar chart of gamma exposure by strike.

---

### Agent 5: Data Freshness + Narrative Layer (Full Stack)

**Goal:** Make every visualization self-documenting. The operator should never have to wonder "is this data stale?" or "what am I looking at?"

#### Task 5A: Stale Data Indicators
Every LivingGraph instance should show data age. The WeightIndicator component exists but needs to actually query freshness.
**Implementation:**
1. In LivingGraph.jsx `useEffect`, after fetching data, check the most recent date in the data
2. Compute staleness: `(now - lastDataDate) / expected_cadence`
3. If staleness > 2x expected cadence: show amber warning badge
4. If staleness > 5x: show red "STALE" badge that pulses
5. Use the existing WeightSchedule `freshness_half_life_hours` to compute expected cadence

#### Task 5B: Narrative Overlays
The VizSpec has a `narrative_overlay` field. Implement it.
**Implementation:**
1. After data loads, if `spec.narrative_overlay` is true, make a secondary request to the LLM briefing engine
2. Endpoint: `POST /api/v1/ollama/viz-narrative` (new)
3. Request body: `{ chart_type, data_summary: { ... }, regime, question: spec.title }`
4. Response: `{ narrative: "The regime trajectory shows a clear drift toward FRAGILE..." }`
5. Render as a semi-transparent overlay at the bottom of the chart (existing CSS in LivingGraph)
6. Cache narrative for 1 hour (same as data)
7. This is optional / progressive enhancement — chart works without it

**Backend endpoint:**
```python
@router.post("/api/v1/ollama/viz-narrative")
async def generate_viz_narrative(body: dict):
    # Use market_briefing engine's LLM client
    # Prompt: "In 2 sentences, describe what this {chart_type} reveals about {question}. Data: {data_summary}"
    # Return: { narrative: str }
```

#### Task 5C: Regime Bands on Time-Series Charts
Any time-series visualization should optionally show regime bands as colored background strips.
**Implementation:**
1. Add to LivingGraph rendering pipeline: if `spec.regime_bands` is true AND data has a time axis
2. Fetch regime history: `GET /api/v1/regime/history?days=365`
3. For each regime period, draw a colored background rect:
   - GROWTH: rgba(0,255,0,0.05)
   - NEUTRAL: rgba(0,100,255,0.05)
   - FRAGILE: rgba(255,165,0,0.05)
   - CRISIS: rgba(255,0,0,0.08)
4. Render behind the main chart content (lowest z-order)

#### Task 5D: Export / Screenshot
Add ability to export any LivingGraph as PNG or SVG.
**Implementation:**
1. Add a small camera icon button in the LivingGraph header
2. For SVG renderers: serialize the SVG node to string, create download blob
3. For Canvas renderers: `canvas.toDataURL('image/png')`, create download link
4. Filename: `grid_{chart_type}_{date}.png`

---

## Dependency Graph

```
Agent 1 (APIs) ──────────────────────┐
  1A: regime/trajectory              │
  1B: discovery/feature-network      ├──→ Agent 2 (Renderers) needs API data
  1C: flows/orbital-data             │      2A: ParticleSystem
  1D: physics/energy-trajectory      │      2B: RiverFlow
  1E: associations/lead-lag-river    │      2C: Ridgeline
                                     │      2D: Chord
Agent 2 (Renderers) ─────────────────┤
                                     ├──→ Agent 3 (Composites) needs renderers
Agent 4 (Vol Surface) ───────────────┤      3A: VizDashboard
  Independent — own API + renderer   │      3B: SmallMultiples
                                     │      3C: DASHBOARD_GRID
Agent 5 (Freshness + Narrative) ─────┘      3D: Navigation wiring
  Can start immediately (framework)
  Full integration after Agents 1-3
```

**Parallelism:**
- Agents 1, 4, and 5 can start immediately in parallel
- Agent 2 can start immediately on renderers using mock data, wire to real APIs when Agent 1 delivers
- Agent 3 starts after Agent 2 has at least PhaseSpace + ForceNetwork + Orbital working (already done) + 1 new renderer

---

## Testing Requirements

Each agent must verify:
1. **API endpoints return valid data** — correct JSON shape, no nulls in required fields, reasonable value ranges
2. **Renderers don't crash on empty data** — graceful "No data" message if API returns empty
3. **Renderers don't crash on partial data** — missing optional fields handled
4. **Time scrubber works** — play/pause, slider, date display
5. **Mobile responsive** — charts resize on viewport change
6. **PWA builds clean** — `cd pwa && npx vite build` succeeds with no errors
7. **Backend tests pass** — `python -m pytest tests/ -x -q` still 489+ passing

---

## Success Criteria

When all 5 agents complete:
1. Operator opens VizDashboard and sees 5 live charts rendering real data
2. Phase space shows regime trajectory with correct regime coloring
3. Orbital shows sector rotation with time scrubbing
4. Force network shows feature correlations with draggable nodes
5. Particle system shows energy dynamics
6. River flow shows lead-lag causation
7. Options view shows vol surface, skew curves, term structure, GEX
8. Every chart has a staleness indicator
9. Narrative overlays describe what each chart reveals (when LLM is available)
10. Regime bands appear on all time-series charts
11. Any chart can be exported as PNG

---

## Key File Paths

| What | Path |
|------|------|
| VizSpec engine | `grid/analysis/viz_intelligence.py` |
| Viz API router | `grid/api/routers/viz.py` |
| LivingGraph component | `grid/pwa/src/components/LivingGraph.jsx` |
| CapitalFlowSankey | `grid/pwa/src/components/CapitalFlowSankey.jsx` |
| Regime router | `grid/api/routers/regime.py` |
| Physics router | `grid/api/routers/physics.py` |
| Flows router | `grid/api/routers/flows.py` |
| Discovery router | `grid/api/routers/discovery.py` |
| Associations router | `grid/api/routers/associations.py` |
| Derivatives router | `grid/api/routers/derivatives.py` |
| Vol surface engine | `grid/analysis/vol_surface.py` |
| Momentum engine | `grid/physics/momentum.py` |
| Dealer gamma engine | `grid/physics/dealer_gamma.py` |
| Auto regime (feature weights) | `grid/scripts/auto_regime.py` |
| Hypothesis tester (lag analysis) | `grid/analysis/hypothesis_tester.py` |
| PIT store | `grid/store/pit.py` |
| PWA app entry | `grid/pwa/src/app.jsx` |
| NavBar | `grid/pwa/src/components/NavBar.jsx` |

## Design Constants (from existing codebase)

```javascript
// LivingGraph.jsx COLORS
const COLORS = {
  bg: '#0D1520',
  surface: '#111820',
  border: '#1e2a38',
  text: '#C8D8E8',
  textMuted: '#5A7A90',
  accent: '#1A6EBF',
  green: '#22C55E',
  red: '#EF4444',
  amber: '#F59E0B',
  purple: '#8B5CF6',
};

// Regime colors
GROWTH: '#22C55E'
NEUTRAL: '#1A6EBF'
FRAGILE: '#F59E0B'
CRISIS: '#EF4444'

// Family colors (from d3.schemeTableau10)
// Used in ForceNetwork node coloring

// Standard font
fontFamily: "'IBM Plex Sans', -apple-system, sans-serif"
monoFont: "'JetBrains Mono', monospace"
```

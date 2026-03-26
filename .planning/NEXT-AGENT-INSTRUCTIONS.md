# Next Agent Instructions (Updated 2026-03-26, after Session 3)

Three massive sessions today: Oracle + data, subsystem activation + audit hardening, derivatives + viz + email + epistemic fixes. Read the memory files at `/home/grid/.claude/projects/-home-grid/memory/` for full context.

---

## PHASE A: Close Remaining Audit Attack Surface (1 hour)

Most audit items are now fixed. These three remain (all Crucix-side):

### A3. Persistent Alert State for Crucix
**Problem:** `_muteUntil` and `_alertHistory` are in-memory fields on the alerter objects. Lost on restart.
**Files:** `Crucix/server.mjs`, `Crucix/lib/alerts/telegram.mjs`, `Crucix/lib/alerts/discord.mjs`
**Fix:** Create `Crucix/lib/alerts/state.mjs` with an `AlertStateStore` class. Reads/writes to `runs/memory/alert_state.json` (atomic writes like hot.json). Methods: `getRecentAlerts(limit)`, `addAlert(alert)`, `mute(channel, durationMs)`, `unmute(channel)`, `isMuted(channel)`. Both Telegram and Discord alerters use this shared store. Mute state survives restart.

### A4. Delta Computation Versioning
**Problem:** If thresholds change over time, prior deltas aren't comparable to current ones.
**Files:** `Crucix/lib/delta/memory.mjs`, `Crucix/lib/delta/engine.mjs`
**Fix:** When `addRun()` stores a run, include metadata: `{ delta_engine_version: 'v2', threshold_profile: JSON.stringify(this.deltaThresholds), config_hash: sha256(thresholds) }`. This makes every stored delta self-documenting.

### A5. Tests for New Code
**Problem:** No tests for bot commands, threshold override behavior, or route registry.
**Files:** New test files
**Fix:**
- `grid/pwa/src/__tests__/routes.test.js` — every nav item maps to route, unique IDs, required metadata
- `Crucix/tests/bot-commands.test.mjs` — /alerts with empty/populated history, /mute with valid/invalid input, /unmute clears state, muted channel suppresses sends
- `Crucix/tests/delta-thresholds.test.mjs` — defaults used when config absent, overrides passed correctly, invalid config normalized

### Previously Open — Now DONE:
- ~~A1. Route registry~~ — DONE: single routes.js, all views derive from it
- ~~A2. Lazy loading~~ — DONE: React.lazy() for non-core views, bundle 710KB → 367KB

---

## PHASE B: Data Quality (from NEXT-SESSION.md, partially done)

### DONE:
- ~~B1. WorldNews resolver mapping~~ — DONE: 33 wn_* mappings added to entity_map.py
- ~~B3. Analyst ratings int64~~ — DONE: numpy int conversion applied
- ~~B7. Resolver run~~ — DONE: coverage 87% → 93%

### Still Open:

### B2. Fix FRED fedfred date parsing
`scripts/fill_missing_features.py` line ~155 — DataFrame column name mismatch. Fix df.reset_index() iteration.

### B4. Run international pullers (20 features)
**BLOCKER:** source_catalog schema mismatch. Fix schema first, then run:
BCB, AKShare, KOSIS, OECD, ECB, MAS — all have dedicated pullers in `ingestion/international/`, never successfully run.

### B5. EIA electricity v2 format (7 features)
Series IDs use different v2 endpoint path. Fix facets format.

### B6. Computed features (12 features)
copper_gold_ratio, sp500_mom_3m, vix_3m_ratio, etc. All derivable from existing data. Run `fill_missing_features.py --batch computed`.

### B8. Systemic risk features (0% coverage)
OFR Financial Stress API returned 400. Try FRED STLFSI2 as proxy.

### B9. Trade features (33% coverage)
Comtrade API or FRED proxies: BOPGSTB, EXPGS.

---

## PHASE B½: Logic Gaps — RESOLVED

All B½ items from the external audit have been fixed in Session 3:

| Item | Problem | Resolution |
|------|---------|------------|
| B½-1 | Raw values used as z-scores in market_briefing | FIXED: Real 252-day rolling z-scores computed |
| B½-2 | Backtest scanner injects PASSED (status inflation) | FIXED: Changed to CANDIDATE, tester validates |
| B½-3 | Oracle silently skips unscoreable predictions | FIXED: no_data verdict after expiry+3 days |
| B½-4 | Paper trading threshold not versioned | FIXED: signal_threshold stored per trade |
| B½-5 | Two disconnected hypothesis registries | FIXED: DuckDB documented as read-only mirror |
| B½-6 | No subsystem health dashboard | FIXED: Operator.jsx + subsystem status API |
| B½-7 | Feature coverage not autonomous | FIXED: FIX_DATA_QUALITY Hermes action (6h) |

---

## PHASE C: Remaining Feature Work

### C1. Flows page rework
- Add "Market Flow Summary" narrative at top
- Group sectors by flow direction: INFLOWS → NEUTRAL → OUTFLOWS
- Each card leads with insight, not data

### C2. Watchlist first-principles redesign
- Mini briefing card per ticker: price + sector + influence + options + regime context
- "Why I'm watching this" editable notes
- Auto-suggest tickers based on sector map gaps

### C3. Oracle confidence calibration (after Apr 17 scoring)
- Fix confidence normalization (everything at 95%) — sigmoid(signal_strength - 2.0)
- Add regime-aware model switching
- Compute per-regime hit rates per model

### C4. Crucix git push auth
`calesthio/Crucix` needs credentials configured. Commit f635f92 is local. Either set up SSH key or HTTPS token.

### C5. Check Codex AstroGrid progress
Branch: `codex/astrogrid-prototype`. Merge when ready.

### C6. Remaining alt data sources
- VIIRS nightlights (NASA FIRMS)
- Patents (USPTO PatentsView, free)
- GDELT avg tone
- Pump.fun / DexScreener

---

## What Already Works (don't rebuild these)

| Subsystem | Status | Notes |
|-----------|--------|-------|
| bridges/ledger_sync.py | LIVE | Dead-letter table, structured logging, no silent failures |
| Hypothesis tester | LIVE in Hermes (12h) | Syncs to DuckDB, no status inflation |
| Backtest scanner | LIVE in Hermes (weekly) | Generates TACTICAL→CANDIDATE hypotheses |
| Paper trading signal_executor | LIVE (hourly) | Fires when PASSED hypotheses exist, threshold versioned |
| Crucix rule-based ideas | LIVE (LLM fallback) | All ideas carry epistemic metadata |
| Crucix /alerts /mute /unmute | LIVE (Telegram + Discord) | Input validated, mute enforced in send path |
| Delta threshold overrides | LIVE | Config flows through MemoryManager |
| DerivativesGrid SPA | LIVE at /derivatives/ | 7 D3 views |
| VizDashboard | LIVE | 5-chart composite with time control |
| Hermes email | LIVE | IMAP poll, triage, extraction, event triggers |
| HermesInbox PWA | LIVE | 5 API endpoints via inbox.py |
| Operator dashboard | LIVE | Subsystem health + status API |
| Route registry | LIVE | Single routes.js, lazy loading, 367KB bundle |
| FIX_DATA_QUALITY | LIVE in Hermes (6h) | Auto-detect coverage gaps, run resolver |
| Market briefing z-scores | FIXED | Real 252-day rolling z-scores |
| Oracle no_data verdict | FIXED | Unscoreable predictions marked explicitly |
| Vol surface SVI endpoint | LIVE | /api/v1/derivatives/svi-surface/{ticker} |
| TradingView webhook | LIVE | Payload hash, dedup, schema version, provenance |
| trading/signal_executor.py | LIVE | Already built and scheduled |
| trading/hyperliquid.py | EXISTS | Already built, needs testnet key |
| trading/prediction_markets.py | EXISTS | Polymarket + Kalshi, needs API keys |
| trading/wallet_manager.py | EXISTS | Multi-wallet management |

## Hermes Schedule (current)

| Task | Interval | Module |
|------|----------|--------|
| Market briefing | Hourly | ollama/market_briefing.py |
| Paper trading signals | Hourly | trading/signal_executor.py |
| Capital flow research | 4 hours | analysis/capital_flows.py |
| 100x digest | 4 hours | alerts/hundredx_digest.py |
| Oracle cycle | 6 hours | oracle/engine.py + report.py |
| Data quality check | 6 hours | FIX_DATA_QUALITY action |
| Email check (IMAP) | Continuous | alerts/email_ingest.py |
| Hypothesis testing | 12 hours | analysis/hypothesis_tester.py |
| Backtest scanner | Weekly | analysis/backtest_scanner.py |
| Options pull | Daily | ingestion/options.py |
| Daily digest | Daily 07:00 UTC | alerts/email.py |
| UX audit | 6 hours | scripts/ux_auditor.py |
| Taxonomy audit | Nightly 02:30 | scripts/taxonomy_audit.py |

## Key File Locations

| What | Where |
|------|-------|
| Derivatives SPA | grid/derivatives/ (7 D3 views) |
| VizDashboard | grid/pwa/src/views/VizDashboard.jsx |
| LivingGraph renderers | grid/pwa/src/components/LivingGraph.jsx (ParticleSystem, RiverFlow, Ridgeline, Chord) |
| Viz data APIs | grid/api/routers/viz.py (trajectory, network, orbital, energy, lead-lag) |
| Hermes email ingest | grid/alerts/email_ingest.py |
| Hermes email supervisor | grid/alerts/email_supervisor.py |
| Hermes email processor | grid/alerts/email_processor.py |
| Hermes inbox API | grid/api/routers/inbox.py |
| HermesInbox PWA | grid/pwa/src/views/HermesInbox.jsx |
| Route registry | grid/pwa/src/config/routes.js |
| Operator dashboard | grid/pwa/src/views/Operator.jsx |
| Ledger sync bridge | grid/bridges/ledger_sync.py |
| Hypothesis tester | grid/analysis/hypothesis_tester.py |
| Backtest scanner | grid/analysis/backtest_scanner.py |
| Vol surface engine | grid/analysis/vol_surface.py |
| SVI surface endpoint | grid/api/routers/derivatives.py |
| Entity map | grid/normalization/entity_map.py |
| International pullers | grid/ingestion/international/ |
| Fill missing features | grid/scripts/fill_missing_features.py |
| Epistemic integrity rules | ~/.claude/projects/-home-grid/memory/feedback_epistemic_integrity.md |
| External audit tracker | ~/.claude/projects/-home-grid/memory/project_external_audit.md |
| Critique documents | ~/grid_issues.txt.rtf, ~/best practice fixes.txt.rtf |
| DuckDB path | /home/grid/grid_v4/data/grid.duckdb |
| Crucix config | /data/grid_v4/Crucix/crucix.config.mjs |

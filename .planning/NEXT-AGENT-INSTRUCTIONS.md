# Next Agent Instructions (Updated 2026-03-26)

This session activated many dormant subsystems and hardened epistemic integrity based on an external audit. Read the memory files at `/home/grid/.claude/projects/-home-grid/memory/` for full context.

---

## PHASE A: Close Remaining Audit Attack Surface (1-2 hours)

These items come from two critique documents at `~/grid_issues.txt.rtf` and `~/best practice fixes.txt.rtf`. The most severe issues were already fixed. These remain:

### A1. Single Route Registry for PWA
**Problem:** Routes are defined in 3 places (imports in app.jsx, switch cases in app.jsx, nav items in NavBar.jsx). This is how views become orphaned.
**Files:** `grid/pwa/src/app.jsx`, `grid/pwa/src/components/NavBar.jsx`
**Fix:** Create `grid/pwa/src/config/routes.js` that exports a ROUTES object. Each entry has: id, component, label, icon, section, desc. Then app.jsx does `const route = ROUTES[activeView]; const View = route.component; return <View />` and NavBar derives its sections from the same object.
**Test:** Every nav item maps to a real route. Every route has component, label, section. All IDs unique.

### A2. Lazy Loading Non-Core Views
**Problem:** All 30+ views are eagerly imported. Bundle is 567KB.
**Files:** `grid/pwa/src/app.jsx` (after A1 is done, this goes into routes.js)
**Fix:** Use `React.lazy()` for non-core views (Knowledge, WatchlistAnalysis, Operator, Snapshots, Hyperspace, AssociationsLegacy). Wrap `renderView()` in `<Suspense fallback={<div>Loading...</div>}>`.

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

---

## PHASE B: Data Quality (from NEXT-SESSION.md, still valid)

### B1. Fix WorldNews resolver mapping (33 features)
`SELECT DISTINCT series_id FROM raw_series WHERE series_id LIKE 'wn_%' LIMIT 20` — see format, add to entity_map.py NEW_MAPPINGS_V2, run resolver.

### B2. Fix FRED fedfred date parsing
`scripts/fill_missing_features.py` line ~155 — DataFrame column name mismatch. Fix df.reset_index() iteration.

### B3. Fix analyst ratings int64 serialization
Wrap values in `int(float(val))`, use `default=str` in json.dumps.

### B4. Run international pullers (20 features)
BCB, AKShare, KOSIS, OECD, ECB — all have dedicated pullers, never run. Commands in NEXT-SESSION.md section 2b.

### B5. EIA electricity v2 format (7 features)
Series IDs use different v2 endpoint path. Fix facets format per NEXT-SESSION.md section 2c.

### B6. Computed features (12 features)
copper_gold_ratio, sp500_mom_3m, vix_3m_ratio, etc. All derivable from existing data. Run `fill_missing_features.py --batch computed`.

### B7. Run resolver after all fixes
```bash
cd /data/grid_v4/grid_repo/grid
PYTHONPATH=. /data/grid_v4/venv/bin/python -c "
from normalization.resolver import Resolver
from db import get_engine
r = Resolver(db_engine=get_engine())
result = r.resolve_pending()
print(result)
"
```

---

## PHASE C: Remaining Feature Work

### C1. hermes@stepdad.finance email + sender allowlist
See NEXT-SESSION.md Priority 4.

### C2. Wire living graph renderers to real data
PhaseSpace → regime PCA trajectory, Orbital → sector relative performance, ForceNetwork → feature correlation. See NEXT-SESSION.md Priority 6.

### C3. Oracle confidence calibration
First scoring Apr 17. After that: fix confidence normalization (everything at 95%), add regime-aware model switching. See NEXT-SESSION.md Priority 5.

### C4. Flows page rework, watchlist redesign, hypothesis UI
See NEXT-SESSION.md Priority 7.

### C5. Crucix git push auth
`calesthio/Crucix` needs credentials configured. Commit f635f92 is local. Either set up SSH key or HTTPS token.

---

## What Already Works (don't rebuild these)

| Subsystem | Status | Notes |
|-----------|--------|-------|
| bridges/ledger_sync.py | LIVE | Dead-letter table, structured logging, no silent failures |
| Hypothesis tester | LIVE in Hermes (12h) | Syncs to DuckDB, no status inflation |
| Backtest scanner | LIVE in Hermes (weekly) | Generates TACTICAL hypotheses |
| Paper trading signal_executor | LIVE (hourly in api/main.py) | Fires when PASSED hypotheses exist |
| Crucix rule-based ideas | LIVE (LLM fallback) | All ideas carry epistemic metadata |
| Crucix /alerts /mute /unmute | LIVE (Telegram + Discord) | Input validated, mute enforced in send path |
| Delta threshold overrides | LIVE | Config flows through MemoryManager |
| PWA Knowledge/Watchlist/Operator/Snapshots | ROUTED | In app.jsx and NavBar |
| /api/v1/derivatives/svi-surface/{ticker} | LIVE | SVI fitting, arbitrage, Greeks, percentile |
| TradingView webhook | LIVE | Payload hash, dedup, schema version, provenance |
| trading/signal_executor.py | EXISTS | Already built and scheduled |
| trading/hyperliquid.py | EXISTS | Already built, needs testnet key |
| trading/prediction_markets.py | EXISTS | Polymarket + Kalshi, needs API keys |
| trading/wallet_manager.py | EXISTS | Multi-wallet management |

## Hermes Schedule (current)

| Task | Interval | Module |
|------|----------|--------|
| Market briefing | Hourly | ollama/market_briefing.py |
| Paper trading signals | Hourly | trading/signal_executor.py (via api/main.py) |
| Capital flow research | 4 hours | analysis/capital_flows.py |
| 100x digest | 4 hours | alerts/hundredx_digest.py |
| Oracle cycle | 6 hours | oracle/engine.py + report.py |
| **Hypothesis testing** | **12 hours** | **analysis/hypothesis_tester.py** (NEW) |
| **Backtest scanner** | **Weekly** | **analysis/backtest_scanner.py** (NEW) |
| Options pull | Daily | ingestion/options.py |
| Daily digest | Daily 07:00 UTC | alerts/email.py |
| UX audit | 6 hours | scripts/ux_auditor.py |

## Key File Locations

| What | Where |
|------|-------|
| Ledger sync bridge | grid/bridges/ledger_sync.py |
| Dead-letter query | `from bridges.ledger_sync import get_sync_failures` |
| Hypothesis tester | grid/analysis/hypothesis_tester.py |
| Backtest scanner | grid/analysis/backtest_scanner.py |
| Vol surface engine | grid/analysis/vol_surface.py |
| SVI surface endpoint | grid/api/routers/derivatives.py (bottom) |
| TradingView webhook | grid/api/routers/tradingview.py |
| Epistemic integrity rules | ~/.claude/projects/-home-grid/memory/feedback_epistemic_integrity.md |
| External audit tracker | ~/.claude/projects/-home-grid/memory/project_external_audit.md |
| Critique documents | ~/grid_issues.txt.rtf, ~/best practice fixes.txt.rtf |
| DuckDB path | /home/grid/grid_v4/data/grid.duckdb |
| Crucix config | /data/grid_v4/Crucix/crucix.config.mjs |

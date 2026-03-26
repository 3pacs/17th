# Next Session Plan — Updated 2026-03-26 (after Session 3)

Everything the next agent needs to pick up and execute. No ambiguity, no guessing.

---

## PRIORITY 1: Fix International Puller Schema + Fill Data Gaps (1-2 hours)

### 1a. Fix source_catalog schema mismatch
**Problem:** International pullers (BCB, AKShare, KOSIS, OECD, ECB, MAS) fail because they expect a `source_catalog` table with a schema that doesn't match what exists. This was being fixed at end of Session 3.
**Steps:**
1. Check what schema the pullers expect vs what's in DB
2. Either ALTER TABLE to add missing columns or update pullers to match existing schema
3. Run each puller after fix

### 1b. Run international pullers (macro coverage 60% → target 85%)
Commands (run after 1a fix):
- Brazil (3): `from ingestion.international.bcb import BCBPuller`
- China (4): `from ingestion.international.akshare_macro import AKSharePuller`
- Korea (2): `from ingestion.international.kosis import KOSISPuller`
- OECD (3): `from ingestion.international.oecd import OECDPuller`
- ECB (1): `from ingestion.international.ecb import ECBPuller`
- MAS (1): `from ingestion.international.mas import MASPuller`

### 1c. Systemic risk (0% coverage)
- OFR Financial Stress API returned 400 — URL format changed
- Try FRED alternative: STLFSI2 (St. Louis Fed Financial Stress Index)
- If neither works, scrape from OFR website

### 1d. Trade features (33% coverage)
- Comtrade API or FRED proxies: BOPGSTB (trade balance), EXPGS (exports)

### 1e. Computed features (derive from existing data)
- copper_gold_ratio, sp500_mom_3m, vix_3m_ratio, hy_spread_proxy, dxy_index, spy_macd, etc.
- Run `fill_missing_features.py --batch computed`

### 1f. FRED date parsing
- fedfred library returns dates in value column for some series
- Fix df.reset_index() iteration in fill_missing_features.py

### 1g. Run resolver after all fixes
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

## PRIORITY 2: Remaining Audit Items (1-2 hours)

### 2a. A3: Persistent Alert State for Crucix
**Problem:** `_muteUntil` and `_alertHistory` are in-memory. Lost on restart.
**Files:** `Crucix/server.mjs`, `Crucix/lib/alerts/telegram.mjs`, `Crucix/lib/alerts/discord.mjs`
**Fix:** Create `Crucix/lib/alerts/state.mjs` with `AlertStateStore` class. Read/write to `runs/memory/alert_state.json`. Both alerters share store. Mute state survives restart.

### 2b. A4: Delta Computation Versioning
**Files:** `Crucix/lib/delta/memory.mjs`, `Crucix/lib/delta/engine.mjs`
**Fix:** When `addRun()` stores a run, include `{ delta_engine_version, threshold_profile, config_hash }`.

### 2c. A5: Tests for New Code
- `grid/pwa/src/__tests__/routes.test.js` — route registry validation
- `Crucix/tests/bot-commands.test.mjs` — /alerts, /mute, /unmute
- `Crucix/tests/delta-thresholds.test.mjs` — defaults, overrides, invalid config

---

## PRIORITY 3: Flows Page Rework + Watchlist Redesign (2 hours)

### 3a. Flows page
- Add "Market Flow Summary" narrative at top
- Group sectors by flow direction: INFLOWS → NEUTRAL → OUTFLOWS
- Each card leads with insight, not data

### 3b. Watchlist first-principles redesign
- Mini briefing card per ticker: price + sector + influence + options + regime context
- "Why I'm watching this" editable notes
- Auto-suggest tickers based on sector map gaps

---

## PRIORITY 4: Oracle Confidence Calibration Prep (30 min)

First scoring happens Apr 17 when 615 predictions expire.

### 4a. After scoring: fix confidence normalization
- Everything at 95% because signal_strength / 5.0 is too generous
- Change to sigmoid(signal_strength - 2.0) to center at 50%

### 4b. After scoring: regime-aware model switching
- Track which regime each prediction was made in
- Compute per-regime hit rates per model
- Weight models by regime-specific performance

---

## PRIORITY 5: Check Codex AstroGrid Progress (15 min)

- Branch: `codex/astrogrid-prototype`
- Check if Codex completed any work
- Merge when ready, resolve conflicts if any
- See ASTROGRID-PLAN.md for spec

---

## PRIORITY 6: Crucix Push Auth + Misc (30 min)

### 6a. Crucix git push
- `calesthio/Crucix` needs SSH key or HTTPS token configured
- Commit f635f92 is local, needs to push

### 6b. EIA electricity v2 format (7 features)
- Series IDs use different v2 endpoint path
- Fix facets format

### 6c. Remaining alt data
- VIIRS nightlights (NASA FIRMS API)
- Patents (USPTO PatentsView API, free)
- GDELT avg tone
- Pump.fun / DexScreener

---

## Quick Reference — File Locations

| What | Where |
|------|-------|
| Oracle engine | `grid/oracle/engine.py` |
| Derivatives SPA | `grid/derivatives/` (7 D3 views) |
| VizDashboard | `grid/pwa/src/views/VizDashboard.jsx` |
| Hermes email | `grid/alerts/email_ingest.py`, `email_supervisor.py`, `email_processor.py` |
| Hermes inbox API | `grid/api/routers/inbox.py` |
| Route registry | `grid/pwa/src/config/routes.js` |
| Operator dashboard | `grid/pwa/src/views/Operator.jsx` |
| Entity map | `grid/normalization/entity_map.py` |
| International pullers | `grid/ingestion/international/` |
| Fill missing features | `grid/scripts/fill_missing_features.py` |
| GSD state | `.planning/STATE.md` |
| GSD roadmap | `.planning/ROADMAP.md` |
| Agent instructions | `.planning/NEXT-AGENT-INSTRUCTIONS.md` |

## Hermes Schedule (what runs automatically)

| Task | Interval | Module |
|------|----------|--------|
| Market briefing | Hourly | ollama/market_briefing.py |
| Paper trading signals | Hourly | trading/signal_executor.py |
| Capital flow research | 4 hours | analysis/capital_flows.py |
| 100x digest | 4 hours | alerts/hundredx_digest.py |
| Oracle cycle | 6 hours | oracle/engine.py + oracle/report.py |
| Data quality check | 6 hours | FIX_DATA_QUALITY action |
| Email check (IMAP) | Continuous | alerts/email_ingest.py |
| Hypothesis testing | 12 hours | analysis/hypothesis_tester.py |
| Backtest scanner | Weekly | analysis/backtest_scanner.py |
| Options pull | Daily | ingestion/options.py |
| Daily digest | Daily 07:00 UTC | alerts/email.py |
| Taxonomy audit | Nightly 02:30 | scripts/taxonomy_audit.py |
| UX audit | 6 hours | scripts/ux_auditor.py |

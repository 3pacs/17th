# State

## Current Position

Phase: 14 — Oracle & Data Completion + Epistemic Hardening
Plan: ROADMAP.md (16 phases planned)
Status: Phases 1–12.5 COMPLETE. Phase 13 (AstroGrid) IN PROGRESS (separate agent). Phase 14 active — subsystem activation + audit response.
Last activity: 2026-03-26 — Two sessions: (1) Oracle engine, 100x digest, viz engine, bulk data. (2) Subsystem activation, epistemic hardening from external audit.

## Accumulated Context

### What shipped in Session 2 (2026-03-26, second session)

#### Subsystem Activation — Closing the Flywheel
- **bridges/ledger_sync.py** (NEW): Syncs regime state and hypothesis calibration from Postgres → DuckDB. Dead-letter table `sync_failures` for failed syncs. `get_sync_failures()` for operator visibility. Zero silent exception swallowing.
- **Hypothesis tester activated**: Wired into Hermes operator (12h cycle). `RUN_HYPOTHESIS_TESTS` action added. Results sync to DuckDB without status inflation — states pass through as-is.
- **Backtest scanner activated**: Wired into Hermes operator (weekly). Scans feature pairs for lead/lag, generates TACTICAL hypotheses that feed tester → paper trading.
- **Paper trading chain complete**: backtest_scanner (weekly) → hypothesis_tester (12h) → signal_executor (hourly, already existed in api/main.py).
- **Vol surface engine exposed**: New `/api/v1/derivatives/svi-surface/{ticker}` — SVI fitting, arbitrage detection, Greeks grid, historical percentile.
- **PWA views routed**: Knowledge, WatchlistAnalysis, Operator, Snapshots — added to app.jsx and NavBar.
- **PWA rebuilt**: 567KB bundle, clean build.

#### Crucix Hardening
- **Rule-based trade ideas re-enabled** as LLM fallback. Every idea carries epistemic metadata: source (rule_v1), eligibility (research_only), evidence_class (heuristic), calibration (uncalibrated).
- **Bot commands registered**: /alerts, /mute, /unmute for Telegram + Discord. Mute input validated (positive, max 168h). Mute enforced in sendAlert() send path.
- **Delta threshold overrides fixed**: Config thresholds from crucix.config.mjs now flow through MemoryManager to computeDelta().
- **Dashboard**: RULE-BASED badge, eligibility class per idea.

#### Epistemic Hardening (External Audit Response)
Received and addressed 17-point architectural critique (~/grid_issues.txt.rtf) + 18-point best practice pass (~/best practice fixes.txt.rtf).

Fixed:
1. Silent `except: pass` at provenance boundaries → dead-letter table + structured logging
2. Lossy TESTING→PARTIALLY_SUPPORTED status mapping → removed, states pass through as-is
3. TradingView webhook provenance gaps → payload hash, dedup key, schema version, timestamps, duplicate rejection
4. Rule-based ideas without epistemic metadata → source/eligibility/evidence_class/calibration on every idea
5. Mute not enforced in send path → guard in sendAlert()
6. Mute input not validated → rejects invalid values
7. Delta config silently ignored → thresholds flow from config
8. auto_regime bare except:pass → logged failure handling

Still open from audit (see NEXT-AGENT-INSTRUCTIONS.md Phase A):
- Route registry (single source of truth)
- Lazy loading for non-core views
- Alert state persistence across restart
- Delta computation versioning
- Tests for new bot commands + threshold override

### What shipped in Session 1 (2026-03-26, first session)

#### Oracle Prediction Engine
- 5 competing models, 615 predictions (expiry Apr 17), self-improving loop, signal + anti-signal
- oracle_predictions, oracle_models, oracle_iterations tables
- Rich email report, runs every 6h via Hermes

#### 100x Supervised Digest
- 3-layer filter: sanity check → LLM review → cross-verification
- Killed email spam, bundled 4h digest only

#### Options Data Quality Fix
- Skip expiries within 2 DTE, quality gate (total_oi >= 1000, iv_atm >= 3%)

#### Visualization Intelligence Engine
- 11 learned rules, VizSpec protocol, weight schedules, LivingGraph component

#### Bulk Historical Data (2M+ rows)
- CBOE, Binance, CoinGecko, DeFiLlama, Open-Meteo, EIA data

### Known Issues
- WorldNews API key expired (402) — wn_* features in raw_series but not resolving
- FRED fedfred library returns dates in value column — parse fix needed
- Analyst ratings yfinance int64 serialization — needs numpy int conversion
- OFR Financial Stress API endpoint returns 400 — URL format changed
- 124 features still at zero
- Oracle confidence normalization too generous (everything at 95%)
- Crucix push needs auth for calesthio/Crucix (commit f635f92 local)

### Data State
- Features at zero: 124 (down from 159)
- Total resolved_series: 328,294
- Raw series: 2,087,768+
- Oracle predictions: 615 (expiry Apr 17)
- Tests: 489 passing, 0 failures
- Coverage: equity 100%, earnings 100%, vol 99%, breadth 94%, crypto 89%

### Hermes Schedule (current)
| Task | Interval | Module |
|------|----------|--------|
| Market briefing | Hourly | ollama/market_briefing.py |
| Paper trading signals | Hourly | trading/signal_executor.py |
| Capital flow research | 4 hours | analysis/capital_flows.py |
| 100x digest | 4 hours | alerts/hundredx_digest.py |
| Oracle cycle | 6 hours | oracle/engine.py |
| Hypothesis testing | 12 hours | analysis/hypothesis_tester.py |
| Backtest scanner | Weekly | analysis/backtest_scanner.py |
| UX audit | 6 hours | scripts/ux_auditor.py |
| Daily digest | Daily | alerts/email.py |

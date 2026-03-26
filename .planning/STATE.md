# State

## Current Position

Phase: 15 — Derivatives + Visualization + Hermes Email
Plan: ROADMAP.md (16 phases planned)
Status: Phases 1–14 COMPLETE. Phase 13 (AstroGrid) IN PROGRESS (separate agent on Codex). Phase 15 active — derivatives SPA, living viz, Hermes email, epistemic fixes.
Last activity: 2026-03-26 — Three sessions: (1) Oracle engine, 100x digest, viz engine, bulk data. (2) Subsystem activation, epistemic hardening from external audit. (3) Derivatives SPA, VizDashboard, Hermes email, epistemic bug fixes, operator dashboard, bundle optimization.

## Accumulated Context

### What shipped in Session 3 (2026-03-26, third session)

#### Derivatives & Visualization
- **DerivativesGrid SPA** (NEW): 7 D3-powered views (DealerFlow, GammaProfile, VolSurface, TermStructure, PositionHeatmap, Scanner, FlowNarrative), served at /derivatives/
- **VizDashboard** (NEW): 5-chart Living Intelligence composite (PhaseSpace, Orbital, ForceNetwork, ParticleSystem, RiverFlow) with master time control
- **4 new LivingGraph renderers**: ParticleSystem, RiverFlow, Ridgeline, Chord
- **5 viz data API endpoints**: regime trajectory, feature network, orbital, energy, lead-lag
- **PWA vol surface components**: VolSurface3D, VolSkewChart, TermStructureChart, Derivatives view
- **Data freshness UX**: StaleBadge, RegimeBands, ExportButton components

#### Hermes Email System
- **hermes@stepdad.finance** live via Cloudflare email routing → Gmail → IMAP poll
- **email_ingest.py**: IMAP poller with 3-address sender allowlist, dedup
- **email_supervisor.py**: Fast triage (spam/note/actionable) — no LLM cost for spam/notes
- **email_processor.py**: LLM extraction (category, summary, actions, tickers, sentiment)
- **Link resolution**: Perplexity API (structured finance queries), Reddit JSON API, X/Twitter (FxTwitter → Syndication → oEmbed → Perplexity fallback)
- **Event triggers**: add_to_watchlist, create_hypothesis, schedule_research, investigate
- **inbox.py router**: 5 API endpoints
- **HermesInbox PWA view**

#### Epistemic Bug Fixes (B½ items from audit)
- **B½-1 FIXED**: Real 252-day z-scores in market_briefing (was passing raw values as z-scores)
- **B½-2 FIXED**: backtest_scanner injects CANDIDATE not PASSED (no more status inflation)
- **B½-3 FIXED**: Oracle no_data verdict instead of stuck pending forever
- **B½-4 FIXED**: Signal threshold stored per trade in paper_trades
- **B½-5 FIXED**: DuckDB documented as read-only mirror (not second source of truth)

#### Infrastructure
- **Operator health dashboard**: subsystem status API + Operator.jsx wired to real data
- **FIX_DATA_QUALITY Hermes action**: auto-detect coverage gaps + resolver every 6h
- **Route registry + lazy loading**: single routes.js, bundle 710KB → 367KB (48% smaller)
- **33 wn_* entity mappings** added, analyst int64 fix, coverage 87% → 93%
- **7 dead branches deleted**, EDGAR fix merged
- **Multi-agent collaboration**: AGENTS.md, CODEX.md, Codex running on codex/astrogrid-prototype

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
- International pullers: source_catalog schema mismatch (being fixed)
- OFR Financial Stress API endpoint returns 400 — URL format changed
- Oracle confidence normalization too generous (everything at 95%) — calibrate after Apr 17
- Crucix push needs auth for calesthio/Crucix (commit f635f92 local)
- Macro coverage 60%, systemic 0%, trade 33%
- FRED fedfred date parsing still needs fix for some series

### Data State
- Features at zero: ~90 (down from 124, after wn_* and analyst fixes)
- Total resolved_series: 328,294+
- Raw series: 2,087,768+
- Oracle predictions: 615 (expiry Apr 17)
- Tests: 489 passing, 0 failures
- Coverage: equity 100%, earnings 100%, vol 99%, breadth 94%, crypto 89%, macro 60%, systemic 0%, trade 33%
- PWA bundle: 367KB (down from 710KB, 48% reduction)

### Hermes Schedule (current)
| Task | Interval | Module |
|------|----------|--------|
| Market briefing | Hourly | ollama/market_briefing.py |
| Paper trading signals | Hourly | trading/signal_executor.py |
| Capital flow research | 4 hours | analysis/capital_flows.py |
| 100x digest | 4 hours | alerts/hundredx_digest.py |
| Oracle cycle | 6 hours | oracle/engine.py |
| Data quality check | 6 hours | FIX_DATA_QUALITY action |
| Hypothesis testing | 12 hours | analysis/hypothesis_tester.py |
| Email check (IMAP) | Continuous | alerts/email_ingest.py |
| Backtest scanner | Weekly | analysis/backtest_scanner.py |
| UX audit | 6 hours | scripts/ux_auditor.py |
| Daily digest | Daily | alerts/email.py |

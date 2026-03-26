# Roadmap

## Milestone v1.1: Always-On Intelligence & Data Resilience

### Phase 1: 24/7 LLM Intelligence Loop — COMPLETE
**Goal:** Wire the onboard Qwen 32B to run continuously — generating briefings, researching gaps, testing hypotheses, and synthesizing narratives around the clock.
**Delivered:** Intelligence loop daemon in api/main.py — hourly briefings (actionable format), 4h capital flows (DB persistence), 6h price fallback, nightly research + taxonomy audit, daily wiki history + CoinGecko + social sentiment. All LLM prompts use orthogonality-optimized feature selection. Social sentiment + Google Trends fed into briefing context.

### Phase 2: Data Source Resilience — COMPLETE
**Goal:** Every data family has at least 2 sources. Failed pulls auto-fallback. Freshness monitoring alerts when data goes stale.
**Delivered:** Price fallback chain (Stooq→AlphaVantage→TwelveData) wired into scheduler. CoinGecko as primary crypto. /api/v1/system/freshness endpoint with per-family GREEN/YELLOW/RED status. User-contributed API supervision deferred (needs BOINC coordinator).

### Phase 3: Hypothesis Engine — COMPLETE
**Goal:** All hypotheses have lag_structures and can be tested. Passed hypotheses surface with interpretation. Promote to Feature workflow.
**Delivered:** 18 CANDIDATE hypotheses given leader/follower mappings. 10 tested, 8 PASSED. 5 new TACTICAL hypotheses from backtest (PYPL→XLK Sharpe 3.07, CMCSA→XLC 61% WR, MSFT→AMD Sharpe 1.06). TestedHypotheses UI in Discovery view. Promote to Feature endpoint + button for PASSED hypotheses. PROMOTED state in UI.

### Phase 4: UX Narrative — COMPLETE
**Goal:** No raw numbers anywhere. Every view leads with interpretation.
**Delivered:** interpret.js shared module (z-scores, features, options, correlations, regime drivers). Regime drivers show "why this matters". Options explain P/C, IV, max pain positioning. SignalCard has z-score interpretation. Signals view Snapshot tab groups by family with summaries. Briefings rewritten: Bottom Line → Regime → What Changed → Risks → Opportunities → Tomorrow.

### Phase 5: Navigation & Polish — COMPLETE
**Goal:** Consistent UI. Bottom nav covers all workflows.
**Delivered:** Bottom nav: Home, Brief, Regime, Flows, Options, Discover, More. NAVIGATE/ACTIONS grids removed. shared.card unified across Regime, Dashboard, Options, Discovery. Consistent 10px radius, 14px 16px padding everywhere.

### Phase 6: Physics-Driven Intelligence — COMPLETE
**Goal:** Wire dealer gamma, momentum, news energy into actionable setups.
**Delivered:** _apply_physics_scores() in Sankey endpoint. GEX per ticker, momentum scoring, news energy. Composite force score with HIGH/MODERATE/LOW labels. Setups sorted by force magnitude. Action text enhanced with physics context.

### Phase 7: Data Gap Closure — COMPLETE
**Goal:** Fill dead data families. Backfill macro. Wire auto-fallback.
**Delivered:** FRED 20/20 series pulled. Auto-fallback in scheduler. Freshness monitoring endpoint. CoinGecko + wiki history in scheduler. 92 taxonomy fixes. 43+ equity tickers populated.

### Phase 8: Backtest Pipeline — COMPLETE
**Goal:** Automated discovery of high-Sharpe strategies.
**Delivered:** backtest_scanner.py scans all feature pairs. 874 winners found (Sharpe>0.8, WR>52%). Auto-generates TACTICAL hypotheses. POST /api/v1/discovery/backtest-scan endpoint. Top: BTC→SOL (Sharpe 21), ETH→SOL (Sharpe 20), MSFT→AMD (Sharpe 1.06).

### Phase 9: Taxonomy Guardian — COMPLETE
**Goal:** Automated daily taxonomy audit.
**Delivered:** taxonomy_audit.py: detects misclassifications, stale data, missing features, impossible values. Auto-fixes. Nightly 2:30 AM schedule. POST /api/v1/system/taxonomy-audit endpoint. Coverage per family with GREEN/YELLOW/RED.

### Phase 10: Social Sentiment — COMPLETE
**Goal:** Reddit, Bluesky, Google Trends sentiment tracking.
**Delivered:** social_sentiment.py: Reddit (12 subs), Bluesky (public API), Google Trends (pytrends). Per-ticker bullish/bearish/neutral scoring. Fed into briefing prompts. Wired into intelligence loop daily.

### Phase 11: Paper Trading Bot — COMPLETE
**Goal:** Execute TACTICAL hypothesis signals automatically. Track P&L. Kill underperformers.
**Delivered:** trading/signal_executor.py: hourly signal loop checks all ACTIVE strategies, fires on leader >1% move, Kelly-sized position on follower, auto-closes after expected_lag. Wired into intelligence loop + manual POST /trading/execute-signals endpoint. Paper engine with open/close/kill/dashboard/kelly. 12 strategies registered.

### Phase 12: Exchange Integrations — COMPLETE
**Goal:** Hyperliquid (perps), Polymarket (prediction markets), Kalshi (event contracts). Multi-wallet, small amounts, grow them.
**Delivered:**
- EXCH-01: trading/hyperliquid.py — HyperliquidTrader (testnet default, $100 max position, 20% drawdown). 4 API endpoints.
- EXCH-02: trading/prediction_markets.py — PolymarketTrader (CLOB API, $500/trade, $5K portfolio). 3 API endpoints.
- EXCH-03: trading/prediction_markets.py — KalshiTrader (REST + JWT auth). 3 API endpoints.
- EXCH-04: trading/wallet_manager.py — WalletManager with create/kill/pause/resume, auto-kill on drawdown breach, aggregated dashboard. 8 API endpoints.

### Phase 12.5: Sentiment Data Pipeline — COMPLETE
**Goal:** Deep sentiment and alternative data ingestion with ML scoring.
**Delivered:** AlphaVantage News Sentiment puller (daily, 11 tickers). HuggingFace financial-news-multisource (57M rows, weekly streaming). Pushshift Reddit backfill (streaming .zst, 12 finance subs). FinBERT scoring pipeline (GPU, scores all text sources). All registered in scheduler.

### Phase 13: AstroGrid — IN PROGRESS
**Goal:** Standalone celestial intelligence interface. 3D planetary visualization, ephemeris, market-astro correlation engine, and narrative synthesis. Separate app sharing GRID's backend.
See ASTROGRID-PLAN.md for full architecture. Running on Codex (codex/astrogrid-prototype branch).

### Phase 14: Oracle, Data Completion & Epistemic Hardening — COMPLETE
**Goal:** Self-improving prediction engine with scored track record. Fill remaining zero-data features. Supervised intelligence on all outbound signals. Activate dormant subsystems. Harden epistemic integrity.
**Delivered Session 1 (2026-03-26):**
- Oracle engine: 5 competing models, signal/anti-signal, weight evolution, immutable prediction journal
- 100x digest: 3-layer supervised filter (sanity → LLM review → cross-verify), kills spam
- Options puller fix: skip near-expiry garbage, quality gate on scanner
- Viz intelligence engine: 11 rules, VizSpec protocol, LivingGraph renderer
- Bulk data: CBOE 35yr VIX/SKEW, Binance 5yr crypto, DeFiLlama, Open-Meteo 5yr, EIA
- 2M+ raw rows ingested, 328K resolved
**Delivered Session 2 (2026-03-26):**
- bridges/ledger_sync.py: Regime + hypothesis sync to DuckDB with dead-letter table, zero silent failures
- Hypothesis tester wired into Hermes (12h cycle), syncs to DuckDB without status inflation
- Backtest scanner wired into Hermes (weekly), auto-generates TACTICAL hypotheses
- Paper trading chain closed: scanner → tester → signal_executor (hourly)
- Vol surface engine exposed via /api/v1/derivatives/svi-surface/{ticker} (SVI, arbitrage, Greeks, percentile)
- TradingView webhook hardened: payload hash, dedup, schema version, provenance envelope
- Crucix rule-based ideas re-enabled as LLM fallback with epistemic metadata
- Crucix /alerts /mute /unmute registered (Telegram + Discord), input validated, mute enforced
- Crucix delta threshold overrides now flow from config
- PWA: Knowledge, WatchlistAnalysis, Operator, Snapshots views routed + in NavBar
- External audit response: 8 of 17 critique items fixed
**Delivered Session 3 (2026-03-26):**
- Epistemic bug fixes: B½-1 through B½-5 all resolved (z-scores, status inflation, oracle no_data, threshold versioning, DuckDB documented)
- 33 wn_* entity mappings + analyst int64 fix → coverage 87% → 93%
- FIX_DATA_QUALITY Hermes action for autonomous coverage monitoring
- Operator health dashboard wired to real subsystem data
- Route registry + lazy loading → bundle 710KB → 367KB (48% smaller)
- 7 dead branches deleted, EDGAR fix merged

### Phase 15: Derivatives + Visualization + Hermes Email — IN PROGRESS
**Goal:** Full derivatives intelligence interface, living visualization dashboard, and Hermes inbound email processing.
**Delivered (2026-03-26 Session 3):**
- DerivativesGrid SPA: 7 D3-powered views (DealerFlow, GammaProfile, VolSurface, TermStructure, PositionHeatmap, Scanner, FlowNarrative), served at /derivatives/
- VizDashboard: 5-chart Living Intelligence composite (PhaseSpace, Orbital, ForceNetwork, ParticleSystem, RiverFlow) with master time control
- 4 new LivingGraph renderers (ParticleSystem, RiverFlow, Ridgeline, Chord)
- 5 viz data API endpoints (regime trajectory, feature network, orbital, energy, lead-lag)
- PWA vol surface components (VolSurface3D, VolSkewChart, TermStructureChart, Derivatives view)
- Data freshness UX (StaleBadge, RegimeBands, ExportButton)
- hermes@stepdad.finance: Cloudflare routing → Gmail → IMAP poll, 3-address allowlist
- email_ingest.py + email_supervisor.py + email_processor.py: triage → extraction pipeline
- Link resolution: Perplexity, Reddit JSON, X/Twitter multi-fallback
- Event triggers: add_to_watchlist, create_hypothesis, schedule_research, investigate
- inbox.py router: 5 API endpoints + HermesInbox PWA view
**Remaining:**
- International pullers: source_catalog schema mismatch (in progress)
- Flows page rework, watchlist redesign
- Crucix iOS reformat

### Phase 16: Living Graphs & UX Polish — PLANNED
**Goal:** Flows page rework. Watchlist redesign. Hypothesis UI. Final UX polish.
**Tasks:** Flows narrative summary. Watchlist briefing cards. Hypothesis results browser in Discovery.

---

## Requirements Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| LOOP-01 | 1 | Done |
| LOOP-02 | 1 | Done |
| LOOP-03 | 1 | Done |
| LOOP-04 | 1 | Done |
| DATA-05 | 2 | Done |
| DATA-06 | 2 | Done |
| DATA-07 | 2 | Done |
| DATA-08 | 2 | Deferred |
| HYPO-01 | 3 | Done |
| HYPO-02 | 3 | Done |
| HYPO-03 | 3 | Done |
| UX-07 | 4 | Done |
| UX-08 | 4 | Done |
| UX-09 | 4 | Done |
| UX-10 | 4 | Done |
| UX-11 | 5 | Done |
| UX-12 | 5 | Done |
| PHYS-01 | 6 | Done |
| PHYS-02 | 6 | Done |
| PHYS-03 | 6 | Done |
| PHYS-04 | 6 | Done |
| DATA-09 | 7 | Done |
| DATA-10 | 7 | Done |
| DATA-11 | 7 | Done |
| DATA-12 | 7 | Done |
| BT-01 | 8 | Done |
| BT-02 | 8 | Done |
| BT-03 | 8 | Done |
| TAX-01 | 9 | Done |
| TAX-02 | 9 | Done |
| SENT-01 | 10 | Done |
| SENT-02 | 10 | Done |
| TRADE-01 | 11 | Done — signal_executor.py hourly loop |
| TRADE-02 | 11 | Done — paper_strategies table with per-strategy P&L |
| TRADE-03 | 11 | Done — _check_kill auto-disables on drawdown/win rate threshold |
| TRADE-04 | 11 | Done — kelly_position_size method |
| EXCH-01 | 12 | Done — hyperliquid.py testnet integration |
| EXCH-02 | 12 | Done — prediction_markets.py Polymarket CLOB |
| EXCH-03 | 12 | Done — prediction_markets.py Kalshi REST |
| EXCH-04 | 12 | Done — wallet_manager.py multi-wallet |
| SENT-03 | 12.5 | Done — AlphaVantage + HF news + Pushshift + FinBERT |
| ASTRO-01 | 13 | In Progress — App scaffold (Codex) |
| ASTRO-02 | 13 | Planned — 3D planetary orrery |
| ASTRO-03 | 13 | Planned — Ephemeris calculator |
| ASTRO-04 | 13 | Planned — Market-astro correlation engine |
| ASTRO-05 | 13 | Planned — Celestial narrative synthesis |
| ASTRO-06 | 13 | Planned — API router expansion |
| ORACLE-01 | 14 | Done — oracle/engine.py 5-model ensemble |
| ORACLE-02 | 14 | Done — Signal + anti-signal architecture |
| ORACLE-03 | 14 | Done — Self-improving weight evolution loop |
| ORACLE-04 | 14 | Done — oracle/report.py email digest |
| ORACLE-05 | 14 | Done — Wired into hermes_operator 6h cycle |
| DIGEST-01 | 14 | Done — 100x bundled digest with strikes |
| DIGEST-02 | 14 | Done — 3-layer supervised sanity check |
| DIGEST-03 | 14 | Done — Options puller near-expiry fix |
| DATA-13 | 14 | Done — CBOE VIX/SKEW 35yr bulk download |
| DATA-14 | 14 | Done — Binance/CoinGecko/DeFiLlama crypto bulk |
| DATA-15 | 14 | Done — Open-Meteo 5yr weather, EIA energy |
| DATA-16 | 14 | In Progress — ~90 features need intl pullers + remaining fixes |
| BRIDGE-01 | 14 | Done — bridges/ledger_sync.py regime + hypothesis sync |
| BRIDGE-02 | 14 | Done — Dead-letter table for sync failures |
| ACTIVATE-01 | 14 | Done — Hypothesis tester in Hermes 12h cycle |
| ACTIVATE-02 | 14 | Done — Backtest scanner in Hermes weekly cycle |
| ACTIVATE-03 | 14 | Done — Vol surface SVI endpoint |
| ACTIVATE-04 | 14 | Done — PWA orphaned views routed |
| HARDEN-01 | 14 | Done — No silent sync failures (dead-letter) |
| HARDEN-02 | 14 | Done — No status inflation (pass-through states) |
| HARDEN-03 | 14 | Done — TradingView webhook provenance + dedup |
| HARDEN-04 | 14 | Done — Crucix ideas epistemic metadata |
| HARDEN-05 | 14 | Done — Mute validation + enforcement in send path |
| HARDEN-06 | 14 | Done — Delta threshold config actually works |
| HARDEN-07 | 14 | Done — Route registry (single routes.js) |
| HARDEN-08 | 14 | Done — Lazy loading non-core views (367KB bundle) |
| HARDEN-09 | 14 | Open — Alert state persistence across restart (Crucix) |
| HARDEN-10 | 14 | Open — Delta computation versioning (Crucix) |
| HARDEN-11 | 14 | Open — Tests for bot commands + thresholds |
| BUG-01 | 14 | Done — Real 252-day z-scores in market_briefing |
| BUG-02 | 14 | Done — Backtest scanner injects CANDIDATE not PASSED |
| BUG-03 | 14 | Done — Oracle no_data verdict for unscoreable predictions |
| BUG-04 | 14 | Done — Signal threshold stored per trade |
| BUG-05 | 14 | Done — DuckDB documented as read-only mirror |
| BUG-06 | 14 | Done — Operator health dashboard wired |
| BUG-07 | 14 | Done — FIX_DATA_QUALITY Hermes action for autonomous coverage |
| VIZ-01 | 14 | Done — viz_intelligence.py 11 rules |
| VIZ-02 | 14 | Done — VizSpec protocol + API |
| VIZ-03 | 14 | Done — LivingGraph.jsx universal renderer |
| VIZ-04 | 15 | Done — PhaseSpace wired to regime trajectory API |
| VIZ-05 | 15 | Done — Orbital wired to sector rotation API |
| VIZ-06 | 15 | Done — ForceNetwork wired to feature correlation API |
| VIZ-07 | 15 | Done — ParticleSystem + RiverFlow + Ridgeline + Chord renderers |
| VIZ-08 | 15 | Done — VizDashboard 5-chart composite with time control |
| DERIV-01 | 15 | Done — DerivativesGrid SPA with 7 D3 views |
| DERIV-02 | 15 | Done — PWA vol surface components (3D, skew, term structure) |
| DERIV-03 | 15 | Done — Data freshness UX (StaleBadge, RegimeBands, ExportButton) |
| EMAIL-01 | 15 | Done — hermes@stepdad.finance Cloudflare → Gmail → IMAP |
| EMAIL-02 | 15 | Done — 3-address sender allowlist |
| EMAIL-03 | 15 | Done — email_supervisor.py fast triage |
| EMAIL-04 | 15 | Done — email_processor.py LLM extraction |
| EMAIL-05 | 15 | Done — Link resolution (Perplexity, Reddit, X/Twitter) |
| EMAIL-06 | 15 | Done — Event triggers (watchlist, hypothesis, research, investigate) |
| EMAIL-07 | 15 | Done — HermesInbox PWA view |
| INFRA-01 | 15 | Done — Operator health dashboard |
| INFRA-02 | 15 | Done — FIX_DATA_QUALITY autonomous action |
| INFRA-03 | 15 | Done — Bundle optimization 710KB → 367KB |
| INFRA-04 | 15 | Done — 33 wn_* mappings + analyst int64 fix |
| INFRA-05 | 15 | Done — Multi-agent setup (AGENTS.md, CODEX.md) |

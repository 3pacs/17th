# GRID — Claude Code Guidelines

## Project Overview

GRID is a systematic, multi-agent trading intelligence platform. It ingests macroeconomic/market data from 37+ global sources, resolves multi-source conflicts using point-in-time (PIT) correct methodology, performs unsupervised regime discovery, and runs walk-forward backtesting with an immutable decision journal.

## Tech Stack

- **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2.0, PostgreSQL 15 + TimescaleDB
- **Frontend:** React 18, Vite, Zustand, served as PWA from FastAPI
- **LLM:** Hyperspace P2P node + Ollama (local inference), TradingAgents (multi-agent)
- **Config:** pydantic-settings, environment variables via `.env`

## Essential Commands

```bash
# Database
cd grid && docker compose up -d          # Start PostgreSQL + TimescaleDB

# Backend
cd grid && pip install -r requirements.txt
cd grid && python -m uvicorn api.main:app --reload --port 8000

# Frontend
cd grid/pwa && npm install && npm run dev  # Dev server on :5173
cd grid/pwa && npm run build               # Production build

# Tests
cd grid && python -m pytest tests/ -v
cd grid && python -m pytest tests/test_pit.py -v  # PIT store tests specifically
```

## Architecture Rules

<important if="modifying any data query, feature engineering, or inference code">
**PIT (Point-in-Time) Correctness is non-negotiable.** Every data query MUST use `store/pit.py` to prevent lookahead bias. Never access future data relative to the decision timestamp. The `assert_no_lookahead()` guard must pass for all inference paths.
</important>

<important if="writing SQL or database queries">
**Never use string `.format()` or f-strings for SQL.** Always use parameterized queries via SQLAlchemy. See ATTENTION.md items #1 for existing SQL injection bugs that need fixing.
</important>

<important if="adding or modifying data sources">
**Multi-source conflict resolution** goes through `normalization/resolver.py`. Every new data source needs: an ingestion module, entity mapping in `entity_map.py`, and PIT-compatible timestamps.
</important>

## Key Architectural Patterns

- **Model Governance:** CANDIDATE → SHADOW → STAGING → PRODUCTION (see `governance/registry.py`)
- **Immutable Journal:** Every recommendation logged in `journal/log.py` — never delete entries
- **Graceful Degradation:** Hyperspace/Ollama calls return `None` if offline; system operates without them
- **Config:** All settings via `config.py` (pydantic-settings). Copy `.env.example` to `.env`

## Code Style

- Use `loguru` for logging (imported as `log` from config)
- Type hints on all new functions
- Follow existing patterns in each module — don't introduce new frameworks
- Keep API routes thin; business logic belongs in domain modules

## Known Issues

See `grid/ATTENTION.md` for the full 40-item audit. Critical items:
1. SQL injection in `regime.py` and `journal/log.py` (use parameterized queries)
2. Weak JWT secret default (must set `GRID_JWT_SECRET` in production)
3. Default DB password "changeme" (must change for production)

## Directory Structure

```
grid/
├── api/           # FastAPI routes and auth
├── ingestion/     # 37+ data source pullers (FRED, BLS, ECB, etc.)
├── normalization/ # Multi-source conflict resolution
├── store/         # PIT-correct query engine
├── features/      # Feature engineering (z-score, slopes, ratios)
├── discovery/     # Unsupervised regime clustering
├── validation/    # Walk-forward backtesting gates
├── inference/     # Live model scoring
├── journal/       # Immutable decision log
├── governance/    # Model lifecycle state machine
├── agents/        # TradingAgents multi-agent framework
├── hyperspace/    # Local LLM inference layer
├── ollama/        # Ollama integration + market knowledge
├── pwa/           # React 18 PWA frontend
└── tests/         # pytest suite
```

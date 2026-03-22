# Data Integrity Rules

These rules apply when working with data ingestion, normalization, or query code.

## PIT Correctness

- All data queries MUST go through `store/pit.py` — never query raw tables directly for inference
- The `as_of` timestamp parameter is required for every analytical query
- `assert_no_lookahead()` must be called before any inference result is persisted
- When adding new features in `features/lab.py`, verify they cannot leak future information
- Walk-forward backtests in `validation/gates.py` enforce temporal boundaries — never bypass them

## Ingestion Modules

- Each data source gets its own module in `ingestion/` (or a subdirectory like `international/`, `altdata/`, `trade/`, `physical/`)
- All pullers must store data with valid `observation_date` timestamps
- Use the scheduler pattern in `ingestion/scheduler.py` for orchestration
- Handle API rate limits gracefully with exponential backoff
- Missing API keys should log a warning but not crash the system (graceful degradation)

## Conflict Resolution

- When the same economic indicator comes from multiple sources, `normalization/resolver.py` resolves conflicts
- Entity disambiguation uses `normalization/entity_map.py` — add new mappings there
- Resolution thresholds are configurable; document any threshold changes

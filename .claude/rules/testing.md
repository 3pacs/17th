# Testing Rules

These rules apply when writing or modifying tests.

## Test Framework

- Use `pytest` — tests live in `grid/tests/`
- Run all tests: `cd grid && python -m pytest tests/ -v`
- Run specific: `cd grid && python -m pytest tests/test_pit.py -v`

## Coverage Expectations

- Every new module must have a corresponding test file
- PIT correctness tests are highest priority — `test_pit.py` must always pass
- Test both happy path and edge cases (missing data, API failures, empty results)
- Mock external API calls — never hit live endpoints in tests

## Test Patterns

- Use fixtures for database sessions and test data
- Test PIT queries with known timestamps to verify no lookahead
- Backtesting tests should validate temporal boundaries
- Journal tests must verify immutability (no updates/deletes)

## Before Submitting

- Run the full test suite and confirm all tests pass
- If adding a new ingestion source, add tests for parsing and timestamp handling
- If modifying inference paths, verify `assert_no_lookahead()` coverage

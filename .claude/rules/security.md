# Security Rules

These rules apply when writing API endpoints, database queries, or authentication code.

## SQL Safety

- NEVER use f-strings, `.format()`, or string concatenation for SQL queries
- ALWAYS use SQLAlchemy parameterized queries: `text("SELECT ... WHERE id = :id").bindparams(id=value)`
- Existing SQL injection bugs are documented in `ATTENTION.md` item #1 — fix on sight

## Authentication

- JWT secret MUST be set via `GRID_JWT_SECRET` env var — never use the default in production
- WebSocket auth currently uses query parameters (known issue) — avoid making it worse
- Rate limiting is in-memory only — account for this limitation in any auth changes

## API Endpoints

- Add security headers for any new middleware
- Implement proper pagination (offset/limit + total count) for list endpoints
- Validate all user-supplied parameters before use
- Keep route handlers thin — delegate business logic to domain modules

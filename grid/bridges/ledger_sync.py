"""Bridge: GRID Core → grid_app DuckDB ledger.

Pushes regime state and hypothesis calibration events from the Postgres-backed
GRID core into the DuckDB-backed grid_app ledger so the flywheel feedback loop
actually closes.

PROVENANCE POLICY:
    Sync failures are NEVER silently swallowed. Every failure is:
    1. Logged as a structured warning with full exception detail
    2. Recorded in the sync_failures dead-letter log (DuckDB)
    3. Returned as False so callers can track divergence

    This ensures the ledger is either correct or visibly broken — never
    silently incomplete.

Usage from auto_regime.py:
    from bridges.ledger_sync import sync_regime
    sync_regime(result)  # result dict from auto_regime.run()

Usage from hypothesis_tester.py:
    from bridges.ledger_sync import sync_hypothesis_status
    sync_hypothesis_status("BTC-P001", "CANDIDATE", "PASSED", "correlation 0.42 at lag 3")
"""

import json
import traceback
from datetime import datetime
from pathlib import Path

import duckdb
from loguru import logger as log

DUCKDB_PATH = "/home/grid/grid_v4/data/grid.duckdb"


def _get_db():
    """Get writable DuckDB connection."""
    return duckdb.connect(DUCKDB_PATH)


def _ensure_dead_letter_table(db) -> None:
    """Create sync_failures table if it doesn't exist."""
    db.execute("""
        CREATE TABLE IF NOT EXISTS sync_failures (
            id INTEGER,
            timestamp VARCHAR,
            sync_type VARCHAR,
            payload VARCHAR,
            error VARCHAR,
            stack_trace VARCHAR
        )
    """)


def _record_failure(sync_type: str, payload: dict, exc: Exception) -> None:
    """Record a sync failure to the dead-letter table.

    This runs in its own try/except so a failure-to-record-failure
    doesn't cascade. But it always logs.
    """
    log.error(
        "Ledger sync FAILED [{t}]: {e} — payload keys: {k}",
        t=sync_type,
        e=str(exc),
        k=list(payload.keys()) if isinstance(payload, dict) else "non-dict",
    )
    try:
        db = _get_db()
        _ensure_dead_letter_table(db)
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        next_id = db.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM sync_failures").fetchone()[0]
        db.execute(
            "INSERT INTO sync_failures VALUES (?,?,?,?,?,?)",
            [
                next_id,
                now,
                sync_type,
                json.dumps(payload, default=str)[:4000],
                str(exc)[:1000],
                traceback.format_exc()[:2000],
            ],
        )
        db.close()
    except Exception as inner:
        # Last resort: at least the log.error above already fired
        log.error("Dead-letter recording also failed: {e}", e=str(inner))


def sync_regime(result: dict) -> bool:
    """Push a regime detection result into grid_app's regime_state table.

    Args:
        result: Dict from auto_regime.run() with keys:
            regime, confidence, posture, stress_index, stress_derivative,
            transition_probability, distribution, contradictions, contributions, etc.

    Returns:
        True if sync succeeded, False if it failed (failure is logged + dead-lettered).
    """
    regime = result.get("regime", "UNKNOWN")
    confidence = result.get("confidence", 0.0)
    posture = result.get("posture", "NEUTRAL")

    # Build indicators payload from the rich result
    indicators = {
        "stress_index": result.get("stress_index"),
        "stress_derivative": result.get("stress_derivative"),
        "transition_probability": result.get("transition_probability"),
        "distribution": result.get("distribution"),
        "contradictions": result.get("contradictions"),
        "n_features": result.get("n_features"),
    }
    # Include top drivers if present
    for key in ("top_stress_drivers", "top_calm_drivers", "contributions"):
        if key in result:
            val = result[key]
            if isinstance(val, list) and val and isinstance(val[0], tuple):
                indicators[key] = {k: v for k, v in val}
            elif isinstance(val, dict):
                indicators[key] = val

    try:
        db = _get_db()
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        next_id = db.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM regime_state").fetchone()[0]
        db.execute(
            "INSERT INTO regime_state VALUES (?,?,?,?,?,?)",
            [next_id, now, regime, confidence, json.dumps(indicators), posture],
        )
        db.close()
        return True
    except Exception as exc:
        _record_failure("regime", result, exc)
        return False


def sync_hypothesis_status(
    hypothesis_id: str,
    old_status: str,
    new_status: str,
    evidence: str = "",
    notes: str = "",
) -> bool:
    """Push a hypothesis calibration event into grid_app's calibration_log.

    STATUS SEMANTICS (no inflation):
        - Status values are passed through as-is from the source system.
        - Callers must NOT map between different vocabularies (e.g. PASSED→SUPPORTED).
        - The calibration_log records exactly what happened, not an interpretation.

    Args:
        hypothesis_id: e.g. "BTC-P001"
        old_status: previous status (exact value from source system)
        new_status: new status (exact value from source system)
        evidence: quantitative evidence for the change (test results, metrics)
        notes: additional context

    Returns:
        True if sync succeeded, False if it failed (failure is logged + dead-lettered).
    """
    payload = {
        "hypothesis_id": hypothesis_id,
        "old_status": old_status,
        "new_status": new_status,
        "evidence": evidence,
    }
    try:
        db = _get_db()
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

        # Insert calibration event — append-only, immutable
        next_id = db.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM calibration_log").fetchone()[0]
        db.execute(
            "INSERT INTO calibration_log (id, hypothesis_id, timestamp, action, old_status, new_status, evidence, notes) "
            "VALUES (?,?,?,?,?,?,?,?)",
            [next_id, hypothesis_id, now, "STATUS_CHANGE", old_status, new_status, evidence, notes],
        )

        # Update hypothesis_registry if the row exists in DuckDB
        existing = db.execute(
            "SELECT status FROM hypothesis_registry WHERE id = ?", [hypothesis_id]
        ).fetchone()
        if existing:
            db.execute(
                "UPDATE hypothesis_registry SET status=?, last_evaluated=?, notes=? WHERE id=?",
                [new_status, now, notes, hypothesis_id],
            )
            if new_status in ("SUPPORTED", "PASSED"):
                db.execute(
                    "UPDATE hypothesis_registry SET supported_count = supported_count + 1 WHERE id=?",
                    [hypothesis_id],
                )
            elif new_status in ("CONTRADICTED", "FAILED"):
                db.execute(
                    "UPDATE hypothesis_registry SET contradicted_count = contradicted_count + 1 WHERE id=?",
                    [hypothesis_id],
                )

        db.close()
        return True
    except Exception as exc:
        _record_failure("hypothesis", payload, exc)
        return False


def sync_flywheel_score(
    asset: str,
    score: int,
    mechanical_value: str = "",
    supply_reduction: str = "",
    price_to_intrinsic: str = "",
    thesis: str = "",
    category: str = "",
) -> bool:
    """Update a flywheel score in grid_app's DuckDB.

    Upserts the row — updates if exists, inserts if new.

    Returns:
        True if sync succeeded, False if it failed (failure is logged + dead-lettered).
    """
    payload = {"asset": asset, "score": score, "category": category}
    try:
        db = _get_db()
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

        existing = db.execute(
            "SELECT asset FROM flywheel_scores WHERE asset = ?", [asset]
        ).fetchone()

        if existing:
            db.execute(
                "UPDATE flywheel_scores SET score=?, mechanical_value=?, supply_reduction=?, "
                "price_to_intrinsic=?, thesis=?, last_updated=? WHERE asset=?",
                [score, mechanical_value, supply_reduction, price_to_intrinsic, thesis, now, asset],
            )
        else:
            db.execute(
                "INSERT INTO flywheel_scores VALUES (?,?,?,?,?,?,?,?)",
                [asset, category, score, mechanical_value, supply_reduction, price_to_intrinsic, thesis, now],
            )

        db.close()
        return True
    except Exception as exc:
        _record_failure("flywheel", payload, exc)
        return False


def get_sync_failures(limit: int = 50) -> list[dict]:
    """Query recent sync failures for operator visibility."""
    try:
        db = _get_db()
        _ensure_dead_letter_table(db)
        rows = db.execute(
            "SELECT * FROM sync_failures ORDER BY id DESC LIMIT ?", [limit]
        ).fetchall()
        db.close()
        return [
            {
                "id": r[0], "timestamp": r[1], "sync_type": r[2],
                "payload": r[3], "error": r[4],
            }
            for r in rows
        ]
    except Exception:
        return []

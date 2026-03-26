"""System status and health endpoints."""

from __future__ import annotations

import subprocess
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from loguru import logger as log
from sqlalchemy import text

from api.auth import require_auth, require_role
from api.dependencies import get_db_engine
from api.schemas.system import (
    DatabaseStatus,
    EmailInboxStats,
    FamilyFreshness,
    FreshnessResponse,
    GridStats,
    HealthResponse,
    HyperspaceStatus,
    LogsResponse,
    RecentIssue,
    RestartResponse,
    ServerHealth,
    SubsystemHealthResponse,
    SubsystemInfo,
    SystemStatusResponse,
)

router = APIRouter(prefix="/api/v1/system", tags=["system"])

_start_time = time.time()


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Health check — no auth required.

    Checks database connectivity, data freshness, connection pool,
    scheduler threads, WebSocket clients, disk space, and LLM availability.
    """
    import shutil
    import threading

    checks: dict[str, object] = {}
    degraded_reasons: list[str] = []

    # --- Database & data freshness ---
    try:
        engine = get_db_engine()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            checks["database"] = True

            r = conn.execute(text("SELECT COUNT(*) FROM feature_registry")).fetchone()
            feature_count = r[0] if r else 0
            checks["features_registered"] = feature_count > 0
            if feature_count == 0:
                degraded_reasons.append("no features registered")

            r = conn.execute(
                text(
                    "SELECT COUNT(*) FROM raw_series "
                    "WHERE pull_timestamp >= NOW() - INTERVAL '7 days'"
                )
            ).fetchone()
            recent = (r[0] if r else 0) > 0
            checks["recent_data"] = recent
            if not recent:
                degraded_reasons.append("no data pulled in 7 days")

        # Connection pool details
        pool = engine.pool
        pool_ok = pool.checkedout() < pool.size() + pool.overflow()
        checks["pool_healthy"] = pool_ok
        checks["pool_size"] = pool.size()
        checks["pool_checked_out"] = pool.checkedout()
        checks["pool_overflow"] = pool.overflow()
        if not pool_ok:
            degraded_reasons.append("connection pool exhausted")
    except Exception:
        checks["database"] = False
        degraded_reasons.append("database unreachable")

    # --- Scheduler threads ---
    expected_threads = {"ingestion"}
    try:
        from config import settings as _settings
        if _settings.AGENTS_ENABLED and _settings.AGENTS_SCHEDULE_ENABLED:
            expected_threads.add("agent-scheduler")
    except Exception:
        pass
    live_threads = {t.name for t in threading.enumerate()}
    for name in expected_threads:
        alive = name in live_threads
        checks[f"thread_{name}"] = alive
        if not alive:
            degraded_reasons.append(f"thread '{name}' not running")

    # --- WebSocket clients ---
    try:
        from api.main import _ws_clients
        checks["ws_clients"] = len(_ws_clients)
    except Exception:
        checks["ws_clients"] = -1

    # --- Disk space ---
    try:
        usage = shutil.disk_usage("/")
        disk_pct = round(usage.used / usage.total * 100, 1)
        checks["disk_percent"] = disk_pct
        checks["disk_free_gb"] = round(usage.free / (1024**3), 1)
        if disk_pct > 95:
            degraded_reasons.append(f"disk {disk_pct}% full")
    except Exception:
        pass

    # --- LLM availability ---
    try:
        from llamacpp.client import LlamaCppClient
        client = LlamaCppClient()
        checks["llm_available"] = client.is_available
    except Exception:
        checks["llm_available"] = False

    # --- API key audit ---
    try:
        from config import settings
        key_audit = settings.audit_api_keys()
        checks["api_keys_configured"] = sum(key_audit.values())
        checks["api_keys_total"] = len(key_audit)
    except Exception:
        pass

    db_ok = checks.get("database", False)
    if db_ok and not degraded_reasons:
        status = "ok"
    elif db_ok:
        status = "degraded"
    else:
        status = "degraded"

    return HealthResponse(status=status, checks=checks, degraded_reasons=degraded_reasons)


@router.get("/status", response_model=SystemStatusResponse)
async def status(_token: str = Depends(require_auth)) -> SystemStatusResponse:
    """Comprehensive system status."""
    engine = get_db_engine()

    # Database status
    db_status = DatabaseStatus()
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            db_status.connected = True
            row = conn.execute(
                text("SELECT pg_database_size(current_database()) AS size")
            ).fetchone()
            if row:
                db_status.size_mb = round(row[0] / (1024 * 1024), 2)
    except Exception as exc:
        log.warning("DB status check failed: {e}", e=str(exc))

    # Grid stats
    grid_stats = GridStats()
    try:
        with engine.connect() as conn:
            r = conn.execute(text("SELECT COUNT(*) FROM feature_registry")).fetchone()
            grid_stats.features_total = r[0] if r else 0

            r = conn.execute(
                text("SELECT COUNT(*) FROM feature_registry WHERE model_eligible = TRUE")
            ).fetchone()
            grid_stats.features_model_eligible = r[0] if r else 0

            r = conn.execute(text("SELECT COUNT(*) FROM hypothesis_registry")).fetchone()
            grid_stats.hypotheses_total = r[0] if r else 0

            r = conn.execute(
                text(
                    "SELECT COUNT(*) FROM model_registry WHERE state = 'PRODUCTION'"
                )
            ).fetchone()
            grid_stats.hypotheses_in_production = r[0] if r else 0

            r = conn.execute(text("SELECT COUNT(*) FROM decision_journal")).fetchone()
            grid_stats.journal_entries_total = r[0] if r else 0

            r = conn.execute(
                text(
                    "SELECT COUNT(*) FROM decision_journal WHERE outcome_recorded_at IS NOT NULL"
                )
            ).fetchone()
            grid_stats.journal_entries_with_outcomes = r[0] if r else 0
    except Exception as exc:
        log.warning("Grid stats query failed: {e}", e=str(exc))

    # Hyperspace status
    hs_status = HyperspaceStatus()
    try:
        from hyperspace.client import get_client

        client = get_client()
        if client.is_available:
            hs_status.node_online = True
            hs_status.api_available = True
            health = client.health_check()
            models = health.get("models", [])
            if models:
                hs_status.model_loaded = models[0]

        from hyperspace.monitor import HyperspaceMonitor

        monitor = HyperspaceMonitor(client)
        node_status = monitor.get_node_status()
        if node_status:
            hs_status.peer_id = node_status.get("peer_id")
            hs_status.connected_peers = node_status.get("connected_peers")
            points = monitor.get_points_summary()
            if points:
                hs_status.points = points.get("total_points")
    except Exception:
        pass

    # Server health
    server_health = ServerHealth()
    try:
        import shutil
        import os
        import glob

        # Disk
        usage = shutil.disk_usage("/")
        server_health.disk_total_gb = round(usage.total / (1024**3), 2)
        server_health.disk_used_gb = round(usage.used / (1024**3), 2)
        server_health.disk_free_gb = round(usage.free / (1024**3), 2)
        server_health.disk_percent = round(usage.used / usage.total * 100, 1)

        # Load average
        load1, load5, load15 = os.getloadavg()
        server_health.load_avg_1m = round(load1, 2)
        server_health.load_avg_5m = round(load5, 2)
        server_health.load_avg_15m = round(load15, 2)

        # Memory from /proc/meminfo
        with open("/proc/meminfo") as f:
            meminfo: dict[str, int] = {}
            for line in f:
                parts = line.split()
                if len(parts) >= 2:
                    meminfo[parts[0].rstrip(":")] = int(parts[1])
        mem_total = meminfo.get("MemTotal", 0) / (1024 * 1024)  # KB to GB
        mem_available = meminfo.get("MemAvailable", 0) / (1024 * 1024)
        server_health.memory_total_gb = round(mem_total, 2)
        server_health.memory_used_gb = round(mem_total - mem_available, 2)
        server_health.memory_percent = (
            round((mem_total - mem_available) / mem_total * 100, 1) if mem_total else 0
        )

        # CPU usage from /proc/stat (snapshot)
        with open("/proc/stat") as f:
            cpu_line = f.readline()
        vals = [int(x) for x in cpu_line.split()[1:]]
        idle = vals[3] if len(vals) > 3 else 0
        total = sum(vals)
        server_health.cpu_percent = round((1 - idle / total) * 100, 1) if total else 0

        # Temperature from thermal zones
        for tz in sorted(glob.glob("/sys/class/thermal/thermal_zone*/temp")):
            try:
                with open(tz) as f:
                    temp = int(f.read().strip()) / 1000
                if temp > 0 and server_health.cpu_temp_c is None:
                    server_health.cpu_temp_c = round(temp, 1)
            except Exception:
                pass

        # GPU temp via nvidia-smi if available
        try:
            result = subprocess.run(
                [
                    "nvidia-smi",
                    "--query-gpu=temperature.gpu",
                    "--format=csv,noheader,nounits",
                ],
                capture_output=True,
                text=True,
                timeout=3,
            )
            if result.returncode == 0 and result.stdout.strip():
                server_health.gpu_temp_c = float(
                    result.stdout.strip().split("\n")[0]
                )
        except Exception:
            pass
    except Exception as exc:
        log.debug("Server health check failed: {e}", e=str(exc))

    return SystemStatusResponse(
        database=db_status,
        hyperspace=hs_status,
        grid=grid_stats,
        server=server_health,
        uptime_seconds=round(time.time() - _start_time, 1),
        server_time=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/freshness", response_model=FreshnessResponse)
async def freshness(_token: str = Depends(require_auth)) -> FreshnessResponse:
    """Per-family data freshness report.

    GREEN = >80% fresh today, YELLOW = 50-80%, RED = <50%.
    """
    engine = get_db_engine()
    families: list[FamilyFreshness] = []
    try:
        with engine.connect() as conn:
            rows = conn.execute(text(
                "SELECT fr.family, "
                "  COUNT(*) AS total, "
                "  COUNT(*) FILTER (WHERE rs.latest_date >= CURRENT_DATE) AS fresh_today "
                "FROM feature_registry fr "
                "LEFT JOIN LATERAL ("
                "  SELECT MAX(obs_date) AS latest_date "
                "  FROM resolved_series WHERE feature_id = fr.id"
                ") rs ON TRUE "
                "WHERE fr.model_eligible = TRUE "
                "GROUP BY fr.family ORDER BY fr.family"
            )).fetchall()
            for row in rows:
                family, total, fresh = row[0], row[1], row[2]
                stale = total - fresh
                pct = (fresh / total * 100) if total > 0 else 0
                if pct >= 80:
                    status = "GREEN"
                elif pct >= 50:
                    status = "YELLOW"
                else:
                    status = "RED"
                families.append(FamilyFreshness(
                    family=family, total=total, fresh_today=fresh,
                    stale=stale, status=status,
                ))
    except Exception as exc:
        log.warning("Freshness query failed: {e}", e=str(exc))

    # Overall status: worst family status
    if not families or any(f.status == "RED" for f in families):
        overall = "RED"
    elif any(f.status == "YELLOW" for f in families):
        overall = "YELLOW"
    else:
        overall = "GREEN"

    return FreshnessResponse(families=families, overall_status=overall)


@router.get("/logs", response_model=LogsResponse)
async def get_logs(
    source: str = "api",
    lines: int = 50,
    _token: str = Depends(require_auth),
) -> LogsResponse:
    """Return recent log lines."""
    log_files = {
        "api": "/var/log/grid-api.log",
        "hyperspace": "/var/log/hyperspace.log",
        "system": "/var/log/syslog",
    }
    path = log_files.get(source, log_files["api"])
    try:
        result = subprocess.run(
            ["tail", "-n", str(min(lines, 500)), path],
            capture_output=True,
            text=True,
            timeout=5,
        )
        output_lines = result.stdout.strip().split("\n") if result.stdout else []
    except Exception:
        output_lines = [f"Could not read {path}"]

    return LogsResponse(source=source, lines=output_lines)


@router.get("/alerts")
async def alerts(_token: str = Depends(require_auth)) -> dict:
    """Return active server alerts for critical conditions."""
    import shutil
    import os

    active_alerts: list[dict[str, str]] = []

    # Disk space alert
    try:
        usage = shutil.disk_usage("/")
        pct = usage.used / usage.total * 100
        if pct > 90:
            active_alerts.append({
                "severity": "critical",
                "source": "disk",
                "message": f"Disk {pct:.0f}% full — only {usage.free / (1024**3):.1f} GB free",
            })
        elif pct > 80:
            active_alerts.append({
                "severity": "warning",
                "source": "disk",
                "message": f"Disk {pct:.0f}% full",
            })
    except Exception:
        pass

    # Temperature alert
    try:
        import glob

        for tz in sorted(glob.glob("/sys/class/thermal/thermal_zone*/temp")):
            with open(tz) as f:
                temp = int(f.read().strip()) / 1000
            if temp > 85:
                active_alerts.append({
                    "severity": "critical",
                    "source": "cpu_temp",
                    "message": f"CPU temperature {temp:.0f}C — throttling likely",
                })
            elif temp > 75:
                active_alerts.append({
                    "severity": "warning",
                    "source": "cpu_temp",
                    "message": f"CPU temperature {temp:.0f}C",
                })
            break
    except Exception:
        pass

    # Memory alert
    try:
        with open("/proc/meminfo") as f:
            meminfo: dict[str, int] = {}
            for line in f:
                parts = line.split()
                if len(parts) >= 2:
                    meminfo[parts[0].rstrip(":")] = int(parts[1])
        mem_total = meminfo.get("MemTotal", 1)
        mem_available = meminfo.get("MemAvailable", 0)
        mem_pct = (1 - mem_available / mem_total) * 100
        if mem_pct > 95:
            active_alerts.append({
                "severity": "critical",
                "source": "memory",
                "message": f"Memory {mem_pct:.0f}% used — OOM risk",
            })
        elif mem_pct > 85:
            active_alerts.append({
                "severity": "warning",
                "source": "memory",
                "message": f"Memory {mem_pct:.0f}% used",
            })
    except Exception:
        pass

    # Load average alert
    try:
        load1, _, _ = os.getloadavg()
        cpu_count = os.cpu_count() or 1
        if load1 > cpu_count * 2:
            active_alerts.append({
                "severity": "critical",
                "source": "load",
                "message": f"Load average {load1:.1f} (CPUs: {cpu_count})",
            })
        elif load1 > cpu_count:
            active_alerts.append({
                "severity": "warning",
                "source": "load",
                "message": f"Load average {load1:.1f} (CPUs: {cpu_count})",
            })
    except Exception:
        pass

    return {"alerts": active_alerts, "count": len(active_alerts)}


@router.post("/restart-hyperspace", response_model=RestartResponse)
async def restart_hyperspace(
    _token: str = Depends(require_role("admin")),
) -> RestartResponse:
    """Restart the Hyperspace node."""
    try:
        subprocess.run(["pkill", "-f", "hyperspace"], timeout=5)
        subprocess.Popen(
            ["bash", "hyperspace_setup/start_node.sh"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return RestartResponse(status="restarting", message="Hyperspace node restarting")
    except Exception as exc:
        return RestartResponse(status="error", message=str(exc))


# ── Subsystem Health endpoint ──────────────────────────────────

# Subsystem definitions: (name, interval_label, interval_seconds, snapshot_key)
_SUBSYSTEMS = [
    ("Market Briefing",       "1h",      3600,     "pipeline"),
    ("Paper Trading Signals", "1h",      3600,     "pipeline"),
    ("Capital Flow Research", "4h",      14400,    "pipeline"),
    ("100x Digest",           "4h",      14400,    "100x_digest"),
    ("Oracle Cycle",          "6h",      21600,    "oracle"),
    ("Hypothesis Testing",    "12h",     43200,    "hypothesis_testing"),
    ("Backtest Scanner",      "weekly",  604800,   "backtest_scanner"),
    ("Email Check",           "15min",   900,      "email_ingest"),
    ("UX Audit",              "6h",      21600,    "ux_audit"),
]


def _subsystem_result_summary(key: str, payload: dict) -> str | None:
    """Extract a human-readable result snippet from the cycle payload."""
    data = payload.get(key)
    if data is None:
        return None
    if isinstance(data, dict):
        if key == "hypothesis_testing":
            tested = data.get("tested", 0)
            passed = data.get("passed", 0)
            return f"{tested} tested, {passed} passed"
        if key == "backtest_scanner":
            w = data.get("winners", 0)
            h = data.get("hypotheses_created", 0)
            return f"{w} winners, {h} hypotheses created"
        if key == "oracle":
            np_ = data.get("new_predictions", 0)
            sc = data.get("scored", 0)
            return f"{np_} predictions, {sc} scored"
        if key == "100x_digest":
            opps = data.get("opportunities", data.get("count", "?"))
            return f"{opps} opportunities found"
        if key == "ux_audit":
            score = data.get("score", "?")
            return f"Score: {score}"
        if key == "email_ingest":
            nm = data.get("new_messages", 0)
            return f"{nm} new messages"
        if key == "pipeline":
            return "Pipeline completed"
        if "error" in data:
            return f"Error: {str(data['error'])[:80]}"
    return str(data)[:100] if data else None


@router.get("/subsystem-health", response_model=SubsystemHealthResponse)
async def subsystem_health(
    _token: str = Depends(require_auth),
) -> SubsystemHealthResponse:
    """Subsystem health overview for the Operator view.

    Returns status of each Hermes subsystem, email inbox stats,
    sync failure count, and recent operator issues.
    """
    engine = get_db_engine()
    now = datetime.now(timezone.utc)

    # -- 1. Get latest pipeline_summary snapshot for last-run data --
    latest_payload: dict = {}
    latest_created: datetime | None = None
    try:
        with engine.connect() as conn:
            row = conn.execute(text(
                "SELECT payload, created_at FROM analytical_snapshots "
                "WHERE category = 'pipeline_summary' "
                "ORDER BY created_at DESC LIMIT 1"
            )).fetchone()
            if row:
                import json as _json
                raw = row[0]
                latest_payload = raw if isinstance(raw, dict) else _json.loads(raw)
                latest_created = row[1]
    except Exception as exc:
        log.warning("subsystem-health: snapshot query failed: {e}", e=str(exc))

    # -- 2. Build subsystem list --
    subsystems: list[SubsystemInfo] = []
    for name, interval_label, interval_secs, snap_key in _SUBSYSTEMS:
        last_run: str | None = None
        status = "stale"
        last_result: str | None = None

        # Determine last_run from the snapshot created_at if the key exists
        if latest_payload.get(snap_key) is not None and latest_created is not None:
            last_run = latest_created.isoformat() if latest_created else None
            last_result = _subsystem_result_summary(snap_key, latest_payload)

            # Check for error in the subsystem data
            sub_data = latest_payload.get(snap_key, {})
            has_error = isinstance(sub_data, dict) and "error" in sub_data

            if has_error:
                status = "error"
            elif last_run:
                age = (now - latest_created).total_seconds()
                # Stale if last run is older than 2x interval
                if age > interval_secs * 2:
                    status = "stale"
                else:
                    status = "healthy"
        else:
            status = "stale"

        subsystems.append(SubsystemInfo(
            name=name,
            interval=interval_label,
            last_run=last_run,
            status=status,
            last_result=last_result,
        ))

    # -- 3. Email inbox stats --
    email_stats = EmailInboxStats()
    try:
        with engine.connect() as conn:
            row = conn.execute(text(
                "SELECT "
                "  COUNT(*) AS total, "
                "  COUNT(*) FILTER (WHERE status = 'pending') AS pending, "
                "  COUNT(*) FILTER (WHERE status = 'processed') AS processed, "
                "  COUNT(*) FILTER (WHERE status = 'spam') AS spam, "
                "  MAX(received_at) AS last_check "
                "FROM hermes_inbox"
            )).fetchone()
            if row:
                email_stats = EmailInboxStats(
                    total=row[0] or 0,
                    pending=row[1] or 0,
                    processed=row[2] or 0,
                    spam=row[3] or 0,
                    last_check=row[4].isoformat() if row[4] else None,
                )
    except Exception as exc:
        log.debug("subsystem-health: hermes_inbox query failed: {e}", e=str(exc))

    # -- 4. Sync failures (DuckDB — best effort) --
    sync_fail_count = 0
    try:
        from bridges.ledger_sync import get_sync_failures
        failures = get_sync_failures(limit=1000)
        sync_fail_count = len(failures)
    except Exception:
        pass

    # -- 5. Operator issues (last 24h) --
    issues_24h = 0
    recent_issues: list[RecentIssue] = []
    try:
        with engine.connect() as conn:
            row = conn.execute(text(
                "SELECT COUNT(*) FROM operator_issues "
                "WHERE created_at > NOW() - INTERVAL '24 hours'"
            )).fetchone()
            issues_24h = row[0] if row else 0

            rows = conn.execute(text(
                "SELECT title, severity, created_at, fix_result "
                "FROM operator_issues "
                "WHERE created_at > NOW() - INTERVAL '24 hours' "
                "ORDER BY created_at DESC LIMIT 20"
            )).fetchall()
            recent_issues = [
                RecentIssue(
                    title=r[0],
                    severity=r[1],
                    created_at=r[2].isoformat() if r[2] else None,
                    fix_result=r[3],
                )
                for r in rows
            ]
    except Exception as exc:
        log.debug("subsystem-health: operator_issues query failed: {e}", e=str(exc))

    return SubsystemHealthResponse(
        subsystems=subsystems,
        email_inbox=email_stats,
        sync_failures=sync_fail_count,
        operator_issues_24h=issues_24h,
        recent_issues=recent_issues,
    )


# ── UX Audit endpoints ─────────────────────────────────────────

@router.post("/ux-audit")
async def trigger_ux_audit(
    _token: str = Depends(require_role("admin")),
) -> dict:
    """Trigger an immediate UX audit (admin only)."""
    try:
        from scripts.ux_auditor import run_ux_audit
        engine = get_db_engine()
        report = run_ux_audit(engine=engine)
        return {
            "status": "completed",
            "summary": report.get("summary"),
            "analysis": report.get("analysis"),
        }
    except Exception as exc:
        return {"status": "error", "error": str(exc)}


@router.get("/ux-audits")
async def list_ux_audits(
    limit: int = 10,
    _token: str = Depends(require_auth),
) -> list[dict]:
    """List recent UX audit results."""
    engine = get_db_engine()
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT id, audit_timestamp, score, total_endpoints, "
                    "endpoints_ok, avg_latency_ms, journey_pass, journey_total, "
                    "priority_fix, acted_on "
                    "FROM ux_audit_results "
                    "ORDER BY audit_timestamp DESC "
                    "LIMIT :lim"
                ).bindparams(lim=min(limit, 50)),
            ).fetchall()
            return [
                {
                    "id": r[0],
                    "timestamp": r[1].isoformat() if r[1] else None,
                    "score": r[2],
                    "endpoints_ok": f"{r[4]}/{r[3]}",
                    "avg_latency_ms": r[5],
                    "journeys_pass": f"{r[6]}/{r[7]}",
                    "priority_fix": r[8],
                    "acted_on": r[9],
                }
                for r in rows
            ]
    except Exception:
        return []


@router.post("/send-digest")
async def trigger_daily_digest(
    _token: str = Depends(require_role("admin")),
) -> dict:
    """Trigger an immediate daily digest email (admin only)."""
    try:
        from scripts.daily_digest import send_daily_digest
        engine = get_db_engine()
        result = send_daily_digest(engine)
        return {"status": "sent" if result.get("sent") else "failed", **result}
    except Exception as exc:
        return {"status": "error", "error": str(exc)}


@router.post("/taxonomy-audit")
async def run_taxonomy_audit_endpoint(
    _token: str = Depends(require_auth),
) -> dict:
    """Run taxonomy audit — detects misclassifications, stale data, missing features, impossible values."""
    try:
        from analysis.taxonomy_audit import run_taxonomy_audit
        engine = get_db_engine()
        return run_taxonomy_audit(engine)
    except Exception as exc:
        return {"error": str(exc)}

"""Hermes inbox — inbound email intelligence endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger as log
from sqlalchemy import text

from api.auth import require_auth
from api.dependencies import get_db_engine

router = APIRouter(
    prefix="/api/v1/inbox",
    tags=["inbox"],
    dependencies=[Depends(require_auth)],
)


@router.get("/messages")
async def list_messages(
    status: str | None = Query(None, description="Filter by status: pending, processed, archived, rejected"),
    category: str | None = Query(None, description="Filter by category: news, instruction, update, research, question"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """List inbox messages with optional filters.

    Returns messages ordered by received_at DESC with LLM analysis fields.
    """
    engine = get_db_engine()

    conditions: list[str] = []
    params: dict[str, Any] = {"lim": limit, "off": offset}

    if status:
        conditions.append("status = :status")
        params["status"] = status
    if category:
        conditions.append("category = :category")
        params["category"] = category

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    f"SELECT id, received_at, from_address, subject, "
                    f"  category, summary, sentiment, tickers_mentioned, "
                    f"  hermes_response, status, processed_at "
                    f"FROM hermes_inbox "
                    f"{where} "
                    f"ORDER BY received_at DESC "
                    f"LIMIT :lim OFFSET :off"
                ),
                params,
            ).fetchall()

            count_row = conn.execute(
                text(f"SELECT COUNT(*) FROM hermes_inbox {where}"),
                params,
            ).fetchone()
            total = count_row[0] if count_row else 0

        messages = [
            {
                "id": r[0],
                "received_at": r[1].isoformat() if r[1] else None,
                "from_address": r[2],
                "subject": r[3],
                "category": r[4],
                "summary": r[5],
                "sentiment": r[6],
                "tickers_mentioned": r[7] or [],
                "hermes_response": r[8],
                "status": r[9],
                "processed_at": r[10].isoformat() if r[10] else None,
            }
            for r in rows
        ]
        return {"messages": messages, "total": total, "limit": limit, "offset": offset}

    except Exception as exc:
        log.warning("Inbox list failed: {e}", e=str(exc))
        return {"messages": [], "total": 0, "limit": limit, "offset": offset}


@router.get("/messages/{msg_id}")
async def get_message(msg_id: int) -> dict[str, Any]:
    """Get a single inbox message with full details including body and analysis."""
    engine = get_db_engine()
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT id, received_at, from_address, subject, "
                    "  body_text, category, summary, action_items, "
                    "  notes, plans, sentiment, tickers_mentioned, "
                    "  hermes_response, status, processed_at, "
                    "  message_id, thread_id "
                    "FROM hermes_inbox WHERE id = :id"
                ),
                {"id": msg_id},
            ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Message not found")

        return {
            "id": row[0],
            "received_at": row[1].isoformat() if row[1] else None,
            "from_address": row[2],
            "subject": row[3],
            "body_text": row[4],
            "category": row[5],
            "summary": row[6],
            "action_items": row[7] or [],
            "notes": row[8] or [],
            "plans": row[9] or [],
            "sentiment": row[10],
            "tickers_mentioned": row[11] or [],
            "hermes_response": row[12],
            "status": row[13],
            "processed_at": row[14].isoformat() if row[14] else None,
            "message_id": row[15],
            "thread_id": row[16],
        }

    except HTTPException:
        raise
    except Exception as exc:
        log.warning("Inbox get message failed: {e}", e=str(exc))
        raise HTTPException(status_code=500, detail="Failed to fetch message")


@router.get("/action-items")
async def list_action_items(
    status: str = Query("pending", description="Filter action item status"),
) -> dict[str, Any]:
    """Return all action items across all processed emails.

    Extracts action_items from JSONB, flattened with parent email context.
    """
    engine = get_db_engine()
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT hi.id, hi.subject, hi.from_address, hi.received_at, "
                    "  ai.value "
                    "FROM hermes_inbox hi, "
                    "  jsonb_array_elements(hi.action_items) ai "
                    "WHERE hi.status = 'processed' "
                    "  AND hi.action_items IS NOT NULL "
                    "  AND jsonb_array_length(hi.action_items) > 0 "
                    "ORDER BY hi.received_at DESC "
                    "LIMIT 100"
                )
            ).fetchall()

        items = []
        for r in rows:
            item = r[4] if isinstance(r[4], dict) else {}
            item_status = item.get("status", "pending")
            if status and item_status != status:
                continue
            items.append({
                "email_id": r[0],
                "email_subject": r[1],
                "from_address": r[2],
                "received_at": r[3].isoformat() if r[3] else None,
                "action": item.get("action", ""),
                "priority": item.get("priority", "medium"),
                "status": item_status,
            })

        return {"action_items": items, "count": len(items)}

    except Exception as exc:
        log.warning("Inbox action items failed: {e}", e=str(exc))
        return {"action_items": [], "count": 0}


@router.post("/messages/{msg_id}/archive")
async def archive_message(msg_id: int) -> dict[str, str]:
    """Mark a message as archived."""
    engine = get_db_engine()
    try:
        with engine.begin() as conn:
            result = conn.execute(
                text(
                    "UPDATE hermes_inbox SET status = 'archived' "
                    "WHERE id = :id AND status != 'archived' "
                    "RETURNING id"
                ),
                {"id": msg_id},
            ).fetchone()

        if not result:
            raise HTTPException(status_code=404, detail="Message not found or already archived")

        return {"status": "archived", "id": str(msg_id)}

    except HTTPException:
        raise
    except Exception as exc:
        log.warning("Inbox archive failed: {e}", e=str(exc))
        raise HTTPException(status_code=500, detail="Failed to archive message")


@router.get("/stats")
async def inbox_stats() -> dict[str, Any]:
    """Return inbox statistics: totals by status, category breakdown, recent tickers."""
    engine = get_db_engine()
    try:
        with engine.connect() as conn:
            # Total count
            total_row = conn.execute(
                text("SELECT COUNT(*) FROM hermes_inbox")
            ).fetchone()
            total = total_row[0] if total_row else 0

            # By status
            status_rows = conn.execute(
                text(
                    "SELECT status, COUNT(*) FROM hermes_inbox "
                    "GROUP BY status ORDER BY COUNT(*) DESC"
                )
            ).fetchall()
            by_status = {r[0]: r[1] for r in status_rows}

            # By category
            cat_rows = conn.execute(
                text(
                    "SELECT category, COUNT(*) FROM hermes_inbox "
                    "WHERE category IS NOT NULL "
                    "GROUP BY category ORDER BY COUNT(*) DESC"
                )
            ).fetchall()
            by_category = {r[0]: r[1] for r in cat_rows}

            # Recent tickers (from last 50 processed emails)
            ticker_rows = conn.execute(
                text(
                    "SELECT DISTINCT unnest(tickers_mentioned) AS ticker "
                    "FROM hermes_inbox "
                    "WHERE status = 'processed' "
                    "  AND tickers_mentioned IS NOT NULL "
                    "ORDER BY ticker "
                    "LIMIT 50"
                )
            ).fetchall()
            recent_tickers = [r[0] for r in ticker_rows]

        return {
            "total": total,
            "pending": by_status.get("pending", 0),
            "processed": by_status.get("processed", 0),
            "archived": by_status.get("archived", 0),
            "rejected": by_status.get("rejected", 0),
            "by_category": by_category,
            "recent_tickers": recent_tickers,
        }

    except Exception as exc:
        log.warning("Inbox stats failed: {e}", e=str(exc))
        return {
            "total": 0, "pending": 0, "processed": 0,
            "archived": 0, "rejected": 0,
            "by_category": {}, "recent_tickers": [],
        }

"""
GRID Hermes — Email Supervisor (fast triage layer).

Sits between email_ingest and email_processor. Decides what each email
is worth BEFORE spending LLM tokens on it. Categories:

  SPAM     — automated alerts, newsletters, system noise from allowed senders → drop
  NOTE     — FYI info, store a quick summary, no LLM processing needed
  ACTIONABLE — real operator intel → full LLM processing → trigger events

Also handles post-processing event triggers for actionable emails:
  - add_to_watchlist → inserts ticker into watchlist
  - create_hypothesis → seeds hypothesis_registry
  - schedule_research → queues research topic for next autoresearch cycle
  - investigate → logs to operator_issues for Hermes attention
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

from loguru import logger as log
from sqlalchemy import text as sa_text
from sqlalchemy.engine import Engine


# ── Spam patterns: emails FROM allowlisted senders that are still noise ──

_SPAM_SUBJECT_PATTERNS = [
    r"\[GRID WARNING\]",           # our own outbound alerts
    r"\[GRID\]",                   # our own outbound emails
    r"GRID Intelligence",          # our own digests
    r"GRID Daily Digest",           # our own daily digest
    r"Security alert",             # Google security
    r"Verify.*Email.*Routing",     # Cloudflare verification
    r"Sign-in.*attempt",           # Google sign-in
    r"Critical security alert",    # Google security
    r"New sign-in",                # Google sign-in
    r"Review blocked sign-in",     # Google sign-in
    r"Action required",            # account maintenance
]

_SPAM_SENDER_PATTERNS = [
    r"no-reply@.*google\.com",
    r"noreply@.*cloudflare\.com",
    r"noreply@.*github\.com",
    r"notifications@.*github\.com",
    r"grid-alerts@",               # our own alert sender
]

# ── Note patterns: FYI content that doesn't need full LLM analysis ──

_NOTE_SUBJECT_PATTERNS = [
    r"^FYI[:\s]",
    r"^Note[:\s]",
    r"^Heads up[:\s]",
    r"^Quick note",
    r"^Reminder[:\s]",
]


class HermesEmailSupervisor:
    """Fast triage layer for inbound emails. No LLM calls."""

    def __init__(self, db_engine: Engine) -> None:
        self.engine = db_engine

    def triage(self, msg_id: int) -> str:
        """Classify a pending email as spam, note, or actionable.

        Args:
            msg_id: Row ID in hermes_inbox.

        Returns:
            str: 'spam', 'note', or 'actionable'
        """
        msg = self._fetch_message(msg_id)
        if msg is None:
            return "spam"

        subject = msg["subject"] or ""
        from_addr = msg["from_address"] or ""
        body = msg["body_text"] or ""

        # Check spam patterns first
        for pattern in _SPAM_SUBJECT_PATTERNS:
            if re.search(pattern, subject, re.IGNORECASE):
                self._mark_spam(msg_id, f"subject matched: {pattern}")
                return "spam"

        for pattern in _SPAM_SENDER_PATTERNS:
            if re.search(pattern, from_addr, re.IGNORECASE):
                self._mark_spam(msg_id, f"sender matched: {pattern}")
                return "spam"

        # Check if body is mostly HTML (automated email)
        if body and len(body) > 200:
            html_ratio = body.count("<") / max(len(body), 1)
            if html_ratio > 0.05:  # more than 5% angle brackets = HTML template
                self._mark_spam(msg_id, "body appears to be HTML template")
                return "spam"

        # Check note patterns
        for pattern in _NOTE_SUBJECT_PATTERNS:
            if re.search(pattern, subject, re.IGNORECASE):
                self._mark_note(msg_id, subject, body)
                return "note"

        # Short emails without urgency markers are likely notes
        if len(body.strip()) < 100 and not any(
            w in body.lower() for w in ["urgent", "asap", "immediately", "action", "buy", "sell", "short", "long"]
        ):
            # Still process through LLM but flag as likely note
            pass

        return "actionable"

    def triage_batch(self) -> dict[str, int]:
        """Triage all pending emails. Returns counts by category."""
        counts = {"spam": 0, "note": 0, "actionable": 0}

        try:
            with self.engine.connect() as conn:
                rows = conn.execute(
                    sa_text(
                        "SELECT id FROM hermes_inbox "
                        "WHERE status = 'pending' "
                        "ORDER BY received_at ASC"
                    )
                ).fetchall()
        except Exception as exc:
            log.warning("Supervisor: failed to fetch pending: {e}", e=str(exc))
            return counts

        for (msg_id,) in rows:
            result = self.triage(msg_id)
            counts[result] += 1

        log.info(
            "Supervisor triage: {s} spam, {n} notes, {a} actionable",
            s=counts["spam"], n=counts["note"], a=counts["actionable"],
        )
        return counts

    def execute_triggers(self, msg_id: int) -> list[str]:
        """Execute post-processing event triggers for a processed email.

        Reads the hermes_response and action_items from a processed email
        and kicks off real system actions.

        Args:
            msg_id: Row ID of a processed email.

        Returns:
            list[str]: Actions taken.
        """
        msg = self._fetch_processed(msg_id)
        if msg is None:
            return []

        actions_taken = []
        response = msg.get("hermes_response", "")
        action_items = msg.get("action_items") or []
        tickers = msg.get("tickers_mentioned") or []
        summary = msg.get("summary", "")
        subject = msg.get("subject", "")

        # ── Trigger: add_to_watchlist ──
        if response == "add_to_watchlist" and tickers:
            for ticker in tickers:
                self._add_to_watchlist(ticker, f"From email: {subject}")
                actions_taken.append(f"watchlist += {ticker}")

        # ── Trigger: create_hypothesis ──
        if response == "create_hypothesis":
            self._create_hypothesis(summary, tickers, subject)
            actions_taken.append(f"hypothesis created: {summary[:60]}")

        # ── Trigger: schedule_research ──
        if response == "schedule_research":
            self._schedule_research(summary, subject)
            actions_taken.append(f"research queued: {summary[:60]}")

        # ── Trigger: investigate ──
        if response == "investigate":
            self._log_operator_issue(subject, summary, "email_intel")
            actions_taken.append(f"operator issue logged: {subject[:60]}")

        # ── Process action items with tickers ──
        if isinstance(action_items, str):
            try:
                action_items = json.loads(action_items)
            except (json.JSONDecodeError, TypeError):
                action_items = []

        for item in action_items:
            if not isinstance(item, dict):
                continue
            action_text = item.get("action", "").lower()
            priority = item.get("priority", "medium")

            # Auto-detect watchlist additions in action items
            if "watchlist" in action_text or "watch" in action_text:
                for ticker in tickers:
                    if ticker not in [a.split()[-1] for a in actions_taken if "watchlist" in a]:
                        self._add_to_watchlist(ticker, action_text)
                        actions_taken.append(f"watchlist += {ticker}")

            # High-priority actions get logged as operator issues
            if priority == "high" and "investigate" not in response:
                self._log_operator_issue(
                    f"[EMAIL ACTION] {action_text}",
                    f"From: {subject}\nPriority: {priority}",
                    "email_action",
                )
                actions_taken.append(f"issue logged: {action_text[:40]}")

        if actions_taken:
            log.info(
                "Supervisor triggers for email #{id}: {actions}",
                id=msg_id, actions=", ".join(actions_taken),
            )

        return actions_taken

    # ── Internal helpers ──

    def _fetch_message(self, msg_id: int) -> dict[str, Any] | None:
        try:
            with self.engine.connect() as conn:
                row = conn.execute(
                    sa_text(
                        "SELECT id, from_address, subject, body_text, status "
                        "FROM hermes_inbox WHERE id = :id"
                    ),
                    {"id": msg_id},
                ).fetchone()
            if row:
                return {
                    "id": row[0], "from_address": row[1],
                    "subject": row[2], "body_text": row[3], "status": row[4],
                }
        except Exception:
            pass
        return None

    def _fetch_processed(self, msg_id: int) -> dict[str, Any] | None:
        try:
            with self.engine.connect() as conn:
                row = conn.execute(
                    sa_text(
                        "SELECT id, subject, summary, hermes_response, "
                        "action_items, tickers_mentioned "
                        "FROM hermes_inbox WHERE id = :id AND status = 'processed'"
                    ),
                    {"id": msg_id},
                ).fetchone()
            if row:
                return {
                    "id": row[0], "subject": row[1], "summary": row[2],
                    "hermes_response": row[3], "action_items": row[4],
                    "tickers_mentioned": row[5],
                }
        except Exception:
            pass
        return None

    def _mark_spam(self, msg_id: int, reason: str) -> None:
        try:
            with self.engine.begin() as conn:
                conn.execute(
                    sa_text(
                        "UPDATE hermes_inbox SET status = 'spam', "
                        "category = 'spam', summary = :reason, "
                        "processed_at = NOW() "
                        "WHERE id = :id"
                    ),
                    {"id": msg_id, "reason": f"Auto-classified: {reason}"},
                )
            log.debug("Supervisor: email #{id} → spam ({r})", id=msg_id, r=reason)
        except Exception:
            pass

    def _mark_note(self, msg_id: int, subject: str, body: str) -> None:
        """Store as a simple note — no LLM needed."""
        summary = body[:300].strip() if body else subject
        try:
            with self.engine.begin() as conn:
                conn.execute(
                    sa_text(
                        "UPDATE hermes_inbox SET status = 'processed', "
                        "category = 'note', summary = :summary, "
                        "sentiment = 'neutral', hermes_response = 'acknowledge', "
                        "processed_at = NOW() "
                        "WHERE id = :id"
                    ),
                    {"id": msg_id, "summary": summary},
                )
            log.info("Supervisor: email #{id} → note", id=msg_id)
        except Exception:
            pass

    def _add_to_watchlist(self, ticker: str, reason: str) -> None:
        """Add a ticker to the watchlist via the API pattern."""
        try:
            with self.engine.begin() as conn:
                conn.execute(
                    sa_text(
                        "INSERT INTO watchlist (ticker, added_by, notes, created_at) "
                        "VALUES (:ticker, 'hermes_email', :notes, NOW()) "
                        "ON CONFLICT (ticker) DO UPDATE SET "
                        "notes = watchlist.notes || ' | ' || :notes"
                    ),
                    {"ticker": ticker.upper(), "notes": reason[:200]},
                )
            log.info("Supervisor: added {t} to watchlist", t=ticker)
        except Exception as exc:
            # Table might not exist or have different schema — log and continue
            log.debug("Supervisor: watchlist insert failed for {t}: {e}", t=ticker, e=str(exc))

    def _create_hypothesis(self, summary: str, tickers: list, source_subject: str) -> None:
        """Seed a hypothesis into the registry."""
        statement = f"Email-sourced: {summary}"
        try:
            with self.engine.begin() as conn:
                conn.execute(
                    sa_text(
                        "INSERT INTO hypothesis_registry "
                        "(statement, state, category, source, created_at) "
                        "VALUES (:statement, 'CANDIDATE', 'EMAIL_SOURCED', "
                        ":source, NOW()) "
                        "ON CONFLICT DO NOTHING"
                    ),
                    {
                        "statement": statement[:500],
                        "source": f"hermes_email: {source_subject[:100]}",
                    },
                )
            log.info("Supervisor: created hypothesis from email")
        except Exception as exc:
            log.debug("Supervisor: hypothesis insert failed: {e}", e=str(exc))

    def _schedule_research(self, topic: str, source_subject: str) -> None:
        """Queue a research topic as an operator issue for the next autoresearch cycle."""
        self._log_operator_issue(
            f"[RESEARCH REQUEST] {topic[:200]}",
            f"Source: email '{source_subject}'\nQueued for next autoresearch cycle.",
            "research_request",
        )

    def _log_operator_issue(self, title: str, detail: str, category: str) -> None:
        """Log an issue to the operator_issues table."""
        try:
            with self.engine.begin() as conn:
                conn.execute(
                    sa_text(
                        "INSERT INTO operator_issues "
                        "(category, severity, title, detail, source, created_at) "
                        "VALUES (:category, 'INFO', :title, :detail, "
                        "'hermes_email', NOW())"
                    ),
                    {
                        "category": category,
                        "title": title[:300],
                        "detail": detail[:2000],
                    },
                )
        except Exception as exc:
            log.debug("Supervisor: issue insert failed: {e}", e=str(exc))

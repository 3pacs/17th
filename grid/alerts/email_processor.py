"""
GRID Hermes — LLM email processor.

Processes inbound emails stored in hermes_inbox through the local LLM
to extract intelligence: categories, summaries, action items, tickers,
sentiment, and response plans.

Uses the existing OllamaClient / LlamaCppClient pattern — no new
dependencies.
"""

from __future__ import annotations

import json
import traceback
from datetime import datetime, timezone
from typing import Any

from loguru import logger as log
from sqlalchemy import text as sa_text
from sqlalchemy.engine import Engine


# JSON schema description embedded in the prompt so the LLM knows
# exactly what structure to return.
_JSON_SCHEMA = """\
{
  "category": "news | instruction | update | research | question",
  "summary": "1-2 sentence summary of the email content",
  "action_items": [
    {"action": "what to do", "priority": "high | medium | low", "status": "pending"}
  ],
  "notes": [
    {"topic": "subject area", "content": "extracted intel", "relevance": "high | medium | low"}
  ],
  "plans": [
    {"goal": "what to investigate/build/change", "steps": ["step1", "step2"], "timeline": "timeframe"}
  ],
  "sentiment": "bullish | bearish | neutral | urgent",
  "tickers_mentioned": ["SPY", "BTC", "..."],
  "hermes_response": "acknowledge | investigate | add_to_watchlist | create_hypothesis | schedule_research | ignore"
}"""


class HermesEmailProcessor:
    """Processes pending inbound emails through the local LLM."""

    def __init__(self, db_engine: Engine, llm_client: Any | None = None) -> None:
        """Initialize the processor.

        Args:
            db_engine: SQLAlchemy engine for database access.
            llm_client: LLM client instance (OllamaClient or LlamaCppClient).
                If None, will be auto-resolved via get_client().
        """
        self.engine = db_engine
        self.llm = llm_client

    def _get_llm(self) -> Any:
        """Lazily resolve the LLM client."""
        if self.llm is None:
            from ollama.client import get_client
            self.llm = get_client()
        return self.llm

    def process_pending(self) -> int:
        """Process all pending emails through the LLM.

        Returns:
            int: Number of emails successfully processed.
        """
        pending = self._fetch_pending()
        if not pending:
            log.debug("Hermes processor: no pending emails")
            return 0

        log.info("Hermes processor: {n} pending emails to process", n=len(pending))
        processed = 0

        for msg in pending:
            try:
                self._process_one(msg)
                processed += 1
            except Exception as exc:
                log.warning(
                    "Hermes processor: failed to process email #{id}: {e}",
                    id=msg["id"], e=str(exc),
                )
                # Mark as error so we don't retry forever
                self._mark_error(msg["id"], str(exc))

        log.info(
            "Hermes processor: {ok}/{total} emails processed",
            ok=processed, total=len(pending),
        )
        return processed

    def _fetch_pending(self) -> list[dict[str, Any]]:
        """Fetch all emails with status='pending'."""
        try:
            with self.engine.connect() as conn:
                rows = conn.execute(
                    sa_text(
                        "SELECT id, from_address, subject, body_text, body_html "
                        "FROM hermes_inbox "
                        "WHERE status = 'pending' "
                        "ORDER BY received_at ASC "
                        "LIMIT 20"
                    )
                ).fetchall()
            return [
                {
                    "id": r[0],
                    "from_address": r[1],
                    "subject": r[2],
                    "body_text": r[3],
                    "body_html": r[4],
                }
                for r in rows
            ]
        except Exception as exc:
            log.warning("Hermes processor: failed to fetch pending: {e}", e=str(exc))
            return []

    def _process_one(self, msg: dict[str, Any]) -> None:
        """Process a single email through the LLM and store results.

        Args:
            msg: Dict with id, from_address, subject, body_text, body_html.
        """
        llm = self._get_llm()
        if not llm or not getattr(llm, "is_available", False):
            log.warning("Hermes processor: LLM not available, skipping")
            return

        prompt = self._build_prompt(msg)
        raw_response = llm.generate(
            prompt=prompt,
            system=(
                "You are Hermes, the autonomous intelligence daemon for GRID — "
                "a quantitative intelligence platform. The operator has emailed you "
                "with information. Your job is to extract actionable intelligence "
                "and return a structured JSON response. Return ONLY valid JSON, "
                "no markdown fences, no explanation."
            ),
            temperature=0.2,
            num_predict=2000,
        )

        if not raw_response:
            log.warning(
                "Hermes processor: LLM returned empty response for email #{id}",
                id=msg["id"],
            )
            return

        # Parse JSON from LLM response
        parsed = self._parse_llm_response(raw_response)
        if parsed is None:
            log.warning(
                "Hermes processor: could not parse LLM JSON for email #{id}",
                id=msg["id"],
            )
            # Still mark as processed but with partial data
            parsed = {
                "category": "unknown",
                "summary": raw_response[:200],
                "hermes_response": "acknowledge",
            }

        # Store results
        self._update_message(msg["id"], parsed)
        log.info(
            "Hermes processor: email #{id} — category={cat}, sentiment={sent}, "
            "tickers={tickers}, response={resp}",
            id=msg["id"],
            cat=parsed.get("category", "?"),
            sent=parsed.get("sentiment", "?"),
            tickers=parsed.get("tickers_mentioned", []),
            resp=parsed.get("hermes_response", "?"),
        )

    def _build_prompt(self, msg: dict[str, Any]) -> str:
        """Build the LLM prompt for email analysis.

        Args:
            msg: Email dict with from_address, subject, body_text.

        Returns:
            str: Complete prompt string.
        """
        # Truncate body to avoid exceeding context window
        body = (msg.get("body_text") or "")[:4000]

        return f"""Analyze this email sent to the GRID intelligence platform and extract structured intelligence.

FROM: {msg['from_address']}
SUBJECT: {msg['subject']}
BODY:
{body}

Return your analysis as a JSON object with EXACTLY this schema:
{_JSON_SCHEMA}

Rules:
- category MUST be one of: news, instruction, update, research, question
- sentiment MUST be one of: bullish, bearish, neutral, urgent
- hermes_response MUST be one of: acknowledge, investigate, add_to_watchlist, create_hypothesis, schedule_research, ignore
- tickers_mentioned should be uppercase stock/crypto ticker symbols (e.g. SPY, BTC, ETH, AAPL)
- action_items, notes, and plans can be empty arrays if not applicable
- summary should be 1-2 concise sentences
- Return ONLY the JSON object, nothing else"""

    def _parse_llm_response(self, raw: str) -> dict[str, Any] | None:
        """Parse the LLM's JSON response, handling common formatting issues.

        Args:
            raw: Raw text from the LLM.

        Returns:
            dict: Parsed JSON object, or None if parsing fails.
        """
        text = raw.strip()

        # Strip markdown code fences if present
        if text.startswith("```"):
            lines = text.split("\n")
            # Remove first and last lines (fences)
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            text = "\n".join(lines)

        # Find the JSON object boundaries
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None

        json_str = text[start : end + 1]

        try:
            data = json.loads(json_str)
            if not isinstance(data, dict):
                return None

            # Validate and normalize required fields
            valid_categories = {"news", "instruction", "update", "research", "question"}
            valid_sentiments = {"bullish", "bearish", "neutral", "urgent"}
            valid_responses = {
                "acknowledge", "investigate", "add_to_watchlist",
                "create_hypothesis", "schedule_research", "ignore",
            }

            if data.get("category") not in valid_categories:
                data["category"] = "update"
            if data.get("sentiment") not in valid_sentiments:
                data["sentiment"] = "neutral"
            if data.get("hermes_response") not in valid_responses:
                data["hermes_response"] = "acknowledge"

            # Ensure lists are lists
            for key in ("action_items", "notes", "plans", "tickers_mentioned"):
                if not isinstance(data.get(key), list):
                    data[key] = []

            # Ensure tickers are uppercase strings
            data["tickers_mentioned"] = [
                str(t).upper()
                for t in data["tickers_mentioned"]
                if t and isinstance(t, str)
            ]

            return data

        except (json.JSONDecodeError, TypeError):
            return None

    def _update_message(self, msg_id: int, parsed: dict[str, Any]) -> None:
        """Update hermes_inbox row with LLM processing results.

        Args:
            msg_id: Row ID in hermes_inbox.
            parsed: Parsed LLM analysis dict.
        """
        try:
            with self.engine.begin() as conn:
                conn.execute(
                    sa_text(
                        "UPDATE hermes_inbox SET "
                        "  processed_at = NOW(), "
                        "  category = :category, "
                        "  summary = :summary, "
                        "  action_items = :action_items, "
                        "  notes = :notes, "
                        "  plans = :plans, "
                        "  sentiment = :sentiment, "
                        "  tickers_mentioned = :tickers, "
                        "  hermes_response = :response, "
                        "  status = 'processed' "
                        "WHERE id = :id"
                    ),
                    {
                        "id": msg_id,
                        "category": parsed.get("category", "update"),
                        "summary": parsed.get("summary", ""),
                        "action_items": json.dumps(parsed.get("action_items", [])),
                        "notes": json.dumps(parsed.get("notes", [])),
                        "plans": json.dumps(parsed.get("plans", [])),
                        "sentiment": parsed.get("sentiment", "neutral"),
                        "tickers": parsed.get("tickers_mentioned", []),
                        "response": parsed.get("hermes_response", "acknowledge"),
                    },
                )
        except Exception as exc:
            log.warning(
                "Hermes processor: failed to update email #{id}: {e}",
                id=msg_id, e=str(exc),
            )

    def _mark_error(self, msg_id: int, error: str) -> None:
        """Mark an email as having a processing error.

        Keeps status='pending' but logs the error in hermes_response so it
        can be retried later with a different LLM or prompt.

        Args:
            msg_id: Row ID in hermes_inbox.
            error: Error description.
        """
        try:
            with self.engine.begin() as conn:
                conn.execute(
                    sa_text(
                        "UPDATE hermes_inbox SET "
                        "  hermes_response = :error "
                        "WHERE id = :id AND status = 'pending'"
                    ),
                    {"id": msg_id, "error": f"PROCESSING_ERROR: {error[:500]}"},
                )
        except Exception:
            pass

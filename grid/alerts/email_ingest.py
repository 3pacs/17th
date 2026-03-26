"""
GRID Hermes — Inbound email ingestion via Gmail IMAP.

Polls Gmail for emails sent to hermes@stepdad.finance, validates
sender against allowlist, and stores them in the hermes_inbox table
for LLM processing. Rejected senders are logged but never processed.

Uses Python stdlib imaplib + email — no external dependencies.
"""

from __future__ import annotations

import email
import imaplib
import re
from datetime import datetime, timezone
from email.header import decode_header
from email.utils import parseaddr
from typing import Any

from loguru import logger as log
from sqlalchemy import text as sa_text
from sqlalchemy.engine import Engine


class HermesEmailIngest:
    """Polls Gmail IMAP for new emails and stores them in hermes_inbox."""

    def __init__(self, db_engine: Engine) -> None:
        self.engine = db_engine
        self._load_config()

    def _load_config(self) -> None:
        """Load IMAP credentials and allowlist from config."""
        from config import settings

        self.imap_host = settings.HERMES_EMAIL_IMAP_HOST
        self.imap_port = settings.HERMES_EMAIL_IMAP_PORT
        # Reuse existing Gmail SMTP credentials for IMAP
        self.imap_user = settings.ALERT_SMTP_USER
        self.imap_password = settings.ALERT_SMTP_PASSWORD
        self.enabled = settings.HERMES_EMAIL_ENABLED

        # Parse comma-separated allowlist
        raw = settings.HERMES_EMAIL_ALLOWLIST
        self.sender_allowlist = [
            addr.strip().lower()
            for addr in raw.split(",")
            if addr.strip()
        ]

    def poll(self) -> list[dict[str, Any]]:
        """Check Gmail for new unread emails. Returns list of stored messages.

        Connects via IMAP SSL, fetches UNSEEN messages, validates sender,
        stores allowed messages, marks all as read. Rejects are stored with
        status='rejected'. Duplicates are silently skipped.

        Returns:
            list[dict]: Successfully stored message dicts (id, from, subject).
        """
        if not self.enabled:
            log.debug("Hermes email ingest disabled — skipping poll")
            return []

        if not self.imap_user or not self.imap_password:
            log.warning("Hermes email ingest: no IMAP credentials configured")
            return []

        self._ensure_table()

        conn: imaplib.IMAP4_SSL | None = None
        stored: list[dict[str, Any]] = []

        try:
            conn = imaplib.IMAP4_SSL(self.imap_host, self.imap_port)
            conn.login(self.imap_user, self.imap_password)
            conn.select("INBOX")

            # Search for unread messages
            status, data = conn.search(None, "UNSEEN")
            if status != "OK" or not data[0]:
                log.debug("Hermes inbox: no new emails")
                return []

            msg_nums = data[0].split()
            log.info("Hermes inbox: {n} unread emails to process", n=len(msg_nums))

            for num in msg_nums:
                try:
                    status, msg_data = conn.fetch(num, "(RFC822)")
                    if status != "OK" or not msg_data[0]:
                        continue

                    raw_email = msg_data[0][1]
                    msg = email.message_from_bytes(raw_email)
                    parsed = self._parse_email(msg)

                    if not parsed:
                        continue

                    # Check sender allowlist
                    if not self._is_allowed_sender(parsed["from_address"]):
                        log.warning(
                            "Hermes inbox: rejected sender {s} — not on allowlist",
                            s=parsed["from_address"],
                        )
                        self._store_message(parsed, status_override="rejected")
                        continue

                    row_id = self._store_message(parsed)
                    if row_id is not None:
                        stored.append({
                            "id": row_id,
                            "from": parsed["from_address"],
                            "subject": parsed["subject"],
                        })
                        log.info(
                            "Hermes inbox: stored email #{id} from {f}: {s}",
                            id=row_id,
                            f=parsed["from_address"],
                            s=parsed["subject"][:60],
                        )

                except Exception as exc:
                    log.warning(
                        "Hermes inbox: failed to process message {n}: {e}",
                        n=num, e=str(exc),
                    )

        except imaplib.IMAP4.error as exc:
            log.error("Hermes IMAP error: {e}", e=str(exc))
        except Exception as exc:
            log.error("Hermes email poll failed: {e}", e=str(exc))
        finally:
            if conn is not None:
                try:
                    conn.close()
                    conn.logout()
                except Exception:
                    pass

        if stored:
            log.info("Hermes inbox: {n} new emails stored", n=len(stored))
        return stored

    def _is_allowed_sender(self, from_addr: str) -> bool:
        """Check if sender is on the allowlist.

        Extracts the email address from formats like 'Name <email@example.com>'
        and checks against the allowlist (case-insensitive).

        Args:
            from_addr: The From header value.

        Returns:
            bool: True if sender is allowed.
        """
        _, addr = parseaddr(from_addr)
        addr = addr.strip().lower()
        return addr in self.sender_allowlist

    def _parse_email(self, msg: email.message.Message) -> dict[str, Any] | None:
        """Extract structured fields from an email.message.Message.

        Args:
            msg: Parsed email message object.

        Returns:
            dict with keys: from_address, subject, body_text, body_html,
            message_id, thread_id. Or None if parsing fails.
        """
        try:
            # Decode subject
            subject_parts = decode_header(msg.get("Subject", ""))
            subject = ""
            for part, charset in subject_parts:
                if isinstance(part, bytes):
                    subject += part.decode(charset or "utf-8", errors="replace")
                else:
                    subject += part

            from_addr = msg.get("From", "")
            message_id = msg.get("Message-ID", "")
            # Gmail uses X-GM-THRID for thread ID, but it's not in standard headers.
            # Use In-Reply-To or References as thread grouping.
            thread_id = msg.get("X-GM-THRID", "") or msg.get("In-Reply-To", "")

            # Extract body
            body_text = ""
            body_html = None

            if msg.is_multipart():
                for part in msg.walk():
                    content_type = part.get_content_type()
                    content_disposition = str(part.get("Content-Disposition", ""))

                    # Skip attachments
                    if "attachment" in content_disposition:
                        continue

                    payload = part.get_payload(decode=True)
                    if payload is None:
                        continue

                    charset = part.get_content_charset() or "utf-8"
                    decoded = payload.decode(charset, errors="replace")

                    if content_type == "text/plain" and not body_text:
                        body_text = decoded
                    elif content_type == "text/html" and body_html is None:
                        body_html = decoded
            else:
                payload = msg.get_payload(decode=True)
                if payload:
                    charset = msg.get_content_charset() or "utf-8"
                    body_text = payload.decode(charset, errors="replace")

            if not body_text and body_html:
                # Strip HTML tags as fallback for plain text
                body_text = re.sub(r"<[^>]+>", " ", body_html)
                body_text = re.sub(r"\s+", " ", body_text).strip()

            return {
                "from_address": from_addr,
                "subject": subject or "(no subject)",
                "body_text": body_text or "",
                "body_html": body_html,
                "message_id": message_id or None,
                "thread_id": thread_id or None,
            }

        except Exception as exc:
            log.warning("Failed to parse email: {e}", e=str(exc))
            return None

    def _store_message(
        self,
        parsed: dict[str, Any],
        status_override: str | None = None,
    ) -> int | None:
        """Insert a parsed email into hermes_inbox.

        Uses message_id for dedup — duplicate messages are silently skipped
        (returns None).

        Args:
            parsed: Dict with from_address, subject, body_text, etc.
            status_override: Override the default 'pending' status (e.g. 'rejected').

        Returns:
            int: The row ID of the inserted message, or None if skipped/failed.
        """
        status = status_override or "pending"
        try:
            with self.engine.begin() as conn:
                row = conn.execute(
                    sa_text(
                        "INSERT INTO hermes_inbox "
                        "(from_address, subject, body_text, body_html, "
                        " message_id, thread_id, status) "
                        "VALUES (:from_addr, :subject, :body_text, :body_html, "
                        " :message_id, :thread_id, :status) "
                        "ON CONFLICT (message_id) DO NOTHING "
                        "RETURNING id"
                    ),
                    {
                        "from_addr": parsed["from_address"],
                        "subject": parsed["subject"],
                        "body_text": parsed["body_text"],
                        "body_html": parsed["body_html"],
                        "message_id": parsed["message_id"],
                        "thread_id": parsed["thread_id"],
                        "status": status,
                    },
                ).fetchone()
            return row[0] if row else None
        except Exception as exc:
            log.warning("Failed to store email: {e}", e=str(exc))
            return None

    def _ensure_table(self) -> None:
        """Create the hermes_inbox table if it does not exist."""
        ddl = sa_text("""
            CREATE TABLE IF NOT EXISTS hermes_inbox (
                id                BIGSERIAL PRIMARY KEY,
                received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                from_address      TEXT NOT NULL,
                subject           TEXT NOT NULL,
                body_text         TEXT NOT NULL,
                body_html         TEXT,
                message_id        TEXT UNIQUE,
                thread_id         TEXT,
                processed_at      TIMESTAMPTZ,
                category          TEXT,
                summary           TEXT,
                action_items      JSONB,
                notes             JSONB,
                plans             JSONB,
                sentiment         TEXT,
                tickers_mentioned TEXT[],
                hermes_response   TEXT,
                status            TEXT NOT NULL DEFAULT 'pending'
            )
        """)
        idx1 = sa_text(
            "CREATE INDEX IF NOT EXISTS idx_hermes_inbox_received "
            "ON hermes_inbox(received_at DESC)"
        )
        idx2 = sa_text(
            "CREATE INDEX IF NOT EXISTS idx_hermes_inbox_status "
            "ON hermes_inbox(status)"
        )
        idx3 = sa_text(
            "CREATE INDEX IF NOT EXISTS idx_hermes_inbox_category "
            "ON hermes_inbox(category)"
        )
        try:
            with self.engine.begin() as conn:
                conn.execute(ddl)
                conn.execute(idx1)
                conn.execute(idx2)
                conn.execute(idx3)
        except Exception as exc:
            log.warning("Could not ensure hermes_inbox table: {e}", e=str(exc))

"""End-User / Implant traceability — Portal-native, stored in portal.db
alongside offers / portal_users / inventory.

Recording a usage is the ONLY way distributor stock goes down (see
inventory_service — there is no manual "subtract" path). Each record
carries doctor / hospital / location / batch / implantation date; post-op
feedback (notes, satisfaction, complication flag) is optional at creation
and can be filled in later via the feedback PATCH. No patient-identity
field is ever captured or stored.

create_record decrements distributor_inventory and inserts the record in
one transaction — both land or neither does, and the stock check is the
`quantity >= ?` predicate on the UPDATE itself (atomic under SQLite's
write lock), not a read-then-write.
"""

import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from . import inventory_service
from .config import settings

_DB_PATH = Path(__file__).resolve().parent.parent / settings.portal_db_path

# Only these three are editable after creation (the feedback PATCH).
_FEEDBACK_FIELDS = ("feedback_notes", "satisfaction_rating", "complication")


class InsufficientInventoryError(Exception):
    """Requested quantity exceeds what this distributor currently holds."""

    def __init__(self, available: int) -> None:
        self.available = available
        super().__init__(f"Only {available} in stock for this item")


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_db() -> None:
    with _get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS end_user_records (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id         TEXT    NOT NULL,
                item_code           TEXT    NOT NULL,
                quantity            INTEGER NOT NULL,
                doctor_name         TEXT    NOT NULL,
                hospital_name       TEXT    NOT NULL,
                location            TEXT    NOT NULL,
                batch_id            TEXT    NOT NULL,
                implantation_date   TEXT    NOT NULL,
                feedback_notes      TEXT,
                satisfaction_rating INTEGER,
                complication        INTEGER NOT NULL DEFAULT 0,
                created_at          TEXT    NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_eur_customer ON end_user_records (customer_id)"
        )


init_db()


def _record_out(row: sqlite3.Row, item_names: dict[str, str]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "record_id": f"EUR-{row['id']:04d}",
        "item_code": row["item_code"],
        "item_name": item_names.get(row["item_code"], row["item_code"]),
        "quantity": row["quantity"],
        "doctor_name": row["doctor_name"],
        "hospital_name": row["hospital_name"],
        "location": row["location"],
        "batch_id": row["batch_id"],
        "implantation_date": row["implantation_date"],
        "feedback_notes": row["feedback_notes"],
        "satisfaction_rating": row["satisfaction_rating"],
        "complication": bool(row["complication"]),
        "has_feedback": bool(
            row["feedback_notes"] or row["satisfaction_rating"] is not None or row["complication"]
        ),
        "created_at": row["created_at"],
    }


def create_record(
    customer_id: str,
    *,
    item_code: str,
    quantity: int,
    doctor_name: str,
    hospital_name: str,
    location: str,
    batch_id: str,
    implantation_date: date,
    feedback_notes: str | None = None,
    satisfaction_rating: int | None = None,
    complication: bool = False,
) -> int:
    """Decrement inventory + insert the record, atomically. Raises
    InsufficientInventoryError (→ 409) if the distributor doesn't hold
    `quantity` of `item_code`."""
    if quantity <= 0:
        raise InsufficientInventoryError(available=0)

    now = _now()
    conn = _get_conn()
    try:
        with conn:  # ── BEGIN … COMMIT, or ROLLBACK on any exception ──
            # (1) Decrement, with the availability check IN the WHERE clause so
            #     it's atomic under the write lock — no read-then-write race.
            cur = conn.execute(
                """
                UPDATE distributor_inventory
                   SET quantity = quantity - ?, updated_at = ?
                 WHERE customer_id = ? AND item_code = ? AND quantity >= ?
                """,
                (quantity, now, customer_id, item_code, quantity),
            )
            if cur.rowcount != 1:
                have = conn.execute(
                    "SELECT quantity FROM distributor_inventory WHERE customer_id = ? AND item_code = ?",
                    (customer_id, item_code),
                ).fetchone()
                raise InsufficientInventoryError(available=have["quantity"] if have else 0)

            # (2) Insert the record — same transaction.
            record_id = conn.execute(
                """
                INSERT INTO end_user_records
                    (customer_id, item_code, quantity, doctor_name, hospital_name, location,
                     batch_id, implantation_date, feedback_notes, satisfaction_rating,
                     complication, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    customer_id,
                    item_code,
                    quantity,
                    doctor_name,
                    hospital_name,
                    location,
                    batch_id,
                    implantation_date.isoformat(),
                    feedback_notes,
                    satisfaction_rating,
                    int(complication),
                    now,
                ),
            ).lastrowid
    finally:
        conn.close()
    return record_id


def update_feedback(
    customer_id: str,
    record_id: int,
    *,
    feedback_notes: str | None,
    satisfaction_rating: int | None,
    complication: bool,
) -> bool:
    """Update only the three feedback columns. Returns False if the record
    doesn't exist or isn't this distributor's (→ 404). No inventory effect."""
    with _get_conn() as conn:
        cur = conn.execute(
            """
            UPDATE end_user_records
               SET feedback_notes = ?, satisfaction_rating = ?, complication = ?
             WHERE id = ? AND customer_id = ?
            """,
            (feedback_notes, satisfaction_rating, int(complication), record_id, customer_id),
        )
    return cur.rowcount == 1


def _stats(conn: sqlite3.Connection, customer_id: str) -> dict[str, Any]:
    scalars = conn.execute(
        """
        SELECT COUNT(*)                                          AS total_records,
               AVG(satisfaction_rating)                          AS avg_satisfaction,
               SUM(CASE WHEN complication = 1 THEN 1 ELSE 0 END) AS complication_alerts
        FROM end_user_records
        WHERE customer_id = ?
        """,
        (customer_id,),
    ).fetchone()
    top = conn.execute(
        """
        SELECT hospital_name, COUNT(*) AS n
        FROM end_user_records
        WHERE customer_id = ?
        GROUP BY hospital_name
        ORDER BY n DESC, hospital_name ASC
        LIMIT 1
        """,
        (customer_id,),
    ).fetchone()
    return {
        "total_records": scalars["total_records"] or 0,
        "top_hospital": top["hospital_name"] if top else None,
        "top_hospital_count": top["n"] if top else 0,
        "avg_satisfaction": round(scalars["avg_satisfaction"], 1)
        if scalars["avg_satisfaction"] is not None
        else None,
        "complication_alerts": scalars["complication_alerts"] or 0,
    }


async def get_record(customer_id: str, record_id: int) -> dict[str, Any] | None:
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM end_user_records WHERE id = ? AND customer_id = ?", (record_id, customer_id)
        ).fetchone()
    if row is None:
        return None
    meta = await inventory_service.item_meta([row["item_code"]])
    names = {row["item_code"]: (meta.get(row["item_code"], {}).get("item_name") or row["item_code"])}
    return _record_out(row, names)


async def list_records(
    customer_id: str,
    *,
    search: str | None = None,
    rating: str | None = None,  # "5" | "complications" | None/"all"
) -> dict[str, Any]:
    """Filtered `items` + `stats` (stats always over the full unfiltered set,
    so the KPI cards don't change when the list is filtered)."""
    clauses = ["customer_id = ?"]
    params: list[Any] = [customer_id]
    if search:
        like = f"%{search}%"
        clauses.append(
            "(doctor_name LIKE ? OR hospital_name LIKE ? OR batch_id LIKE ? "
            "OR ('EUR-' || printf('%04d', id)) LIKE ?)"
        )
        params += [like, like, like, like]
    if rating == "5":
        clauses.append("satisfaction_rating = 5")
    elif rating == "complications":
        clauses.append("complication = 1")

    with _get_conn() as conn:
        rows = conn.execute(
            f"SELECT * FROM end_user_records WHERE {' AND '.join(clauses)} ORDER BY id DESC",
            params,
        ).fetchall()
        stats = _stats(conn, customer_id)

    item_names = {
        code: (meta.get("item_name") or code)
        for code, meta in (await inventory_service.item_meta([r["item_code"] for r in rows])).items()
    }
    return {
        "items": [_record_out(r, item_names) for r in rows],
        "stats": stats,
    }

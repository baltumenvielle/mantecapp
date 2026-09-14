import os

import psycopg
from psycopg.rows import dict_row

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SCHEMA_PATH = os.path.join(BASE_DIR, "schema.sql")

DEFAULT_SETTINGS = {
    "price_multipliers": "2,2.5,3",
}


def _dsn():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "Falta la variable de entorno DATABASE_URL (cadena de conexión a Postgres)."
        )
    # Some providers hand out "postgres://"; psycopg wants "postgresql://".
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    return url


def get_connection():
    return psycopg.connect(_dsn(), row_factory=dict_row)


def init_db():
    conn = get_connection()
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        conn.execute(f.read())
    for key, value in DEFAULT_SETTINGS.items():
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (%s, %s) ON CONFLICT (key) DO NOTHING",
            (key, value),
        )
    conn.commit()
    conn.close()


def to_iso(value):
    """Serialize a date/datetime value returned by psycopg to an ISO string."""
    return value.isoformat() if hasattr(value, "isoformat") else value


def ingredient_unit_cost(row):
    """Cost per single base unit (per gram, per ml, or per unidad)."""
    if row["package_quantity"] in (None, 0):
        return 0.0
    return row["package_price"] / row["package_quantity"]


def cake_cost(conn, cake_id):
    """Total cost to produce one of this cake, from current ingredient prices."""
    cake = conn.execute("SELECT * FROM cakes WHERE id = %s", (cake_id,)).fetchone()
    if cake is None:
        return None
    rows = conn.execute(
        """
        SELECT ci.quantity AS quantity, i.package_price AS package_price,
               i.package_quantity AS package_quantity
        FROM cake_ingredients ci
        JOIN ingredients i ON i.id = ci.ingredient_id
        WHERE ci.cake_id = %s
        """,
        (cake_id,),
    ).fetchall()
    total = cake["extra_cost"]
    for r in rows:
        unit_cost = ingredient_unit_cost(r)
        total += unit_cost * r["quantity"]
    return total

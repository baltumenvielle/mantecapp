from datetime import date

import psycopg
from flask import Blueprint, jsonify, request

from db import get_connection, cake_cost, to_iso

bp = Blueprint("sales", __name__, url_prefix="/api/sales")


def serialize(row):
    d = dict(row)
    d["sale_date"] = to_iso(d["sale_date"])
    d["created_at"] = to_iso(d["created_at"])
    d["total_revenue"] = round(row["quantity"] * row["unit_price"], 2)
    d["total_cost"] = round(row["quantity"] * row["unit_cost_snapshot"], 2)
    d["profit"] = round(d["total_revenue"] - d["total_cost"], 2)
    return d


@bp.get("")
def list_sales():
    conn = get_connection()
    date_from = request.args.get("from")
    date_to = request.args.get("to")
    cake_id = request.args.get("cake_id")

    query = """
        SELECT s.*, c.name AS cake_name
        FROM sales s
        JOIN cakes c ON c.id = s.cake_id
        WHERE 1 = 1
    """
    params = []
    if date_from:
        query += " AND s.sale_date >= %s"
        params.append(date_from)
    if date_to:
        query += " AND s.sale_date <= %s"
        params.append(date_to)
    if cake_id:
        query += " AND s.cake_id = %s"
        params.append(cake_id)
    query += " ORDER BY s.sale_date DESC, s.id DESC"

    rows = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([serialize(r) for r in rows])


@bp.post("")
def create_sale():
    body = request.get_json(force=True) or {}
    cake_id = body.get("cake_id")
    try:
        quantity = int(body.get("quantity"))
    except (TypeError, ValueError):
        return jsonify({"error": "La cantidad debe ser un número entero."}), 400
    if quantity <= 0:
        return jsonify({"error": "La cantidad debe ser mayor a 0."}), 400

    sale_date = body.get("sale_date") or date.today().isoformat()

    conn = get_connection()
    cake = conn.execute("SELECT * FROM cakes WHERE id = %s", (cake_id,)).fetchone()
    if cake is None:
        conn.close()
        return jsonify({"error": "Torta no encontrada."}), 404

    computed_cost = cake_cost(conn, cake_id)
    try:
        unit_price = float(body.get("unit_price"))
    except (TypeError, ValueError):
        conn.close()
        return jsonify({"error": "El precio de venta debe ser numérico."}), 400
    if unit_price < 0:
        conn.close()
        return jsonify({"error": "El precio de venta no puede ser negativo."}), 400

    unit_cost_snapshot = body.get("unit_cost_snapshot")
    if unit_cost_snapshot is None:
        unit_cost_snapshot = computed_cost
    else:
        try:
            unit_cost_snapshot = float(unit_cost_snapshot)
        except (TypeError, ValueError):
            conn.close()
            return jsonify({"error": "El costo unitario debe ser numérico."}), 400

    notes = (body.get("notes") or "").strip() or None

    try:
        row = conn.execute(
            """
            INSERT INTO sales (cake_id, quantity, sale_date, unit_price, unit_cost_snapshot, notes)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (cake_id, quantity, sale_date, unit_price, unit_cost_snapshot, notes),
        ).fetchone()
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": str(e)}), 400

    row = conn.execute(
        "SELECT s.*, c.name AS cake_name FROM sales s JOIN cakes c ON c.id = s.cake_id WHERE s.id = %s",
        (row["id"],),
    ).fetchone()
    conn.close()
    return jsonify(serialize(row)), 201


@bp.delete("/<int:sale_id>")
def delete_sale(sale_id):
    conn = get_connection()
    conn.execute("DELETE FROM sales WHERE id = %s", (sale_id,))
    conn.commit()
    conn.close()
    return "", 204

from flask import Blueprint, jsonify, request
from datetime import datetime, timezone
import psycopg

from db import get_connection, ingredient_unit_cost, to_iso

bp = Blueprint("ingredients", __name__, url_prefix="/api/ingredients")

VALID_UNITS = {"g", "ml", "u"}


def serialize(row):
    d = dict(row)
    d["unit_cost"] = round(ingredient_unit_cost(row), 6)
    d["updated_at"] = to_iso(d["updated_at"])
    return d


@bp.get("")
def list_ingredients():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM ingredients ORDER BY name COLLATE \"C\"").fetchall()
    conn.close()
    return jsonify([serialize(r) for r in rows])


@bp.post("")
def create_ingredient():
    body = request.get_json(force=True) or {}
    name = (body.get("name") or "").strip()
    unit = body.get("unit")
    package_quantity = body.get("package_quantity")
    package_price = body.get("package_price", 0)
    note = (body.get("note") or "").strip() or None

    if not name:
        return jsonify({"error": "El nombre es obligatorio."}), 400
    if unit not in VALID_UNITS:
        return jsonify({"error": "Unidad inválida. Usá 'g', 'ml' o 'u'."}), 400
    try:
        package_quantity = float(package_quantity)
        package_price = float(package_price)
    except (TypeError, ValueError):
        return jsonify({"error": "Cantidad y precio deben ser numéricos."}), 400
    if package_quantity <= 0:
        return jsonify({"error": "La cantidad del paquete debe ser mayor a 0."}), 400
    if package_price < 0:
        return jsonify({"error": "El precio no puede ser negativo."}), 400

    conn = get_connection()
    try:
        row = conn.execute(
            """
            INSERT INTO ingredients (name, unit, package_quantity, package_price, note, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (name, unit, package_quantity, package_price, note, datetime.now(timezone.utc)),
        ).fetchone()
        conn.commit()
    except psycopg.errors.UniqueViolation:
        conn.rollback()
        conn.close()
        return jsonify({"error": f"Ya existe un ingrediente llamado '{name}'."}), 409
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": str(e)}), 400
    conn.close()
    return jsonify(serialize(row)), 201


@bp.put("/<int:ingredient_id>")
def update_ingredient(ingredient_id):
    body = request.get_json(force=True) or {}
    conn = get_connection()
    row = conn.execute("SELECT * FROM ingredients WHERE id = %s", (ingredient_id,)).fetchone()
    if row is None:
        conn.close()
        return jsonify({"error": "Ingrediente no encontrado."}), 404

    name = (body.get("name") or row["name"]).strip()
    unit = body.get("unit", row["unit"])
    if unit not in VALID_UNITS:
        conn.close()
        return jsonify({"error": "Unidad inválida. Usá 'g', 'ml' o 'u'."}), 400
    try:
        package_quantity = float(body.get("package_quantity", row["package_quantity"]))
        package_price = float(body.get("package_price", row["package_price"]))
    except (TypeError, ValueError):
        conn.close()
        return jsonify({"error": "Cantidad y precio deben ser numéricos."}), 400
    if package_quantity <= 0:
        conn.close()
        return jsonify({"error": "La cantidad del paquete debe ser mayor a 0."}), 400
    if package_price < 0:
        conn.close()
        return jsonify({"error": "El precio no puede ser negativo."}), 400
    note = body.get("note", row["note"])
    if note is not None:
        note = note.strip() or None

    try:
        row = conn.execute(
            """
            UPDATE ingredients
            SET name = %s, unit = %s, package_quantity = %s, package_price = %s, note = %s, updated_at = %s
            WHERE id = %s
            RETURNING *
            """,
            (name, unit, package_quantity, package_price, note, datetime.now(timezone.utc), ingredient_id),
        ).fetchone()
        conn.commit()
    except psycopg.errors.UniqueViolation:
        conn.rollback()
        conn.close()
        return jsonify({"error": f"Ya existe un ingrediente llamado '{name}'."}), 409
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": str(e)}), 400

    conn.close()
    return jsonify(serialize(row))


@bp.delete("/<int:ingredient_id>")
def delete_ingredient(ingredient_id):
    conn = get_connection()
    in_use = conn.execute(
        "SELECT COUNT(*) AS c FROM cake_ingredients WHERE ingredient_id = %s", (ingredient_id,)
    ).fetchone()["c"]
    if in_use:
        conn.close()
        return jsonify({"error": "No se puede borrar: el ingrediente se usa en una o más tortas."}), 409
    conn.execute("DELETE FROM ingredients WHERE id = %s", (ingredient_id,))
    conn.commit()
    conn.close()
    return "", 204

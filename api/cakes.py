import psycopg
from flask import Blueprint, jsonify, request

from db import get_connection, ingredient_unit_cost, to_iso

bp = Blueprint("cakes", __name__, url_prefix="/api/cakes")


def get_multipliers(conn):
    row = conn.execute("SELECT value FROM settings WHERE key = 'price_multipliers'").fetchone()
    raw = row["value"] if row else "2,2.5,3"
    out = []
    for part in raw.split(","):
        part = part.strip()
        if part:
            try:
                out.append(float(part))
            except ValueError:
                pass
    return out or [2, 2.5, 3]


def serialize_cake(conn, cake, multipliers):
    d = dict(cake)
    d["created_at"] = to_iso(d["created_at"])
    ingredients = conn.execute(
        """
        SELECT ci.id AS line_id, ci.quantity AS quantity, i.id AS ingredient_id,
               i.name AS name, i.unit AS unit, i.package_price AS package_price,
               i.package_quantity AS package_quantity
        FROM cake_ingredients ci
        JOIN ingredients i ON i.id = ci.ingredient_id
        WHERE ci.cake_id = %s
        ORDER BY i.name COLLATE "C"
        """,
        (cake["id"],),
    ).fetchall()
    lines = []
    ingredients_cost = 0.0
    for r in ingredients:
        unit_cost = ingredient_unit_cost(r)
        line_cost = unit_cost * r["quantity"]
        ingredients_cost += line_cost
        lines.append({
            "line_id": r["line_id"],
            "ingredient_id": r["ingredient_id"],
            "name": r["name"],
            "unit": r["unit"],
            "quantity": r["quantity"],
            "unit_cost": round(unit_cost, 6),
            "line_cost": round(line_cost, 4),
            "has_price": r["package_price"] > 0,
        })
    total_cost = ingredients_cost + cake["extra_cost"]
    d["ingredients"] = lines
    d["ingredients_cost"] = round(ingredients_cost, 4)
    d["cost"] = round(total_cost, 4)
    d["suggested_prices"] = [
        {"multiplier": m, "price": round(total_cost * m, 2)} for m in multipliers
    ]
    d["missing_prices"] = any(not line["has_price"] for line in lines)
    return d


@bp.get("")
def list_cakes():
    conn = get_connection()
    multipliers = get_multipliers(conn)
    include_inactive = request.args.get("include_inactive") == "1"
    query = "SELECT * FROM cakes"
    if not include_inactive:
        query += " WHERE active = TRUE"
    query += " ORDER BY name COLLATE \"C\""
    rows = conn.execute(query).fetchall()
    result = [serialize_cake(conn, r, multipliers) for r in rows]
    conn.close()
    return jsonify(result)


@bp.get("/<int:cake_id>")
def get_cake(cake_id):
    conn = get_connection()
    row = conn.execute("SELECT * FROM cakes WHERE id = %s", (cake_id,)).fetchone()
    if row is None:
        conn.close()
        return jsonify({"error": "Torta no encontrada."}), 404
    multipliers = get_multipliers(conn)
    result = serialize_cake(conn, row, multipliers)
    conn.close()
    return jsonify(result)


@bp.post("")
def create_cake():
    body = request.get_json(force=True) or {}
    name = (body.get("name") or "").strip()
    if not name:
        return jsonify({"error": "El nombre es obligatorio."}), 400
    try:
        extra_cost = float(body.get("extra_cost", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "El costo extra debe ser numérico."}), 400
    notes = (body.get("notes") or "").strip() or None

    conn = get_connection()
    try:
        row = conn.execute(
            "INSERT INTO cakes (name, extra_cost, notes) VALUES (%s, %s, %s) RETURNING *",
            (name, extra_cost, notes),
        ).fetchone()
        new_id = row["id"]
        for line in body.get("ingredients", []):
            _upsert_line(conn, new_id, line)
        conn.commit()
    except psycopg.errors.UniqueViolation:
        conn.rollback()
        conn.close()
        return jsonify({"error": f"Ya existe una torta llamada '{name}'."}), 409
    except ValueError as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": str(e)}), 400

    row = conn.execute("SELECT * FROM cakes WHERE id = %s", (new_id,)).fetchone()
    multipliers = get_multipliers(conn)
    result = serialize_cake(conn, row, multipliers)
    conn.close()
    return jsonify(result), 201


def _upsert_line(conn, cake_id, line):
    ingredient_id = line.get("ingredient_id")
    quantity = line.get("quantity")
    try:
        quantity = float(quantity)
    except (TypeError, ValueError):
        raise ValueError("La cantidad de cada ingrediente debe ser numérica.")
    if quantity <= 0:
        raise ValueError("La cantidad de cada ingrediente debe ser mayor a 0.")
    exists = conn.execute("SELECT id FROM ingredients WHERE id = %s", (ingredient_id,)).fetchone()
    if not exists:
        raise ValueError(f"El ingrediente {ingredient_id} no existe.")
    conn.execute(
        """
        INSERT INTO cake_ingredients (cake_id, ingredient_id, quantity)
        VALUES (%s, %s, %s)
        ON CONFLICT (cake_id, ingredient_id) DO UPDATE SET quantity = excluded.quantity
        """,
        (cake_id, ingredient_id, quantity),
    )


@bp.put("/<int:cake_id>")
def update_cake(cake_id):
    body = request.get_json(force=True) or {}
    conn = get_connection()
    row = conn.execute("SELECT * FROM cakes WHERE id = %s", (cake_id,)).fetchone()
    if row is None:
        conn.close()
        return jsonify({"error": "Torta no encontrada."}), 404

    name = (body.get("name") or row["name"]).strip()
    try:
        extra_cost = float(body.get("extra_cost", row["extra_cost"]))
    except (TypeError, ValueError):
        conn.close()
        return jsonify({"error": "El costo extra debe ser numérico."}), 400
    notes = body.get("notes", row["notes"])
    if notes is not None:
        notes = notes.strip() or None
    active = body.get("active", row["active"])

    try:
        conn.execute(
            "UPDATE cakes SET name = %s, extra_cost = %s, notes = %s, active = %s WHERE id = %s",
            (name, extra_cost, notes, bool(active), cake_id),
        )
        if "ingredients" in body:
            conn.execute("DELETE FROM cake_ingredients WHERE cake_id = %s", (cake_id,))
            for line in body["ingredients"]:
                _upsert_line(conn, cake_id, line)
        conn.commit()
    except psycopg.errors.UniqueViolation:
        conn.rollback()
        conn.close()
        return jsonify({"error": f"Ya existe una torta llamada '{name}'."}), 409
    except ValueError as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": str(e)}), 400

    row = conn.execute("SELECT * FROM cakes WHERE id = %s", (cake_id,)).fetchone()
    multipliers = get_multipliers(conn)
    result = serialize_cake(conn, row, multipliers)
    conn.close()
    return jsonify(result)


@bp.delete("/<int:cake_id>")
def delete_cake(cake_id):
    conn = get_connection()
    has_sales = conn.execute(
        "SELECT COUNT(*) AS c FROM sales WHERE cake_id = %s", (cake_id,)
    ).fetchone()["c"]
    if has_sales:
        conn.execute("UPDATE cakes SET active = FALSE WHERE id = %s", (cake_id,))
        conn.commit()
        conn.close()
        return jsonify({"archived": True}), 200
    conn.execute("DELETE FROM cakes WHERE id = %s", (cake_id,))
    conn.commit()
    conn.close()
    return "", 204

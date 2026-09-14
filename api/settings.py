from flask import Blueprint, jsonify, request

from db import get_connection

bp = Blueprint("settings", __name__, url_prefix="/api/settings")


@bp.get("")
def get_settings():
    conn = get_connection()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    return jsonify({r["key"]: r["value"] for r in rows})


@bp.put("/price_multipliers")
def update_multipliers():
    body = request.get_json(force=True) or {}
    multipliers = body.get("value")
    if not isinstance(multipliers, list) or not multipliers:
        return jsonify({"error": "Se espera una lista de multiplicadores."}), 400
    try:
        parsed = [float(m) for m in multipliers]
    except (TypeError, ValueError):
        return jsonify({"error": "Los multiplicadores deben ser numéricos."}), 400
    if any(m <= 0 for m in parsed):
        return jsonify({"error": "Los multiplicadores deben ser mayores a 0."}), 400

    value = ",".join(str(m) for m in parsed)
    conn = get_connection()
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('price_multipliers', %s) "
        "ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        (value,),
    )
    conn.commit()
    conn.close()
    return jsonify({"price_multipliers": value})

from flask import Blueprint, jsonify, request

from db import get_connection, to_iso

bp = Blueprint("metrics", __name__, url_prefix="/api/metrics")


def date_filters(args):
    clauses = []
    params = []
    date_from = args.get("from")
    date_to = args.get("to")
    if date_from:
        clauses.append("s.sale_date >= %s")
        params.append(date_from)
    if date_to:
        clauses.append("s.sale_date <= %s")
        params.append(date_to)
    where = (" AND " + " AND ".join(clauses)) if clauses else ""
    return where, params


@bp.get("/summary")
def summary():
    conn = get_connection()
    where, params = date_filters(request.args)
    row = conn.execute(
        f"""
        SELECT
            COALESCE(SUM(s.quantity), 0) AS units_sold,
            COUNT(*) AS num_sales,
            COALESCE(SUM(s.quantity * s.unit_price), 0) AS total_revenue,
            COALESCE(SUM(s.quantity * s.unit_cost_snapshot), 0) AS total_cost
        FROM sales s
        WHERE 1 = 1 {where}
        """,
        params,
    ).fetchone()
    conn.close()
    revenue = row["total_revenue"]
    cost = row["total_cost"]
    profit = revenue - cost
    margin = (profit / revenue * 100) if revenue > 0 else 0
    return jsonify({
        "units_sold": row["units_sold"],
        "num_sales": row["num_sales"],
        "total_revenue": round(revenue, 2),
        "total_cost": round(cost, 2),
        "total_profit": round(profit, 2),
        "margin_pct": round(margin, 2),
    })


@bp.get("/by-cake")
def by_cake():
    conn = get_connection()
    where, params = date_filters(request.args)
    rows = conn.execute(
        f"""
        SELECT
            c.id AS cake_id,
            c.name AS cake_name,
            COALESCE(SUM(s.quantity), 0) AS units_sold,
            COALESCE(SUM(s.quantity * s.unit_price), 0) AS total_revenue,
            COALESCE(SUM(s.quantity * s.unit_cost_snapshot), 0) AS total_cost
        FROM cakes c
        JOIN sales s ON s.cake_id = c.id
        WHERE 1 = 1 {where}
        GROUP BY c.id, c.name
        ORDER BY total_revenue DESC
        """,
        params,
    ).fetchall()
    conn.close()
    result = []
    for r in rows:
        revenue = r["total_revenue"]
        cost = r["total_cost"]
        profit = revenue - cost
        margin = (profit / revenue * 100) if revenue > 0 else 0
        result.append({
            "cake_id": r["cake_id"],
            "cake_name": r["cake_name"],
            "units_sold": r["units_sold"],
            "total_revenue": round(revenue, 2),
            "total_cost": round(cost, 2),
            "profit": round(profit, 2),
            "margin_pct": round(margin, 2),
        })
    return jsonify(result)


@bp.get("/timeseries")
def timeseries():
    conn = get_connection()
    where, params = date_filters(request.args)
    granularity = request.args.get("granularity", "day")
    bucket_expr = {
        "day": "s.sale_date",
        "week": "to_char(s.sale_date, 'IYYY-\"W\"IW')",
        "month": "to_char(s.sale_date, 'YYYY-MM')",
    }.get(granularity, "s.sale_date")

    rows = conn.execute(
        f"""
        SELECT
            {bucket_expr} AS bucket,
            COALESCE(SUM(s.quantity), 0) AS units_sold,
            COALESCE(SUM(s.quantity * s.unit_price), 0) AS total_revenue,
            COALESCE(SUM(s.quantity * s.unit_cost_snapshot), 0) AS total_cost
        FROM sales s
        WHERE 1 = 1 {where}
        GROUP BY bucket
        ORDER BY bucket ASC
        """,
        params,
    ).fetchall()
    conn.close()
    result = []
    for r in rows:
        revenue = r["total_revenue"]
        cost = r["total_cost"]
        result.append({
            "bucket": to_iso(r["bucket"]),
            "units_sold": r["units_sold"],
            "total_revenue": round(revenue, 2),
            "total_cost": round(cost, 2),
            "profit": round(revenue - cost, 2),
        })
    return jsonify(result)

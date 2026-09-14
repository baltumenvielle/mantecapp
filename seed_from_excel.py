"""One-off import of manteca.xlsx into the Postgres database.

Reads the COSTOS sheet (ingredients) and RECETAS sheet (cake recipes) and
populates the ingredients/cakes/cake_ingredients tables so nothing has to be
retyped by hand. Safe to re-run: existing ingredients/cakes are matched by
name and left alone (use --reset to wipe and reimport instead).

Usage:
    python seed_from_excel.py [path/to/manteca.xlsx] [--reset]
"""
import sys

from dotenv import load_dotenv

load_dotenv()

import openpyxl

from db import get_connection, init_db

# Ingredients that are grams by weight in the sheet (everything not listed
# here or in UNIT_INGREDIENTS is left for manual review).
GRAM_INGREDIENTS = {
    "Harina", "Azucar", "Manteca", "DDL", "Ch cobertura sa", "Baño reposteria",
    "Crema", "Queso crema", "Leche condens", "Almendras", "Nueces", "Lincoln",
    "Chocolinas", "Coco", "Maicena", "Azucar imp", "Frutos rojos",
}
UNIT_INGREDIENTS = {
    "Huevo", "Limon", "Banana", "Bases tortas", "Stickers", "Caja torta",
}

# Conservative alias map: only exact, unambiguous abbreviations found in the
# RECETAS sheet get folded into a COSTOS ingredient. Anything not listed here
# becomes its own new ingredient (price 0, flagged for manual completion)
# rather than risk merging two different things.
ALIASES = {
    "huevos": "Huevo",
    "leche condensada": "Leche condens",
    "baño rep": "Baño reposteria",
    "frutos": "Frutos rojos",
    "base": "Bases tortas",
    "caja": "Caja torta",
    "sticker": "Stickers",
    "agua": "__AGUA__",  # water: free, added as its own 0-cost ingredient
}


def norm(s):
    return str(s).strip().lower() if s is not None else ""


def load_ingredients(ws):
    """Returns {canonical_name: (unit, package_quantity, package_price, note)}"""
    ingredients = {}
    for row in ws.iter_rows(min_row=2, max_row=25, values_only=True):
        name = row[0]
        if not name or not isinstance(name, str):
            continue
        name = name.strip()
        qty, price = row[1], row[2]
        if not isinstance(qty, (int, float)):
            continue
        price = price if isinstance(price, (int, float)) else 0
        unit = "g" if name in GRAM_INGREDIENTS else ("u" if name in UNIT_INGREDIENTS else "g")
        note = row[5] if len(row) > 5 and isinstance(row[5], str) and row[5].strip() else None
        ingredients[name] = (unit, float(qty), float(price), note)
    return ingredients


def resolve_ingredient_name(raw_name, known_names):
    n = norm(raw_name)
    if n in ALIASES:
        alias = ALIASES[n]
        return alias
    for canonical in known_names:
        if norm(canonical) == n:
            return canonical
    return raw_name.strip()


def load_recipes(ws):
    """Returns {cake_name: [(ingredient_raw_name, quantity), ...]}

    Each cake block is: a title row (name in col cs), then a "$" header row
    (a lone '$' at col cs+2), then ingredient rows (name at cs, qty at cs+1)
    until the next title row in that same column or the sheet ends. Detecting
    blocks via the '$' marker (rather than an all-caps heuristic) avoids
    misfiring on all-caps ingredient names like "DDL".
    """
    col_starts = [0, 4, 8, 12, 16]
    rows = list(ws.iter_rows(min_row=1, max_row=ws.max_row, values_only=True))

    # 1) find every title-row start per column
    starts = []  # list of (row_index, col_start, cake_name)
    for r, row in enumerate(rows[:-1]):
        for cs in col_starts:
            if cs >= len(row):
                continue
            title = row[cs]
            next_row = rows[r + 1]
            marker = next_row[cs + 2] if cs + 2 < len(next_row) else None
            if isinstance(title, str) and title.strip() and marker == "$":
                starts.append((r, cs, title.strip().title()))

    # 2) for each start, read ingredient rows until the next start in the
    #    same column (or sheet end)
    recipes = {}
    for i, (r, cs, cake_name) in enumerate(starts):
        next_in_col = next(
            (s[0] for s in starts[i + 1:] if s[1] == cs), len(rows)
        )
        ingredients = []
        for rr in range(r + 2, next_in_col):
            line = rows[rr]
            ing_name = line[cs] if cs < len(line) else None
            qty = line[cs + 1] if cs + 1 < len(line) else None
            if isinstance(ing_name, str) and isinstance(qty, (int, float)):
                ingredients.append((ing_name.strip(), float(qty)))
        if ingredients:
            recipes[cake_name] = ingredients
    return recipes


def main():
    args = sys.argv[1:]
    reset = "--reset" in args
    args = [a for a in args if a != "--reset"]
    xlsx_path = args[0] if args else "manteca.xlsx"

    init_db()
    conn = get_connection()

    if reset:
        conn.execute("DELETE FROM cake_ingredients")
        conn.execute("DELETE FROM cakes")
        conn.execute("DELETE FROM ingredients")
        conn.commit()

    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    costos_ws = wb["COSTOS"]
    recetas_ws = wb["RECETAS"]

    ingredients = load_ingredients(costos_ws)
    known_names = set(ingredients.keys())

    created_ing, skipped_ing = 0, 0
    for name, (unit, qty, price, note) in ingredients.items():
        existing = conn.execute("SELECT id FROM ingredients WHERE name = %s", (name,)).fetchone()
        if existing:
            skipped_ing += 1
            continue
        conn.execute(
            "INSERT INTO ingredients (name, unit, package_quantity, package_price, note) VALUES (%s, %s, %s, %s, %s)",
            (name, unit, qty, price, note),
        )
        created_ing += 1

    # water: free, unit-based ingredient used by several recipes
    existing_agua = conn.execute("SELECT id FROM ingredients WHERE name = 'Agua'").fetchone()
    if not existing_agua:
        conn.execute(
            "INSERT INTO ingredients (name, unit, package_quantity, package_price, note) VALUES (%s, 'g', 1000, 0, %s)",
            ("Agua", "Costo asumido en $0",),
        )
    conn.commit()

    recipes = load_recipes(recetas_ws)

    created_cakes, created_lines, new_ingredients_from_recipes = 0, 0, 0
    for cake_name, lines in recipes.items():
        existing_cake = conn.execute("SELECT id FROM cakes WHERE name = %s", (cake_name,)).fetchone()
        if existing_cake:
            continue
        cake_id = conn.execute(
            "INSERT INTO cakes (name) VALUES (%s) RETURNING id", (cake_name,)
        ).fetchone()["id"]
        created_cakes += 1
        for raw_name, qty in lines:
            resolved = resolve_ingredient_name(raw_name, known_names)
            if resolved == "__AGUA__":
                resolved = "Agua"
            ing_row = conn.execute("SELECT id, unit FROM ingredients WHERE name = %s", (resolved,)).fetchone()
            if not ing_row:
                unit = "u" if norm(raw_name) in ("huevo", "huevos", "base", "caja", "sticker", "limon", "banana") else "g"
                ing_id = conn.execute(
                    "INSERT INTO ingredients (name, unit, package_quantity, package_price, note) VALUES (%s, %s, 1000, 0, %s) RETURNING id",
                    (resolved, unit, "Creado automáticamente al importar recetas: revisar precio."),
                ).fetchone()["id"]
                new_ingredients_from_recipes += 1
            else:
                ing_id = ing_row["id"]
            conn.execute(
                "INSERT INTO cake_ingredients (cake_id, ingredient_id, quantity) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                (cake_id, ing_id, qty),
            )
            created_lines += 1
    conn.commit()
    conn.close()

    print(f"Ingredientes creados: {created_ing} (ya existían: {skipped_ing})")
    print(f"Ingredientes nuevos detectados en recetas (revisar precio): {new_ingredients_from_recipes}")
    print(f"Tortas creadas: {created_cakes}")
    print(f"Líneas de receta creadas: {created_lines}")


if __name__ == "__main__":
    main()

CREATE TABLE IF NOT EXISTS ingredients (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    unit TEXT NOT NULL CHECK (unit IN ('g', 'ml', 'u')),
    package_quantity DOUBLE PRECISION NOT NULL CHECK (package_quantity > 0),
    package_price DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (package_price >= 0),
    note TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cakes (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    extra_cost DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (extra_cost >= 0),
    notes TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cake_ingredients (
    id SERIAL PRIMARY KEY,
    cake_id INTEGER NOT NULL REFERENCES cakes(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
    quantity DOUBLE PRECISION NOT NULL CHECK (quantity > 0),
    UNIQUE (cake_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    cake_id INTEGER NOT NULL REFERENCES cakes(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    sale_date DATE NOT NULL,
    unit_price DOUBLE PRECISION NOT NULL CHECK (unit_price >= 0),
    unit_cost_snapshot DOUBLE PRECISION NOT NULL CHECK (unit_cost_snapshot >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cake_ingredients_cake ON cake_ingredients(cake_id);
CREATE INDEX IF NOT EXISTS idx_sales_cake ON sales(cake_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);

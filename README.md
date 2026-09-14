# Mantecapp

App para calcular el costo de tortas a partir del precio de los ingredientes, y
registrar ventas para ver ganancia y métricas (torta más vendida, más rentable, etc.).

Backend: Python + Flask + **Postgres**. Frontend: HTML/JS sin build step (una
sola página con 4 pestañas). No requiere Node.

## Uso local

Necesitás una base Postgres para desarrollar (no importa cuál — una gratis en
Neon sirve también para esto, o una local). Para levantar una local rápido con
podman/docker:

```bash
podman run -d --name mantecapp-pg -e POSTGRES_PASSWORD=devpass \
  -e POSTGRES_DB=mantecapp -p 5433:5432 docker.io/library/postgres:16-alpine
```

Creá un archivo `.env` (no se sube a git) con la conexión:

```
DATABASE_URL=postgresql://postgres:devpass@localhost:5433/mantecapp
```

Y corré la app:

```bash
source .venv/bin/activate      # ya está creado en este proyecto
python app.py                  # sirve en http://localhost:5000
```

## Reimportar desde el Excel

`seed_from_excel.py` lee `manteca.xlsx` (hojas COSTOS y RECETAS) y carga
ingredientes y tortas automáticamente en la base a la que apunte `DATABASE_URL`.
Ya se corrió una vez contra la base local. Para reimportar desde cero (borra
todo lo cargado):

```bash
python seed_from_excel.py manteca.xlsx --reset
```

### Cosas para revisar después de la importación

El importador fue conservador: cuando un nombre de ingrediente en RECETAS no
matcheaba exactamente uno de COSTOS, creó un ingrediente nuevo con precio $0
en vez de adivinar. Quedaron pendientes de revisar (marcados con la etiqueta
"sin precio" en la app):

- **Pavlova**: la receta original dice "Huevos 150" — se importó como 150
  *unidades* de huevo, lo que da un costo muy alto. Es probable que en
  realidad sean 150 **gramos** de clara de huevo. Corregilo en Tortas si es así.
- **Key Lime Pie**: "Leche condensada 2" se importó como 2 gramos. Puede que
  en realidad sean 2 latas. Revisalo.
- **Chocolate** (Torta Brownie) y **Leche** (Cheesecake Frutos) se crearon
  como ingredientes nuevos con precio $0 porque no había forma de saber si
  son lo mismo que otro ya cargado (ej. "Chocolate" vs "Ch cobertura sa").
- **Limón, Banana, Stickers**: ya estaban sin precio en el Excel original.

## Multiplicadores de precio sugerido

En la pestaña Tortas, el botón "Multiplicadores" define con qué factores se
sugiere el precio de venta (por defecto 2 / 2.5 / 3, igual que en el Excel
original).

## Deploy online, gratis (Neon + Render)

La app quedó armada para separar el cómputo (que puede ser efímero) de los
datos (que viven en Postgres, persistentes). Con esto alcanza el plan
gratuito de ambos servicios:

**1. Base de datos — Neon** (https://neon.tech, tiene plan gratis)
   - Creá una cuenta y un proyecto nuevo.
   - Copiá el "Connection string" que te da (empieza con `postgresql://...`).

**2. Cargar los datos iniciales** — desde tu compu, una sola vez:
   ```bash
   export DATABASE_URL="<el connection string de Neon>"
   source .venv/bin/activate
   python seed_from_excel.py manteca.xlsx --reset
   ```

**3. Subir el código a GitHub** (Render se conecta a un repo):
   ```bash
   git init
   git add -A
   git commit -m "Mantecapp"
   ```
   Creá un repo vacío en GitHub y hacé push (`git remote add origin ...`,
   `git push -u origin main`).

**4. Servidor — Render** (https://render.com, plan gratis)
   - "New +" → "Web Service" → conectá el repo de GitHub.
   - Build command: `pip install -r requirements.txt`
   - Start command: `gunicorn app:app`
   - En "Environment", agregá la variable `DATABASE_URL` con el mismo
     connection string de Neon.
   - Deploy. Te da una URL pública (`https://tu-app.onrender.com`) — esa es
     la que le pasás a tu cliente.

Con el plan gratis de Render, el servidor "se duerme" tras ~15 min sin uso y
tarda unos segundos en despertar en la próxima visita — normal y sin ningún
riesgo para los datos, porque estos viven en Neon, no en el servidor.

**Importante:** la app no tiene login ni contraseña. Cualquiera con la URL
puede editar precios y ver las ventas. Si te importa, avisame y agrego una
autenticación simple (usuario/clave por variable de entorno) antes de que se
la pases a tu cliente.

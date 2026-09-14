import os

from dotenv import load_dotenv

load_dotenv()

from flask import Flask, render_template

from db import init_db
from api.ingredients import bp as ingredients_bp
from api.cakes import bp as cakes_bp
from api.sales import bp as sales_bp
from api.metrics import bp as metrics_bp
from api.settings import bp as settings_bp


def create_app():
    app = Flask(__name__, static_folder="static", template_folder="templates")
    init_db()

    app.register_blueprint(ingredients_bp)
    app.register_blueprint(cakes_bp)
    app.register_blueprint(sales_bp)
    app.register_blueprint(metrics_bp)
    app.register_blueprint(settings_bp)

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.errorhandler(404)
    def not_found(e):
        if str(getattr(e, "description", "")).startswith("/api"):
            return {"error": "No encontrado"}, 404
        return render_template("index.html")

    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)

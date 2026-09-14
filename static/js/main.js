(() => {
  const views = {
    ingredientes: IngredientesView,
    tortas: TortasView,
    ventas: VentasView,
    metricas: MetricasView,
  };
  const loaded = new Set();

  function activate(tab) {
    document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tab}`));
    views[tab].render();
    loaded.add(tab);
    history.replaceState(null, "", `#${tab}`);
  }

  document.querySelectorAll("nav.tabs button").forEach((btn) => {
    btn.addEventListener("click", () => activate(btn.dataset.tab));
  });

  const initial = (location.hash || "").replace("#", "") || "ingredientes";
  activate(views[initial] ? initial : "ingredientes");
})();

const VentasView = (() => {
  let sales = [];
  let cakes = [];

  async function render() {
    const panel = document.getElementById("tab-ventas");
    panel.innerHTML = `<p class="muted">Cargando...</p>`;
    const [salesData, cakesData] = await Promise.all([
      Api.sales.list(),
      Api.cakes.list(),
    ]);
    sales = salesData;
    cakes = cakesData;
    panel.innerHTML = template();
    bind(panel);
  }

  function template() {
    return `
      <div class="card">
        <div class="toolbar"><h2>Registrar venta</h2></div>
        ${cakes.length ? formHtml() : `<p class="muted">Primero cargá al menos una torta en la pestaña "Tortas".</p>`}
      </div>
      <div class="card">
        <div class="toolbar"><h2>Ventas recientes</h2></div>
        ${salesTableHtml()}
      </div>
    `;
  }

  function formHtml() {
    const options = cakes.map((c) => `<option value="${c.id}" data-cost="${c.cost}">${UI.escapeHtml(c.name)}</option>`).join("");
    return `
      <form id="sale-form">
        <div class="row">
          <div class="field" style="flex:2; min-width:180px;">
            <label>Torta</label>
            <select name="cake_id" id="sale-cake">${options}</select>
          </div>
          <div class="field" style="flex:1; min-width:90px;">
            <label>Cantidad</label>
            <input name="quantity" type="number" min="1" step="1" value="1" required />
          </div>
          <div class="field" style="flex:1; min-width:130px;">
            <label>Fecha</label>
            <input name="sale_date" type="date" value="${UI.todayIso()}" required />
          </div>
        </div>
        <div class="row">
          <div class="field" style="flex:1; min-width:140px;">
            <label>Precio de venta (por unidad)</label>
            <input name="unit_price" id="sale-price" type="number" step="any" min="0" required />
          </div>
          <div class="field" style="flex:1; min-width:140px;">
            <label>Costo actual (por unidad)</label>
            <input id="sale-cost-display" type="text" disabled />
          </div>
          <div class="field" style="flex:2; min-width:160px;">
            <label>Notas (opcional)</label>
            <input name="notes" placeholder="Ej: pedido para cumpleaños" />
          </div>
        </div>
        <div id="form-error"></div>
        <div class="row" style="justify-content:flex-end;">
          <button type="submit" class="btn primary">Registrar venta</button>
        </div>
      </form>
    `;
  }

  function salesTableHtml() {
    if (!sales.length) return `<div class="empty-state">Todavía no hay ventas registradas.</div>`;
    const rows = sales.map((s) => `
      <tr data-id="${s.id}">
        <td>${s.sale_date}</td>
        <td>${UI.escapeHtml(s.cake_name)}</td>
        <td class="num">${s.quantity}</td>
        <td class="num">${UI.fmtMoney2(s.unit_price)}</td>
        <td class="num">${UI.fmtMoney2(s.unit_cost_snapshot)}</td>
        <td class="num">${UI.fmtMoney(s.total_revenue)}</td>
        <td class="num">${UI.fmtMoney(s.profit)}</td>
        <td class="muted">${UI.escapeHtml(s.notes || "")}</td>
        <td><button class="icon-btn del-sale-btn" title="Borrar">🗑️</button></td>
      </tr>
    `).join("");
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th><th>Torta</th><th class="num">Cant.</th>
              <th class="num">Precio unit.</th><th class="num">Costo unit.</th>
              <th class="num">Ingreso</th><th class="num">Ganancia</th><th>Notas</th><th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function bind(panel) {
    const form = panel.querySelector("#sale-form");
    if (form) {
      const cakeSelect = form.querySelector("#sale-cake");
      const priceInput = form.querySelector("#sale-price");
      const costDisplay = form.querySelector("#sale-cost-display");

      function currentCost() {
        const opt = cakeSelect.options[cakeSelect.selectedIndex];
        return opt ? parseFloat(opt.dataset.cost) : 0;
      }
      function updateCostDisplay() {
        const cost = currentCost();
        costDisplay.value = UI.fmtMoney2(cost);
        if (!priceInput.dataset.touched) {
          priceInput.value = Math.round(cost * 2.5);
        }
      }
      cakeSelect.onchange = updateCostDisplay;
      priceInput.addEventListener("input", () => { priceInput.dataset.touched = "1"; });
      updateCostDisplay();

      form.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const data = {
          cake_id: Number(fd.get("cake_id")),
          quantity: Number(fd.get("quantity")),
          sale_date: fd.get("sale_date"),
          unit_price: parseFloat(fd.get("unit_price")),
          unit_cost_snapshot: currentCost(),
          notes: fd.get("notes").trim(),
        };
        try {
          await Api.sales.create(data);
          UI.toast("Venta registrada");
          render();
        } catch (err) {
          panel.querySelector("#form-error").innerHTML = `<div class="error-banner">${UI.escapeHtml(err.message)}</div>`;
        }
      };
    }

    panel.querySelectorAll(".del-sale-btn").forEach((btn) => {
      const tr = btn.closest("tr");
      btn.onclick = async () => {
        const ok = await UI.confirmDialog("¿Borrar esta venta?");
        if (!ok) return;
        await Api.sales.remove(Number(tr.dataset.id));
        UI.toast("Venta borrada");
        render();
      };
    });
  }

  return { render };
})();

const IngredientesView = (() => {
  let ingredients = [];

  async function render() {
    const panel = document.getElementById("tab-ingredientes");
    panel.innerHTML = `<p class="muted">Cargando...</p>`;
    ingredients = await Api.ingredients.list();
    panel.innerHTML = template();
    bind(panel);
  }

  function template() {
    const rows = ingredients.map(rowHtml).join("");
    return `
      <div class="card">
        <div class="toolbar">
          <div>
            <h2>Ingredientes y precios</h2>
            <p class="muted" style="margin:2px 0 0;font-size:12.5px;">
              Cargá el precio del paquete tal cual lo comprás. El costo por unidad se calcula solo.
              Actualizalos cuando cambien los precios; las recetas se recalculan automáticamente.
            </p>
          </div>
          <button class="btn primary" id="btn-new-ingredient">+ Nuevo ingrediente</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th class="num">Cant. paquete</th>
                <th>Unidad</th>
                <th class="num">Precio paquete</th>
                <th class="num">Costo unitario</th>
                <th>Nota</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows || emptyRow()}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function emptyRow() {
    return `<tr><td colspan="7" class="empty-state">Todavía no cargaste ingredientes.</td></tr>`;
  }

  function unitCostLabel(ing) {
    const perLabel = ing.unit === "u" ? "u" : ing.unit;
    return `${UI.fmtMoney2(ing.unit_cost)} / ${perLabel}`;
  }

  function rowHtml(ing) {
    const noPrice = !ing.package_price || ing.package_price <= 0;
    return `
      <tr data-id="${ing.id}">
        <td>${UI.escapeHtml(ing.name)}</td>
        <td class="num">${UI.fmtNum(ing.package_quantity)}</td>
        <td>${UI.unitLabel(ing.unit)}</td>
        <td class="num">${UI.fmtMoney(ing.package_price)} ${noPrice ? '<span class="badge warn">sin precio</span>' : ""}</td>
        <td class="num">${unitCostLabel(ing)}</td>
        <td class="muted">${UI.escapeHtml(ing.note || "")}</td>
        <td class="row" style="gap:2px;justify-content:flex-end;flex-wrap:nowrap;">
          <button class="icon-btn edit-btn" title="Editar">✏️</button>
          <button class="icon-btn del-btn" title="Borrar">🗑️</button>
        </td>
      </tr>
    `;
  }

  function bind(panel) {
    panel.querySelector("#btn-new-ingredient").onclick = () => openForm(null);
    panel.querySelectorAll("tr[data-id]").forEach((tr) => {
      const id = Number(tr.dataset.id);
      const ing = ingredients.find((i) => i.id === id);
      tr.querySelector(".edit-btn").onclick = () => openForm(ing);
      tr.querySelector(".del-btn").onclick = () => handleDelete(ing);
    });
  }

  function openForm(ing) {
    const isEdit = !!ing;
    UI.openModal(`
      <h3>${isEdit ? "Editar ingrediente" : "Nuevo ingrediente"}</h3>
      <div id="form-error"></div>
      <form id="ing-form">
        <div class="field">
          <label>Nombre</label>
          <input name="name" required value="${UI.escapeHtml(ing?.name || "")}" placeholder="Ej: Harina" />
        </div>
        <div class="row">
          <div class="field" style="flex:1;">
            <label>Cantidad del paquete</label>
            <input name="package_quantity" type="number" step="any" min="0.001" required value="${ing?.package_quantity ?? ""}" />
          </div>
          <div class="field" style="flex:1;">
            <label>Unidad</label>
            <select name="unit">
              <option value="g" ${ing?.unit === "g" ? "selected" : ""}>gramos (g)</option>
              <option value="ml" ${ing?.unit === "ml" ? "selected" : ""}>mililitros (ml)</option>
              <option value="u" ${ing?.unit === "u" ? "selected" : ""}>unidades (u)</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>Precio del paquete completo ($)</label>
          <input name="package_price" type="number" step="any" min="0" required value="${ing?.package_price ?? ""}" />
        </div>
        <div class="field">
          <label>Nota (opcional)</label>
          <input name="note" value="${UI.escapeHtml(ing?.note || "")}" placeholder="Ej: más barato en tienda" />
        </div>
        <div class="row" style="justify-content:space-between; margin-top:16px;">
          <span></span>
          <div class="row">
            <button type="button" class="btn" id="cancel-btn">Cancelar</button>
            <button type="submit" class="btn primary">${isEdit ? "Guardar" : "Crear"}</button>
          </div>
        </div>
      </form>
    `, {
      onMount: (modal) => {
        modal.querySelector("#cancel-btn").onclick = UI.closeModal;
        modal.querySelector("#ing-form").onsubmit = async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const data = {
            name: fd.get("name").trim(),
            unit: fd.get("unit"),
            package_quantity: parseFloat(fd.get("package_quantity")),
            package_price: parseFloat(fd.get("package_price")),
            note: fd.get("note").trim(),
          };
          try {
            if (isEdit) await Api.ingredients.update(ing.id, data);
            else await Api.ingredients.create(data);
            UI.closeModal();
            UI.toast(isEdit ? "Ingrediente actualizado" : "Ingrediente creado");
            render();
          } catch (err) {
            modal.querySelector("#form-error").innerHTML = `<div class="error-banner">${UI.escapeHtml(err.message)}</div>`;
          }
        };
      },
    });
  }

  async function handleDelete(ing) {
    const ok = await UI.confirmDialog(`¿Borrar el ingrediente "${ing.name}"? Esta acción no se puede deshacer.`);
    if (!ok) return;
    try {
      await Api.ingredients.remove(ing.id);
      UI.toast("Ingrediente borrado");
      render();
    } catch (err) {
      UI.toast(err.message, true);
    }
  }

  return { render, getAll: () => ingredients };
})();

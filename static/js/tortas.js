const TortasView = (() => {
  let cakes = [];
  let ingredients = [];
  let multipliers = [2, 2.5, 3];
  let expanded = new Set();

  async function render() {
    const panel = document.getElementById("tab-tortas");
    panel.innerHTML = `<p class="muted">Cargando...</p>`;
    const [cakesData, ingredientsData, settings] = await Promise.all([
      Api.cakes.list(),
      Api.ingredients.list(),
      Api.settings.get(),
    ]);
    cakes = cakesData;
    ingredients = ingredientsData;
    multipliers = (settings.price_multipliers || "2,2.5,3").split(",").map(Number);
    panel.innerHTML = template();
    bind(panel);
  }

  function template() {
    const cards = cakes.map(cardHtml).join("") || `<div class="empty-state">Todavía no cargaste tortas.</div>`;
    return `
      <div class="card">
        <div class="toolbar">
          <div>
            <h2>Tortas y costos</h2>
            <p class="muted" style="margin:2px 0 0;font-size:12.5px;">
              El costo de cada torta se calcula solo a partir del precio actual de sus ingredientes.
            </p>
          </div>
          <div class="row">
            <button class="btn" id="btn-multipliers">Multiplicadores (${multipliers.join(" / ")})</button>
            <button class="btn primary" id="btn-new-cake">+ Nueva torta</button>
          </div>
        </div>
        ${cards}
      </div>
    `;
  }

  function cardHtml(cake) {
    const isOpen = expanded.has(cake.id);
    return `
      <div class="cake-card" data-id="${cake.id}">
        <div class="cake-header">
          <div>
            <div class="name">${UI.escapeHtml(cake.name)} ${cake.missing_prices ? '<span class="badge warn">faltan precios</span>' : ""}</div>
            <div class="suggested-prices">
              ${cake.suggested_prices.map((s) => `<span class="item">x${s.multiplier}: <b>${UI.fmtMoney(s.price)}</b></span>`).join("")}
            </div>
          </div>
          <div class="cost">${UI.fmtMoney(cake.cost)}</div>
        </div>
        <div class="cake-body" style="${isOpen ? "" : "display:none;"}">
          ${recipeTableHtml(cake)}
          <div class="row" style="margin-top:10px; gap:8px;">
            <button class="btn small edit-cake-btn">Editar receta</button>
            <button class="btn small danger del-cake-btn">Borrar torta</button>
          </div>
        </div>
      </div>
    `;
  }

  function recipeTableHtml(cake) {
    if (!cake.ingredients.length) {
      return `<p class="muted" style="font-size:13px;">Sin ingredientes cargados.</p>`;
    }
    const rows = cake.ingredients.map((l) => `
      <tr>
        <td>${UI.escapeHtml(l.name)} ${!l.has_price ? '<span class="badge warn">sin precio</span>' : ""}</td>
        <td class="num">${UI.fmtNum(l.quantity)} ${l.unit}</td>
        <td class="num">${UI.fmtMoney2(l.line_cost)}</td>
      </tr>
    `).join("");
    const extra = cake.extra_cost > 0 ? `
      <tr><td class="muted">Costo extra (mano de obra, etc.)</td><td></td><td class="num">${UI.fmtMoney2(cake.extra_cost)}</td></tr>
    ` : "";
    return `
      <table>
        <thead><tr><th>Ingrediente</th><th class="num">Cantidad</th><th class="num">Costo</th></tr></thead>
        <tbody>${rows}${extra}</tbody>
      </table>
    `;
  }

  function bind(panel) {
    panel.querySelector("#btn-new-cake").onclick = () => openCakeForm(null);
    panel.querySelector("#btn-multipliers").onclick = openMultipliersForm;
    panel.querySelectorAll(".cake-card").forEach((card) => {
      const id = Number(card.dataset.id);
      const cake = cakes.find((c) => c.id === id);
      card.querySelector(".cake-header").onclick = () => {
        if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
        render();
      };
      const editBtn = card.querySelector(".edit-cake-btn");
      if (editBtn) editBtn.onclick = (e) => { e.stopPropagation(); openCakeForm(cake); };
      const delBtn = card.querySelector(".del-cake-btn");
      if (delBtn) delBtn.onclick = (e) => { e.stopPropagation(); handleDelete(cake); };
    });
  }

  function openMultipliersForm() {
    UI.openModal(`
      <h3>Multiplicadores de precio sugerido</h3>
      <p class="secondary-text" style="font-size:13px;">Se usan para sugerir precio de venta = costo × multiplicador.</p>
      <div id="form-error"></div>
      <form id="mult-form">
        <div class="field">
          <label>Valores separados por coma</label>
          <input name="values" value="${multipliers.join(", ")}" placeholder="2, 2.5, 3" />
        </div>
        <div class="row" style="justify-content:flex-end; margin-top:16px;">
          <button type="button" class="btn" id="cancel-btn">Cancelar</button>
          <button type="submit" class="btn primary">Guardar</button>
        </div>
      </form>
    `, {
      onMount: (modal) => {
        modal.querySelector("#cancel-btn").onclick = UI.closeModal;
        modal.querySelector("#mult-form").onsubmit = async (e) => {
          e.preventDefault();
          const raw = new FormData(e.target).get("values");
          const values = raw.split(",").map((v) => parseFloat(v.trim())).filter((v) => !isNaN(v) && v > 0);
          if (!values.length) {
            modal.querySelector("#form-error").innerHTML = `<div class="error-banner">Ingresá al menos un valor válido.</div>`;
            return;
          }
          try {
            await Api.settings.updateMultipliers(values);
            UI.closeModal();
            render();
          } catch (err) {
            modal.querySelector("#form-error").innerHTML = `<div class="error-banner">${UI.escapeHtml(err.message)}</div>`;
          }
        };
      },
    });
  }

  function openCakeForm(cake) {
    const isEdit = !!cake;
    const lines = isEdit ? cake.ingredients.map((l) => ({ ingredient_id: l.ingredient_id, quantity: l.quantity })) : [];
    let lineState = lines.length ? [...lines] : [{ ingredient_id: ingredients[0]?.id, quantity: "" }];

    function ingredientOptions(selectedId) {
      return ingredients.map((i) => `<option value="${i.id}" ${i.id === selectedId ? "selected" : ""}>${UI.escapeHtml(i.name)} (${UI.unitLabel(i.unit)})</option>`).join("");
    }

    function linesHtml() {
      return lineState.map((line, idx) => `
        <div class="recipe-line" data-idx="${idx}">
          <select class="line-ingredient">${ingredientOptions(line.ingredient_id)}</select>
          <input class="line-qty" type="number" step="any" min="0.001" value="${line.quantity}" placeholder="Cantidad" />
          <button type="button" class="icon-btn remove-line" title="Quitar">✕</button>
        </div>
      `).join("");
    }

    function bodyHtml() {
      return `
        <h3>${isEdit ? "Editar torta" : "Nueva torta"}</h3>
        <div id="form-error"></div>
        <form id="cake-form">
          <div class="field">
            <label>Nombre</label>
            <input name="name" required value="${UI.escapeHtml(cake?.name || "")}" placeholder="Ej: Chocotorta" />
          </div>
          <div class="field">
            <label>Costo extra por unidad (mano de obra, delivery, etc.) — opcional</label>
            <input name="extra_cost" type="number" step="any" min="0" value="${cake?.extra_cost ?? 0}" />
          </div>
          <div class="field">
            <label>Ingredientes</label>
            <div class="recipe-lines" id="recipe-lines">${linesHtml()}</div>
            <button type="button" class="btn small" id="add-line">+ Agregar ingrediente</button>
          </div>
          <div class="row" style="justify-content:space-between; margin-top:16px;">
            <span></span>
            <div class="row">
              <button type="button" class="btn" id="cancel-btn">Cancelar</button>
              <button type="submit" class="btn primary">${isEdit ? "Guardar" : "Crear"}</button>
            </div>
          </div>
        </form>
      `;
    }

    UI.openModal(bodyHtml(), {
      onMount: (modal) => wireCakeForm(modal),
    });

    function wireCakeForm(modal) {
      modal.querySelector("#cancel-btn").onclick = UI.closeModal;

      function syncLineState() {
        lineState = Array.from(modal.querySelectorAll(".recipe-line")).map((row) => ({
          ingredient_id: Number(row.querySelector(".line-ingredient").value),
          quantity: row.querySelector(".line-qty").value,
        }));
      }

      function refreshLines() {
        modal.querySelector("#recipe-lines").innerHTML = linesHtml();
        attachLineHandlers();
      }

      function attachLineHandlers() {
        modal.querySelectorAll(".remove-line").forEach((btn) => {
          btn.onclick = () => {
            syncLineState();
            const idx = Number(btn.closest(".recipe-line").dataset.idx);
            lineState.splice(idx, 1);
            refreshLines();
          };
        });
      }
      attachLineHandlers();

      modal.querySelector("#add-line").onclick = () => {
        syncLineState();
        lineState.push({ ingredient_id: ingredients[0]?.id, quantity: "" });
        refreshLines();
      };

      modal.querySelector("#cake-form").onsubmit = async (e) => {
        e.preventDefault();
        syncLineState();
        const fd = new FormData(e.target);
        const validLines = lineState
          .filter((l) => l.ingredient_id && l.quantity !== "" && !isNaN(parseFloat(l.quantity)))
          .map((l) => ({ ingredient_id: l.ingredient_id, quantity: parseFloat(l.quantity) }));

        const data = {
          name: fd.get("name").trim(),
          extra_cost: parseFloat(fd.get("extra_cost") || 0),
          ingredients: validLines,
        };
        try {
          if (isEdit) await Api.cakes.update(cake.id, data);
          else await Api.cakes.create(data);
          UI.closeModal();
          UI.toast(isEdit ? "Torta actualizada" : "Torta creada");
          render();
        } catch (err) {
          modal.querySelector("#form-error").innerHTML = `<div class="error-banner">${UI.escapeHtml(err.message)}</div>`;
        }
      };
    }
  }

  async function handleDelete(cake) {
    const ok = await UI.confirmDialog(`¿Borrar la torta "${cake.name}"? Si ya tiene ventas registradas, se archivará en vez de borrarse.`);
    if (!ok) return;
    try {
      await Api.cakes.remove(cake.id);
      UI.toast("Listo");
      render();
    } catch (err) {
      UI.toast(err.message, true);
    }
  }

  return { render, getAll: () => cakes };
})();

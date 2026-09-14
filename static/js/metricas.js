const MetricasView = (() => {
  let range = { from: null, to: null };
  let timeseriesChart = null;
  let topSellersChart = null;
  let byCakeData = [];

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function presetRange(days) {
    const to = new Date();
    const from = new Date();
    if (days !== null) from.setDate(from.getDate() - (days - 1));
    return {
      from: days === null ? "" : from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  }

  async function render() {
    const panel = document.getElementById("tab-metricas");
    if (!range.to) range = presetRange(30);
    panel.innerHTML = `<p class="muted">Cargando...</p>`;

    const params = {};
    if (range.from) params.from = range.from;
    if (range.to) params.to = range.to;

    const [summary, byCake, timeseries] = await Promise.all([
      Api.metrics.summary(params),
      Api.metrics.byCake(params),
      Api.metrics.timeseries({ ...params, granularity: "day" }),
    ]);
    byCakeData = byCake;

    panel.innerHTML = template(summary, byCake);
    bind(panel);
    drawTimeseries(timeseries);
    drawTopSellers(byCake);
  }

  function template(summary, byCake) {
    const bestSeller = [...byCake].sort((a, b) => b.units_sold - a.units_sold)[0];
    const mostProfitable = [...byCake].sort((a, b) => b.profit - a.profit)[0];

    return `
      <div class="filters">
        <button class="btn small" data-preset="7">Últimos 7 días</button>
        <button class="btn small" data-preset="30">Últimos 30 días</button>
        <button class="btn small" data-preset="90">Últimos 90 días</button>
        <button class="btn small" data-preset="all">Todo</button>
        <span class="muted">·</span>
        <div class="field" style="margin:0;">
          <input type="date" id="date-from" value="${range.from || ""}" />
        </div>
        <span class="muted">a</span>
        <div class="field" style="margin:0;">
          <input type="date" id="date-to" value="${range.to || ""}" />
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-tile">
          <div class="label">Ingresos totales</div>
          <div class="value">${UI.fmtMoney(summary.total_revenue)}</div>
        </div>
        <div class="stat-tile">
          <div class="label">Costos totales</div>
          <div class="value">${UI.fmtMoney(summary.total_cost)}</div>
        </div>
        <div class="stat-tile">
          <div class="label">Ganancia</div>
          <div class="value" style="color:var(--success);">${UI.fmtMoney(summary.total_profit)}</div>
          <div class="sub">Margen: ${UI.fmtPct(summary.margin_pct)}</div>
        </div>
        <div class="stat-tile">
          <div class="label">Unidades vendidas</div>
          <div class="value">${summary.units_sold}</div>
          <div class="sub">${summary.num_sales} venta(s) registradas</div>
        </div>
        <div class="stat-tile">
          <div class="label">Torta más vendida</div>
          <div class="value" style="font-size:16px;">${bestSeller ? UI.escapeHtml(bestSeller.cake_name) : "—"}</div>
          <div class="sub">${bestSeller ? bestSeller.units_sold + " unidades" : ""}</div>
        </div>
        <div class="stat-tile">
          <div class="label">Torta más rentable</div>
          <div class="value" style="font-size:16px;">${mostProfitable ? UI.escapeHtml(mostProfitable.cake_name) : "—"}</div>
          <div class="sub">${mostProfitable ? UI.fmtMoney(mostProfitable.profit) + " de ganancia" : ""}</div>
        </div>
      </div>

      <div class="card">
        <h2>Ingresos, costos y ganancia en el tiempo</h2>
        <div class="chart-wrap"><canvas id="chart-timeseries"></canvas></div>
      </div>

      <div class="card">
        <h2>Unidades vendidas por torta</h2>
        <div class="chart-wrap" style="height:${Math.max(220, byCake.length * 34)}px;"><canvas id="chart-top-sellers"></canvas></div>
      </div>

      <div class="card">
        <div class="toolbar"><h2>Detalle por torta</h2></div>
        ${byCakeTableHtml(byCake)}
      </div>
    `;
  }

  function byCakeTableHtml(byCake) {
    if (!byCake.length) return `<div class="empty-state">No hay ventas en el período seleccionado.</div>`;
    const sorted = [...byCake].sort((a, b) => b.profit - a.profit);
    const rows = sorted.map((r) => `
      <tr>
        <td>${UI.escapeHtml(r.cake_name)}</td>
        <td class="num">${r.units_sold}</td>
        <td class="num">${UI.fmtMoney(r.total_revenue)}</td>
        <td class="num">${UI.fmtMoney(r.total_cost)}</td>
        <td class="num" style="color:${r.profit >= 0 ? "var(--success)" : "var(--critical)"}">${UI.fmtMoney(r.profit)}</td>
        <td class="num">${UI.fmtPct(r.margin_pct)}</td>
      </tr>
    `).join("");
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Torta</th><th class="num">Unidades</th><th class="num">Ingresos</th><th class="num">Costos</th><th class="num">Ganancia</th><th class="num">Margen</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function bind(panel) {
    panel.querySelectorAll("[data-preset]").forEach((btn) => {
      btn.onclick = () => {
        const p = btn.dataset.preset;
        range = p === "all" ? presetRange(null) : presetRange(Number(p));
        render();
      };
    });
    panel.querySelector("#date-from").onchange = (e) => { range.from = e.target.value; render(); };
    panel.querySelector("#date-to").onchange = (e) => { range.to = e.target.value; render(); };
  }

  function drawTimeseries(data) {
    const ctx = document.getElementById("chart-timeseries");
    if (!ctx) return;
    if (timeseriesChart) timeseriesChart.destroy();

    const labels = data.map((d) => d.bucket);
    const gridline = cssVar("--gridline");
    const textMuted = cssVar("--text-muted");
    const textSecondary = cssVar("--text-secondary");

    timeseriesChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Ingresos", data: data.map((d) => d.total_revenue), borderColor: cssVar("--series-1"), backgroundColor: cssVar("--series-1"), tension: 0.25, borderWidth: 2, pointRadius: 2, pointHoverRadius: 4 },
          { label: "Costos", data: data.map((d) => d.total_cost), borderColor: cssVar("--series-2"), backgroundColor: cssVar("--series-2"), tension: 0.25, borderWidth: 2, pointRadius: 2, pointHoverRadius: 4 },
          { label: "Ganancia", data: data.map((d) => d.profit), borderColor: cssVar("--series-3"), backgroundColor: cssVar("--series-3"), tension: 0.25, borderWidth: 2, pointRadius: 2, pointHoverRadius: 4 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "bottom", labels: { color: textSecondary, boxWidth: 10, boxHeight: 10, usePointStyle: true } },
          tooltip: {
            callbacks: {
              label: (item) => `${item.dataset.label}: ${UI.fmtMoney(item.raw)}`,
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: textMuted, maxRotation: 0, autoSkip: true } },
          y: { grid: { color: gridline }, ticks: { color: textMuted, callback: (v) => UI.fmtMoney(v) } },
        },
      },
    });
  }

  function drawTopSellers(byCake) {
    const ctx = document.getElementById("chart-top-sellers");
    if (!ctx) return;
    if (topSellersChart) topSellersChart.destroy();

    const sorted = [...byCake].sort((a, b) => b.units_sold - a.units_sold);
    const gridline = cssVar("--gridline");
    const textMuted = cssVar("--text-muted");

    topSellersChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: sorted.map((d) => d.cake_name),
        datasets: [{
          label: "Unidades vendidas",
          data: sorted.map((d) => d.units_sold),
          backgroundColor: cssVar("--series-1"),
          borderRadius: 4,
          maxBarThickness: 22,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (item) => `${item.raw} unidades` } },
        },
        scales: {
          x: { grid: { color: gridline }, ticks: { color: textMuted, precision: 0 } },
          y: { grid: { display: false }, ticks: { color: textMuted } },
        },
      },
    });
  }

  return { render };
})();

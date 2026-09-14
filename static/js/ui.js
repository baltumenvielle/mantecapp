const UI = (() => {
  const fmtMoney = (n) => "$" + Math.round(n || 0).toLocaleString("es-AR");
  const fmtMoney2 = (n) => "$" + (n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtNum = (n) => (n || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 });
  const fmtPct = (n) => (n || 0).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "%";
  const unitLabel = (u) => ({ g: "gramos", ml: "ml", u: "unidades" }[u] || u);

  function toast(message, isError = false) {
    const root = document.getElementById("toast-root");
    const el = document.createElement("div");
    el.className = "toast";
    if (isError) el.style.background = "var(--critical)";
    el.textContent = message;
    root.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function openModal(innerHtml, { onMount } = {}) {
    const root = document.getElementById("modal-root");
    root.innerHTML = `<div class="modal-backdrop"><div class="modal">${innerHtml}</div></div>`;
    const backdrop = root.querySelector(".modal-backdrop");
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
    document.addEventListener("keydown", escListener);
    if (onMount) onMount(root.querySelector(".modal"));
    return root.querySelector(".modal");
  }

  function escListener(e) {
    if (e.key === "Escape") closeModal();
  }

  function closeModal() {
    document.getElementById("modal-root").innerHTML = "";
    document.removeEventListener("keydown", escListener);
  }

  async function confirmDialog(message) {
    return new Promise((resolve) => {
      openModal(`
        <h3>Confirmar</h3>
        <p class="secondary-text">${escapeHtml(message)}</p>
        <div class="row" style="justify-content:flex-end; margin-top:16px;">
          <button class="btn" id="confirm-no">Cancelar</button>
          <button class="btn danger" id="confirm-yes">Confirmar</button>
        </div>
      `, {
        onMount: (modal) => {
          modal.querySelector("#confirm-no").onclick = () => { closeModal(); resolve(false); };
          modal.querySelector("#confirm-yes").onclick = () => { closeModal(); resolve(true); };
        },
      });
    });
  }

  function todayIso() {
    const d = new Date();
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d - tz).toISOString().slice(0, 10);
  }

  return { fmtMoney, fmtMoney2, fmtNum, fmtPct, unitLabel, toast, escapeHtml, openModal, closeModal, confirmDialog, todayIso };
})();

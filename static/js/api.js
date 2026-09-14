const Api = (() => {
  async function request(path, options = {}) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (res.status === 204) return null;
    let body = null;
    try { body = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const message = (body && body.error) || `Error ${res.status}`;
      throw new Error(message);
    }
    return body;
  }

  const get = (path) => request(path);
  const post = (path, data) => request(path, { method: "POST", body: JSON.stringify(data) });
  const put = (path, data) => request(path, { method: "PUT", body: JSON.stringify(data) });
  const del = (path) => request(path, { method: "DELETE" });

  return {
    ingredients: {
      list: () => get("/api/ingredients"),
      create: (data) => post("/api/ingredients", data),
      update: (id, data) => put(`/api/ingredients/${id}`, data),
      remove: (id) => del(`/api/ingredients/${id}`),
    },
    cakes: {
      list: (includeInactive = false) => get(`/api/cakes${includeInactive ? "?include_inactive=1" : ""}`),
      get: (id) => get(`/api/cakes/${id}`),
      create: (data) => post("/api/cakes", data),
      update: (id, data) => put(`/api/cakes/${id}`, data),
      remove: (id) => del(`/api/cakes/${id}`),
    },
    sales: {
      list: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return get(`/api/sales${qs ? "?" + qs : ""}`);
      },
      create: (data) => post("/api/sales", data),
      remove: (id) => del(`/api/sales/${id}`),
    },
    metrics: {
      summary: (params = {}) => get(`/api/metrics/summary?${new URLSearchParams(params)}`),
      byCake: (params = {}) => get(`/api/metrics/by-cake?${new URLSearchParams(params)}`),
      timeseries: (params = {}) => get(`/api/metrics/timeseries?${new URLSearchParams(params)}`),
    },
    settings: {
      get: () => get("/api/settings"),
      updateMultipliers: (value) => put("/api/settings/price_multipliers", { value }),
    },
  };
})();

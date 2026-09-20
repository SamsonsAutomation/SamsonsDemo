(function () {
  const cfg = window.SAMSONS_CLOCK_CONFIG || {};
  const rawBase = String(cfg.API_BASE_URL || '').trim().replace(/\/$/, '');

  function configured() {
    return rawBase && !rawBase.includes('YOUR-WORKER-URL');
  }

  async function request(path, options = {}) {
    if (!configured()) {
      throw new Error('The secure clock backend is not configured yet. Set API_BASE_URL in config.js after deploying the Worker.');
    }
    const headers = new Headers(options.headers || {});
    if (options.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (options.token) headers.set('Authorization', `Bearer ${options.token}`);

    const response = await fetch(`${rawBase}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : (typeof options.body === 'string' ? options.body : JSON.stringify(options.body))
    });
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) {
      const err = new Error(payload?.error || `Request failed (${response.status})`);
      err.status = response.status;
      err.details = payload;
      throw err;
    }
    return payload;
  }

  window.SamsonsClockAPI = {
    configured,
    baseUrl: rawBase,
    request
  };
})();

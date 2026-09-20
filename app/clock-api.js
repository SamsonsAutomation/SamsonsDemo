(function () {
  const cfg = window.SAMSONS_CLOCK_CONFIG || {};
  const rawBase = String(cfg.API_BASE_URL || '').trim().replace(/\/$/, '');

  function configured() {
    return rawBase && !rawBase.includes('YOUR-WORKER-URL');
  }

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function request(path, options = {}) {
    if (!configured()) {
      throw new Error('The secure clock backend is not configured yet. Set API_BASE_URL in config.js after deploying the Worker.');
    }
    const headers = new Headers(options.headers || {});
    if (options.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (options.token) headers.set('Authorization', `Bearer ${options.token}`);

    const attempts = options.noRetry ? 1 : 2;
    let lastNetworkError = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 18000));
      try {
        const response = await fetch(`${rawBase}${path}`, {
          method: options.method || 'GET',
          headers,
          body: options.body === undefined ? undefined : (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)),
          cache: 'no-store',
          credentials: 'omit',
          signal: controller.signal
        });
        clearTimeout(timeout);
        let payload = null;
        try { payload = await response.json(); } catch { payload = null; }
        if (!response.ok) {
          const err = new Error(payload?.error || `Request failed (${response.status})`);
          err.status = response.status;
          err.details = payload;
          throw err;
        }
        return payload;
      } catch (err) {
        clearTimeout(timeout);
        if (err.status) throw err;
        lastNetworkError = err;
        if (attempt + 1 < attempts) await sleep(650);
      }
    }
    const err = new Error('Could not reach the secure time-clock server. Your GPS may have succeeded, but the server connection failed. Check your internet connection and open the page directly in Chrome, Safari, or Edge rather than an in-app browser.');
    err.cause = lastNetworkError;
    err.networkError = true;
    throw err;
  }

  async function health() {
    try { return await request('/api/health', { noRetry: true, timeoutMs: 8000 }); }
    catch { return null; }
  }

  window.SamsonsClockAPI = {
    configured,
    baseUrl: rawBase,
    request,
    health
  };
})();

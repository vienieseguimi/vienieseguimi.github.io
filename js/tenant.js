/**
 * Risolve l’ente dal primo segmento di path: /vanzago/… → ente "vanzago".
 * Apex `/` → portale. Override: ?ente= o PELLEGRINAGGIO_BOOT.ente.
 * /<ente>/secretariat → redirect a secretariat.html?ente=
 */
(function () {
  const cfg = window.PELLEGRINAGGIO;
  const boot = window.PELLEGRINAGGIO_BOOT || {};

  const RISERVATI = {
    www: 1, app: 1, admin: 1, platform: 1, api: 1, mail: 1, ftp: 1,
    localhost: 1, cdn: 1, static: 1, status: 1, help: 1, docs: 1,
    css: 1, js: 1, img: 1, images: 1, assets: 1, favicon: 1,
    index: 1, secretariat: 1, segreteria: 1,
  };

  function basePath() {
    return String(cfg.basePath || '').replace(/\/$/, '');
  }

  function pathParti() {
    let path = location.pathname.replace(/\/$/, '') || '/';
    const base = basePath();
    if (base && path.startsWith(base)) path = path.slice(base.length) || '/';
    return path.split('/').filter(Boolean).map(p => p.toLowerCase());
  }

  /** Id ente dal path (o override), oppure ''. */
  function enteDaPath() {
    if (boot.ente) return String(boot.ente).toLowerCase();
    const q = new URLSearchParams(location.search).get('ente');
    if (q) return String(q).toLowerCase();

    const parti = pathParti();
    if (!parti.length) return '';
    const primo = parti[0].replace(/\.html$/, '');
    if (primo.endsWith('.html') || RISERVATI[primo]) return '';
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(primo)) return '';
    return primo;
  }

  /** Se l’URL è /<ente>/secretariat, passa a secretariat.html?ente= */
  function redirigiSegreteriaSeServe() {
    const parti = pathParti();
    if (parti.length >= 2 && (parti[1] === 'secretariat' || parti[1] === 'segreteria')) {
      const ente = parti[0];
      const dest = (basePath() || '') + '/secretariat.html?ente=' + encodeURIComponent(ente);
      location.replace(dest + location.hash);
      return true;
    }
    return false;
  }

  async function platformApi(azione, payload, opzioni) {
    const timeoutMs = (opzioni && opzioni.timeoutMs) || 15000;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let risposta;
    try {
      const res = await fetch(cfg.platformApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ azione }, payload)),
        signal: ctrl.signal,
        redirect: 'follow',
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      risposta = await res.json();
    } catch (err) {
      const e = new Error('Connessione alla piattaforma non riuscita.');
      e.codice = 'rete';
      throw e;
    } finally {
      clearTimeout(timer);
    }
    if (!risposta || risposta.ok !== true) {
      const e = new Error((risposta && risposta.messaggio) || 'Errore piattaforma.');
      e.codice = (risposta && risposta.errore) || 'sconosciuto';
      e.dati = risposta || {};
      throw e;
    }
    return risposta;
  }

  /**
   * Risolve l’ente corrente. Restituisce:
   *   { mode: 'ente', ente } | { mode: 'apex' } | { mode: 'errore', ... }
   */
  async function risolviTenant() {
    if (redirigiSegreteriaSeServe()) {
      return { mode: 'redirect' };
    }

    const id = enteDaPath();
    if (!id) {
      cfg.ente = null;
      cfg.apiUrl = '';
      return { mode: 'apex', subdomain: '' };
    }
    try {
      const r = await platformApi('risolvi', { subdomain: id });
      cfg.ente = r.ente;
      cfg.apiUrl = r.ente.apiUrl;
      return { mode: 'ente', ente: r.ente, subdomain: id };
    } catch (err) {
      cfg.ente = null;
      cfg.apiUrl = '';
      return {
        mode: 'errore',
        subdomain: id,
        errore: err.codice || 'rete',
        messaggio: err.message || 'Impossibile caricare questa comunità.',
      };
    }
  }

  /**
   * path: '/' | '/slug/' | 'secretariat' | '/secretariat.html'
   * → /vanzago/ · /vanzago/slug/ · /secretariat.html?ente=vanzago
   */
  function urlEnte(enteId, path) {
    const base = basePath();
    const id = String(enteId || '').toLowerCase();
    let p = path == null || path === '' ? '/' : String(path);
    if (p === 'secretariat' || p === '/secretariat' || p === 'secretariat.html' || p === '/secretariat.html') {
      return (base || '') + '/secretariat.html?ente=' + encodeURIComponent(id);
    }
    if (!p.startsWith('/')) p = '/' + p;
    if (!id) return (base || '') + (p === '/' ? '/' : p);
    if (p === '/') return (base || '') + '/' + id + '/';
    return (base || '') + '/' + id + p;
  }

  window.PellTenant = { enteDaPath, risolviTenant, platformApi, urlEnte, pathParti };
})();

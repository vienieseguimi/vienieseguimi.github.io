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
  /** Difesa in profondità: accetta solo una web app Apps Script, o /api quando si lavora in locale. */
  function apiUrlAffidabile(u) {
    u = String(u || '');
    if (/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u)) return true;
    const locale = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    return locale && (u === '/api' || /^https?:\/\/localhost(?::\d+)?\/api$/.test(u));
  }

  const LOGO_PORTALE = 'img/logo-icona.png';

  /**
   * Sulle pagine /<ente>/: nome (e logo se c’è) nell’header;
   * se c’è il logo org, il logo del portale passa nel footer.
   */
  function applicaBrandingEnte(ente) {
    const nome = ente && ente.nome ? String(ente.nome) : '';
    const logoOrg = ente && ente.logoUrl ? String(ente.logoUrl).trim() : '';
    const conLogoOrg = !!(nome && logoOrg && /^https:\/\//i.test(logoOrg));

    document.querySelectorAll('[data-brand-nome]').forEach(function (el) {
      if (nome) el.textContent = nome;
    });
    document.querySelectorAll('[data-brand-logo]').forEach(function (img) {
      if (conLogoOrg) {
        img.src = logoOrg;
        img.alt = nome;
        img.dataset.logoEnte = '1';
      } else {
        img.src = LOGO_PORTALE;
        img.alt = '';
        delete img.dataset.logoEnte;
      }
    });
    document.querySelectorAll('[data-piede-portale]').forEach(function (el) {
      el.hidden = !conLogoOrg;
    });
    document.body.classList.toggle('con-logo-ente', conLogoOrg);
    document.body.classList.toggle('su-ente', !!nome);
  }

  async function risolviTenant() {
    if (redirigiSegreteriaSeServe()) {
      return { mode: 'redirect' };
    }

    const id = enteDaPath();
    if (!id) {
      cfg.ente = null;
      cfg.apiUrl = '';
      applicaBrandingEnte(null);
      return { mode: 'apex', subdomain: '' };
    }
    try {
      const r = await platformApi('risolvi', { subdomain: id });
      cfg.ente = r.ente;
      if (!apiUrlAffidabile(r.ente && r.ente.apiUrl)) {
        throw Object.assign(new Error('Indirizzo del servizio non valido per questa comunità.'), { codice: 'api_non_valida' });
      }
      cfg.apiUrl = r.ente.apiUrl;
      applicaBrandingEnte(r.ente);
      return { mode: 'ente', ente: r.ente, subdomain: id };
    } catch (err) {
      cfg.ente = null;
      cfg.apiUrl = '';
      applicaBrandingEnte(null);
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

  window.PellTenant = {
    enteDaPath, risolviTenant, platformApi, urlEnte, pathParti, applicaBrandingEnte,
  };
})();

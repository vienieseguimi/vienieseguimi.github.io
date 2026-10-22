/**
 * Client del backend Apps Script.
 * Content-Type text/plain = richiesta "semplice": il browser non fa il preflight OPTIONS,
 * a cui Apps Script non sa rispondere. fetch segue da solo il 302 verso googleusercontent.com.
 */
(function () {
  class ErroreApi extends Error {
    constructor(codice, messaggio, dati) {
      super(messaggio);
      this.codice = codice;
      this.dati = dati || {};
    }
  }

  async function api(azione, payload, opzioni) {
    const timeoutMs = (opzioni && opzioni.timeoutMs) || 30000;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let risposta;
    try {
      const res = await fetch(window.PELLEGRINAGGIO.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ azione }, payload)),
        signal: ctrl.signal,
        redirect: 'follow',
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      risposta = await res.json();
    } catch (err) {
      throw new ErroreApi('rete', 'Connessione non riuscita.');
    } finally {
      clearTimeout(timer);
    }
    if (!risposta || risposta.ok !== true) {
      const r = risposta || {};
      throw new ErroreApi(r.errore || 'sconosciuto', r.messaggio || 'Errore imprevisto.', r);
    }
    return risposta;
  }

  /** Storage tollerante: in navigazione privata o con i cookie bloccati non deve rompere nulla. */
  const area = tipo => (tipo === 'sessione' ? window.sessionStorage : window.localStorage);
  const memoria = {
    leggi(chiave, tipo) {
      try { const v = area(tipo).getItem(chiave); return v === null ? null : JSON.parse(v); } catch (e) { return null; }
    },
    scrivi(chiave, valore, tipo) {
      try { area(tipo).setItem(chiave, JSON.stringify(valore)); } catch (e) { /* ignora */ }
    },
    togli(chiave, tipo) {
      try { area(tipo).removeItem(chiave); } catch (e) { /* ignora */ }
    },
  };

  function basePath() {
    return String((window.PELLEGRINAGGIO && window.PELLEGRINAGGIO.basePath) || '').replace(/\/$/, '');
  }

  function pathParti() {
    let path = location.pathname.replace(/\/$/, '') || '/';
    const base = basePath();
    if (base && path.startsWith(base)) path = path.slice(base.length) || '/';
    return path.split('/').filter(Boolean);
  }

  function entePathPrefix() {
    const ente = window.PELLEGRINAGGIO && window.PELLEGRINAGGIO.ente;
    if (ente && ente.subdomain) return String(ente.subdomain).toLowerCase();
    // Prima del resolve (o se manca cfg.ente): primo segmento path = id ente
    if (window.PellTenant && typeof window.PellTenant.enteDaPath === 'function') {
      return window.PellTenant.enteDaPath() || '';
    }
    return '';
  }

  /**
   * Slug pellegrinaggio dall’URL.
   * Con ente: /vanzago/assisi-2026 → assisi-2026
   * Senza ente (dev locale): /assisi-2026 → assisi-2026
   */
  function slugDaUrl() {
    const parti = pathParti().map(p => p.toLowerCase());
    if (!parti.length) return '';
    const pref = entePathPrefix();
    let cand;
    if (pref && parti[0] === pref) cand = parti[1] || '';
    else if (!pref) cand = parti[0] || '';
    else return '';
    if (!cand || cand.endsWith('.html') || cand === 'css' || cand === 'js') return '';
    if (cand === 'secretariat' || cand === 'segreteria') return '';
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cand) ? cand : '';
  }

  function urlEdizione(slug) {
    const base = basePath();
    const pref = entePathPrefix();
    const mid = pref ? '/' + pref : '';
    return (base || '') + mid + '/' + slug + '/';
  }

  function urlHome() {
    const base = basePath();
    const pref = entePathPrefix();
    if (pref) return (base || '') + '/' + pref + '/';
    return base ? base + '/' : '/';
  }

  window.Pell = { api, ErroreApi, memoria, slugDaUrl, urlEdizione, urlHome, basePath };
})();

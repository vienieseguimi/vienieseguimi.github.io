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

  /** Ultimo segmento del path se è uno slug valido (es. /assisi-2026 → assisi-2026). */
  function slugDaUrl() {
    const base = basePath();
    let path = location.pathname.replace(/\/$/, '') || '/';
    if (base && path.startsWith(base)) path = path.slice(base.length) || '/';
    const parti = path.split('/').filter(Boolean);
    if (!parti.length) return '';
    const cand = parti[0].toLowerCase();
    if (cand.endsWith('.html') || cand === 'css' || cand === 'js') return '';
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cand) ? cand : '';
  }

  function urlEdizione(slug) {
    const base = basePath();
    return (base || '') + '/' + slug + '/';
  }

  function urlHome() {
    const base = basePath();
    return base ? base + '/' : '/';
  }

  window.Pell = { api, ErroreApi, memoria, slugDaUrl, urlEdizione, urlHome, basePath };
})();

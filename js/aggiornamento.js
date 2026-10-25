/**
 * Avviso di nuova versione: confronta la versione della pagina con /version.json (sempre dalla rete).
 * Se la pagina aperta è vecchia mostra un banner con il pulsante «Ricarica».
 */
(function () {
  const cfg = window.PELLEGRINAGGIO || {};
  const versionePagina = String(cfg.version || '');
  if (!versionePagina) return;
  const PAUSA_MS = 5 * 60 * 1000;
  let mostrato = false;

  function mostraBanner() {
    if (mostrato) return;
    mostrato = true;
    const box = document.createElement('div');
    box.setAttribute('role', 'status');
    box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;display:flex;gap:12px;' +
      'align-items:center;justify-content:space-between;padding:12px 16px;border-radius:10px;' +
      'background:#1f2937;color:#fff;font:15px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.3)';
    const testo = document.createElement('span');
    testo.textContent = 'È disponibile una versione aggiornata del sito.';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Ricarica';
    btn.style.cssText = 'padding:8px 14px;border:0;border-radius:8px;background:#fff;color:#1f2937;font-weight:600;cursor:pointer';
    btn.addEventListener('click', function () { location.reload(); });
    box.appendChild(testo);
    box.appendChild(btn);
    document.body.appendChild(box);
  }

  async function controlla() {
    if (mostrato) return;
    try {
      const base = String(cfg.basePath || '').replace(/\/$/, '');
      const res = await fetch(base + '/version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const dati = await res.json();
      if (dati && dati.version && dati.version !== versionePagina) mostraBanner();
    } catch (e) { /* offline o file assente: nessun avviso */ }
  }

  function avvia() {
    controlla();
    setInterval(controlla, PAUSA_MS);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) controlla();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia);
  else avvia();
})();

/**
 * Configurazione del sito.
 * - platformApiUrl: backend registry enti (console + resolve)
 * - apiUrl: impostato da tenant.js dopo risolvi (GAS della parrocchia)
 * Multi-ente a path: /<ente>/ e /<ente>/<slug>/ (funziona su GitHub Pages senza dominio custom).
 */
window.PELLEGRINAGGIO = {
  platformApiUrl: ['localhost', '127.0.0.1'].includes(location.hostname)
    ? '/platform-api'
    : 'https://script.google.com/macros/s/AKfycbzJU7dtWEvcPfhHoG_D1ZWTYsfTPEjukZ7PAvtvCzeYaqQbhwTAzZuIZCZf-Ha5tMTM/exec',

  // Valorizzato da js/tenant.js dopo risolvi (su /<ente>/). Sulla home / resta vuoto (portale enti).
  apiUrl: '',

  // Prefisso del sito su GitHub Pages '' per organization; '/nome-repo' per progetto.
  basePath: (window.PELLEGRINAGGIO_BOOT && window.PELLEGRINAGGIO_BOOT.basePath) || '',

  intervalloAggiornamento: 10000,

  // Allineata a package.json; `npm run publish` la riscrive sulla copia pubblica.
  version: '0.2.19',
};

(function riempiVersione() {
  const v = window.PELLEGRINAGGIO && window.PELLEGRINAGGIO.version;
  if (!v) return;
  function applica() {
    document.querySelectorAll('[data-site-version]').forEach(function (el) {
      el.textContent = 'v' + v;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applica);
  else applica();
})();

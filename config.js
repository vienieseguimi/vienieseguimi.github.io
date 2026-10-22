/**
 * Configurazione del sito. I testi dell'evento vivono nel backend (foglio Pellegrinaggi)
 * e si gestiscono dal pannello segreteria.
 */
window.PELLEGRINAGGIO = {
  // URL della web app Apps Script (Deploy → Gestisci deployment → URL che finisce con /exec).
  apiUrl: ['localhost', '127.0.0.1'].includes(location.hostname)
    ? '/api'
    : 'https://script.google.com/macros/s/AKfycbyLkbwFPENA7PJpT9m-TGtFuSMOJl8OG_rgS1Voou1oU9WWJaLTlZlwfIcruSTCNtaj/exec',

  // Prefisso del sito su GitHub Pages '' per il sito di organization vienieseguimi.github.io; '/nome-repo' per un sito di progetto.
  // Deve coincidere con PELLEGRINAGGIO_BOOT.basePath in index.html / 404.html / segreteria.html.
  basePath: (window.PELLEGRINAGGIO_BOOT && window.PELLEGRINAGGIO_BOOT.basePath) || '',

  // Ogni quanti millisecondi il pannello controlla se ci sono novità.
  intervalloAggiornamento: 10000,
};

(async function () {
  const { api, memoria, slugDaUrl, urlEdizione, urlHome } = window.Pell;
  const { risolviTenant, platformApi, urlEnte } = window.PellTenant;
  const cfg = window.PELLEGRINAGGIO;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function mostraErroreHome(msg) {
    $('#home-caricamento').hidden = true;
    $('#home-errore').hidden = false;
    if (msg) {
      const p = $('#home-errore').querySelector('p:not(.stato-home-etichetta):not(.stato-home-azioni)');
      if (p) p.textContent = msg;
    }
    const riprova = $('#home-riprova');
    if (riprova) riprova.addEventListener('click', () => location.reload());
  }

  async function avviaPortale() {
    $('#vista-home').hidden = false;
    document.title = 'Vieni e seguimi · Comunità';
    $('#home-parrocchia').textContent = 'Vieni e seguimi';
    const sotto = $('#home-brand-sotto');
    if (sotto) sotto.textContent = 'Portale iscrizioni';
    const h1 = $('#vista-home h1');
    if (h1) h1.textContent = 'Comunità';
    const meta = document.querySelector('.meta-home');
    if (meta) meta.textContent = 'Scegli la tua parrocchia o comunità pastorale.';
    const piedeSeg = $('#piede-segreteria');
    if (piedeSeg) piedeSeg.hidden = true;
    // Console operatori: non pubblicizzata in home (URL noto solo agli operatori).
    try {
      const r = await platformApi('enti_attivi', {}, { timeoutMs: 15000 });
      $('#home-caricamento').hidden = true;
      const lista = r.enti || [];
      if (!lista.length) {
        $('#home-vuoto').hidden = false;
        $('#home-vuoto').querySelector('h2').textContent = 'Nessuna comunità ancora';
        $('#home-vuoto').querySelector('p').textContent =
          'Le iscrizioni saranno disponibili quando la piattaforma avrà attivato le comunità.';
        return;
      }
      const box = $('#home-portale');
      box.hidden = false;
      box.classList.add('lista-enti');
      box.innerHTML = lista.map(e =>
        '<a class="card-edizione card-ente" href="' + esc(urlEnte(e.subdomain, '/')) + '">' +
        '<h2>' + esc(e.nome) + '</h2>' +
        '<p class="card-fatti">Iscrizioni ai pellegrinaggi</p>' +
        '<span class="card-cta">Entra</span></a>'
      ).join('');
    } catch (err) {
      mostraErroreHome('Non riusciamo a caricare l’elenco delle comunità.');
    }
  }

  const tenant = await risolviTenant();

  if (tenant.mode === 'redirect') return;

  if (tenant.mode === 'errore') {
    $('#vista-home').hidden = false;
    $('#home-caricamento').hidden = true;
    $('#home-ente-mancante').hidden = false;
    const msg = $('#home-ente-mancante-msg');
    if (msg) msg.textContent = tenant.messaggio || msg.textContent;
    const piedeSeg = $('#piede-segreteria');
    if (piedeSeg) piedeSeg.hidden = true;
    document.title = 'Vieni e seguimi · Comunità non trovata';
    return;
  }

  // Home di piattaforma: elenco enti → click → /<ente>/
  if (tenant.mode === 'apex') {
    await avviaPortale();
    return;
  }

  // Dopo il resolve: cfg.ente è valorizzato, così /demo/ non viene preso come slug
  const slug = slugDaUrl();

  if (tenant.mode === 'ente' && cfg.ente) {
    if (cfg.ente.nome) {
      document.querySelectorAll('#home-parrocchia').forEach(el => { el.textContent = cfg.ente.nome; });
    }
    const brandHome = $('#vista-home .brand');
    if (brandHome) brandHome.href = urlEnte(cfg.ente.subdomain, '/');
    const linkSeg = $('#link-secretariat');
    if (linkSeg) linkSeg.href = urlEnte(cfg.ente.subdomain, 'secretariat');
  }

  // ---- Home ente: elenco pellegrinaggi aperti
  if (!slug) {
    $('#vista-home').hidden = false;
    document.title = (cfg.ente && cfg.ente.nome ? cfg.ente.nome + ' · ' : '') + 'Iscrizioni · Vieni e seguimi';
    const meta = document.querySelector('.meta-home');
    if (meta) meta.textContent = 'Scegli il pellegrinaggio a cui vuoi iscriverti.';
    const indietro = $('#link-portale-home');
    if (indietro) {
      indietro.hidden = false;
      indietro.href = (cfg.basePath || '') + '/' || '/';
    }
    const piedePlat = $('#piede-piattaforma');
    if (piedePlat) {
      piedePlat.hidden = false;
      const etichetta = piedePlat.querySelector('.piede-etichetta');
      if (etichetta) etichetta.textContent = 'Comunità';
      const a = piedePlat.querySelector('a');
      if (a) {
        a.href = (cfg.basePath || '') + '/' || '/';
        a.textContent = 'Tutte le comunità';
      }
    }
    api('edizioni_pubbliche', {}, { timeoutMs: 15000 }).then(r => {
      $('#home-caricamento').hidden = true;
      const lista = r.edizioni || [];
      const nomeEnte = (lista[0] && lista[0].parrocchia)
        || (cfg.ente && cfg.ente.nome)
        || '';
      if (nomeEnte) {
        $('#home-parrocchia').textContent = nomeEnte;
        document.title = nomeEnte + ' · Iscrizioni · Vieni e seguimi';
      }
      if (!lista.length) { $('#home-vuoto').hidden = false; return; }
      const box = $('#home-lista');
      box.hidden = false;
      box.innerHTML = lista.map(e => {
        const titolo = esc(e.titolo) + (e.meta ? ' <span class="meta-card">' + esc(e.meta) + '</span>' : '');
        const fatti = [e.quando, e.scadenza].filter(Boolean).map(esc).join(' · ');
        return '<a class="card-edizione" href="' + esc(urlEdizione(e.slug)) + '">' +
          '<h2>' + titolo + '</h2>' +
          (fatti ? '<p class="card-fatti">' + fatti + '</p>' : '') +
          (e.quota ? '<p class="card-quota">' + esc(e.quota) + '</p>' : '') +
          '<span class="card-cta">Iscriviti</span></a>';
      }).join('');
    }).catch(() => {
      mostraErroreHome();
    });
    return;
  }

  // ---- Modulo edizione
  $('#vista-modulo').hidden = false;
  const home = urlHome();
  ['#link-altre', '#link-home-mancante', '#link-home-piede', '#link-home-testata', '#link-brand-modulo'].forEach(s => {
    const a = $(s); if (a) a.href = home;
  });
  if (cfg.ente && cfg.ente.nome) {
    const bn = document.querySelector('#vista-modulo .brand-nome');
    if (bn) bn.textContent = cfg.ente.nome;
  }

  const modulo = $('#modulo');
  const BOZZA = 'pellegrinaggio.bozza.' + slug;
  const CONTATTI = ['email', 'telefono', 'indirizzo', 'comune', 'parrocchiano_dichiarato'];
  let PASSI = 4;
  let CAMPI_PASSO = [
    ['nome', 'cognome', 'data_nascita', 'tutore'],
    ['email', 'telefono', 'indirizzo', 'comune', 'parrocchiano_dichiarato'],
    ['sistemazione', 'compagno_camera', 'esigenze', 'note'],
    ['consenso_privacy'],
  ];
  let FOCUS_PASSO = ['#nome', '#email', 'input[name=sistemazione]', '#consenso_privacy'];
  let PASSO_CAMPO = {};
  let haDocumenti = false;
  let passo = 0;
  let evento = null;

  function ricostruisciMappaPassi() {
    PASSO_CAMPO = {};
    CAMPI_PASSO.forEach((campi, i) => campi.forEach(c => { PASSO_CAMPO[c] = i; }));
  }
  ricostruisciMappaPassi();

  function configuraPassiDocumenti(docs) {
    haDocumenti = Array.isArray(docs) && docs.length > 0;
    const stepDocs = $('#stepper-documenti');
    const passoDocs = $('#passo-documenti');
    const passoInvio = $('#passo-invio');
    const stepInvio = $('#stepper-invio');
    const btnInvio = $('#stepper-btn-invio');
    const numInvio = $('#stepper-num-invio');
    const introN = $('#intro-passi-n');
    const lista = $('#lista-documenti');

    if (haDocumenti) {
      PASSI = 5;
      CAMPI_PASSO = [
        ['nome', 'cognome', 'data_nascita', 'tutore'],
        ['email', 'telefono', 'indirizzo', 'comune', 'parrocchiano_dichiarato'],
        ['sistemazione', 'compagno_camera', 'esigenze', 'note'],
        ['documenti_confermati'],
        ['consenso_privacy'],
      ];
      FOCUS_PASSO = ['#nome', '#email', 'input[name=sistemazione]', '#documenti_confermati', '#consenso_privacy'];
      if (stepDocs) { stepDocs.hidden = false; stepDocs.dataset.step = '3'; }
      if (passoDocs) passoDocs.dataset.passo = '3';
      if (passoInvio) passoInvio.dataset.passo = '4';
      if (stepInvio) stepInvio.dataset.step = '4';
      if (btnInvio) btnInvio.dataset.vai = '4';
      if (numInvio) numInvio.textContent = '5';
      if (introN) introN.textContent = '5';
      if (lista) {
        lista.innerHTML = docs.map(d =>
          '<li><a class="btn btn-secondario" href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">' +
          'Scarica: ' + esc(d.nome) + '</a></li>'
        ).join('');
      }
    } else {
      PASSI = 4;
      CAMPI_PASSO = [
        ['nome', 'cognome', 'data_nascita', 'tutore'],
        ['email', 'telefono', 'indirizzo', 'comune', 'parrocchiano_dichiarato'],
        ['sistemazione', 'compagno_camera', 'esigenze', 'note'],
        ['consenso_privacy'],
      ];
      FOCUS_PASSO = ['#nome', '#email', 'input[name=sistemazione]', '#consenso_privacy'];
      if (stepDocs) stepDocs.hidden = true;
      if (passoDocs) passoDocs.hidden = true;
      if (passoInvio) passoInvio.dataset.passo = '3';
      if (stepInvio) stepInvio.dataset.step = '3';
      if (btnInvio) btnInvio.dataset.vai = '3';
      if (numInvio) numInvio.textContent = '4';
      if (introN) introN.textContent = '4';
      if (lista) lista.innerHTML = '';
      const chk = $('#documenti_confermati');
      if (chk) chk.checked = false;
    }
    ricostruisciMappaPassi();
    if (passo >= PASSI) passo = PASSI - 1;
  }

  function applicaEvento(ev) {
    evento = ev;
    cfg.evento = ev;
    document.querySelectorAll('[data-evento]').forEach(el => { el.textContent = ev[el.dataset.evento] || ''; });
    document.title = ev.titolo + (ev.meta ? ' · ' + ev.meta : '') + ' · Vieni e seguimi';
    configuraPassiDocumenti(ev.documenti || []);
  }

  api('stato', { slug }, { timeoutMs: 15000 }).then(r => {
    applicaEvento(r.evento);
    if (!r.aperte) { modulo.hidden = true; $('#chiuse').hidden = false; }
    else { modulo.hidden = false; aggiornaStepper(); }
  }).catch(err => {
    if (err.codice === 'edizione_non_trovata' || err.codice === 'dati_non_validi') {
      $('#edizione-mancante').hidden = false;
    } else {
      modulo.hidden = false;
    }
  });

  const vistaData = $('#data_nascita_vista');
  const nativoData = $('#data_nascita');
  const oggiIso = new Date().toISOString().slice(0, 10);
  nativoData.max = oggiIso;

  function isoAIt(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
    const [a, m, g] = iso.split('-');
    return g + '/' + m + '/' + a;
  }
  function itAIso(testo) {
    const t = String(testo || '').trim();
    if (!t) return '';
    const m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
    if (!m) return 'non-valida';
    const g = +m[1], me = +m[2], a = +m[3];
    const iso = a + '-' + String(me).padStart(2, '0') + '-' + String(g).padStart(2, '0');
    const d = new Date(iso + 'T00:00:00Z');
    if (isNaN(d) || d.getUTCFullYear() !== a || d.getUTCMonth() + 1 !== me || d.getUTCDate() !== g) return 'non-valida';
    if (iso < '1900-01-01' || iso > oggiIso) return 'non-valida';
    return iso;
  }
  function mascheraData(grezzo) {
    const cifre = String(grezzo || '').replace(/\D/g, '').slice(0, 8);
    if (cifre.length <= 2) return cifre;
    if (cifre.length <= 4) return cifre.slice(0, 2) + '/' + cifre.slice(2);
    return cifre.slice(0, 2) + '/' + cifre.slice(2, 4) + '/' + cifre.slice(4);
  }
  function syncDaVista() {
    const iso = itAIso(vistaData.value);
    nativoData.value = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : '';
    aggiornaTutore();
  }
  function syncDaNativo() {
    if (nativoData.value) vistaData.value = isoAIt(nativoData.value);
    aggiornaTutore();
  }
  function impostaDataIso(iso) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      nativoData.value = iso;
      vistaData.value = isoAIt(iso);
    } else {
      nativoData.value = '';
      vistaData.value = '';
    }
    aggiornaTutore();
  }

  vistaData.addEventListener('input', () => {
    const pos = vistaData.selectionStart;
    const prima = vistaData.value;
    vistaData.value = mascheraData(vistaData.value);
    // cursore dopo l'ultimo carattere utile
    const delta = vistaData.value.length - prima.length;
    const nuova = Math.max(0, (pos || 0) + delta);
    try { vistaData.setSelectionRange(nuova, nuova); } catch (err) { /* IE */ }
    syncDaVista();
  });
  vistaData.addEventListener('blur', () => {
    const iso = itAIso(vistaData.value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) vistaData.value = isoAIt(iso);
    syncDaVista();
  });
  nativoData.addEventListener('change', syncDaNativo);
  nativoData.addEventListener('input', syncDaNativo);
  // Click sull'icona = click diretto sull'input date (niente showPicker, più affidabile)

  function valori() {
    const f = new FormData(modulo);
    const v = {};
    ['nome', 'cognome', 'email', 'telefono', 'indirizzo', 'comune', 'compagno_camera', 'tutore', 'esigenze', 'note', 'sito_web']
      .forEach(k => { v[k] = String(f.get(k) || '').trim(); });
    v.parrocchiano_dichiarato = f.get('parrocchiano_dichiarato') || '';
    v.sistemazione = f.get('sistemazione') || '';
    v.consenso_privacy = $('#consenso_privacy').checked;
    v.documenti_confermati = haDocumenti && $('#documenti_confermati') && $('#documenti_confermati').checked;
    // Preferisci ISO dal date nativo; altrimenti interpreta gg/mm/aaaa digitato
    if (nativoData.value && /^\d{4}-\d{2}-\d{2}$/.test(nativoData.value)) {
      v.data_nascita = nativoData.value;
    } else if (!vistaData.value.trim()) {
      v.data_nascita = '';
    } else {
      v.data_nascita = itAIso(vistaData.value);
    }
    return v;
  }

  function imposta(dati) {
    Object.keys(dati || {}).forEach(k => {
      if (k === 'data') {
        const d = dati.data || {};
        if (d.a && d.m && d.g) {
          impostaDataIso(String(d.a).padStart(4, '0') + '-' +
            String(d.m).padStart(2, '0') + '-' + String(d.g).padStart(2, '0'));
        }
        return;
      }
      if (k === 'data_nascita') { impostaDataIso(dati.data_nascita); return; }
      const radio = modulo.querySelectorAll('input[type=radio][name="' + k + '"]');
      if (radio.length) radio.forEach(r => { r.checked = r.value === dati[k]; });
      else if (modulo.elements[k] && modulo.elements[k].type !== 'checkbox') modulo.elements[k].value = dati[k];
    });
    aggiornaTutore();
  }

  function eta(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const [a, m, g] = iso.split('-').map(Number);
    const oggi = new Date();
    let e = oggi.getFullYear() - a;
    if (oggi.getMonth() + 1 < m || (oggi.getMonth() + 1 === m && oggi.getDate() < g)) e--;
    return e;
  }

  function aggiornaTutore() {
    const e = eta(nativoData.value || itAIso(vistaData.value));
    $('#campo-tutore').hidden = !(e !== null && e < 18);
  }

  function salvaBozza() {
    const v = valori();
    delete v.consenso_privacy; delete v.documenti_confermati; delete v.sito_web;
    if (v.data_nascita === 'non-valida') v.data_nascita = nativoData.value || '';
    v.passo = passo;
    memoria.scrivi(BOZZA, v);
  }
  const bozza = memoria.leggi(BOZZA);
  imposta(bozza);
  if (bozza && Number.isInteger(+bozza.passo) && +bozza.passo >= 0 && +bozza.passo < PASSI) passo = +bozza.passo;
  modulo.addEventListener('input', salvaBozza);
  modulo.addEventListener('change', salvaBozza);

  const ETICHETTE = {
    nome: 'Nome', cognome: 'Cognome', data_nascita: 'Data di nascita', tutore: 'Genitore o tutore',
    email: 'Email', telefono: 'Telefono', indirizzo: 'Indirizzo', comune: 'Comune di residenza',
    parrocchiano_dichiarato: 'Parrocchia', sistemazione: 'Camera',
    documenti_confermati: 'Documenti', consenso_privacy: 'Consenso',
  };
  const PRIMO_INPUT = {
    data_nascita: '#data_nascita_vista',
    parrocchiano_dichiarato: 'input[name=parrocchiano_dichiarato]',
    sistemazione: 'input[name=sistemazione]',
  };

  function valida(v) {
    const e = {};
    if (!v.nome) e.nome = 'Scrivi il nome';
    if (!v.cognome) e.cognome = 'Scrivi il cognome';
    if (!v.data_nascita) e.data_nascita = 'Scrivi la data di nascita (gg/mm/aaaa)';
    else if (v.data_nascita === 'non-valida') e.data_nascita = 'La data non è valida: usa gg/mm/aaaa';
    else { const a = eta(v.data_nascita); if (a < 0 || a > 110) e.data_nascita = 'Controlla l\'anno di nascita'; else if (a < 18 && !v.tutore) e.tutore = 'Scrivi il nome di un genitore o tutore'; }
    if (!v.email) e.email = 'Scrivi l\'indirizzo email';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) e.email = 'L\'email deve essere come nome@esempio.it';
    if (!v.telefono) e.telefono = 'Scrivi un numero di telefono';
    else if (!/^[+0-9 ()./-]{6,}$/.test(v.telefono)) e.telefono = 'Il numero può contenere solo cifre, spazi e +';
    if (!v.indirizzo) e.indirizzo = 'Scrivi via e numero civico';
    if (!v.comune) e.comune = 'Scrivi il comune di residenza';
    if (!v.parrocchiano_dichiarato) e.parrocchiano_dichiarato = 'Scegli una risposta';
    if (!v.sistemazione) e.sistemazione = 'Scegli il tipo di camera';
    if (haDocumenti && !v.documenti_confermati) e.documenti_confermati = 'Scarica i documenti e conferma di averli presi in visione';
    if (!v.consenso_privacy) e.consenso_privacy = 'Serve il consenso per registrare l\'iscrizione';
    return e;
  }

  function erroriPasso(errori, n) {
    const out = {};
    CAMPI_PASSO[n].forEach(k => { if (errori[k]) out[k] = errori[k]; });
    return out;
  }

  function mostraErrori(errori) {
    modulo.querySelectorAll('[data-campo]').forEach(c => {
      const msg = errori[c.dataset.campo];
      c.classList.toggle('errore', !!msg);
      const p = c.querySelector('.messaggio-errore');
      if (p) p.textContent = msg || '';
      c.querySelectorAll('input, textarea, select').forEach(i => i.setAttribute('aria-invalid', msg ? 'true' : 'false'));
    });
    const chiavi = Object.keys(errori);
    const box = $('#riepilogo-errori');
    box.hidden = !chiavi.length;
    if (!chiavi.length) return;
    if (errori.tutore) $('#campo-tutore').hidden = false;
    box.querySelector('ul').innerHTML = '';
    chiavi.forEach(k => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#';
      a.textContent = (ETICHETTE[k] || k) + ': ' + errori[k];
      a.addEventListener('click', ev => {
        ev.preventDefault();
        const destinazione = PASSO_CAMPO[k];
        if (destinazione !== undefined && destinazione !== passo) vaiA(destinazione, { senzaScroll: true });
        const el = modulo.querySelector(PRIMO_INPUT[k] || '[name="' + k + '"]');
        if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); }
      });
      li.appendChild(a);
      box.querySelector('ul').appendChild(li);
    });
    box.focus();
    box.scrollIntoView({ block: 'start' });
  }

  const btnIndietro = $('#indietro');
  const btnAvanti = $('#avanti');
  const bottone = $('#invia');
  const erroreInvio = $('#errore-invio');

  function aggiornaStepper() {
    $$('.stepper-voce').forEach(li => {
      if (li.hidden) return;
      const idx = +li.dataset.step;
      const btn = li.querySelector('.stepper-btn');
      const corrente = idx === passo;
      const fatto = idx < passo;
      li.classList.toggle('fatto', fatto);
      if (corrente) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
      if (btn) btn.disabled = !(fatto || corrente);
    });
    $$('.passo-pannello').forEach(p => {
      if (p.id === 'passo-documenti' && !haDocumenti) { p.hidden = true; return; }
      p.hidden = +p.dataset.passo !== passo;
    });
    btnIndietro.hidden = passo === 0;
    btnAvanti.hidden = passo === PASSI - 1;
    bottone.hidden = passo !== PASSI - 1;
  }

  function focusPasso() {
    const el = modulo.querySelector(FOCUS_PASSO[passo]);
    if (el) el.focus({ preventScroll: true });
  }

  function vaiA(n, opts) {
    passo = Math.max(0, Math.min(PASSI - 1, n));
    aggiornaStepper();
    mostraErrori({});
    erroreInvio.hidden = true;
    salvaBozza();
    if (!opts || !opts.senzaScroll) {
      window.scrollTo({ top: 0 });
      $('#stepper').scrollIntoView({ block: 'nearest' });
    }
    focusPasso();
  }

  btnAvanti.addEventListener('click', () => {
    const errori = erroriPasso(valida(valori()), passo);
    mostraErrori(errori);
    if (Object.keys(errori).length) return;
    vaiA(passo + 1);
  });
  btnIndietro.addEventListener('click', () => vaiA(passo - 1));
  $$('.stepper-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const destinazione = +btn.dataset.vai;
      if (destinazione >= passo) return;
      vaiA(destinazione);
    });
  });

  modulo.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (passo !== PASSI - 1) { btnAvanti.click(); return; }
    erroreInvio.hidden = true;
    const v = valori();
    const errori = valida(v);
    if (Object.keys(errori).length) {
      const destinazione = Math.min(...Object.keys(errori).map(k => PASSO_CAMPO[k]).filter(n => n !== undefined));
      if (Number.isFinite(destinazione) && destinazione !== passo) vaiA(destinazione, { senzaScroll: true });
      mostraErrori(Number.isFinite(destinazione) ? erroriPasso(errori, destinazione) : errori);
      return;
    }

    bottone.disabled = true;
    bottone.textContent = 'Invio in corso…';
    try {
      const r = await api('iscrivi', { slug, dati: v });
      mostraRicevuta(v, r.codice, r.stato);
    } catch (err) {
      if (err.codice === 'dati_non_validi' && err.dati.campi) {
        const campi = err.dati.campi;
        const destinazione = Math.min(...Object.keys(campi).map(k => PASSO_CAMPO[k]).filter(n => n !== undefined));
        if (Number.isFinite(destinazione) && destinazione !== passo) vaiA(destinazione, { senzaScroll: true });
        mostraErrori(Number.isFinite(destinazione) ? erroriPasso(campi, destinazione) : campi);
      } else if (err.codice === 'chiuse') {
        modulo.hidden = true; $('#chiuse').hidden = false;
      } else {
        erroreInvio.textContent = err.codice === 'rete'
          ? 'Non siamo riusciti a inviare l\'iscrizione. Controlla la connessione e premi di nuovo "Invia iscrizione": quello che hai scritto è ancora qui.'
          : err.message;
        erroreInvio.hidden = false;
        erroreInvio.scrollIntoView({ block: 'center' });
      }
    } finally {
      bottone.disabled = false;
      bottone.textContent = 'Invia iscrizione';
    }
  });

  let ultimiContatti = {};
  function mostraRicevuta(v, codice, stato) {
    ultimiContatti = {};
    CONTATTI.forEach(k => { ultimiContatti[k] = v[k]; });
    memoria.togli(BOZZA);
    $('#ricevuta-nome').textContent = v.nome + ' ' + v.cognome;
    $('#ricevuta-email').textContent = v.email;
    $('#timbro-codice').textContent = codice;
    $('#timbro-data').textContent = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const seguito = $('#ricevuta-seguito');
    if (seguito) {
      seguito.textContent = stato === 'lista_attesa'
        ? 'I posti sono al momento esauriti: sei in lista d’attesa. La segreteria ti scriverà se si libera un posto o quando l’iscrizione sarà confermata.'
        : 'La segreteria controllerà l’iscrizione e ti scriverà solo quando sarà confermata. Per ora non devi fare altro.';
    }
    modulo.hidden = true;
    const r = $('#ricevuta');
    r.hidden = false;
    const t = r.querySelector('.timbro'); t.replaceWith(t.cloneNode(true));
    window.scrollTo({ top: 0 });
    r.focus();
  }

  $('#altra').addEventListener('click', () => {
    modulo.reset();
    imposta(ultimiContatti);
    mostraErrori({});
    $('#ricevuta').hidden = true;
    modulo.hidden = false;
    vaiA(0);
    salvaBozza();
  });

  aggiornaStepper();
})();

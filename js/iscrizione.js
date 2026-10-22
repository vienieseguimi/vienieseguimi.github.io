(function () {
  const { api, memoria, slugDaUrl, urlEdizione, urlHome } = window.Pell;
  const cfg = window.PELLEGRINAGGIO;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const slug = slugDaUrl();

  // ---- Home: elenco edizioni aperte
  if (!slug) {
    $('#vista-home').hidden = false;
    document.title = 'Vieni e seguimi · Iscrizioni';
    api('edizioni_pubbliche', {}, { timeoutMs: 15000 }).then(r => {
      $('#home-caricamento').hidden = true;
      const lista = r.edizioni || [];
      if (lista[0] && lista[0].parrocchia) $('#home-parrocchia').textContent = lista[0].parrocchia;
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
      $('#home-caricamento').hidden = true;
      $('#home-errore').hidden = false;
    });
    return;
  }

  // ---- Modulo edizione
  $('#vista-modulo').hidden = false;
  const home = urlHome();
  ['#link-altre', '#link-home-mancante', '#link-home-piede', '#link-home-testata'].forEach(s => {
    const a = $(s); if (a) a.href = home;
  });

  const modulo = $('#modulo');
  const BOZZA = 'pellegrinaggio.bozza.' + slug;
  const CONTATTI = ['email', 'telefono', 'indirizzo', 'comune', 'parrocchiano_dichiarato'];
  const PASSI = 4;
  const CAMPI_PASSO = [
    ['nome', 'cognome', 'data_nascita', 'tutore'],
    ['email', 'telefono', 'indirizzo', 'comune', 'parrocchiano_dichiarato'],
    ['sistemazione', 'compagno_camera', 'esigenze', 'note'],
    ['consenso_privacy'],
  ];
  const FOCUS_PASSO = ['#nome', '#email', 'input[name=sistemazione]', '#consenso_privacy'];
  let passo = 0;
  let evento = null;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function applicaEvento(ev) {
    evento = ev;
    cfg.evento = ev;
    document.querySelectorAll('[data-evento]').forEach(el => { el.textContent = ev[el.dataset.evento] || ''; });
    document.title = ev.titolo + (ev.meta ? ' · ' + ev.meta : '') + ' · Vieni e seguimi';
  }

  api('stato', { slug }, { timeoutMs: 15000 }).then(r => {
    applicaEvento(r.evento);
    if (!r.aperte) { modulo.hidden = true; $('#chiuse').hidden = false; }
    else { modulo.hidden = false; }
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
    delete v.consenso_privacy; delete v.sito_web;
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
    email: 'Email', telefono: 'Telefono', indirizzo: 'Indirizzo', comune: 'Comune',
    parrocchiano_dichiarato: 'Parrocchia', sistemazione: 'Camera', consenso_privacy: 'Consenso',
  };
  const PRIMO_INPUT = {
    data_nascita: '#data_nascita_vista',
    parrocchiano_dichiarato: 'input[name=parrocchiano_dichiarato]',
    sistemazione: 'input[name=sistemazione]',
  };
  const PASSO_CAMPO = {};
  CAMPI_PASSO.forEach((campi, i) => campi.forEach(c => { PASSO_CAMPO[c] = i; }));

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
    if (!v.comune) e.comune = 'Scrivi il comune';
    if (!v.parrocchiano_dichiarato) e.parrocchiano_dichiarato = 'Scegli una risposta';
    if (!v.sistemazione) e.sistemazione = 'Scegli il tipo di camera';
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
    $$('.stepper-voce').forEach((li, i) => {
      const btn = li.querySelector('.stepper-btn');
      const corrente = i === passo;
      const fatto = i < passo;
      li.classList.toggle('fatto', fatto);
      if (corrente) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
      btn.disabled = !(fatto || corrente);
    });
    $$('.passo-pannello').forEach(p => { p.hidden = +p.dataset.passo !== passo; });
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
      mostraRicevuta(v, r.codice);
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
  function mostraRicevuta(v, codice) {
    ultimiContatti = {};
    CONTATTI.forEach(k => { ultimiContatti[k] = v[k]; });
    memoria.togli(BOZZA);
    $('#ricevuta-nome').textContent = v.nome + ' ' + v.cognome;
    $('#ricevuta-email').textContent = v.email;
    $('#timbro-codice').textContent = codice;
    $('#timbro-data').textContent = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
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

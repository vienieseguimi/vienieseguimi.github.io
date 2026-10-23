/**
 * Pannello della segreteria.
 * "Live" senza ricaricare la pagina: ogni N secondi chiede al backend le righe con rev > versione
 * conosciuta. Se non è cambiato nulla la risposta è vuota e costa pochissimo.
 * Il polling si ferma quando la scheda non è visibile e riparte subito quando torna in primo piano.
 */
(async function () {
  // Anti-clickjacking: GitHub Pages non permette l’header X-Frame-Options, quindi il pannello rifiuta di stare in un iframe.
  if (window.top !== window.self) {
    document.documentElement.style.display = 'none';
    try { window.top.location = window.self.location.href; } catch (e) { /* frame di un altro sito: resta nascosto */ }
    return;
  }
  const { api, memoria, urlEdizione } = window.Pell;
  const { risolviTenant } = window.PellTenant;
  const cfg = window.PELLEGRINAGGIO;

  const tenant = await risolviTenant();
  if (tenant.mode === 'errore' || (tenant.mode === 'apex' && !cfg.apiUrl)) {
    document.body.innerHTML = '<main class="accesso"><div class="accesso-box">' +
      '<p class="marchio">Vieni e seguimi</p><h1>Segreteria</h1>' +
      '<p>Apri il pannello dalla pagina della tua comunità' +
      ' (es. <code>/vanzago/secretariat</code> oppure <code>secretariat.html?ente=vanzago</code>).' +
      '</p><p><a href="/">Torna alla home</a></p></div></main>';
    return;
  }
  if (cfg.ente && cfg.ente.nome) {
    const h = document.querySelector('#vista-accesso h1');
    if (h) h.textContent = 'Segreteria · ' + cfg.ente.nome;
  }
  const $ = s => document.querySelector(s);
  const SESSIONE = 'pellegrinaggio.sessione';
  const NOME = 'pellegrinaggio.nome-segreteria';
  const EDIZIONE = 'pellegrinaggio.edizione';

  const STATO = {
    in_attesa: 'Da gestire', lista_attesa: 'Lista d’attesa',
    confermata: 'Confermata', rifiutata: 'Non confermata', annullata: 'Annullata',
  };
  const DICHIARA = { si: 'dice di sì', no: 'dice di no', non_so: 'non lo sa' };
  const SIST = { singola: 'singola', doppia: 'doppia', tripla: 'tripla', indifferente: 'camera indifferente' };
  const STATO_ED = { bozza: 'Bozza', aperta: 'Aperta', chiusa: 'Chiusa', archivio: 'Archivio' };

  const FRASI_LOG = {
    iscrizione_ricevuta: '{nome} {cognome} si è iscritta — {codice}',
    iscrizione_aggiornata: '{operatore} ha aggiornato {nome} {cognome} ({codice}) → {stato}',
    iscrizioni_aperte: '{operatore} ha aperto le iscrizioni{slug_suffisso}',
    iscrizioni_chiuse: '{operatore} ha chiuso le iscrizioni{slug_suffisso}',
    documento_caricato: '{operatore} ha caricato «{documento}»{slug_suffisso}',
    documento_eliminato: '{operatore} ha eliminato «{documento}»{slug_suffisso}',
    edizione_salvata: '{operatore} ha salvato il pellegrinaggio «{titolo}»{slug_suffisso}',
    login_ok: '{operatore} ha aperto la segreteria',
    setup_eseguito: '{operatore} ha eseguito la manutenzione (setup)',
  };

  const s = {
    token: null, nome: '',
    slug: '', edizioni: [], evento: null,
    versione: 0, caricato: false, righe: new Map(),
    filtro: 'in_attesa', cerca: '', parr: '',
    selezionato: null, occupate: new Set(), evidenzia: new Map(),
    nonViste: 0, errori: 0, timer: null, inCorso: false, ultimoOk: null,
    attivita: [], attivitaTimer: null, attivitaInCorso: false,
  };

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nomeDi = r => r.cognome + ' ' + r.nome;

  function formatAperturaIt(isoLocal) {
    const m = String(isoLocal || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!m) return String(isoLocal || '');
    return m[3] + '/' + m[2] + '/' + m[1] + ' alle ' + m[4] + ':' + m[5];
  }

  function aggiornaAperturaHint(motivoChiusura) {
    const hint = $('#apertura-hint');
    if (!hint) return;
    const apertura = s.evento && s.evento.apertura_il;
    if (motivoChiusura === 'non_ancora' && apertura) {
      hint.hidden = false;
      hint.textContent = 'Apertura programmata ' + formatAperturaIt(apertura);
    } else if (apertura && s.evento && s.evento.stato === 'aperta' && motivoChiusura === null) {
      hint.hidden = false;
      hint.textContent = 'Aperte dal ' + formatAperturaIt(apertura);
    } else {
      hint.hidden = true;
      hint.textContent = '';
    }
  }

  function applicaEvento(ev) {
    if (!ev) return;
    s.evento = ev;
    document.title = (s.nonViste ? '(' + s.nonViste + ') ' : '') + (ev.titolo || 'Segreteria') + ' · Vieni e seguimi';
    const link = $('#ed-link-pubblico');
    if (link && ev.slug) { link.href = urlEdizione(ev.slug); link.textContent = 'Modulo: /' + ev.slug + '/'; }
    aggiornaPostiRiepilogo();
    aggiornaAperturaHint(ev.motivoChiusura !== undefined ? ev.motivoChiusura : null);
  }

  function contaOccupatiLocali() {
    let n = 0;
    s.righe.forEach(r => { if (r.stato === 'confermata' || r.stato === 'in_attesa') n++; });
    return n;
  }

  function aggiornaPostiRiepilogo() {
    const el = $('#posti-riepilogo');
    if (!el) return;
    const posti = s.evento && Number(s.evento.posti) || 0;
    if (!posti) { el.textContent = ''; el.dataset.pieni = '0'; return; }
    const occ = contaOccupatiLocali();
    const lista = Array.from(s.righe.values()).filter(r => r.stato === 'lista_attesa').length;
    el.textContent = occ + ' / ' + posti + ' posti' + (lista ? ' · ' + lista + ' in lista' : '');
    el.dataset.pieni = occ >= posti ? '1' : '0';
  }

  function postiLiberi() {
    const posti = s.evento && Number(s.evento.posti) || 0;
    if (!posti) return Infinity;
    return Math.max(0, posti - contaOccupatiLocali());
  }

  function slugDaQuery() {
    return new URLSearchParams(location.search).get('e') || memoria.leggi(EDIZIONE) || '';
  }

  function popolaSelettore() {
    const sel = $('#sel-edizione');
    sel.innerHTML = s.edizioni.map(e =>
      '<option value="' + esc(e.slug) + '"' + (e.slug === s.slug ? ' selected' : '') + '>' +
      esc(e.titolo || e.slug) + (e.meta ? ' · ' + esc(e.meta) : '') + ' (' + esc(STATO_ED[e.stato] || e.stato) + ')</option>'
    ).join('');
  }

  async function caricaEdizioni() {
    const r = await api('edizioni_elenco', { token: s.token });
    s.edizioni = r.edizioni || [];
    if (!s.edizioni.length) throw new Error('Nessun pellegrinaggio. Creane uno da «Pellegrinaggi…».');
    let scelta = slugDaQuery();
    if (!s.edizioni.some(e => e.slug === scelta)) scelta = s.edizioni[0].slug;
    await selezionaEdizione(scelta, { silenzioso: true });
    popolaSelettore();
  }

  async function selezionaEdizione(slug, opz) {
    if (!slug) return;
    s.slug = slug;
    memoria.scrivi(EDIZIONE, slug);
    const ed = s.edizioni.find(e => e.slug === slug);
    if (ed) applicaEvento(ed);
    s.versione = 0; s.caricato = false; s.righe.clear(); s.selezionato = null;
    $('#dettaglio').hidden = true;
    document.body.classList.remove('con-dettaglio');
    const url = new URL(location.href);
    url.searchParams.set('e', slug);
    history.replaceState(null, '', url.pathname + url.search);
    if (!opz || !opz.silenzioso) popolaSelettore();
    render();
    await aggiorna();
  }

  // ================= Accesso =================
  function mostraAccesso(messaggio) {
    fermaAggiornamenti();
    s.token = null;
    memoria.togli(SESSIONE, 'sessione');
    $('#vista-pannello').hidden = true;
    $('#dettaglio').hidden = true;
    $('#vista-accesso').hidden = false;
    $('#acc-nome').value = memoria.leggi(NOME) || '';
    const e = $('#acc-errore');
    e.hidden = !messaggio; e.textContent = messaggio || '';
    ($('#acc-nome').value ? $('#acc-password') : $('#acc-nome')).focus();
  }

  $('#form-accesso').addEventListener('submit', async e => {
    e.preventDefault();
    const nome = $('#acc-nome').value.trim(), password = $('#acc-password').value;
    const err = $('#acc-errore');
    if (!nome || !password) { err.textContent = 'Scrivi il tuo nome e la password.'; err.hidden = false; return; }
    const b = $('#acc-entra'); b.disabled = true; b.textContent = 'Accesso…';
    try {
      const r = await api('login', { nome, password });
      memoria.scrivi(NOME, nome);
      memoria.scrivi(SESSIONE, { token: r.token, nome: r.nome, scadenza: r.scadenza }, 'sessione');
      $('#acc-password').value = '';
      entra(r.token, r.nome);
    } catch (ex) {
      err.textContent = ex.codice === 'rete' ? 'Connessione non riuscita. Riprova.' : ex.message;
      err.hidden = false;
    } finally { b.disabled = false; b.textContent = 'Entra'; }
  });

  $('#esci').addEventListener('click', () => mostraAccesso());

  async function entra(token, nome) {
    s.token = token; s.nome = nome;
    s.versione = 0; s.caricato = false; s.righe.clear();
    $('#utente-nome').textContent = nome;
    $('#vista-accesso').hidden = true;
    $('#vista-pannello').hidden = false;
    try {
      await caricaEdizioni();
    } catch (err) {
      avviso(err.message || 'Impossibile caricare i pellegrinaggi.', 'errore');
      $('#pannello-edizioni').hidden = false;
      renderListaEdizioni();
    }
    caricaAttivita();
    programmaAttivita();
  }

  $('#sel-edizione').addEventListener('change', e => selezionaEdizione(e.target.value));

  // ================= Aggiornamento live =================
  function fermaAggiornamenti() {
    clearTimeout(s.timer); s.timer = null;
    clearTimeout(s.attivitaTimer); s.attivitaTimer = null;
  }

  function programmaAttivita() {
    clearTimeout(s.attivitaTimer); s.attivitaTimer = null;
    if (!s.token || document.hidden) return;
    s.attivitaTimer = setTimeout(function () {
      caricaAttivita().finally(programmaAttivita);
    }, Math.max(30000, (cfg.intervalloAggiornamento || 5000) * 6));
  }

  function fraseLog(ev) {
    const d = (ev && ev.dettagli && typeof ev.dettagli === 'object') ? ev.dettagli : {};
    const vals = {
      nome: ev.nome || '',
      cognome: ev.cognome || '',
      codice: ev.codice || '',
      email: ev.email || '',
      operatore: ev.operatore || 'Qualcuno',
      slug: ev.slug || '',
      slug_suffisso: ev.slug ? ' (' + ev.slug + ')' : '',
      stato: STATO[d.stato || ''] || d.stato || '',
      documento: d.documento || '',
      titolo: d.titolo || ev.slug || 'pellegrinaggio',
    };
    const tpl = FRASI_LOG[ev.tipo] || ('Attività: ' + (ev.tipo || 'sconosciuta'));
    return tpl.replace(/\{(\w+)\}/g, function (_, k) { return vals[k] != null ? String(vals[k]) : ''; })
      .replace(/\s+/g, ' ').trim();
  }

  function quandoLog(iso) {
    if (!iso) return '';
    const t = Date.parse(iso);
    if (!t) return String(iso).slice(0, 16);
    return new Date(t).toLocaleString('it-IT', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  }

  function renderAttivita() {
    const lista = $('#attivita-lista');
    const vuoto = $('#attivita-vuoto');
    if (!lista) return;
    lista.innerHTML = s.attivita.map(function (ev) {
      return '<li><time class="attivita-quando" datetime="' + esc(ev.creato_il || '') + '">' +
        esc(quandoLog(ev.creato_il)) + '</time><p class="attivita-frase">' + esc(fraseLog(ev)) + '</p></li>';
    }).join('');
    if (vuoto) vuoto.hidden = s.attivita.length > 0;
  }

  async function caricaAttivita() {
    if (!s.token || s.attivitaInCorso) return;
    s.attivitaInCorso = true;
    try {
      const r = await api('log_elenco', { token: s.token, limite: 40 });
      s.attivita = r.eventi || [];
      renderAttivita();
    } catch (err) {
      /* silenzioso: il pannello principale resta usabile */
    } finally {
      s.attivitaInCorso = false;
    }
  }

  const btnAttivita = $('#attivita-aggiorna');
  if (btnAttivita) btnAttivita.addEventListener('click', function () { caricaAttivita(); });

  function programma() {
    fermaAggiornamenti();
    if (!s.token || document.hidden) return;
    const attesa = s.errori ? Math.min(60000, cfg.intervalloAggiornamento * Math.pow(2, s.errori)) : cfg.intervalloAggiornamento;
    s.timer = setTimeout(aggiorna, attesa);
    if (s.errori) impostaLive('errore', 'Connessione persa · riprovo tra ' + Math.round(attesa / 1000) + ' s');
  }

  async function aggiorna() {
    if (!s.token || s.inCorso || !s.slug) return;
    s.inCorso = true;
    const primaVolta = !s.caricato;
    try {
      if (!s.slug) { s.inCorso = false; return; }
      const r = await api('elenco', { token: s.token, slug: s.slug, da: s.versione });
      s.errori = 0;
      const nuove = [];
      if (r.completo) {
        const prima = new Set(s.righe.keys());
        s.righe.clear();
        r.righe.forEach(x => {
          s.righe.set(x.id, x);
          if (!primaVolta && !prima.has(x.id)) nuove.push(x);
        });
      } else {
        r.righe.forEach(x => {
          const vecchia = s.righe.get(x.id);
          if (!vecchia) nuove.push(x);
          else if (x.rev > vecchia.rev) s.evidenzia.set(x.id, 'cambiata');
          if (!vecchia || x.rev >= vecchia.rev) s.righe.set(x.id, x);
        });
      }
      nuove.forEach(x => s.evidenzia.set(x.id, 'nuova'));
      s.versione = r.versione;
      s.caricato = true;
      if (r.evento) {
        applicaEvento(r.evento);
        const i = s.edizioni.findIndex(e => e.slug === s.slug);
        if (i >= 0) s.edizioni[i] = Object.assign({}, s.edizioni[i], r.evento);
      }
      // Interruttore = stato edizione (aperta/chiusa); aperte/motivoChiusura = se il pubblico può già iscriversi.
      $('#aperte').checked = !!(s.evento && s.evento.stato === 'aperta');
      aggiornaTestoAperte();
      aggiornaAperturaHint(r.motivoChiusura);
      s.ultimoOk = new Date();
      impostaLive('ok', 'Aggiornato alle ' + s.ultimoOk.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      if (nuove.length) annunciaNuove(nuove);
      if (r.righe.length || primaVolta) render();
      if (s.selezionato && r.righe.some(x => x.id === s.selezionato)) renderDettaglio();
    } catch (err) {
      if (err.codice === 'non_autorizzato') { s.inCorso = false; return mostraAccesso(err.message); }
      s.errori++;
    } finally {
      s.inCorso = false;
      programma();
    }
  }

  function impostaLive(stato, testo) {
    $('#live').dataset.stato = stato;
    $('#live-testo').textContent = testo;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return fermaAggiornamenti();
    s.nonViste = 0; aggiornaTitolo();
    aggiorna();
    caricaAttivita();
    programmaAttivita();
  });

  function annunciaNuove(nuove) {
    if (document.hidden) { s.nonViste += nuove.length; aggiornaTitolo(); }
    if (nuove.length > 3) avviso(nuove.length + ' nuove iscrizioni');
    else nuove.forEach(x => avviso('Nuova iscrizione: ' + x.nome + ' ' + x.cognome + ' · ' + x.codice));
  }

  function aggiornaTitolo() {
    document.title = (s.nonViste ? '(' + s.nonViste + ') ' : '') + 'Segreteria · Vieni e seguimi';
  }

  // ================= Elenco =================
  function filtrate() {
    const q = s.cerca.toLowerCase();
    return Array.from(s.righe.values())
      .filter(r => s.filtro === 'tutte' || r.stato === s.filtro)
      .filter(r => !s.parr || r.parrocchiano_verificato === s.parr)
      .filter(r => !q || [r.nome, r.cognome, r.nome + ' ' + r.cognome, r.cognome + ' ' + r.nome, r.comune, r.codice, r.email, r.telefono]
        .some(v => String(v).toLowerCase().includes(q)))
      .sort((a, b) => (a.creato_il < b.creato_il ? 1 : -1));
  }

  function render() {
    // conteggi
    const conta = { in_attesa: 0, lista_attesa: 0, confermata: 0, rifiutata: 0, annullata: 0, tutte: s.righe.size };
    s.righe.forEach(r => { conta[r.stato] = (conta[r.stato] || 0) + 1; });
    document.querySelectorAll('[data-conta]').forEach(b => { b.textContent = conta[b.dataset.conta] || 0; });
    aggiornaPostiRiepilogo();

    const lista = filtrate();
    const tbody = $('#righe');
    const esistenti = new Map(Array.from(tbody.children).map(tr => [tr.dataset.id, tr]));
    lista.forEach((r, i) => {
      let tr = esistenti.get(r.id);
      const firma = r.rev + (s.occupate.has(r.id) ? 'o' : '') + (s.selezionato === r.id ? 's' : '');
      if (!tr) { tr = document.createElement('tr'); tr.dataset.id = r.id; }
      if (tr.dataset.firma !== firma) { tr.innerHTML = rigaHtml(r); tr.dataset.firma = firma; }
      tr.classList.toggle('selezionata', s.selezionato === r.id);
      const ev = s.evidenzia.get(r.id);
      if (ev) {
        s.evidenzia.delete(r.id);
        tr.classList.remove('nuova', 'cambiata');
        void tr.offsetWidth; // riavvia l'animazione
        tr.classList.add(ev);
      }
      if (tbody.children[i] !== tr) tbody.insertBefore(tr, tbody.children[i] || null);
      esistenti.delete(r.id);
    });
    esistenti.forEach(tr => tr.remove());

    const vuoto = $('#vuoto');
    vuoto.hidden = lista.length > 0;
    if (!lista.length) {
      const inCaricamento = !s.caricato;
      vuoto.classList.toggle('in-caricamento', inCaricamento);
      vuoto.textContent = inCaricamento ? 'Caricamento delle iscrizioni…'
        : s.righe.size === 0 ? 'Ancora nessuna iscrizione. Appena qualcuno compila il modulo comparirà qui, senza ricaricare la pagina.'
        : s.cerca || s.parr ? 'Nessuna iscrizione corrisponde ai filtri.'
        : s.filtro === 'in_attesa' ? 'Nessuna iscrizione da gestire. Le nuove compariranno qui da sole.'
        : s.filtro === 'lista_attesa' ? 'Nessuno in lista d’attesa.'
        : 'Nessuna iscrizione in questo elenco.';
    }
  }

  function eta(iso) {
    const [a, m, g] = String(iso).split('-').map(Number);
    if (!a) return '';
    const o = new Date();
    let e = o.getFullYear() - a;
    if (o.getMonth() + 1 < m || (o.getMonth() + 1 === m && o.getDate() < g)) e--;
    return e;
  }

  function quando(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    const giorno = new Date(d); giorno.setHours(0, 0, 0, 0);
    const diff = Math.round((oggi - giorno) / 86400000);
    const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    if (diff === 0) return 'oggi ' + ora;
    if (diff === 1) return 'ieri ' + ora;
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  }

  function rigaHtml(r) {
    const occ = s.occupate.has(r.id);
    const v = r.parrocchiano_verificato;
    const minore = eta(r.data_nascita) < 18;
    let azione = '';
    if (r.stato === 'in_attesa') {
      azione = `<button type="button" class="btn btn-timbro btn-piccolo" data-azione="conferma" ${v === 'da_verificare' || occ ? 'disabled' : ''}
           ${v === 'da_verificare' ? 'title="Indica prima se è parrocchiano"' : ''}>Conferma</button>`;
    } else if (r.stato === 'lista_attesa') {
      const pieni = postiLiberi() <= 0;
      azione = `<button type="button" class="btn btn-secondario btn-piccolo" data-azione="promuovi" ${occ || pieni ? 'disabled' : ''}
           ${pieni ? 'title="Posti esauriti"' : 'title="Passa tra le da gestire"'}>Promuovi</button>`;
    }
    return `
      <td class="c-codice">${esc(r.codice)}</td>
      <td class="c-persona">
        <button type="button" class="link nome" data-azione="apri">${esc(nomeDi(r))}</button>
        <span class="dettagli">${esc(eta(r.data_nascita))} anni${minore ? ' · <b>minorenne</b>' : ''} · ${esc(SIST[r.sistemazione] || r.sistemazione)}${r.esigenze ? ' · <span title="' + esc(r.esigenze) + '">esigenze</span>' : ''}</span>
      </td>
      <td class="c-comune">${esc(r.comune)}</td>
      <td class="c-quando"><time datetime="${esc(r.creato_il)}">${esc(quando(r.creato_il))}</time></td>
      <td class="c-parr">
        <div class="segmenti piccoli" role="group" aria-label="Parrocchiano: ${esc(nomeDi(r))}">
          <button type="button" data-azione="verifica" data-v="si" aria-pressed="${v === 'si'}" ${occ ? 'disabled' : ''}>Sì</button>
          <button type="button" data-azione="verifica" data-v="no" aria-pressed="${v === 'no'}" ${occ ? 'disabled' : ''}>No</button>
        </div>
        <span class="dichiara">${esc(DICHIARA[r.parrocchiano_dichiarato] || '')}</span>
      </td>
      <td class="c-stato"><span class="pillola s-${esc(r.stato)}">${esc(STATO[r.stato] || r.stato)}</span>${r.email_coda ? '<span class="email-coda" title="Email in coda">✉ in coda</span>' : ''}</td>
      <td class="c-azione">${azione}</td>`;
  }

  // Click nella tabella
  $('#righe').addEventListener('click', e => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const id = tr.dataset.id;
    const b = e.target.closest('[data-azione]');
    if (!b) return apriDettaglio(id);
    const r = s.righe.get(id);
    if (b.dataset.azione === 'apri') apriDettaglio(id);
    if (b.dataset.azione === 'verifica') {
      const nuovo = r.parrocchiano_verificato === b.dataset.v ? 'da_verificare' : b.dataset.v;
      modifica(id, { parrocchiano_verificato: nuovo });
    }
    if (b.dataset.azione === 'conferma') {
      modifica(id, { stato: 'confermata' }, { notifica: true, fatto: 'confermata' });
    }
    if (b.dataset.azione === 'promuovi') {
      modifica(id, { stato: 'in_attesa' }, { notifica: false, fatto: 'promossa' });
    }
  });

  // Filtri
  document.querySelectorAll('[data-filtro]').forEach(b => b.addEventListener('click', () => {
    s.filtro = b.dataset.filtro;
    document.querySelectorAll('[data-filtro]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    render();
  }));
  $('#cerca').addEventListener('input', e => { s.cerca = e.target.value.trim(); render(); });
  $('#filtro-parr').addEventListener('change', e => { s.parr = e.target.value; render(); });

  // Apertura iscrizioni
  function aggiornaTestoAperte() { $('#aperte-testo').textContent = $('#aperte').checked ? 'Iscrizioni aperte' : 'Iscrizioni chiuse'; }
  $('#aperte').addEventListener('change', async e => {
    const voglio = e.target.checked;
    aggiornaTestoAperte();
    try {
      const r = await api('apertura', { token: s.token, slug: s.slug, aperte: voglio });
      e.target.checked = r.aperte; aggiornaTestoAperte();
      if (r.edizione) {
        applicaEvento(r.edizione);
        const i = s.edizioni.findIndex(x => x.slug === s.slug);
        if (i >= 0) s.edizioni[i] = Object.assign({}, s.edizioni[i], r.edizione);
        popolaSelettore();
      }
      avviso(r.aperte ? 'Il modulo pubblico accetta di nuovo iscrizioni.' : 'Iscrizioni chiuse: il modulo pubblico ora lo dice.');
    } catch (err) {
      e.target.checked = !voglio; aggiornaTestoAperte();
      avviso(err.message, 'errore');
    }
  });

  // ================= Modifiche =================
  async function modifica(id, modifiche, opz) {
    opz = opz || {};
    const r = s.righe.get(id);
    if (!r || s.occupate.has(id)) return false;
    s.occupate.add(id);
    render(); renderDettaglio();
    try {
      const out = await api('aggiorna', { token: s.token, slug: s.slug, id, rev: r.rev, modifiche, notifica: opz.notifica !== false });
      s.righe.set(id, out.riga);
      if (opz.fatto) {
        const coda = out.riga.email_coda.includes(out.riga.stato);
        const email = opz.notifica === false || !['confermata', 'rifiutata'].includes(out.riga.stato) ? ''
          : coda ? ' L\'email è in coda: partirà appena possibile.' : ' Email inviata.';
        avviso(nomeDi(out.riga) + ': ' + (STATO[out.riga.stato] || '').toLowerCase() + '.' + email);
      }
      return true;
    } catch (err) {
      if (err.codice === 'non_autorizzato') { mostraAccesso(err.message); return false; }
      if (err.codice === 'conflitto' && err.dati.riga) { s.righe.set(id, err.dati.riga); s.evidenzia.set(id, 'cambiata'); }
      avviso(err.codice === 'rete' ? 'Modifica non salvata: connessione non riuscita. Riprova.' : err.message, 'errore');
      return false;
    } finally {
      s.occupate.delete(id);
      render(); renderDettaglio();
    }
  }

  // ================= Dettaglio =================
  let ritornoFocus = null;
  let noteSporche = false;

  function apriDettaglio(id) {
    ritornoFocus = document.activeElement;
    s.selezionato = id;
    noteSporche = false;
    $('#det-motivo-box').hidden = true;
    $('#dettaglio').hidden = false;
    document.body.classList.add('con-dettaglio');
    renderDettaglio(true);
    render();
    $('#dettaglio').focus();
  }

  function chiudiDettaglio() {
    if (noteSporche && !window.confirm('Le note non sono state salvate. Chiudere comunque?')) return;
    s.selezionato = null;
    $('#dettaglio').hidden = true;
    document.body.classList.remove('con-dettaglio');
    render();
    if (ritornoFocus && document.contains(ritornoFocus)) ritornoFocus.focus();
  }
  $('#det-chiudi').addEventListener('click', chiudiDettaglio);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && s.selezionato) chiudiDettaglio(); });

  function renderDettaglio(primaApertura) {
    const r = s.righe.get(s.selezionato);
    if (!r) return;
    const occ = s.occupate.has(r.id);
    $('#det-codice').textContent = r.codice;
    $('#det-nome').textContent = r.nome + ' ' + r.cognome;
    $('#det-stato').innerHTML = `<span class="pillola grande s-${esc(r.stato)}">${esc(STATO[r.stato])}</span>` +
      (r.gestito_da ? `<span class="aiuto">ultima modifica di ${esc(r.gestito_da)}, ${esc(quando(r.aggiornato_il))}</span>` : '');
    $('#det-dichiara').textContent = 'Nel modulo ' + (DICHIARA[r.parrocchiano_dichiarato] || '—') + '. Residenza: ' + r.indirizzo + ', ' + r.comune + '.';
    $('#det-verifica').querySelectorAll('button').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.v === r.parrocchiano_verificato));
      b.disabled = occ;
    });

    const az = [];
    const pieni = postiLiberi() <= 0;
    const giaOccupante = r.stato === 'confermata' || r.stato === 'in_attesa';
    const confermaDisab = r.parrocchiano_verificato === 'da_verificare' || occ || (!giaOccupante && pieni);
    if (r.stato === 'in_attesa' || r.stato === 'lista_attesa') {
      az.push(`<button type="button" class="btn btn-timbro" data-det="confermata" ${confermaDisab ? 'disabled' : ''}
        ${!giaOccupante && pieni ? 'title="Posti esauriti"' : ''}>Conferma iscrizione</button>`);
    }
    if (r.stato === 'lista_attesa') {
      az.push(`<button type="button" class="btn btn-secondario" data-det="in_attesa" ${occ || pieni ? 'disabled' : ''}
        ${pieni ? 'title="Posti esauriti"' : ''}>Promuovi tra le da gestire</button>`);
    }
    if (r.stato === 'in_attesa' || r.stato === 'confermata') {
      az.push(`<button type="button" class="btn btn-secondario" data-det="lista_attesa" ${occ ? 'disabled' : ''}>Metti in lista d’attesa</button>`);
    }
    if (r.stato === 'in_attesa') {
      az.push(`<button type="button" class="btn btn-rifiuto" data-det="rifiuta" ${occ ? 'disabled' : ''}>Non confermare…</button>`);
    }
    if (r.stato !== 'in_attesa' && r.stato !== 'lista_attesa') {
      az.push(`<button type="button" class="btn btn-secondario" data-det="in_attesa" ${occ || (!giaOccupante && pieni) ? 'disabled' : ''}>Riporta tra le da gestire</button>`);
    }
    if (r.stato !== 'annullata') az.push(`<button type="button" class="btn btn-secondario btn-piccolo" data-det="annullata" ${occ ? 'disabled' : ''} title="La persona ha rinunciato">Annulla iscrizione</button>`);
    let aiutoAz = '';
    if ((r.stato === 'in_attesa' || r.stato === 'lista_attesa') && r.parrocchiano_verificato === 'da_verificare') {
      aiutoAz = '<p class="aiuto">Per confermare, indica prima se è parrocchiano.</p>';
    } else if (!giaOccupante && pieni && (r.stato === 'lista_attesa' || r.stato === 'rifiutata' || r.stato === 'annullata')) {
      aiutoAz = '<p class="aiuto">Posti esauriti: libera un posto (lista d’attesa o annulla) prima di promuovere o confermare.</p>';
    }
    $('#det-azioni').innerHTML = az.join('') + aiutoAz;

    const dati = [
      ['Nata/o il', r.data_nascita.split('-').reverse().join('/') + ' (' + eta(r.data_nascita) + ' anni)'],
      r.tutore ? ['Genitore o tutore', r.tutore] : null,
      ['Email', `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>`, true],
      ['Telefono', `<a href="tel:${esc(r.telefono.replace(/[^+0-9]/g, ''))}">${esc(r.telefono)}</a>`, true],
      ['Indirizzo', r.indirizzo],
      ['Comune di residenza', r.comune],
      ['Camera', SIST[r.sistemazione] || r.sistemazione],
      r.compagno_camera ? ['In camera con', r.compagno_camera] : null,
      r.esigenze ? ['Esigenze', r.esigenze] : null,
      r.note ? ['Note della persona', r.note] : null,
      r.motivo_rifiuto ? ['Motivo non conferma', r.motivo_rifiuto] : null,
    ].filter(Boolean);
    $('#det-dati').innerHTML = dati.map(d => `<div><dt>${esc(d[0])}</dt><dd>${d[2] ? d[1] : esc(d[1])}</dd></div>`).join('');

    $('#det-storico').innerHTML = [
      ['Iscritta il', new Date(r.creato_il).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' })],
      ['Email', r.email_log ? r.email_log.split(' | ').join('\n') : 'nessuna'],
      ['Consenso', r.consenso_privacy],
    ].map(d => `<div><dt>${esc(d[0])}</dt><dd>${esc(d[1])}</dd></div>`).join('');

    if (primaApertura || !noteSporche) {
      $('#det-note').value = r.note_segreteria || '';
      noteSporche = false;
      $('#det-salva-note').disabled = true;
      $('#det-note-stato').textContent = '';
    }
    $('#det-errore').hidden = true;
  }

  $('#det-verifica').addEventListener('click', e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    modifica(s.selezionato, { parrocchiano_verificato: b.dataset.v });
  });

  $('#det-azioni').addEventListener('click', e => {
    const b = e.target.closest('[data-det]'); if (!b) return;
    const notifica = $('#det-notifica').checked;
    if (b.dataset.det === 'rifiuta') {
      $('#det-motivo-box').hidden = false;
      $('#det-motivo').focus();
      return;
    }
    modifica(s.selezionato, { stato: b.dataset.det }, { notifica, fatto: true });
  });

  $('#det-rifiuta-ok').addEventListener('click', async () => {
    const ok = await modifica(s.selezionato,
      { stato: 'rifiutata', motivo_rifiuto: $('#det-motivo').value.trim() },
      { notifica: $('#det-notifica').checked, fatto: true });
    if (ok) { $('#det-motivo-box').hidden = true; $('#det-motivo').value = ''; }
  });
  $('#det-rifiuta-annulla').addEventListener('click', () => { $('#det-motivo-box').hidden = true; });

  $('#det-note').addEventListener('input', () => {
    noteSporche = true;
    $('#det-salva-note').disabled = false;
    $('#det-note-stato').textContent = 'Non salvate';
  });
  $('#det-salva-note').addEventListener('click', async () => {
    const testo = $('#det-note').value;
    noteSporche = false;
    const ok = await modifica(s.selezionato, { note_segreteria: testo });
    if (ok) { $('#det-note-stato').textContent = 'Salvate'; $('#det-salva-note').disabled = true; }
    else { noteSporche = true; $('#det-note').value = testo; }
  });

  // ================= Export =================
  $('#esporta').addEventListener('click', () => {
    const col = [
      ['codice', 'Codice'], ['stato', 'Stato'], ['parrocchiano_verificato', 'Parrocchiano'], ['cognome', 'Cognome'], ['nome', 'Nome'],
      ['data_nascita', 'Data di nascita'], ['email', 'Email'], ['telefono', 'Telefono'], ['indirizzo', 'Indirizzo'], ['comune', 'Comune di residenza'],
      ['sistemazione', 'Camera'], ['compagno_camera', 'In camera con'], ['tutore', 'Tutore'], ['esigenze', 'Esigenze'],
      ['note', 'Note persona'], ['note_segreteria', 'Note segreteria'], ['creato_il', 'Iscritta il'], ['gestito_da', 'Gestita da'],
    ];
    // Neutralizza le formule (CSV/formula injection): Excel esegue celle che iniziano con = + - @ tab o CR.
    const cella = v => {
      let s = String(v == null ? '' : v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const righe = filtrate().map(r => col.map(([k]) => cella(k === 'stato' ? STATO[r.stato] : k === 'creato_il' ? new Date(r.creato_il).toLocaleString('it-IT') : r[k])).join(';'));
    const csv = '﻿' + [col.map(c => cella(c[1])).join(';')].concat(righe).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'iscrizioni-' + (s.slug || 'ed') + '-' + s.filtro + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // ================= Avvisi =================
  function avviso(testo, tipo) {
    const el = document.createElement('div');
    el.className = 'avviso-toast' + (tipo ? ' ' + tipo : '');
    el.textContent = testo;
    $('#avvisi').appendChild(el);
    setTimeout(() => { el.classList.add('via'); setTimeout(() => el.remove(), 400); }, tipo === 'errore' ? 8000 : 5000);
  }

  // ================= Gestione pellegrinaggi =================
  function renderListaEdizioni() {
    const ul = $('#ed-lista');
    ul.innerHTML = s.edizioni.map(e =>
      '<li class="ed-item' + (e.slug === s.slug ? ' corrente' : '') + '">' +
      '<button type="button" class="link ed-apri" data-slug="' + esc(e.slug) + '"><strong>' + esc(e.titolo || e.slug) + '</strong></button>' +
      '<span class="aiuto">' + esc(e.slug) + ' · ' + esc(STATO_ED[e.stato] || e.stato) + '</span>' +
      '<button type="button" class="btn btn-secondario btn-piccolo ed-modifica" data-id="' + esc(e.id) + '">Modifica</button>' +
      '</li>'
    ).join('') || '<li class="aiuto">Nessun pellegrinaggio.</li>';
  }

  function renderDocumentiEdizione(docs) {
    const box = $('#ed-documenti-box');
    const lista = $('#ed-documenti-lista');
    const msg = $('#ed-documenti-msg');
    if (!box || !lista) return;
    const id = $('#ed-id').value;
    box.hidden = !id;
    if (msg) msg.hidden = true;
    const docsSafe = Array.isArray(docs) ? docs : [];
    lista.innerHTML = docsSafe.map(d =>
      '<li class="ed-doc">' +
      '<a href="' + esc(d.url) + '" target="_blank" rel="noopener">' + esc(d.nome) + '</a>' +
      '<button type="button" class="link ed-doc-elimina" data-id="' + esc(d.id) + '">Elimina</button>' +
      '</li>'
    ).join('') || '<li class="aiuto">Nessun documento caricato.</li>';
  }

  function apriFormEdizione(ed) {
    $('#ed-form').hidden = false;
    $('#ed-errore').hidden = true;
    $('#ed-form-titolo').textContent = ed ? 'Modifica pellegrinaggio' : 'Nuovo pellegrinaggio';
    $('#ed-id').value = ed ? ed.id : '';
    $('#ed-slug').value = ed ? ed.slug : '';
    $('#ed-slug').disabled = !!ed;
    $('#ed-parrocchia').value = ed ? ed.parrocchia : '';
    $('#ed-titolo-campo').value = ed ? ed.titolo : '';
    $('#ed-meta').value = ed ? ed.meta : '';
    $('#ed-quando').value = ed ? ed.quando : '';
    $('#ed-quota').value = ed ? ed.quota : '';
    $('#ed-scadenza').value = ed ? ed.scadenza : '';
    $('#ed-apertura').value = ed && ed.apertura_il ? String(ed.apertura_il).replace(' ', 'T').slice(0, 16) : '';
    $('#ed-chiusura').value = ed ? (ed.chiusura || '') : '';
    $('#ed-contatto').value = ed ? ed.contatto : '';
    $('#ed-posti').value = ed ? (ed.posti || 0) : 50;
    $('#ed-prefisso').value = ed ? (ed.prefisso_codice || 'PG-') : 'PG-';
    $('#ed-stato').value = ed ? ed.stato : 'bozza';
    renderDocumentiEdizione(ed ? (ed.documenti || []) : []);
  }

  $('#gestisci-edizioni').addEventListener('click', () => {
    $('#pannello-edizioni').hidden = false;
    $('#ed-form').hidden = true;
    renderListaEdizioni();
    $('#pannello-edizioni').focus();
  });
  $('#ed-chiudi').addEventListener('click', () => { $('#pannello-edizioni').hidden = true; });
  $('#ed-nuova').addEventListener('click', () => apriFormEdizione(null));
  $('#ed-setup').addEventListener('click', async () => {
    if (!window.confirm('Eseguire la manutenzione (setup)? Allinea fogli, cartelle Drive e trigger. Di solito serve dopo un aggiornamento del sistema.')) return;
    const btn = $('#ed-setup');
    btn.disabled = true;
    const testo = btn.textContent;
    btn.textContent = 'In corso…';
    try {
      const r = await api('setup', { token: s.token });
      avviso(r.messaggio || 'Manutenzione completata.');
      caricaAttivita();
    } catch (err) {
      if (err.codice === 'non_autorizzato') mostraAccesso(err.message);
      else avviso(err.message || 'Manutenzione non riuscita.', 'errore');
    } finally {
      btn.disabled = false;
      btn.textContent = testo;
    }
  });
  $('#ed-annulla').addEventListener('click', () => { $('#ed-form').hidden = true; });
  $('#ed-lista').addEventListener('click', e => {
    const apri = e.target.closest('.ed-apri');
    if (apri) { selezionaEdizione(apri.dataset.slug); return; }
    const mod = e.target.closest('.ed-modifica');
    if (mod) {
      const ed = s.edizioni.find(x => x.id === mod.dataset.id);
      if (ed) apriFormEdizione(ed);
    }
  });
  $('#ed-form').addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#ed-errore');
    err.hidden = true;
    const id = $('#ed-id').value;
    const dati = {
      slug: $('#ed-slug').value.trim().toLowerCase(),
      parrocchia: $('#ed-parrocchia').value.trim(),
      titolo: $('#ed-titolo-campo').value.trim(),
      meta: $('#ed-meta').value.trim(),
      quando: $('#ed-quando').value.trim(),
      quota: $('#ed-quota').value.trim(),
      scadenza: $('#ed-scadenza').value.trim(),
      apertura_il: ($('#ed-apertura').value || '').trim(),
      chiusura: $('#ed-chiusura').value.trim(),
      contatto: $('#ed-contatto').value.trim(),
      posti: Number($('#ed-posti').value) || 0,
      prefisso_codice: $('#ed-prefisso').value.trim() || 'PG-',
      stato: $('#ed-stato').value,
    };
    const btn = $('#ed-salva');
    btn.disabled = true;
    try {
      const r = await api('edizione_salva', { token: s.token, id: id || undefined, dati });
      const ed = r.edizione;
      const i = s.edizioni.findIndex(x => x.id === ed.id);
      if (i >= 0) s.edizioni[i] = Object.assign({}, s.edizioni[i], ed);
      else s.edizioni.push(ed);
      popolaSelettore();
      renderListaEdizioni();
      if (!id) {
        // Nuova edizione: resta sul form per caricare i documenti
        $('#ed-id').value = ed.id;
        $('#ed-slug').disabled = true;
        $('#ed-form-titolo').textContent = 'Modifica pellegrinaggio';
        renderDocumentiEdizione(ed.documenti || []);
        avviso('Pellegrinaggio creato. Ora puoi caricare i documenti.');
      } else {
        $('#ed-form').hidden = true;
        avviso('Pellegrinaggio salvato: ' + ed.slug);
      }
      if (!s.slug || s.slug === ed.slug) await selezionaEdizione(ed.slug);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally { btn.disabled = false; }
  });

  async function fileABase64(file) {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function mimeDaFile(file) {
    const t = String(file.type || '').toLowerCase();
    if (t) return t;
    const n = String(file.name || '').toLowerCase();
    if (n.endsWith('.pdf')) return 'application/pdf';
    if (n.endsWith('.png')) return 'image/png';
    if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
    return '';
  }

  const inputDoc = $('#ed-documento-file');
  if (inputDoc) inputDoc.addEventListener('change', async ev => {
    const input = ev.target;
    const file = input.files && input.files[0];
    input.value = '';
    const id = $('#ed-id').value;
    const msg = $('#ed-documenti-msg');
    if (!file || !id) return;
    if (msg) { msg.hidden = false; msg.textContent = 'Caricamento di «' + file.name + '»…'; }
    try {
      const contenutoBase64 = await fileABase64(file);
      const r = await api('documento_carica', {
        token: s.token,
        id,
        nome: file.name,
        mime: mimeDaFile(file),
        contenutoBase64,
      });
      const i = s.edizioni.findIndex(x => x.id === id);
      if (i >= 0) s.edizioni[i].documenti = r.documenti || [];
      renderDocumentiEdizione(r.documenti || []);
      if (msg) { msg.textContent = 'File caricato.'; }
      avviso('Documento caricato: ' + file.name);
    } catch (ex) {
      if (msg) { msg.hidden = false; msg.textContent = ex.message; }
      else avviso(ex.message);
    }
  });

  const listaDoc = $('#ed-documenti-lista');
  if (listaDoc) listaDoc.addEventListener('click', async e => {
    const btn = e.target.closest('.ed-doc-elimina');
    if (!btn) return;
    const id = $('#ed-id').value;
    const documentoId = btn.dataset.id;
    if (!id || !documentoId) return;
    if (!confirm('Eliminare questo documento?')) return;
    try {
      const r = await api('documento_elimina', { token: s.token, id, documentoId });
      const i = s.edizioni.findIndex(x => x.id === id);
      if (i >= 0) s.edizioni[i].documenti = r.documenti || [];
      renderDocumentiEdizione(r.documenti || []);
      avviso('Documento eliminato.');
    } catch (ex) {
      avviso(ex.message);
    }
  });

  // ================= Avvio =================
  setInterval(() => {
    if (s.ultimoOk && !s.errori && Date.now() - s.ultimoOk > cfg.intervalloAggiornamento * 3 && !document.hidden) {
      impostaLive('lento', 'Aggiornato alle ' + s.ultimoOk.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }));
    }
  }, 5000);

  const sess = memoria.leggi(SESSIONE, 'sessione');
  if (sess && sess.token && sess.scadenza > Date.now()) entra(sess.token, sess.nome);
  else mostraAccesso();
})();

/**
 * Console operatori: login piattaforma + CRUD enti.
 */
(function () {
  // Anti-clickjacking: GitHub Pages non permette l’header X-Frame-Options, quindi il pannello rifiuta di stare in un iframe.
  if (window.top !== window.self) {
    document.documentElement.style.display = 'none';
    try { window.top.location = window.self.location.href; } catch (e) { /* frame di un altro sito: resta nascosto */ }
    return;
  }
  const { memoria } = window.Pell;
  const { platformApi, urlEnte } = window.PellTenant;
  const cfg = window.PELLEGRINAGGIO;
  const $ = s => document.querySelector(s);
  const SESSIONE = 'vienieseguimi.platform.sessione';

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const s = { token: null, nome: '', enti: [] };

  function mostraAccesso() {
    $('#vista-accesso').hidden = false;
    $('#vista-app').hidden = true;
  }

  function mostraApp() {
    $('#vista-accesso').hidden = true;
    $('#vista-app').hidden = false;
    $('#op-nome').textContent = s.nome;
  }

  async function caricaEnti() {
    try {
      const r = await platformApi('enti_elenco', { token: s.token });
      s.enti = r.enti || [];
      const vuoto = $('#lista-vuota');
      if (vuoto) {
        vuoto.classList.remove('plat-msg', 'err');
        vuoto.textContent = 'Nessun ente ancora. Crea il primo con «Nuovo ente».';
      }
      render();
    } catch (ex) {
      if (ex.codice === 'non_autorizzato') throw ex;
      s.enti = [];
      render();
      const vuoto = $('#lista-vuota');
      if (vuoto) {
        vuoto.hidden = false;
        vuoto.textContent = ex.message || 'Non riesco a caricare gli enti.';
        vuoto.classList.add('plat-msg', 'err');
      }
    }
  }

  function render() {
    const box = $('#lista-enti');
    const vuoto = $('#lista-vuota');
    if (!s.enti.length) {
      box.innerHTML = '';
      vuoto.hidden = false;
      return;
    }
    vuoto.hidden = true;
    box.innerHTML = s.enti.map(e => {
      const badge = e.attivo
        ? '<span class="plat-badge on">Attivo</span>'
        : '<span class="plat-badge off">Disattivo</span>';
      return '<article class="plat-card" data-id="' + esc(e.id) + '">' +
        '<div>' +
        '<h2>' + esc(e.nome) + ' ' + badge + '</h2>' +
        '<p class="sub">/' + esc(e.subdomain) + '/</p>' +
        '<p class="sub">' + esc(e.apiUrl) + '</p>' +
        '</div>' +
        '<div class="azioni">' +
        '<a class="btn btn-secondario btn-piccolo" href="' + esc(urlEnte(e.subdomain, '/')) + '" target="_blank" rel="noopener">Sito</a>' +
        '<a class="btn btn-secondario btn-piccolo" href="' + esc(urlEnte(e.subdomain, 'secretariat')) + '" target="_blank" rel="noopener">Segreteria</a>' +
        '<button type="button" class="btn btn-piccolo" data-edit="' + esc(e.id) + '">Modifica</button>' +
        '<button type="button" class="btn btn-secondario btn-piccolo" data-setup="' + esc(e.id) + '" title="Esegue setup sul backend Apps Script dell’ente">Esegui setup</button>' +
        '<button type="button" class="btn btn-secondario btn-piccolo" data-toggle="' + esc(e.id) + '">' +
        (e.attivo ? 'Disattiva' : 'Attiva') + '</button>' +
        '</div></article>';
    }).join('');
  }

  function apriForm(ente) {
    $('#form-ente').hidden = false;
    $('#form-msg').hidden = true;
    if (ente) {
      $('#form-titolo').textContent = 'Modifica ente';
      $('#ente-id').value = ente.id;
      $('#ente-nome').value = ente.nome;
      $('#ente-giuridico').value = ente.nomeGiuridico || '';
      $('#ente-email').value = ente.email || '';
      $('#ente-logo').value = ente.logoUrl || '';
      aggiornaAnteprimaLogo();
      $('#ente-sub').value = ente.subdomain;
      $('#ente-api').value = ente.apiUrl;
      $('#ente-attivo').checked = !!ente.attivo;
    } else {
      $('#form-titolo').textContent = 'Nuovo ente';
      $('#ente-id').value = '';
      $('#form-ente').reset();
      $('#ente-logo').value = '';
      aggiornaAnteprimaLogo();
      $('#ente-attivo').checked = true;
    }
    $('#ente-nome').focus();
  }

  async function entra(token, nome) {
    s.token = token;
    s.nome = nome;
    memoria.scrivi(SESSIONE, { token, nome, scadenza: Date.now() + 11 * 3600 * 1000 }, 'sessione');
    mostraApp();
    await caricaEnti();
  }

  $('#ente-sub').addEventListener('input', () => {
    const v = $('#ente-sub').value.trim().toLowerCase() || 'vanzago';
    const hint = $('#hint-path');
    if (hint) hint.textContent = v;
  });

  $('#form-accesso').addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#acc-errore');
    err.hidden = true;
    const btn = $('#acc-entra');
    btn.disabled = true;
    try {
      const r = await platformApi('login', {
        nome: $('#acc-nome').value.trim(),
        password: $('#acc-password').value,
      });
      await entra(r.token, r.nome);
    } catch (ex) {
      err.textContent = ex.message || 'Accesso non riuscito.';
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  $('#esci').addEventListener('click', () => {
    memoria.togli(SESSIONE, 'sessione');
    s.token = null;
    mostraAccesso();
  });

  /* ---- Logo: caricamento o URL ---- */
  const LOGO_LATO = 256;

  function messaggioLogo(testo, tipo) {
    const m = $('#ente-logo-msg');
    m.textContent = testo || '';
    m.className = 'plat-msg' + (tipo ? ' ' + tipo : '');
    m.hidden = !testo;
  }

  /** anteprima: facoltativa, l’immagine appena ridotta (data:) per non aspettare Drive. */
  function aggiornaAnteprimaLogo(anteprima) {
    const url = $('#ente-logo').value.trim();
    const box = $('#ente-logo-anteprima');
    const img = box.querySelector('img');
    const mostra = !!(anteprima || /^https:\/\//i.test(url));
    box.classList.toggle('vuota', !mostra);
    img.hidden = !mostra;
    if (mostra) img.src = anteprima || url; else img.removeAttribute('src');
    $('#ente-logo-rimuovi').hidden = !url && !anteprima;
    if (!anteprima) messaggioLogo('');
  }

  /** Riduce l’immagine nel browser (max 256 px) e la ricodifica: niente SVG o metadati arrivano al server. */
  async function riduciLogo(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, ko) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = () => ko(new Error('Non riesco a leggere questa immagine.'));
        i.src = url;
      });
      const w = img.naturalWidth || LOGO_LATO, h = img.naturalHeight || LOGO_LATO;
      const k = Math.min(1, LOGO_LATO / Math.max(w, h));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k));
      c.height = Math.max(1, Math.round(h * k));
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise(ok => c.toBlob(ok, 'image/png'));
      if (!blob) throw new Error('Non riesco a convertire questa immagine.');
      const b64 = await new Promise((ok, ko) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result).split(',')[1] || '');
        r.onerror = () => ko(new Error('Lettura del file non riuscita.'));
        r.readAsDataURL(blob);
      });
      return b64;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  $('#ente-logo-anteprima img').addEventListener('error', () => {
    if ($('#ente-logo').value.trim()) {
      messaggioLogo('Non riesco a mostrare il logo. Prova a caricarlo di nuovo.', 'err');
      aggiornaAnteprimaLogo();
    }
  });
  $('#ente-logo-rimuovi').addEventListener('click', () => {
    $('#ente-logo').value = '';
    aggiornaAnteprimaLogo();
    messaggioLogo('Logo rimosso. Salva l’ente per confermare.', 'ok');
  });
  $('#ente-logo-file').addEventListener('change', async ev => {
    const input = ev.target;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) {
      messaggioLogo('Formato non accettato. Usa PNG, JPG, WebP o SVG.', 'err');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      messaggioLogo('Il file supera i 10 MB.', 'err');
      return;
    }
    const sub = $('#ente-sub').value.trim().toLowerCase();
    if (!sub) {
      messaggioLogo('Prima indica il percorso URL dell’ente, poi carica il logo.', 'err');
      $('#ente-sub').focus();
      return;
    }
    const btn = document.querySelector('label[for="ente-logo-file"]');
    btn.classList.add('in-corso');
    messaggioLogo('Caricamento del logo…');
    try {
      const contenutoBase64 = await riduciLogo(file);
      const r = await platformApi('logo_carica', {
        token: s.token,
        subdomain: sub,
        contenutoBase64,
      }, { timeoutMs: 30000 });
      $('#ente-logo').value = r.url;
      aggiornaAnteprimaLogo('data:image/png;base64,' + contenutoBase64);
      messaggioLogo('Logo caricato. Ricordati di salvare l’ente.', 'ok');
    } catch (ex) {
      messaggioLogo(ex.message || 'Caricamento non riuscito.', 'err');
    } finally {
      btn.classList.remove('in-corso');
    }
  });

  $('#btn-nuovo').addEventListener('click', () => apriForm(null));
  $('#ente-annulla').addEventListener('click', () => { $('#form-ente').hidden = true; });

  $('#form-ente').addEventListener('submit', async ev => {
    ev.preventDefault();
    const msg = $('#form-msg');
    msg.hidden = true;
    const btn = $('#ente-salva');
    btn.disabled = true;
    try {
      const r = await platformApi('ente_salva', {
        token: s.token,
        ente: {
          id: $('#ente-id').value || undefined,
          nome: $('#ente-nome').value.trim(),
          nomeGiuridico: $('#ente-giuridico').value.trim(),
          email: $('#ente-email').value.trim(),
          logoUrl: $('#ente-logo').value.trim(),
          subdomain: $('#ente-sub').value.trim().toLowerCase(),
          apiUrl: $('#ente-api').value.trim(),
          attivo: $('#ente-attivo').checked,
        },
      });
      const i = s.enti.findIndex(x => x.id === r.ente.id);
      if (i >= 0) s.enti[i] = Object.assign({}, s.enti[i], r.ente);
      else s.enti.push(r.ente);
      s.enti.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'it'));
      render();
      $('#form-ente').hidden = true;
    } catch (ex) {
      msg.textContent = ex.message;
      msg.className = 'plat-msg err';
      msg.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  $('#lista-enti').addEventListener('click', async ev => {
    const edit = ev.target.closest('[data-edit]');
    if (edit) {
      const ente = s.enti.find(x => x.id === edit.getAttribute('data-edit'));
      if (ente) apriForm(ente);
      return;
    }
    const setupBtn = ev.target.closest('[data-setup]');
    if (setupBtn) {
      const id = setupBtn.getAttribute('data-setup');
      const ente = s.enti.find(x => x.id === id);
      if (!ente) return;
      if (!window.confirm('Eseguire setup su «' + ente.nome + '» (/' + ente.subdomain + '/)? Serve HOOK_SECRET uguale su piattaforma e org.')) return;
      setupBtn.disabled = true;
      const label = setupBtn.textContent;
      setupBtn.textContent = 'In corso…';
      try {
        const r = await platformApi('ente_setup', { token: s.token, id });
        alert(r.messaggio || 'Setup completato.');
      } catch (ex) {
        alert(ex.message || 'Setup non riuscito.');
      } finally {
        setupBtn.disabled = false;
        setupBtn.textContent = label;
      }
      return;
    }
    const tog = ev.target.closest('[data-toggle]');
    if (!tog) return;
    const id = tog.getAttribute('data-toggle');
    const ente = s.enti.find(x => x.id === id);
    if (!ente) return;
    tog.disabled = true;
    try {
      const r = await platformApi('ente_stato', { token: s.token, id, attivo: !ente.attivo });
      Object.assign(ente, r.ente);
      render();
    } catch (ex) {
      alert(ex.message);
    } finally {
      tog.disabled = false;
    }
  });

  const sess = memoria.leggi(SESSIONE, 'sessione');
  if (sess && sess.token && sess.scadenza > Date.now()) {
    entra(sess.token, sess.nome).catch(() => {
      memoria.togli(SESSIONE, 'sessione');
      mostraAccesso();
    });
  } else {
    mostraAccesso();
  }
})();

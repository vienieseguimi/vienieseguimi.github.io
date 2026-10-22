/**
 * Console operatori: login piattaforma + CRUD enti.
 */
(function () {
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
    const r = await platformApi('enti_elenco', { token: s.token });
    s.enti = r.enti || [];
    render();
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
      $('#ente-sub').value = ente.subdomain;
      $('#ente-api').value = ente.apiUrl;
      $('#ente-attivo').checked = !!ente.attivo;
    } else {
      $('#form-titolo').textContent = 'Nuovo ente';
      $('#ente-id').value = '';
      $('#form-ente').reset();
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

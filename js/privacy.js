/**
 * Popup «Dati e privacy»: apre <dialog id="dialog-privacy">
 * da link [data-apri-privacy].
 */
(function () {
  const dlg = document.getElementById('dialog-privacy');
  if (!dlg) return;

  function apri(e) {
    if (e) e.preventDefault();
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  document.querySelectorAll('[data-apri-privacy]').forEach(el => {
    el.addEventListener('click', apri);
  });

  dlg.addEventListener('click', e => {
    if (e.target === dlg) dlg.close();
  });
})();

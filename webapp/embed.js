// Runs the quiz inside the ABECFX student portal.
// bot.js adds this script to the quiz page. It does nothing unless the page was opened with a portal pass,
// which looks like  https://quiz-service/#t=<pass>&o=<portal address>  (the part after # is never sent to a server).
// It relies on these ids in index.html: reg-input, reg-check-btn, reg-change-btn, save-status, grade-line.
(function () {
  var params;
  try { params = new URLSearchParams(location.hash.replace(/^#/, '')); } catch (e) { return; }
  var token = params.get('t');
  if (!token || token.length > 600) return;

  // The registration number named in the pass (the server checks the signature; this is only for the form).
  var reg = '';
  try {
    var body = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    reg = JSON.parse(atob(body)).r || '';
  } catch (e) { return; }
  if (!/^ABECFX\/\d{2}\/\d{4}$/.test(reg)) return;

  // Where to tell the portal a result was saved (https only).
  var portalOrigin = '';
  try {
    var o = new URL(params.get('o') || '');
    if (o.protocol === 'https:') portalOrigin = o.origin;
  } catch (e) { /* no portal address given */ }

  // Take the pass out of the address bar.
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }

  // 1. Every call this page makes to its own /api/ carries the pass.
  var realFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('/api/') === 0) {
      init = Object.assign({}, init);
      var headers = new Headers(init.headers || {});
      headers.set('x-portal-token', token);
      init.headers = headers;
    }
    return realFetch.call(this, input, init);
  };

  function $(id) { return document.getElementById(id); }

  // 2. Sign the student in with the number from the pass. They cannot switch to another number here.
  var regInput = $('reg-input');
  var checkBtn = $('reg-check-btn');
  var changeBtn = $('reg-change-btn');
  if (regInput && checkBtn) {
    if (changeBtn) changeBtn.style.display = 'none';
    regInput.value = reg;
    checkBtn.click();
  }

  // 3. "Send score to chat & close" only works inside Telegram.
  Array.prototype.forEach.call(document.querySelectorAll('button'), function (b) {
    if (/send score to chat/i.test(b.textContent)) b.style.display = 'none';
  });

  // 4. Tell the portal when a result has been saved, so its results card refreshes.
  var saveEl = $('save-status');
  if (saveEl && portalOrigin && window.parent !== window) {
    var told = false;
    new MutationObserver(function () {
      if (saveEl.classList.contains('ok')) {
        if (!told) {
          told = true;
          var gl = $('grade-line');
          window.parent.postMessage({ type: 'abecfx_quiz_saved', grade: gl ? gl.textContent : '' }, portalOrigin);
        }
      } else {
        told = false;
      }
    }).observe(saveEl, { attributes: true, childList: true, characterData: true, subtree: true });
  }
})();

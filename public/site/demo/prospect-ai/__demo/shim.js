// Demonstração estática do Prospect AI: responde à API com dados gravados e não salva nada.
(function () {
  var B = '/demo/prospect-ai';
  var D = B + '/__demo/';
  var man = null;
  var xhr = new XMLHttpRequest();
  xhr.open('GET', D + 'api.json', false); // síncrono: precisa estar pronto antes do app
  xhr.send();
  try { man = JSON.parse(xhr.responseText); } catch (e) { man = { pages: [], api: {} }; }
  var pages = {};
  man.pages.forEach(function (p) { pages[p] = 1; });

  // /leads/abc -> /demo/prospect-ai/leads/abc.html; sem gravação, cai na página-pai gravada
  function pageUrl(u) {
    var p = u.pathname.slice(B.length).replace(/\.html$/, '').replace(/\/$/, '') || '/';
    while (!pages[p] && p !== '/') p = p.slice(0, p.lastIndexOf('/')) || '/';
    if (!pages[p]) p = man.home || '/dashboard';
    return B + (p === '/' ? '/index.html' : p + '.html') + u.search + u.hash;
  }
  function apiEntry(u) {
    var k = u.pathname + u.search;
    if (man.api[k]) return man.api[k];
    for (var key in man.api) if (key.split('?')[0] === u.pathname) return man.api[key];
    return null;
  }
  var toastT;
  function toast() {
    var t = document.getElementById('demo-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'demo-toast';
      t.style.cssText = 'position:fixed;left:50%;top:20px;transform:translateX(-50%);z-index:2147483001;background:#0a0a0a;color:#fff;font:500 14px/1.4 system-ui,sans-serif;padding:12px 18px;border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.25)';
      t.textContent = 'Demonstração: as alterações não são salvas.';
      document.body.appendChild(t);
    }
    t.style.display = 'block';
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.style.display = 'none'; }, 2600);
  }
  function json(o, s) { return new Response(JSON.stringify(o), { status: s || 200, headers: { 'content-type': 'application/json' } }); }

  var of = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var req = new Request(input, init);
    var u = new URL(req.url, location.href);
    if (u.origin !== location.origin || u.pathname.indexOf(B) !== 0) return of(input, init);
    if (req.headers.get('rsc')) {
      if (req.headers.get('next-router-prefetch')) return new Promise(function () {}); // prefetch fica pendente; o clique navega pelo .html
      location.href = pageUrl(u);
      return new Promise(function () {});
    }
    if (u.pathname.indexOf(B + '/api/') === 0 || u.pathname.indexOf(B + '/_next/image') === 0) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { toast(); return Promise.resolve(json({ ok: true, demo: true })); }
      var e = apiEntry(u);
      if (!e) return Promise.resolve(json({ error: 'Indisponível na demonstração' }, 404));
      return of(D + 'a/' + e.f).then(function (r) { return new Response(r.body, { status: e.s, headers: { 'content-type': e.t } }); });
    }
    return of(input, init);
  };

  // Links comuns (<a>) e Link do Next: navegação direta para o .html gravado
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href]');
    if (!a || a.target === '_blank' || ev.defaultPrevented || ev.metaKey || ev.ctrlKey) return;
    var u = new URL(a.getAttribute('href'), location.href);
    if (u.origin !== location.origin || u.pathname.indexOf(B) !== 0 || u.pathname.indexOf(B + '/__demo') === 0) return;
    if (/\.[a-z0-9]{2,4}$/i.test(u.pathname) && !/\.html$/.test(u.pathname)) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (u.pathname.indexOf(B + '/api/') === 0 || /\/login$/.test(u.pathname)) { toast(); return; }
    if (u.pathname === location.pathname.replace(/\.html$/, '') && u.hash) { location.hash = u.hash; return; }
    location.href = pageUrl(u);
  }, true);

  // Sem tempo real, push nem service worker
  window.EventSource = function () { return { close: function () {}, addEventListener: function () {}, removeEventListener: function () {} }; };
  if (navigator.serviceWorker) navigator.serviceWorker.register = function () { return Promise.reject(new Error('demo')); };
  if (window.Notification) Notification.requestPermission = function () { return Promise.resolve('denied'); };

  // Barra da demonstração (mesmo padrão das outras demos do site)
  function bar() {
    if (document.getElementById('stack-demo-bar')) return;
    var d = document.createElement('div');
    d.id = 'stack-demo-bar';
    d.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:14px;background:#0a0a0a;color:#fff;font:500 13px/1 Sora,system-ui,sans-serif;padding:8px 8px 8px 18px;border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.25);white-space:nowrap';
    d.innerHTML = '<span>Demonstração · Prospect AI · dados fictícios</span><a href="/index.html#portfolio" style="background:#1800ad;color:#fff;text-decoration:none;padding:9px 14px;border-radius:999px">Voltar ao site</a>';
    document.body.appendChild(d);
  }
  if (document.body) bar(); else document.addEventListener('DOMContentLoaded', bar);
  new MutationObserver(function () { if (document.body && !document.getElementById('stack-demo-bar')) bar(); }).observe(document.documentElement, { childList: true, subtree: true });
})();

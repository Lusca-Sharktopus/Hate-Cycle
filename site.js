/* Scripts do site. Cada bloco é independente: se um falhar, os outros continuam funcionando. */
function hcSafe(fn) { try { fn(); } catch (e) { if (window.console) console.error('site.js:', e); } }

/* 1) Ordenação das histórias (Lançamento / Cronológica / Alfabética, cada uma invertível) */
hcSafe(function () {
  document.querySelectorAll('.sorter').forEach(function (box) {
    var grid = document.getElementById(box.dataset.grid);
    if (!grid) return;
    var lang = box.dataset.lang, labels = JSON.parse(box.dataset.labels);
    var select = box.querySelector('select'), btn = box.querySelector('.sort-dir'), search = box.querySelector('.story-search');
    var none = grid.closest('.stories-block') && grid.closest('.stories-block').querySelector('.no-results');
    function norm(t) { return (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
    var cards = Array.prototype.slice.call(grid.children);
    var mode = 'release', desc = false;
    try {
      var saved = (localStorage.getItem('hc-sort') || '').split(':');
      if (labels[saved[0]]) { mode = saved[0]; desc = saved[1] === 'desc'; }
    } catch (e) {}
    select.value = mode;
    cards.forEach(function (c) { var p = c.querySelector('p'); c._text = norm(c.dataset.title); /* a busca considera só o título */ });
    function matches(c) { var q = norm(search ? search.value : '').split(/\s+/).filter(Boolean); return q.every(function (w) { return c._text.indexOf(w) > -1; }); }

    function apply() {
      var hidden = [], numbered = [], unnumbered = [];
      cards.forEach(function (c) {
        var raw = c.dataset[mode];
        if (!matches(c)) hidden.push(c);                                         // não combina com o que foi digitado na busca
        else if (mode !== 'alpha' && raw === 'hide') hidden.push(c);                 // "chrono": false no work.json = oculta nessa ordem
        else if (mode !== 'alpha' && (raw === undefined || isNaN(parseFloat(raw)))) unnumbered.push(c);  // sem número: vai para o fim
        else numbered.push(c);
      });
      numbered.sort(function (a, b) {
        var r = mode === 'alpha'
          ? a.dataset.title.localeCompare(b.dataset.title, lang, { sensitivity: 'base', ignorePunctuation: true })
          : parseFloat(a.dataset[mode]) - parseFloat(b.dataset[mode]);
        return desc ? -r : r;
      });
      numbered.concat(unnumbered).forEach(function (c) { c.hidden = false; c.style.display = ''; grid.appendChild(c); });
      hidden.forEach(function (c) { c.hidden = true; c.style.display = 'none'; grid.appendChild(c); });
      grid.scrollLeft = 0;
      if (none) none.hidden = (numbered.length + unnumbered.length) > 0;
      btn.dataset.dir = desc ? 'desc' : 'asc';
      btn.title = labels[mode][desc ? 1 : 0];
      btn.setAttribute('aria-label', labels[mode][desc ? 1 : 0]);
      try { localStorage.setItem('hc-sort', mode + ':' + (desc ? 'desc' : 'asc')); } catch (e) {}
    }
    select.addEventListener('change', function () { mode = select.value; apply(); });
    btn.addEventListener('click', function () { desc = !desc; apply(); });
    if (search) search.addEventListener('input', apply);
    apply();
  });
});

/* 2) Carrossel horizontal das histórias: setas + esmaecer a borda quando há mais cards para o lado */
hcSafe(function () {
  var right = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4.5v15l11.5-7.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  var left = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 4.5v15L4.5 12z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  document.querySelectorAll('.works:not(.grid)').forEach(function (works) {
    var rail = document.createElement('div');
    rail.className = 'rail';
    works.parentNode.insertBefore(rail, works);
    rail.appendChild(works);
    function make(dir) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'rail-btn rail-' + dir; b.innerHTML = dir === 'prev' ? left : right;
      b.setAttribute('aria-label', works.dataset[dir] || dir);
      if (dir === 'next' && works.dataset.moreUrl) { var lab = document.createElement('span'); lab.className = 'rail-label'; lab.textContent = works.dataset.moreLabel || ''; b.insertBefore(lab, b.firstChild); }
      b.addEventListener('click', function () {
        if (b.classList.contains('is-link')) { location.href = works.dataset.moreUrl; return; }   // fim do carrossel: vai para a página de Histórias
        var card = works.querySelector('.work-card:not([hidden])');
        var step = (card ? card.offsetWidth : 240) + 22;
        works.scrollBy({ left: dir === 'next' ? step : -step, behavior: 'smooth' });
      });
      rail.appendChild(b);
      return b;
    }
    var prev = make('prev'), next = make('next');
    function update() {
      var max = works.scrollWidth - works.clientWidth, l = works.scrollLeft > 4, r = works.scrollLeft < max - 4;
      prev.style.display = l ? '' : 'none';
      if (works.dataset.moreUrl) {                       // carrossel com "ver todas": a seta fica sempre, e no fim vira link
        next.style.display = '';
        next.classList.toggle('is-link', !r);
        next.setAttribute('aria-label', !r ? (works.dataset.moreLabel || '') : (works.dataset.next || 'next'));
      } else next.style.display = r ? '' : 'none';
      works.style.setProperty('--fl', l ? '90px' : '0px');
      works.style.setProperty('--fr', r ? '90px' : '0px');
    }
    works.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    window.addEventListener('load', update);
    if (window.MutationObserver) new MutationObserver(update).observe(works, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    update();
  });
});

/* 3) Gifs da página "Histórias": se passarem do fim do texto, encolhem até caber (sem deixar vão) */
hcSafe(function () {
  var root = document.querySelector('.page-project .prose');
  if (!root) return;
  var gifs = Array.prototype.slice.call(root.querySelectorAll('.apollo-gif, .anfibio-gif'));
  if (!gifs.length) return;
  function fit() {
    gifs.forEach(function (g) { g.style.width = ''; });
    for (var n = 0; n < 5; n++) {
      var ps = Array.prototype.filter.call(root.children, function (x) { return x.tagName === 'P'; });
      if (!ps.length) return;
      var limit = ps[ps.length - 1].getBoundingClientRect().bottom, changed = false;
      gifs.forEach(function (g) {
        var r = g.getBoundingClientRect();
        if (r.height > 0 && r.bottom > limit + 6 && r.width > 80) {
          g.style.width = Math.max(80, r.width * Math.max(limit - r.top, 40) / r.height) + 'px';
          changed = true;
        }
      });
      if (!changed) break;
    }
  }
  gifs.forEach(function (g) { if (!g.complete) g.addEventListener('load', fit); });
  window.addEventListener('load', fit);
  window.addEventListener('resize', fit);
  fit();
});

/* 4) Carta que vira ao clicar (e volta ao clicar de novo) */
hcSafe(function () {
  document.querySelectorAll('.flip-card').forEach(function (card) {
    card.setAttribute('tabindex', '0'); card.setAttribute('role', 'button'); card.setAttribute('aria-pressed', 'false');
    function toggle() { card.setAttribute('aria-pressed', String(card.classList.toggle('flipped'))); }
    card.addEventListener('click', toggle);
    card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });
});

/* 5) Imagem ausente: emissário mostra a inicial; capa de história mostra um bloco liso */
hcSafe(function () {
  function guard(sel, make) {
    document.querySelectorAll(sel).forEach(function (img) {
      function fallback() { img.replaceWith(make(img)); }
      if (img.complete && img.naturalWidth === 0) fallback(); else img.addEventListener('error', fallback);
    });
  }
  guard('.emi-photo img', function (img) {
    var d = document.createElement('div'); d.className = 'emi-ph'; d.setAttribute('aria-hidden', 'true');
    d.textContent = (img.alt || '?').charAt(0).toUpperCase(); return d;
  });
  guard('.work-card > img', function (img) {
    var d = document.createElement('div'); d.className = 'nocover'; d.setAttribute('role', 'img'); d.setAttribute('aria-label', img.alt || ''); return d;
  });
});

/* 5) Tela de abertura: vídeo da logo sobre o fundo; some (com fade) quando a página termina de carregar */
hcSafe(function () {
  var d = document.documentElement, intro = document.getElementById('intro');
  if (!intro || !d.classList.contains('intro')) return;
  try { sessionStorage.setItem('hc-intro', '1'); } catch (e) {}
  var min = parseInt(intro.dataset.min, 10) || 4200, max = parseInt(intro.dataset.max, 10) || 10000;
  var start = Date.now(), loaded = document.readyState === 'complete', ended = false, failed = false, closing = false;
  var v = intro.querySelector('video');
  if (v) {
    v.addEventListener('ended', function () { ended = true; check(); });
    v.addEventListener('error', function () { failed = true; check(); });
  }
  function close() {
    if (closing) return; closing = true;
    d.classList.add('intro-out');                                  // fundo e vídeo desvanecem juntos
    setTimeout(function () { d.classList.remove('intro', 'intro-out'); intro.remove(); }, 1000);
  }
  function check() {
    if (closing || !loaded) return;
    var waited = Date.now() - start;
    if (failed || ended || waited >= min) close(); else setTimeout(check, Math.max(50, min - waited));
  }
  if (!loaded) window.addEventListener('load', function () { loaded = true; check(); });
  setTimeout(close, max);                                          // garantia: nunca prende o visitante
  check();
});

/* 6) Notícias: 10 por página, números de página (como numa pesquisa) e busca em todas as notícias */
hcSafe(function () {
  var list = document.querySelector('.news-list');
  if (!list) return;
  var items = Array.prototype.slice.call(list.querySelectorAll('.news-item'));
  var input = document.querySelector('.news-search'), pag = document.querySelector('.pagination'), none = document.querySelector('.news-none');
  var per = parseInt(pag.dataset.per, 10) || 10;
  var page = parseInt(new URLSearchParams(location.search).get('p'), 10) || 1;
  function norm(t) { return (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  items.forEach(function (it) { it._t = norm(it.dataset.search); });
  function filtered() {
    var q = norm(input ? input.value : '').split(/\s+/).filter(Boolean);
    return items.filter(function (it) { return q.every(function (w) { return it._t.indexOf(w) > -1; }); });
  }
  function link(label, n, cls, current) {
    var a = document.createElement(current ? 'span' : 'a');
    a.textContent = label; if (cls) a.className = cls;
    if (current) a.setAttribute('aria-current', 'page');
    else { a.href = '?p=' + n; a.addEventListener('click', function (e) { e.preventDefault(); go(n, true); }); }
    return a;
  }
  function render() {
    var f = filtered(), pages = Math.max(1, Math.ceil(f.length / per));
    page = Math.min(Math.max(1, page), pages);
    items.forEach(function (it) { it.hidden = true; });
    f.slice((page - 1) * per, page * per).forEach(function (it) { it.hidden = false; });
    none.hidden = f.length > 0;
    pag.textContent = '';
    if (pages > 1) {
      if (page > 1) pag.appendChild(link('‹ ' + pag.dataset.prev, page - 1, 'pg-step'));
      var shown = [];
      for (var n = 1; n <= pages; n++) if (n === 1 || n === pages || Math.abs(n - page) <= 2) shown.push(n);
      shown.forEach(function (n, i) {
        if (i && n - shown[i - 1] > 1) { var gap = document.createElement('span'); gap.className = 'pg-gap'; gap.textContent = '…'; pag.appendChild(gap); }
        pag.appendChild(link(String(n), n, 'pg-num', n === page));
      });
      if (page < pages) pag.appendChild(link(pag.dataset.next + ' ›', page + 1, 'pg-step'));
    }
    if (window.history && history.replaceState) history.replaceState(null, '', page > 1 ? '?p=' + page : location.pathname);
  }
  function go(n, scroll) {
    page = n; render();
    if (scroll) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (input) input.addEventListener('input', function () { page = 1; render(); });
  render();
});


/* Alternar entre posts incorporados (.embed-alt) */
(function () {
  document.querySelectorAll('.embed-alt').forEach(function (box) {
    var btns = box.querySelectorAll('.embed-btn'), panels = box.querySelectorAll('.embed-panel');
    btns.forEach(function (btn, i) {
      btn.addEventListener('click', function () {
        btns.forEach(function (b, j) { b.classList.toggle('is-on', i === j); b.setAttribute('aria-pressed', i === j ? 'true' : 'false'); });
        panels.forEach(function (p, j) { p.classList.toggle('is-on', i === j); });
        try { if (window.twttr && twttr.widgets) twttr.widgets.load(panels[i]); } catch (e) {}
        try { if (window.instgrm && instgrm.Embeds) instgrm.Embeds.process(); } catch (e) {}
        try { if (window.tiktokEmbedLoad) window.tiktokEmbedLoad(); } catch (e) {}
      });
    });
  });
})();

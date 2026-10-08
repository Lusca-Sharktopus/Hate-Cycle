/* Comentários do Hᴀᴛᴇ Cʏᴄʟᴇ — contas + comentários usando Supabase (ver COMENTARIOS-LEIA-ME.md).
   Todo texto de usuário entra na página com textContent (nunca innerHTML), então não dá para injetar HTML. */
(function () {
  var cfg = window.HC, root = document.querySelector('.hc-comments[data-page]');
  if (!cfg || !root || !window.supabase) return;
  var app = root.querySelector('.c-app'), T = cfg.ui, page = root.dataset.page;
  var sb = window.supabase.createClient(cfg.url, cfg.key);
  var user = null, profile = null, mode = 'login', recovery = false, notice = null, flash = null;
  var authBox = document.createElement('div'), listBox = document.createElement('div');
  app.appendChild(authBox); app.appendChild(listBox);

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function msg(text, ok) { return text ? el('p', { class: 'c-msg' + (ok ? ' ok' : ''), role: 'status', text: text }) : null; }
  function friendly(err) {
    var m = (err && err.message || '').toLowerCase();
    if (m.indexOf('rate limit') > -1 || m.indexOf('too many') > -1) return T.c_err_rate;
    if (m.indexOf('invalid login') > -1 || m.indexOf('not confirmed') > -1) return T.c_err_login;
    return T.c_err_generic + (err && err.message ? ' (' + err.message + ')' : '');
  }
  function field(type, name, ph, extra) {
    var i = el('input', Object.assign({ type: type, name: name, placeholder: ph, 'aria-label': ph, required: 'required' }, extra || {}));
    return i;
  }
  function submitBtn(text) { return el('button', { type: 'submit', class: 'button', text: text }); }

  /* ── área de login / novo comentário ── */
  function renderAuth() {
    authBox.textContent = '';
    var box = el('div', { class: 'c-box' });
    if (recovery) {
      var f = el('form', {}, []);
      var pw = field('password', 'password', T.c_new_password, { minlength: '6', autocomplete: 'new-password' });
      f.appendChild(pw); f.appendChild(submitBtn(T.c_save_password));
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        sb.auth.updateUser({ password: pw.value }).then(function (r) {
          if (r.error) { flash = friendly(r.error); } else { recovery = false; notice = T.c_password_changed; }
          refresh();
        });
      });
      box.appendChild(f);
    } else if (user) {
      var name = (profile && profile.display_name) || user.email;
      box.appendChild(el('div', { class: 'c-who' }, [
        el('span', { text: T.c_hello + ' ' + name }),
        el('button', { type: 'button', class: 'c-link', text: T.c_logout, onclick: function () { sb.auth.signOut().then(function () { user = profile = null; refresh(); }); } })
      ]));
      box.appendChild(commentForm(null));
    } else {
      box.appendChild(el('p', { text: T.c_login_to }));
      box.appendChild(el('div', { class: 'c-tabs' }, [
        el('button', { type: 'button', text: T.c_login, 'aria-pressed': String(mode === 'login'), onclick: function () { mode = 'login'; renderAuth(); } }),
        el('button', { type: 'button', text: T.c_signup, 'aria-pressed': String(mode === 'signup'), onclick: function () { mode = 'signup'; renderAuth(); } })
      ]));
      box.appendChild(mode === 'login' ? loginForm() : signupForm());
    }
    [msg(flash), msg(notice, true)].forEach(function (m) { if (m) box.appendChild(m); });
    flash = notice = null;
    authBox.appendChild(box);
  }

  function loginForm() {
    var f = el('form');
    var em = field('email', 'email', T.c_email, { autocomplete: 'email' }), pw = field('password', 'password', T.c_password, { autocomplete: 'current-password' });
    [em, pw, submitBtn(T.c_login),
     el('button', { type: 'button', class: 'c-link', text: T.c_forgot, onclick: function () {
       if (!em.value) { em.focus(); return; }
       sb.auth.resetPasswordForEmail(em.value, { redirectTo: location.href.split('#')[0] }).then(function () { notice = T.c_reset_sent; renderAuth(); });
     } })].forEach(function (n) { f.appendChild(n); });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      sb.auth.signInWithPassword({ email: em.value, password: pw.value }).then(function (r) {
        if (r.error) { flash = friendly(r.error); renderAuth(); }
      });
    });
    return f;
  }

  function signupForm() {
    var f = el('form');
    var nm = field('text', 'username', T.c_username, { minlength: '2', maxlength: '30', autocomplete: 'nickname' });
    var em = field('email', 'email', T.c_email, { autocomplete: 'email' });
    var pw = field('password', 'password', T.c_password + ' (min. 6)', { minlength: '6', autocomplete: 'new-password' });
    [nm, em, pw, submitBtn(T.c_signup)].forEach(function (n) { f.appendChild(n); });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      sb.auth.signUp({ email: em.value, password: pw.value,
        options: { data: { display_name: nm.value.trim() }, emailRedirectTo: location.href.split('#')[0] } }).then(function (r) {
        if (r.error) flash = friendly(r.error); else { notice = T.c_check_email; mode = 'login'; }
        renderAuth();
      });
    });
    return f;
  }

  function commentForm(parentId, onDone) {
    var f = el('form', { class: parentId ? 'c-reply-form' : 'c-form-wide' });
    var ta = el('textarea', { name: 'body', maxlength: '2000', required: 'required', placeholder: T.c_write, 'aria-label': T.c_write });
    var row = el('div', { class: 'c-row' }, [submitBtn(parentId ? T.c_reply : T.c_post)]);
    if (parentId) row.appendChild(el('button', { type: 'button', class: 'c-link', text: T.c_cancel, onclick: onDone }));
    f.appendChild(ta); f.appendChild(row);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var row0 = { page_id: page, body: ta.value.trim() };
      if (parentId) row0.parent_id = parentId;
      if (!row0.body) return;
      sb.from('comments').insert(row0).then(function (r) {
        if (r.error) { flash = friendly(r.error); renderAuth(); } else { loadComments(); if (onDone) onDone(); else ta.value = ''; }
      });
    });
    return f;
  }

  /* ── lista de comentários ── */
  function loadComments() {
    listBox.textContent = T.c_loading;
    sb.from('comments').select('id, body, created_at, user_id, parent_id, profiles(display_name, is_admin)')
      .eq('page_id', page).order('created_at', { ascending: true }).then(function (r) {
        listBox.textContent = '';
        if (r.error) { listBox.appendChild(msg(friendly(r.error))); return; }
        var rows = r.data || [];
        if (!rows.length) { listBox.appendChild(el('p', { class: 'c-note', text: T.c_none })); return; }
        var kids = {};
        rows.forEach(function (c) { if (c.parent_id) (kids[c.parent_id] = kids[c.parent_id] || []).push(c); });
        rows.filter(function (c) { return !c.parent_id; }).forEach(function (c) { listBox.appendChild(item(c, kids[c.id] || [], true)); });
      });
  }

  function item(c, replies, top) {
    var author = c.profiles || {};
    var d = new Date(c.created_at);
    var head = el('div', { class: 'c-head' }, [
      author.is_admin ? el('span', { class: 'c-badge', text: '✦' }) : null,
      el('strong', { text: author.display_name || '?' }),
      el('time', { datetime: c.created_at, text: isNaN(d) ? '' : d.toLocaleString(cfg.lang, { dateStyle: 'medium', timeStyle: 'short' }) })
    ]);
    var actions = el('div', { class: 'c-actions' });
    var wrap = el('div', { class: 'c-item' }, [head, el('div', { class: 'c-body', text: c.body }), actions]);
    if (user && top) {
      actions.appendChild(el('button', { type: 'button', class: 'c-link', text: T.c_reply, onclick: function () {
        var open = wrap.querySelector(':scope > .c-reply-form');
        if (open) { open.remove(); return; }
        wrap.insertBefore(commentForm(c.id, function () { var x = wrap.querySelector(':scope > .c-reply-form'); if (x) x.remove(); }), actions.nextSibling);
      } }));
    }
    if (user && (user.id === c.user_id || (profile && profile.is_admin))) {
      actions.appendChild(el('button', { type: 'button', class: 'c-link', text: T.c_delete, onclick: function () {
        if (window.confirm(T.c_confirm_delete)) sb.from('comments').delete().eq('id', c.id).then(function (r) {
          if (r.error) { flash = friendly(r.error); renderAuth(); } else loadComments();
        });
      } }));
    }
    if (replies.length) {
      var box = el('div', { class: 'c-replies' });
      replies.forEach(function (x) { box.appendChild(item(x, [], false)); });
      wrap.appendChild(box);
    }
    return wrap;
  }

  /* ── sessão ── */
  function refresh() {
    var p = user
      ? sb.from('profiles').select('display_name, is_admin').eq('id', user.id).single().then(function (r) { profile = r.data || null; })
      : Promise.resolve();
    return p.then(function () { renderAuth(); loadComments(); });
  }

  sb.auth.onAuthStateChange(function (event, session) {
    if (event === 'PASSWORD_RECOVERY') recovery = true;
    var next = session && session.user || null;
    if ((next && next.id) === (user && user.id) && event !== 'PASSWORD_RECOVERY') return;   // evita redesenhar à toa
    user = next; if (!next) profile = null;
    refresh();
  });
  sb.auth.getSession().then(function (r) {
    var s = r.data && r.data.session;
    if (s && !user) { user = s.user; }
    refresh();
  });
})();

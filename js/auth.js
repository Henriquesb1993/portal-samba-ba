/**
 * auth.js v3 — Sistema de Autenticação e Controle de Acesso
 * Portal Sambaíba · Viagens Nimer
 */

const AUTH = (() => {

  const STORAGE_USERS       = 'sb_users';
  const STORAGE_PERMS       = 'sb_perms';
  const STORAGE_SESSION     = 'sb_session';
  const STORAGE_LOG         = 'sb_access_log';
  const SESSION_TIMEOUT_MIN = 30;

  const MENUS_DEFAULT = [
    // ── OPERAÇÃO ──
    { id: 'horas',           label: 'Horas Realizadas',          section: 'Operação',    href: 'horas.html',                   ico: '⏱' },
    { id: 'viagens_nimer',   label: 'Viagens Realizadas Nimer',  section: 'Operação',    href: 'viagens.html',                 ico: '🚌' },
    { id: 'viagens_sim',     label: 'Viagens Realizadas SIM',    section: 'Operação',    href: 'viagens_sim.html',             ico: '🗂' },
    { id: 'pontualidade',    label: 'Pontualidade de Partidas SIM', section: 'Operação', href: 'pontualidade_sim.html',        ico: '🕐' },
    { id: 'icf',             label: 'ICF',                        section: 'Operação',    href: 'em_desenvolvimento.html',      ico: '📈' },
    { id: 'multas',          label: 'Multas RESAM e DSV',         section: 'Operação',    href: 'em_desenvolvimento.html',      ico: '⚠️' },
    { id: 'jornada',         label: 'Jornada Incompleta',         section: 'Operação',    href: 'em_desenvolvimento.html',      ico: '📋' },
    { id: 'operadores',      label: 'Operadores',                 section: 'Operação',    href: 'em_desenvolvimento.html',      ico: '👤' },
    // ── GESTÃO ──
    { id: 'financeiro',      label: 'Financeiro',                 section: 'Gestão',      href: 'em_desenvolvimento.html',      ico: '💰' },
    { id: 'manutencao',      label: 'Manutenção',                 section: 'Gestão',      href: 'em_desenvolvimento.html',      ico: '🔧' },
    { id: 'rh',              label: 'RH',                         section: 'Gestão',      href: 'em_desenvolvimento.html',      ico: '👥' },
    { id: 'vr',              label: 'Gestão de VR',               section: 'Gestão',      href: 'vr.html',                      ico: '🍽' },
    // ── ELÉTRICO ──
    { id: 'recarga',         label: 'Simulação Recarga',          section: 'Elétrico',    href: 'simulador_recarga.html',       ico: '⚡' },
    // ── ESTRATÉGICO ──
    { id: 'indicadores',     label: 'Indicadores',                section: 'Estratégico', href: '#',                            ico: '📊' },
    { id: 'config',          label: 'Configurações',              section: 'Estratégico', href: '#',                            ico: '⚙'  },
    // ── ADMIN ──
    { id: 'usuarios',        label: 'Gestão de Usuários',         section: 'Admin',       href: 'usuarios.html',                ico: '🔐' },
    { id: 'permissoes',      label: 'Permissões de Menu',         section: 'Admin',       href: 'permissoes.html',              ico: '🛡'  },
  ];

  const PERFIS = { 1:'VISUALIZAÇÃO', 2:'OPERADOR', 3:'SUPERVISOR', 4:'GERENTE', 5:'ADMIN' };

  function loginPath() {
    const path = window.location.pathname;
    const inSubdir = path.includes('/pages/');
    if (inSubdir) return '../login.html';
    const file = path.split('/').pop();
    if (file && file.includes('.html')) {
      const segments = path.split('/').filter(Boolean);
      if (segments.length >= 2) return '../login.html';
    }
    return 'login.html';
  }

  function init() {
    if (!localStorage.getItem(STORAGE_USERS)) {
      localStorage.setItem(STORAGE_USERS, JSON.stringify([
        { id:1, login:'admin',      senha:'admin123', perfil:5, ativo:true, tentativas:0, bloqueado:false },
        { id:2, login:'gerente',    senha:'ger123',   perfil:4, ativo:true, tentativas:0, bloqueado:false },
        { id:3, login:'supervisor', senha:'sup123',   perfil:3, ativo:true, tentativas:0, bloqueado:false },
        { id:4, login:'operador',   senha:'op123',    perfil:2, ativo:true, tentativas:0, bloqueado:false },
        { id:5, login:'viewer',     senha:'view123',  perfil:1, ativo:true, tentativas:0, bloqueado:false },
      ]));
    }
    if (!localStorage.getItem(STORAGE_PERMS)) {
      const perms = {};
      MENUS_DEFAULT.forEach(m => {
        perms[m.id] = (m.id === 'usuarios' || m.id === 'permissoes') ? [5] : [1,2,3,4,5];
      });
      localStorage.setItem(STORAGE_PERMS, JSON.stringify(perms));
    }
  }

  function getUsers()   { return JSON.parse(localStorage.getItem(STORAGE_USERS) || '[]'); }
  function saveUsers(u) { localStorage.setItem(STORAGE_USERS, JSON.stringify(u)); }
  function getPerms()   { return JSON.parse(localStorage.getItem(STORAGE_PERMS) || '{}'); }
  function savePerms(p) { localStorage.setItem(STORAGE_PERMS, JSON.stringify(p)); }

  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_SESSION) || 'null'); }
    catch(e) { return null; }
  }
  function setSession(user) {
    sessionStorage.setItem(STORAGE_SESSION, JSON.stringify({
      id: user.id, login: user.login, perfil: user.perfil,
      loginAt: Date.now(), lastActivity: Date.now()
    }));
  }
  function clearSession()  { sessionStorage.removeItem(STORAGE_SESSION); }
  function touchSession() {
    const s = getSession(); if (!s) return;
    s.lastActivity = Date.now();
    sessionStorage.setItem(STORAGE_SESSION, JSON.stringify(s));
  }
  function isExpired() {
    const s = getSession(); if (!s) return true;
    return (Date.now() - s.lastActivity) > SESSION_TIMEOUT_MIN * 60 * 1000;
  }

  function login(loginStr, senha) {
    const users = getUsers();
    const user  = users.find(u => u.login.toLowerCase() === loginStr.toLowerCase());
    if (!user)          return { ok:false, msg:'Usuário não encontrado.' };
    if (user.bloqueado) return { ok:false, msg:'Usuário bloqueado. Contate o administrador.' };
    if (user.senha !== senha) {
      user.tentativas = (user.tentativas || 0) + 1;
      if (user.tentativas >= 5) {
        user.bloqueado = true; saveUsers(users);
        return { ok:false, msg:'Usuário bloqueado após 5 tentativas.' };
      }
      saveUsers(users);
      return { ok:false, msg:`Senha incorreta. Tentativa ${user.tentativas}/5.` };
    }
    user.tentativas = 0;
    saveUsers(users);
    setSession(user);
    _addLog(user.login, user.perfil);
    return { ok:true, user };
  }

  function logout() { clearSession(); window.location.href = loginPath(); }

  function requireAuth() {
    const s = getSession();
    if (!s || isExpired()) {
      clearSession();
      window.location.href = loginPath();
      return null;
    }
    touchSession();
    return s;
  }

  function canAccess(menuId) {
    const s = getSession(); if (!s) return false;
    if (s.perfil === 5) return true;
    return (getPerms()[menuId] || []).includes(s.perfil);
  }

  function getMenusForUser() {
    const s = getSession(); if (!s) return [];
    if (s.perfil === 5) return MENUS_DEFAULT;
    const perms = getPerms();
    return MENUS_DEFAULT.filter(m => (perms[m.id] || []).includes(s.perfil));
  }

  function renderSidebar(activeId) {
    const s  = getSession();
    if (!s) return;
    const sb = document.querySelector('.sb');
    if (!sb) return;

    const sections = {};
    getMenusForUser().forEach(m => {
      if (!sections[m.section]) sections[m.section] = [];
      sections[m.section].push(m);
    });

    let html = `
      <div class="sb-logo">
        <img src="../assets/logo.png" alt="Sambaíba">
        <div class="sb-brand"><b>Sambaíba</b><small>Portal Operacional</small></div>
      </div>`;

    Object.entries(sections).forEach(([sec, items]) => {
      html += `<div class="sb-sec">${sec}</div>`;
      items.forEach(m => {
        const on = m.id === activeId ? ' on' : '';
        html += `<a class="sb-item${on}" href="${m.href}" data-menu="${m.id}">
          <span class="ico">${m.ico}</span>
          <span class="sb-txt">${m.label}</span>
        </a>`;
      });
    });

    html += `
      <div class="sb-foot">
        <div class="sb-user">
          <div class="sb-av">${s.login[0].toUpperCase()}</div>
          <div class="sb-utxt">
            <b>${s.login}</b>
            <small>${PERFIS[s.perfil] || 'Usuário'}</small>
          </div>
        </div>
        <button class="btn-sair-sb" onclick="AUTH.logout()">Sair</button>
      </div>`;

    sb.innerHTML = html;
  }

  function _addLog(login, perfil) {
    const logs = JSON.parse(localStorage.getItem(STORAGE_LOG) || '[]');
    logs.unshift({ login, perfil, ts: new Date().toLocaleString('pt-BR'), ua: navigator.userAgent.slice(0,80) });
    localStorage.setItem(STORAGE_LOG, JSON.stringify(logs.slice(0, 200)));
  }
  function getLogs() { return JSON.parse(localStorage.getItem(STORAGE_LOG) || '[]'); }

  const _isAuthPage = () => {
    const p = window.location.pathname;
    return p.endsWith('login.html') || p.endsWith('index.html') || p === '/' || p === '';
  };

  let _redirecting = false;

  if (!_isAuthPage()) {
    setInterval(() => {
      if (_redirecting || _isAuthPage()) return;
      if (isExpired()) {
        _redirecting = true;
        clearSession();
        const el = document.createElement('div');
        el.style.cssText = `position:fixed;inset:0;background:rgba(7,22,45,.95);z-index:99999;
          display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;
          font-family:"Segoe UI",sans-serif;`;
        el.innerHTML = `
          <div style="font-size:36px">⏰</div>
          <div style="font-size:17px;font-weight:900;color:#f6a623">Sessão expirada</div>
          <div style="font-size:12px;color:#7a9cc8">Redirecionando para o login em instantes...</div>
          <div style="width:180px;height:3px;background:#1f3860;border-radius:2px;overflow:hidden;margin-top:4px">
            <div style="height:100%;background:#3d7ef5;animation:sbprog 1.5s linear forwards"></div>
          </div>`;
        const style = document.createElement('style');
        style.textContent = '@keyframes sbprog{from{width:0}to{width:100%}}';
        document.head.appendChild(style);
        document.body.appendChild(el);
        setTimeout(() => { window.location.href = loginPath(); }, 1600);
      }
    }, 30_000);

    ['mousemove','keydown','click','touchstart','scroll'].forEach(ev =>
      document.addEventListener(ev, touchSession, { passive:true })
    );
  }

  return {
    init, login, logout, requireAuth, canAccess,
    getMenusForUser, getUsers, saveUsers, getPerms, savePerms,
    renderSidebar, getLogs, getSession, MENUS_DEFAULT, PERFIS
  };
})();

AUTH.init();

/**
 * auth-guard.js v3
 * Incluir em TODAS as páginas protegidas (após auth.js).
 */
(function() {
  document.addEventListener('DOMContentLoaded', () => {
    const s = AUTH.requireAuth();
    if (!s) return;

    const page  = window.location.pathname.split('/').pop().replace('.html', '');
    const idMap = {
      'horas':              'horas',
      'viagens':            'viagens_nimer',
      'viagens_sim':        'viagens_sim',
      'pontualidade_sim':   'pontualidade',
      'em_desenvolvimento': null,
      'simulador_recarga':  'recarga',
      'vr':                 'vr',
      'usuarios':           'usuarios',
      'permissoes':         'permissoes',
    };
    const menuId = idMap.hasOwnProperty(page) ? idMap[page] : null;

    if (menuId && !AUTH.canAccess(menuId)) {
      const primeiraPermitida = AUTH.getMenusForUser()
        .find(m => m.href && m.href !== '#')?.href || 'horas.html';

      document.body.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100vh;
                    background:#07162d;flex-direction:column;gap:16px;text-align:center;
                    font-family:'Segoe UI',sans-serif;">
          <div style="font-size:48px">🔒</div>
          <div style="font-size:20px;font-weight:900;color:#f65858">Acesso Negado</div>
          <div style="font-size:13px;color:#7a9cc8;max-width:320px;line-height:1.6">
            Seu perfil <b style="color:#eaf2ff">(${AUTH.PERFIS[s.perfil]})</b>
            não tem permissão para acessar esta página.
          </div>
          <div style="display:flex;gap:10px;margin-top:8px">
            <a href="${primeiraPermitida}"
               style="height:36px;padding:0 20px;background:#3d7ef5;color:#fff;
                      border-radius:7px;display:inline-flex;align-items:center;
                      font-weight:800;font-size:12px;text-decoration:none;">
              ← Ir para o início
            </a>
            <button onclick="AUTH.logout()"
               style="height:36px;padding:0 16px;background:rgba(246,88,88,.12);
                      color:#f65858;border:1px solid rgba(246,88,88,.3);
                      border-radius:7px;font-size:12px;font-weight:700;cursor:pointer">
              Sair
            </button>
          </div>
        </div>`;
      return;
    }

    AUTH.renderSidebar(menuId || '');

    document.querySelectorAll('.btn-sair').forEach(btn =>
      btn.addEventListener('click', () => AUTH.logout())
    );
  });
})();

/* ── Toggle de Tema (Claro/Escuro) ── */
(function() {
  const saved = localStorage.getItem('sb_theme');
  // Tema claro é o padrão — só aplica escuro se explicitamente salvo
  if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

  document.addEventListener('DOMContentLoaded', function() {
    const toggle = document.getElementById('themeToggle');
    const label = document.getElementById('themeLabel');
    if (!toggle || !label) return;

    if (saved === 'dark') label.textContent = 'Acender luz';
    else label.textContent = 'Apagar luz';

    toggle.addEventListener('click', function() {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        label.textContent = 'Apagar luz';
        localStorage.setItem('sb_theme', 'light');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        label.textContent = 'Acender luz';
        localStorage.setItem('sb_theme', 'dark');
      }
    });
  });
})();

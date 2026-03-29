/* ── Toggle de Tema (Claro/Escuro) ── */
(function() {
  const saved = localStorage.getItem('sb_theme');
  if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');

  document.addEventListener('DOMContentLoaded', function() {
    const toggle = document.getElementById('themeToggle');
    const label = document.getElementById('themeLabel');
    if (!toggle || !label) return;

    if (saved === 'light') label.textContent = 'Apagar luz';

    toggle.addEventListener('click', function() {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      if (isLight) {
        document.documentElement.removeAttribute('data-theme');
        label.textContent = 'Acender luz';
        localStorage.setItem('sb_theme', 'dark');
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        label.textContent = 'Apagar luz';
        localStorage.setItem('sb_theme', 'light');
      }
    });
  });
})();

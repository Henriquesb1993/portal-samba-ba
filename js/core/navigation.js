document.addEventListener("DOMContentLoaded", () => {
  const currentPage = window.location.pathname.split("/").pop();

  const links = document.querySelectorAll("[data-page]");
  links.forEach((link) => {
    if (link.getAttribute("data-page") === currentPage) {
      link.classList.add("on");
    }
  });
});

function abrirModal(titulo) {
  const modTit = document.getElementById("modTit");
  const modal = document.getElementById("modal");

  if (modTit) modTit.textContent = titulo;
  if (modal) modal.style.display = "flex";
}

function fecharModal() {
  const modal = document.getElementById("modal");
  if (modal) modal.style.display = "none";
}


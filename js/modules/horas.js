/* ─────────────────────────────────────────
   MÓDULO HORAS — Portal Sambaíba
   Inclui: dados locais + painel de API
───────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", async () => {
  iniciarPainelAPI();

  try {
    const data = await carregarDadosHoras();
    preencherKpis(data.kpis);
    preencherTabelaColaboradores(data.colaboradores);
    preencherTabelaLinhas(data.linhasDetalhadas);
    preencherHeatmap(data.heatmap);
    iniciarGraficos(data.graficos);
    addLog("lok", "Dados locais carregados com sucesso.");
  } catch (err) {
    addLog("lerro", "Erro ao carregar dados locais: " + err.message);
  }
});

/* ── DADOS LOCAIS ── */
async function carregarDadosHoras() {
  const response = await fetch("../data/horas.json");
  if (!response.ok) throw new Error("Falha ao carregar horas.json — HTTP " + response.status);
  return await response.json();
}

/* ── LOG ── */
function addLog(cls, msg) {
  const box = document.getElementById("logBox");
  if (!box) return;
  const sp = document.createElement("span");
  sp.className = cls;
  const d = new Date();
  sp.textContent = "[" + d.toLocaleTimeString("pt-BR") + "] " + msg;
  box.appendChild(sp);
  box.scrollTop = box.scrollHeight;
}

/* ── PAINEL DE API ── */
function iniciarPainelAPI() {

  const btnEye      = document.getElementById("btnEye");
  const apiUrlInput = document.getElementById("apiUrlInput");
  const btnConectar = document.getElementById("btnConectar");
  const btnLimpar   = document.getElementById("btnLimpar");
  const btnTogLog   = document.getElementById("btnTogLog");
  const apiStatus   = document.getElementById("apiStatus");
  const logBox      = document.getElementById("logBox");

  /* ── OLHO: mostrar/ocultar URL ── */
  let urlVisivel = false;
  btnEye.addEventListener("click", () => {
    urlVisivel = !urlVisivel;
    apiUrlInput.type = urlVisivel ? "text" : "password";
    btnEye.textContent = urlVisivel ? "🙈" : "👁";
    btnEye.title = urlVisivel ? "Ocultar URL" : "Mostrar URL";
  });

  /* ── TOGGLE LOG ── */
  let logVisivel = true;
  btnTogLog.addEventListener("click", () => {
    logVisivel = !logVisivel;
    logBox.style.display = logVisivel ? "block" : "none";
    btnTogLog.textContent = logVisivel ? "👁 Ocultar Log" : "👁 Exibir Log";
  });

  /* ── LIMPAR LOG ── */
  btnLimpar.addEventListener("click", () => {
    logBox.innerHTML = '<span class="linfo">Log limpo.</span>';
  });

  /* ── CONECTAR API ── */
  btnConectar.addEventListener("click", async () => {
    const url = apiUrlInput.value.trim();

    if (!url) {
      addLog("lwarn", "Informe a URL da API antes de conectar.");
      apiStatus.textContent = "⚠ URL não informada.";
      return;
    }

    addLog("linfo", "Iniciando conexão com a API...");
    addLog("linfo", "URL: " + (urlVisivel ? url : url.substring(0, 30) + "..."));
    apiStatus.textContent = "Conectando...";
    btnConectar.textContent = "⏳ Conectando...";
    btnConectar.disabled = true;

    const t0 = performance.now();

    try {
      const response = await fetch(url, { mode: "cors" });
      const ms = Math.round(performance.now() - t0);

      if (!response.ok) {
        throw new Error("HTTP " + response.status + " — " + response.statusText);
      }

      const data = await response.json();

      const total =
        Array.isArray(data)
          ? data.length
          : data.total ?? data.count ?? data.registros ?? "N/A";

      addLog("lok", "✔ Conectado em " + ms + "ms.");
      addLog("lok", "✔ Registros recebidos: " + total);

      apiStatus.textContent = "✔ Conectado — " + ms + "ms — " + total + " registros";
      btnConectar.textContent = "✔ Conectado";
      btnConectar.classList.add("conectado");

    } catch (err) {
      const ms = Math.round(performance.now() - t0);
      addLog("lerro", "✖ Falha na conexão após " + ms + "ms.");
      addLog("lerro", "✖ Erro: " + err.message);
      addLog("lwarn", "Verifique a URL, CORS ou disponibilidade da API.");

      apiStatus.textContent = "✖ Falha na conexão — " + err.message;
      btnConectar.textContent = "▶ Tentar novamente";
      btnConectar.classList.remove("conectado");

    } finally {
      btnConectar.disabled = false;
    }
  });
}

/* ── KPIs ── */
function preencherKpis(kpis) {
  document.getElementById("kpiHorasProg").textContent  = kpis.horasProg;
  document.getElementById("kpiHorasReal").textContent  = kpis.horasReal;
  document.getElementById("kpiRealizacao").textContent = kpis.realizacao;
  document.getElementById("kpiDesvio").textContent     = kpis.desvio;
  document.getElementById("kpiHoraExtra").textContent  = kpis.horaExtra;
  document.getElementById("kpiHnr").textContent        = kpis.hnr;
}

/* ── TABELA COLABORADORES ── */
function preencherTabelaColaboradores(colaboradores) {
  const tbody = document.getElementById("tbColab");
  if (!tbody) return;
  tbody.innerHTML = colaboradores.map((item) => `
    <tr>
      <td>${item.data}</td>
      <td><b>${item.re}</b></td>
      <td>${item.heDia}</td>
      <td class="clr-o">${item.totalPeriodo}</td>
      <td>${item.qtdDobra}</td>
      <td><button class="btn-ver" onclick="abrirModal('RE ${item.re}')">Ver</button></td>
    </tr>
  `).join("");
}

/* ── TABELA LINHAS ── */
function preencherTabelaLinhas(linhas) {
  const tbody = document.getElementById("tbLinhas");
  if (!tbody) return;
  tbody.innerHTML = linhas.map((item) => `
    <tr>
      <td>${item.estrela}</td>
      <td><b>${item.linha}</b></td>
      <td>${item.garagem}</td>
      <td>${item.lote}</td>
      <td>${item.ttProg}</td>
      <td>${item.ttReal}</td>
      <td class="${item.percClass}">${item.percReal}</td>
      <td>${item.norProg}</td>
      <td>${item.norReal}</td>
      <td class="${item.difClass}">${item.dif}</td>
      <td>${item.heProg}</td>
      <td>${item.heReal}</td>
      <td>${item.hle}</td>
      <td>${item.dobra}</td>
      <td><button class="btn-ver" onclick="abrirModal('${item.linha}')">Ver</button></td>
    </tr>
  `).join("");
}

/* ── HEATMAP ── */
function preencherHeatmap(heatmap) {
  const tbody = document.getElementById("tbHeatmap");
  if (!tbody) return;
  tbody.innerHTML = heatmap.map((linha) => `
    <tr>
      <td class="rh"><b>${linha.linha}</b></td>
      <td class="roh">${linha.op}</td>
      ${linha.dias.map((dia) => `<td class="${dia.classe}">${dia.valor}</td>`).join("")}
      <td class="tot">${linha.total}</td>
    </tr>
  `).join("");
}

/* ── GRÁFICOS ── */
function iniciarGraficos(graficos) {
  const co = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: "#c8dcff", font: { size: 10 } } }
    },
    scales: {
      x: { ticks: { color: "#7a9cc8", font: { size: 9 } }, grid: { color: "rgba(31,56,96,.3)" } },
      y: { ticks: { color: "#7a9cc8", font: { size: 9 } }, grid: { color: "rgba(31,56,96,.3)" } }
    }
  };

  new Chart(document.getElementById("cBar"), {
    type: "bar",
    data: {
      labels: graficos.programadoRealizado.labels,
      datasets: [
        { label: "Programado", data: graficos.programadoRealizado.programado, backgroundColor: "#3d7ef5", borderRadius: 3 },
        { label: "Realizado",  data: graficos.programadoRealizado.realizado,  backgroundColor: "#19d46e", borderRadius: 3 }
      ]
    },
    options: co
  });

  new Chart(document.getElementById("cDonut"), {
    type: "doughnut",
    data: {
      labels: graficos.garagens.labels,
      datasets: [{ data: graficos.garagens.valores, backgroundColor: ["#3d7ef5","#19d46e","#f6a623"], borderWidth: 0 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { color: "#c8dcff", font: { size: 10 } } } }
    }
  });

  new Chart(document.getElementById("cDia"), {
    type: "bar",
    data: {
      labels: graficos.hePorDia.labels,
      datasets: [{ label: "HE", data: graficos.hePorDia.valores, backgroundColor: "#3d7ef5", borderRadius: 2 }]
    },
    options: { ...co, plugins: { legend: { display: false } } }
  });

  new Chart(document.getElementById("cMes"), {
    type: "bar",
    data: {
      labels: graficos.hePorMes.labels,
      datasets: [{ label: "HE", data: graficos.hePorMes.valores, backgroundColor: ["#3d7ef5","#4b8cff","#3d7ef5","#4b8cff","#3d7ef5","#f6a623","#f59e0b","#19d46e"], borderRadius: 3 }]
    },
    options: { ...co, plugins: { legend: { display: false } } }
  });

  new Chart(document.getElementById("cRank"), {
    type: "bar",
    data: {
      labels: graficos.ranking.labels,
      datasets: [{ label: "HE", data: graficos.ranking.valores, backgroundColor: ["#6aaeff","#3d7ef5","#7bc8ff","#f6a623","#f59e0b","#fbbf24"], borderRadius: 3 }]
    },
    options: { ...co, plugins: { legend: { display: false } } }
  });

  const evoData = graficos.evolucao;
  let evoChart = null;

  function buildEvo(nivel) {
    const d = evoData[nivel];
    document.getElementById("evoCrumb").textContent = d.crumb;
    if (evoChart) evoChart.destroy();
    evoChart = new Chart(document.getElementById("cEvo"), {
      type: "line",
      data: {
        labels: d.labels,
        datasets: [
          { label: "HE Realizada",  data: d.real, borderColor: "#9bc2ff", backgroundColor: "rgba(155,194,255,.12)", fill: true,  tension: 0.4, pointRadius: 4, borderWidth: 2 },
          { label: "HE Programada", data: d.prog, borderColor: "#f6a623", borderDash: [8,4],                        fill: false, tension: 0.3, pointRadius: 3, borderWidth: 2 }
        ]
      },
      options: co
    });
  }

  window.setEvo = function (nivel, btn) {
    document.querySelectorAll(".evo-btn").forEach((b) => b.classList.remove("on"));
    btn.classList.add("on");
    buildEvo(nivel);
  };

  buildEvo("dia");
}

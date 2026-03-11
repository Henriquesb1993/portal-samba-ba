document.addEventListener("DOMContentLoaded", async () => {

  iniciarPainelAPI();

  // Carrega os dados "fake" iniciais apenas para a tela não ficar vazia até conectar
  try {
    const data = await carregarDadosFake();
    preencherKpis(data.kpis);
    preencherTabelaColaboradores(data.colaboradores);
    preencherTabelaLinhas(data.linhasDetalhadas);
    preencherHeatmap(data.heatmap);
    iniciarGraficos(data.graficos);
  } catch (err) {
    console.log("Mock inicial não carregado", err);
  }

});

/* ── MOCK INICIAL (FALLBACK) ── */
async function carregarDadosFake() {
  const response = await fetch("../data/horas.json");
  return await response.json();
}

/* ── LOG ── */
function addLog(cls, msg) {
  const box = document.getElementById("logBox");
  if (!box) return;
  const sp = document.createElement("span");
  sp.className = cls;
  const hora = new Date().toLocaleTimeString("pt-BR");
  sp.textContent = "[" + hora + "] " + msg;
  box.appendChild(sp);
  box.scrollTop = box.scrollHeight;
}

/* ── PAINEL DE API E LÓGICA DE CHAMADA ── */
function iniciarPainelAPI() {

  const btnConectar = document.getElementById("btnConectar");
  const btnLimpar   = document.getElementById("btnLimpar");
  const btnTogLog   = document.getElementById("btnTogLog");
  const apiStatus   = document.getElementById("apiStatus");
  const logBox      = document.getElementById("logBox");

  const inputsDatas = document.querySelectorAll('.filters input[type="date"]');
  const inputDataFiltro = inputsDatas[0]; // Pega o primeiro calendário (Data Início)

  /* Oculta o campo de digitar URL antigo, pois agora a URL é fixa via código */
  const apiRow = document.querySelector('.api-url-row');
  if(apiRow) apiRow.style.display = 'none';

  /* TOGGLE LOG */
  let logVisivel = true;
  btnTogLog.addEventListener("click", () => {
    logVisivel = !logVisivel;
    logBox.style.display  = logVisivel ? "block" : "none";
    btnTogLog.textContent = logVisivel ? "👁 Ocultar Log" : "👁 Exibir Log";
  });

  /* LIMPAR LOG */
  btnLimpar.addEventListener("click", () => {
    logBox.innerHTML = '<span class="linfo">Log limpo.</span>';
  });

  /* 🔴 CONECTAR E CARREGAR API COM DATAS DINÂMICAS 🔴 */
  btnConectar.addEventListener("click", async () => {

    const dataCalendario = inputDataFiltro ? inputDataFiltro.value : "2026-03-03";
    const dataHojeFormatada = new Date().toISOString().split("T")[0]; // Ex: 2026-03-11
    const dataInicioAnual = "2026-01-01";

    const baseUrl = "https://dashboardipp.sambaibasp.cloud/data/viagens";

    // 1. API para Visão Diária (Usa o calendário)
    const urlVisaoDiaria = `${baseUrl}?date=${dataCalendario}&keep_audit=true`;

    // 2. API para Visão Histórica (Mês e Evolução) -> Idealmente passando range de data
    const urlVisaoHistorica = `${baseUrl}?start_date=${dataInicioAnual}&end_date=${dataHojeFormatada}&keep_audit=true`;

    addLog("linfo", "Iniciando integração Sambaíba API...");
    addLog("linfo", "Buscando dados diários: " + dataCalendario);
    addLog("linfo", `Buscando histórico evo: ${dataInicioAnual} até ${dataHojeFormatada}`);

    apiStatus.textContent   = "Conectando ao banco de dados...";
    btnConectar.textContent = "⏳ Baixando...";
    btnConectar.disabled    = true;
    btnConectar.classList.remove("conectado");

    const t0 = performance.now();

    try {
      
      // Manda fazer as duas pesquisas ao mesmo tempo em paralelo (muito mais rápido)
      const reqDiaria = fetch(urlVisaoDiaria, { mode: "cors" });
      const reqHistorica = fetch(urlVisaoHistorica, { mode: "cors" });

      const [resDiaria, resHistorica] = await Promise.all([reqDiaria, reqHistorica]);

      if (!resDiaria.ok) throw new Error("Erro na API Diária: " + resDiaria.status);
      if (!resHistorica.ok) throw new Error("Erro na API Histórica: " + resHistorica.status);

      const dadosDiarios = await resDiaria.json();
      const dadosHistoricos = await resHistorica.json();

      const ms = Math.round(performance.now() - t0);

      const regDia = Array.isArray(dadosDiarios) ? dadosDiarios.length : (dadosDiarios.total ?? 0);
      const regHist = Array.isArray(dadosHistoricos) ? dadosHistoricos.length : (dadosHistoricos.total ?? 0);

      addLog("lok", `✔ API conectada em ${ms}ms.`);
      addLog("lok", `✔ Diário: ${regDia} res | Histórico: ${regHist} res.`);

      apiStatus.textContent   = `✔ Atualizado — Diário: ${regDia} | Histórico: ${regHist}`;
      btnConectar.textContent = "✔ Dados Atualizados";
      btnConectar.classList.add("conectado");

      /* 
         IMPORTANTE:
         Aqui os dados chegaram com sucesso. 
         Agora precisaremos processar (mapear) esses 'dadosDiarios' e 'dadosHistoricos'
         para injetar nas funções de tabelas e gráficos abaixo.
      */

    } catch (err) {
      const ms = Math.round(performance.now() - t0);
      addLog("lerro", "✖ Falha de conexão na VPS após " + ms + "ms.");
      addLog("lerro", "✖ Erro: " + err.message);

      apiStatus.textContent   = "✖ Falha — " + err.message;
      btnConectar.textContent = "▶ Tentar novamente";
    } finally {
      btnConectar.disabled = false;
    }

  });
}

/* ── KPIs ── */
function preencherKpis(kpis) {
  if(!kpis) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("kpiHorasProg",  kpis.horasProg);
  set("kpiHorasReal",  kpis.horasReal);
  set("kpiRealizacao", kpis.realizacao);
  set("kpiDesvio",     kpis.desvio);
  set("kpiHoraExtra",  kpis.horaExtra);
  set("kpiHnr",        kpis.hnr);
}

/* ── TABELA COLABORADORES ── */
function preencherTabelaColaboradores(colaboradores) {
  const tbody = document.getElementById("tbColab");
  if (!tbody || !colaboradores) return;
  tbody.innerHTML = colaboradores.map(item => `
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
  if (!tbody || !linhas) return;
  tbody.innerHTML = linhas.map(item => `
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
  if (!tbody || !heatmap) return;
  tbody.innerHTML = heatmap.map(linha => `
    <tr>
      <td class="rh"><b>${linha.linha}</b></td>
      <td class="roh">${linha.op}</td>
      ${linha.dias.map(dia => `<td class="${dia.classe}">${dia.valor}</td>`).join("")}
      <td class="tot">${linha.total}</td>
    </tr>
  `).join("");
}

/* ── GRÁFICOS ── */
function iniciarGraficos(graficos) {
  if(!graficos) return;

  const co = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: "#c8dcff", font: { size: 10 } } } },
    scales: {
      x: { ticks: { color: "#7a9cc8", font: { size: 9 } }, grid: { color: "rgba(31,56,96,.3)" } },
      y: { ticks: { color: "#7a9cc8", font: { size: 9 } }, grid: { color: "rgba(31,56,96,.3)" } }
    }
  };

  if(document.getElementById("cBar")) {
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
  }

  if(document.getElementById("cDonut")) {
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
  }

  if(document.getElementById("cDia")) {
    new Chart(document.getElementById("cDia"), {
      type: "bar",
      data: {
        labels: graficos.hePorDia.labels,
        datasets: [{ label: "HE", data: graficos.hePorDia.valores, backgroundColor: "#3d7ef5", borderRadius: 2 }]
      },
      options: { ...co, plugins: { legend: { display: false } } }
    });
  }

  if(document.getElementById("cMes")) {
    new Chart(document.getElementById("cMes"), {
      type: "bar",
      data: {
        labels: graficos.hePorMes.labels,
        datasets: [{ label: "HE", data: graficos.hePorMes.valores,
          backgroundColor: ["#3d7ef5","#4b8cff","#3d7ef5","#4b8cff","#3d7ef5","#f6a623","#f59e0b","#19d46e"],
          borderRadius: 3 }]
      },
      options: { ...co, plugins: { legend: { display: false } } }
    });
  }

  if(document.getElementById("cRank")) {
    new Chart(document.getElementById("cRank"), {
      type: "bar",
      data: {
        labels: graficos.ranking.labels,
        datasets: [{ label: "HE", data: graficos.ranking.valores,
          backgroundColor: ["#6aaeff","#3d7ef5","#7bc8ff","#f6a623","#f59e0b","#fbbf24"],
          borderRadius: 3 }]
      },
      options: { ...co, plugins: { legend: { display: false } } }
    });
  }

  /* EVOLUÇÃO */
  const evoData = graficos.evolucao;
  let evoChart  = null;

  function buildEvo(nivel) {
    const d = evoData[nivel];
    if(!d) return;
    document.getElementById("evoCrumb").textContent = d.crumb;
    if (evoChart) evoChart.destroy();
    
    if(document.getElementById("cEvo")) {
      evoChart = new Chart(document.getElementById("cEvo"), {
        type: "line",
        data: {
          labels: d.labels,
          datasets: [
            { label: "HE Realizada",  data: d.real, borderColor: "#9bc2ff", backgroundColor: "rgba(155,194,255,.12)", fill: true,  tension: 0.4, pointRadius: 4, borderWidth: 2 },
            { label: "HE Programada", data: d.prog, borderColor: "#f6a623", borderDash: [8,4], fill: false, tension: 0.3, pointRadius: 3, borderWidth: 2 }
          ]
        },
        options: co
      });
    }
  }

  window.setEvo = function(nivel, btn) {
    document.querySelectorAll(".evo-btn").forEach(b => b.classList.remove("on"));
    btn.classList.add("on");
    buildEvo(nivel);
  };

  buildEvo("dia");
}

/* ── MODAL ── */
function abrirModal(titulo) {
  const el = document.getElementById("modTit");
  const modal = document.getElementById("modal");
  if (el) el.textContent = titulo;
  if (modal) modal.style.display = "flex";
}

function fecharModal() {
  const modal = document.getElementById("modal");
  if (modal) modal.style.display = "none";
}

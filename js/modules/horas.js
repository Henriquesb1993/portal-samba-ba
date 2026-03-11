document.addEventListener("DOMContentLoaded", async () => {
  const data = await carregarDadosHoras();
  preencherKpis(data.kpis);
  preencherTabelaColaboradores(data.colaboradores);
  preencherTabelaLinhas(data.linhasDetalhadas);
  preencherHeatmap(data.heatmap);
  iniciarGraficos(data.graficos);
});

async function carregarDadosHoras() {
  const response = await fetch("../data/horas.json");
  if (!response.ok) {
    throw new Error("Falha ao carregar horas.json");
  }
  return await response.json();
}

function preencherKpis(kpis) {
  document.getElementById("kpiHorasProg").textContent = kpis.horasProg;
  document.getElementById("kpiHorasReal").textContent = kpis.horasReal;
  document.getElementById("kpiRealizacao").textContent = kpis.realizacao;
  document.getElementById("kpiDesvio").textContent = kpis.desvio;
  document.getElementById("kpiHoraExtra").textContent = kpis.horaExtra;
  document.getElementById("kpiHnr").textContent = kpis.hnr;
}

function preencherTabelaColaboradores(colaboradores) {
  const tbody = document.getElementById("tbColab");
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

function preencherTabelaLinhas(linhas) {
  const tbody = document.getElementById("tbLinhas");
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

function preencherHeatmap(heatmap) {
  const tbody = document.getElementById("tbHeatmap");
  tbody.innerHTML = heatmap.map((linha) => `
    <tr>
      <td class="rh"><b>${linha.linha}</b></td>
      <td class="roh">${linha.op}</td>
      ${linha.dias.map((dia) => `<td class="${dia.classe}">${dia.valor}</td>`).join("")}
      <td class="tot">${linha.total}</td>
    </tr>
  `).join("");
}

function iniciarGraficos(graficos) {
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: "#c8dcff",
          font: { size: 10 }
        }
      }
    },
    scales: {
      x: {
        ticks: { color: "#7a9cc8", font: { size: 9 } },
        grid: { color: "rgba(31,56,96,.3)" }
      },
      y: {
        ticks: { color: "#7a9cc8", font: { size: 9 } },
        grid: { color: "rgba(31,56,96,.3)" }
      }
    }
  };

  new Chart(document.getElementById("cBar"), {
    type: "bar",
    data: {
      labels: graficos.programadoRealizado.labels,
      datasets: [
        {
          label: "Programado",
          data: graficos.programadoRealizado.programado,
          backgroundColor: "#3d7ef5",
          borderRadius: 3
        },
        {
          label: "Realizado",
          data: graficos.programadoRealizado.realizado,
          backgroundColor: "#19d46e",
          borderRadius: 3
        }
      ]
    },
    options: commonOptions
  });

  new Chart(document.getElementById("cDonut"), {
    type: "doughnut",
    data: {
      labels: graficos.garagens.labels,
      datasets: [{
        data: graficos.garagens.valores,
        backgroundColor: ["#3d7ef5", "#19d46e", "#f6a623"],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#c8dcff",
            font: { size: 10 }
          }
        }
      }
    }
  });

  new Chart(document.getElementById("cDia"), {
    type: "bar",
    data: {
      labels: graficos.hePorDia.labels,
      datasets: [{
        label: "HE",
        data: graficos.hePorDia.valores,
        backgroundColor: "#3d7ef5",
        borderRadius: 2
      }]
    },
    options: {
      ...commonOptions,
      plugins: { legend: { display: false } }
    }
  });

  new Chart(document.getElementById("cMes"), {
    type: "bar",
    data: {
      labels: graficos.hePorMes.labels,
      datasets: [{
        label: "HE",
        data: graficos.hePorMes.valores,
        backgroundColor: ["#3d7ef5", "#4b8cff", "#3d7ef5", "#4b8cff", "#3d7ef5", "#f6a623", "#f59e0b", "#19d46e"],
        borderRadius: 3
      }]
    },
    options: {
      ...commonOptions,
      plugins: { legend: { display: false } }
    }
  });

  new Chart(document.getElementById("cRank"), {
    type: "bar",
    data: {
      labels: graficos.ranking.labels,
      datasets: [{
        label: "HE",
        data: graficos.ranking.valores,
        backgroundColor: ["#6aaeff", "#3d7ef5", "#7bc8ff", "#f6a623", "#f59e0b", "#fbbf24"],
        borderRadius: 3
      }]
    },
    options: {
      ...commonOptions,
      plugins: { legend: { display: false } }
    }
  });

  const evoData = graficos.evolucao;
  let evoChart = null;

  function buildEvo(nivel) {
    const d = evoData[nivel];
    document.getElementById("evoCrumb").textContent = d.crumb;

    if (evoChart) {
      evoChart.destroy();
    }

    evoChart = new Chart(document.getElementById("cEvo"), {
      type: "line",
      data: {
        labels: d.labels,
        datasets: [
          {
            label: "HE Realizada",
            data: d.real,
            borderColor: "#9bc2ff",
            backgroundColor: "rgba(155,194,255,.12)",
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            borderWidth: 2
          },
          {
            label: "HE Programada",
            data: d.prog,
            borderColor: "#f6a623",
            borderDash: [8, 4],
            fill: false,
            tension: 0.3,
            pointRadius: 3,
            borderWidth: 2
          }
        ]
      },
      options: commonOptions
    });
  }

  window.setEvo = function (nivel, btn) {
    document.querySelectorAll(".evo-btn").forEach((b) => b.classList.remove("on"));
    btn.classList.add("on");
    buildEvo(nivel);
  };

  buildEvo("dia");
}


const PaginaHoras = {

  rendered: false,
  charts: {},

  // ==========================================
  // DADOS MOCK — substitui API real por enquanto
  // ==========================================
  dados: {
    kpis: {
      prog:   "9.865h",
      real:   "10.360h",
      pct:    "105%",
      desvio: "950h",
      he:     "+495h",
      hnr:    "89h"
    },
    linhas: [
      { id:"8012-10", gar:"Garagem A", lote:"Lote 1", ttp:"950m",  ttr:"19h50m", pct:"108.3%", norp:"1140m", norr:"1843m", dif:"+0h3m", hep:"090h", her:"8929h", hle:"Vpr", dobra:29 },
      { id:"8021-10", gar:"Garagem B", lote:"Lote 2", ttp:"773m",  ttr:"14h55m", pct:"97.3%",  norp:"976m",  norr:"1442m", dif:"-0h0m", hep:"090h", her:"6553h", hle:"Vji", dobra:29 },
      { id:"8022-10", gar:"Garagem C", lote:"Lote 3", ttp:"773m",  ttr:"14h55m", pct:"98.0%",  norp:"620m",  norr:"1430m", dif:"-0h3m", hep:"006h", her:"6944h", hle:"Vje", dobra:21 },
      { id:"8026-10", gar:"Garagem B", lote:"Lote 4", ttp:"773m",  ttr:"14h50m", pct:"97.3%",  norp:"978m",  norr:"1400m", dif:"-0h0m", hep:"006h", her:"6519h", hle:"Ner", dobra:22 },
      { id:"8050-10", gar:"Garagem B", lote:"Lote 3", ttp:"820m",  ttr:"16h00m", pct:"110.0%", norp:"700m",  norr:"1500m", dif:"+1h0m", hep:"010h", her:"7100h", hle:"Vop", dobra:15 }
    ],
    heatmap: {
      headers: ["Linha","OP","04","05","06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","Total"],
      rows: [
        { linha:"8013-10", op:"1+2", vals:[6,6,6,5,5,5,10,6,6,6,8,8,8,8,6,8,6,60,5,6], tot:"359h" },
        { linha:"8021-10", op:"83h", vals:[6,4,4,8,5,0,4,4,6,6,6,6,6,6,6,6,6,6,6,6],  tot:"274h" },
        { linha:"8023-10", op:"33h", vals:[0,8,8,8,4,4,13,4,4,4,8,4,0,8,8,8,4,4,4,4], tot:"131h" },
        { linha:"8050-10", op:"+42", vals:[0,7,7,7,7,6,1,1,7,6,7,1,7,6,6,1,7,6,6,1],  tot:"108h" }
      ]
    }
  },

  // ==========================================
  // RENDER PRINCIPAL
  // ==========================================
  render() {
    this.rendered = false;
    this.charts = {};
    document.getElementById("app").innerHTML = this.template();
    this.injetarKPIs();
    this.injetarTabela();
    this.injetarHeatmap();
    setTimeout(() => { this.montarGraficos(); }, 150);
  },

  // ==========================================
  // TEMPLATE HTML DA PÁGINA
  // ==========================================
  template() {
    return `
    <div class="topbar">
      <h1>CUMPRIMENTO DE HORAS — OPERAÇÃO <span>(Horas Programadas vs Realizadas)</span></h1>
      <div class="top-btns">
        <div class="badge-live">● AO VIVO</div>
        <button class="btn-excel" onclick="PaginaHoras.exportarExcel()">Exportar Excel</button>
        <button class="btn-sair" onclick="Auth.logout()">Sair</button>
      </div>
    </div>

    <div class="filters">
      <div class="fld"><label>Data Início</label><input type="date" id="f-dtini" value="2026-03-03"></div>
      <div class="sep">até</div>
      <div class="fld"><label>Data Fim</label><input type="date" id="f-dtfim" value="2026-03-03"></div>
      <div class="fld"><label>Garagem</label>
        <select id="f-gar"><option>Todas</option><option>Garagem A</option><option>Garagem B</option><option>Garagem C</option></select>
      </div>
      <div class="fld"><label>Lote</label>
        <select id="f-lote"><option>Todos</option><option>Lote 1</option><option>Lote 2</option><option>Lote 3</option><option>Lote 4</option></select>
      </div>
      <div class="fld"><label>Linha</label>
        <select id="f-linha"><option>Todas</option></select>
      </div>
      <div class="fld"><label>Função</label>
        <select id="f-funcao"><option>Todas</option><option>Motorista</option><option>Cobrador</option></select>
      </div>
      <button class="btn-consultar" onclick="PaginaHoras.recarregar()">Consultar</button>
    </div>

    <div class="page-content">

      <div class="kpis">
        <div class="kpi bl"><div class="kpi-lbl">TT Horas Prog.</div><div class="kpi-val" id="kpi-prog">—</div><div class="kpi-sub">Horas programadas</div></div>
        <div class="kpi gr"><div class="kpi-lbl">TT Horas Real.</div><div class="kpi-val clr-g" id="kpi-real">—</div><div class="kpi-sub">Horas realizadas</div></div>
        <div class="kpi gr"><div class="kpi-lbl">% Realização</div><div class="kpi-val clr-g" id="kpi-pct">—</div><div class="kpi-sub">Meta: >= 95%</div></div>
        <div class="kpi rd"><div class="kpi-lbl">Desvio Extra</div><div class="kpi-val clr-r" id="kpi-desvio">—</div><div class="kpi-sub">Hora a mais</div></div>
        <div class="kpi or"><div class="kpi-lbl">Hora Extra</div><div class="kpi-val clr-o" id="kpi-he">—</div><div class="kpi-sub">Total hora extra</div></div>
        <div class="kpi bl"><div class="kpi-lbl">HNR (Não Real.)</div><div class="kpi-val" id="kpi-hnr">—</div><div class="kpi-sub">Horas não realizadas</div></div>
      </div>

      <div class="card">
        <div class="card-hd">
          <div>
            <div class="card-title">Integração API — Log em Tempo Real</div>
            <div class="api-url">${CONFIG.API_URL}</div>
          </div>
          <div class="api-btns">
            <button class="btn-api btn-run" onclick="PaginaHoras.acionarAPI()">▶ Conectar API</button>
            <button class="btn-api btn-clr" onclick="PaginaHoras.limparLog()">🗑 Limpar</button>
          </div>
        </div>
        <div class="api-status" id="api-status">Sistema pronto. Aguardando conexão...</div>
        <div class="log-box" id="log-console"><span class="linfo">Clique em Conectar API para carregar os dados.</span></div>
      </div>

      <div class="g21">
        <div class="card">
          <div class="card-title">Programado vs Realizado por Linha</div>
          <div style="height:190px"><canvas id="cBar"></canvas></div>
        </div>
        <div class="card">
          <div class="card-title">Distribuição de HE por Garagem</div>
          <div style="height:190px"><canvas id="cDonut"></canvas></div>
        </div>
      </div>

      <div class="g11">
        <div class="card">
          <div class="card-title">Hora Extra por Dia (Março)</div>
          <div style="height:160px"><canvas id="cDia"></canvas></div>
        </div>
        <div class="card">
          <div class="card-title">Ranking — Linhas com Mais HE</div>
          <div style="height:160px"><canvas id="cRank"></canvas></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Hora Extra por Linha × Dia — Heatmap</div>
        <div class="hm-wrap">
          <table class="hm">
            <thead id="hm-thead"></thead>
            <tbody id="hm-tbody"></tbody>
          </table>
        </div>
        <div class="hm-leg">
          <span><i style="background:rgba(25,212,110,.2)"></i> ≤ 5h</span>
          <span><i style="background:rgba(246,166,35,.25)"></i> 6h–10h</span>
          <span><i style="background:rgba(246,88,88,.25)"></i> 11h–40h</span>
          <span><i style="background:rgba(246,88,88,.6)"></i> > 40h</span>
        </div>
      </div>

      <div class="card">
        <div class="card-hd">
          <div class="card-title">Detalhamento por Linha — 14 Colunas</div>
        </div>
        <div class="tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th></th><th>Linha</th><th>Garagem</th><th>Lote</th>
                <th>TT Prog</th><th>TT Real</th><th>% Real</th>
                <th>NOR Prog</th><th>NOR Real</th><th>DIF</th>
                <th>HE Prog</th><th>HE Real</th><th>HLE</th><th>Dobra</th><th>Ação</th>
              </tr>
            </thead>
            <tbody id="tbl-linhas"></tbody>
          </table>
        </div>
      </div>

    </div>

    <div class="modal-bg" id="modal-base">
      <div class="modal-box">
        <div class="modal-top">
          <h3>Detalhes — <span id="mod-tit" class="clr-o"></span></h3>
          <button class="btn-close" onclick="document.getElementById('modal-base').style.display='none'">✖</button>
        </div>
        <table class="tbl">
          <thead><tr><th>Data</th><th>Linha</th><th>Turno</th><th>Total Horas</th></tr></thead>
          <tbody id="mod-tbody"></tbody>
        </table>
      </div>
    </div>
    `;
  },

  // ==========================================
  // INJETAR KPIs
  // ==========================================
  injetarKPIs() {
    const k = this.dados.kpis;
    document.getElementById("kpi-prog").innerText   = k.prog;
    document.getElementById("kpi-real").innerText   = k.real;
    document.getElementById("kpi-pct").innerText    = k.pct;
    document.getElementById("kpi-desvio").innerText = k.desvio;
    document.getElementById("kpi-he").innerText     = k.he;
    document.getElementById("kpi-hnr").innerText    = k.hnr;
  },

  // ==========================================
  // INJETAR TABELA
  // ==========================================
  injetarTabela() {
    let html = "";
    this.dados.linhas.forEach(l => {
      const cor = l.dif.includes("+") ? "clr-g" : "clr-r";
      html += `<tr>
        <td>★</td>
        <td><b>${l.id}</b></td>
        <td>${l.gar}</td>
        <td>${l.lote}</td>
        <td>${l.ttp}</td>
        <td>${l.ttr}</td>
        <td class="clr-g">${l.pct}</td>
        <td>${l.norp}</td>
        <td>${l.norr}</td>
        <td class="${cor}">${l.dif}</td>
        <td>${l.hep}</td>
        <td>${l.her}</td>
        <td>${l.hle}</td>
        <td>${l.dobra}</td>
        <td><button class="btn-ver" onclick="PaginaHoras.abrirModal('${l.id}')">Ver</button></td>
      </tr>`;
    });
    document.getElementById("tbl-linhas").innerHTML = html;
  },

  // ==========================================
  // INJETAR HEATMAP
  // ==========================================
  injetarHeatmap() {
    const hm = this.dados.heatmap;
    let thead = "<tr>";
    hm.headers.forEach((h, i) => {
      thead += `<th ${i === 0 ? "class='lh'" : ""}>${h}</th>`;
    });
    thead += "</tr>";
    document.getElementById("hm-thead").innerHTML = thead;

    let tbody = "";
    hm.rows.forEach(r => {
      tbody += `<tr><td class="rh"><b>${r.linha}</b></td><td class="roh">${r.op}</td>`;
      r.vals.forEach(v => {
        const c = v <= 5 ? "hc0" : v <= 10 ? "hc1" : v <= 40 ? "hc2" : "hc3";
        tbody += `<td class="${c}">${v}h</td>`;
      });
      tbody += `<td class="tot">${r.tot}</td></tr>`;
    });
    document.getElementById("hm-tbody").innerHTML = tbody;
  },

  // ==========================================
  // GRÁFICOS Chart.js
  // ==========================================
  montarGraficos() {
    if (!window.Chart) return;
    const C = { azul:"#3d7ef5", verde:"#19d46e", laranja:"#f6a623", vermelho:"#f65858" };
    const base = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color:"#7a9cc8", font:{size:9} }, grid: { color:"rgba(31,56,96,.3)" } },
        y: { ticks: { color:"#7a9cc8", font:{size:9} }, grid: { color:"rgba(31,56,96,.3)" } }
      }
    };

    new Chart(document.getElementById("cBar"), {
      type: "bar",
      data: {
        labels: ["8012-10","8021-10","8022-10","8026-10","8050-10"],
        datasets: [
          { label:"Prog", data:[78,82,86,74,80], backgroundColor: C.azul, borderRadius:3 },
          { label:"Real", data:[84,79,90,80,88], backgroundColor: C.verde, borderRadius:3 }
        ]
      },
      options: { ...base, plugins:{ legend:{ display:true, labels:{ color:"#c8dcff", font:{size:10} } } } }
    });

    new Chart(document.getElementById("cDonut"), {
      type: "doughnut",
      data: {
        labels: ["Garagem A","Garagem B","Garagem C"],
        datasets: [{ data:[446,331,351], backgroundColor:[C.azul,C.verde,C.laranja], borderWidth:0 }]
      },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:"bottom", labels:{ color:"#c8dcff", font:{size:10} } } } }
    });

    new Chart(document.getElementById("cDia"), {
      type: "bar",
      data: {
        labels: ["01","02","03","04","05","06","07","08","09","10","11","12","13","14","15"],
        datasets: [{ label:"HE", data:[62,70,76,73,84,90,88,80,82,95,70,65,72,88,91], backgroundColor: C.azul, borderRadius:2 }]
      },
      options: base
    });

    new Chart(document.getElementById("cRank"), {
      type: "bar",
      data: {
        labels: ["8013-10","8021-10","8022-10","8050-10"],
        datasets: [{ label:"HE Total", data:[359,274,131,108], backgroundColor:[C.azul,C.verde,C.laranja,C.vermelho], borderRadius:3 }]
      },
      options: base
    });
  },

  // ==========================================
  // API REAL
  // ==========================================
  async acionarAPI() {
    this.log("Conectando na API oficial...", "linfo");
    document.getElementById("api-status").innerText = "Conectando...";
    const t0 = performance.now();
    try {
      const r = await fetch(CONFIG.API_URL + "?data=2026-03-03&limit=50&offset=0");
      const ms = Math.round(performance.now() - t0);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = await r.json();
      const n = Array.isArray(d) ? d.length : (d.total || d.count || "?");
      this.log(`200 OK — ${ms}ms — ${n} registros carregados.`, "lok");
      document.getElementById("api-status").innerText = `✅ Conectado — ${ms}ms — ${n} registros`;
    } catch(e) {
      const ms = Math.round(performance.now() - t0);
      this.log(`Erro: ${e.message} — usando dados fictícios.`, "lerro");
      document.getElementById("api-status").innerText = "⚠️ API indisponível — exibindo dados fictícios";
    }
  },

  log(msg, tipo = "linfo") {
    const box = document.getElementById("log-console");
    if (!box) return;
    const h = new Date().toLocaleTimeString("pt-BR");
    box.innerHTML += `<span class="${tipo}" style="display:block">[${h}] ${msg}</span>`;
    box.scrollTop = box.scrollHeight;
  },

  limparLog() {
    const box = document.getElementById("log-console");
    if (box) box.innerHTML = "<span class='linfo'>Terminal limpo.</span>";
  },

  recarregar() {
    this.log("Recarregando dados com filtros aplicados...", "linfo");
    this.injetarKPIs();
    this.injetarTabela();
    this.injetarHeatmap();
  },

  // ==========================================
  // MODAL
  // ==========================================
  abrirModal(linha) {
    document.getElementById("mod-tit").innerText = linha;
    document.getElementById("mod-tbody").innerHTML = `
      <tr><td>03/03/2026</td><td><b>${linha}</b></td><td>TB1</td><td class="clr-g">2h00m</td></tr>
      <tr><td>03/03/2026</td><td><b>${linha}</b></td><td>TB2</td><td class="clr-g">1h20m</td></tr>
    `;
    document.getElementById("modal-base").style.display = "flex";
  },

  // ==========================================
  // EXPORTAR EXCEL (simulado)
  // ==========================================
  exportarExcel() {
    alert("Exportação Excel em desenvolvimento.");
  }

};

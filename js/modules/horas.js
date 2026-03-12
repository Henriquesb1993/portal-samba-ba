/**
 * MÓDULO HORAS — Portal Sambaíba
 * Versão: 5.0 — ALINHADO AO HTML DO GITHUB PAGES
 */

document.addEventListener("DOMContentLoaded", async () => {

  // ==========================================
  // CONSTANTES E ESTADO
  // ==========================================
  const API_HORAS   = 'https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_horas_nimer';
  const API_FILTROS = 'https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_linha_garagens';

  // Define data padrão como a última que sabemos ter muitos dados ou a data atual
  const dataHoje = new Date();
  dataHoje.setHours(dataHoje.getHours() - 3); // Fuso BR
  const strHoje = dataHoje.toISOString().split('T')[0];
  const DATA_PADRAO = '2026-03-05'; // Usando março/2026 pois sabemos que tem dados na API

  let dadosAPI = [];
  let dadosFiltros = [];
  let mapaLinhaGar = {};  
  let mapaLinhaLote = {}; 

  let chartBar = null, chartDonut = null, chartEvo = null, chartRank = null;

  // ==========================================
  // FUNÇÕES UTILITÁRIAS
  // ==========================================
  function setEl(id, val) { const el = document.getElementById(id); if(el) el.textContent = val; }
  function setHTML(id, val) { const el = document.getElementById(id); if(el) el.innerHTML = val; }

  function fmtHoras(h) {
    if (!h || isNaN(h)) return '0h 00m';
    const hh = Math.floor(Math.abs(h));
    const mm = Math.round((Math.abs(h) - hh) * 60);
    return (h < 0 ? '-' : '') + hh + 'h ' + String(mm).padStart(2,'0') + 'm';
  }

  function fmtNum(n) { return Number(n || 0).toLocaleString('pt-BR'); }

  function parseDt(s) {
    if (!s || s === 'nan' || s === 'None') return null;
    try { return new Date(String(s).substring(0, 19).replace(' ', 'T')); } catch { return null; }
  }

  function normLinha(l) {
    if (!l) return '';
    return String(l).trim().replace(/^L\s+/i, '').replace(/\./g, '-').toUpperCase();
  }

  // ==========================================
  // REGRAS DEFINITIVAS DE CÁLCULO
  // ==========================================
  function calcJornada(item) {
    const pg  = parseDt(item.pegada_considerada);
    const lg  = parseDt(item.largada_considerada);
    const esp = parseDt(item.esperado);
    const es1 = parseDt(item.esperado_1);

    if (!pg || !lg) return { hb: 0, interv: 0, hl: 0, he: 0, hn: 0, prog: 0, horaPg: 0 };

    const hb = (lg - pg) / 3600000;
    let interv = hb > 7.0 ? Math.min(hb - 7.0, 1.0) : 0;
    const hl = hb - interv;

    const isExtra = (item.extra || '').toLowerCase().includes('sim');
    const isDobra = (item.dobra  || '').toLowerCase().includes('sim');

    let he = 0, hn = 0;
    if (isExtra || isDobra) { 
      he = hl; 
      hn = 0; 
    } else { 
      he = Math.max(hl - 7.0, 0); 
      hn = Math.min(hl, 7.0); 
    }

    let prog = 0;
    if (esp && es1) prog = (es1 - esp) / 3600000;

    return { hb, interv, hl, he, hn, prog, horaPg: pg.getHours() };
  }

  // ==========================================
  // BUSCA COM PAGINAÇÃO POR DATA
  // ==========================================
  function gerarRangeDatas(inicio, fim) {
    const arr = [];
    let d = new Date(inicio + 'T12:00:00');
    let f = new Date(fim + 'T12:00:00');
    while (d <= f) {
      arr.push(d.toISOString().split('T')[0]);
      d.setDate(d.getDate() + 1);
    }
    return arr;
  }

  async function buscarTodos(dtIni, dtFim, funcaoApi) {
    const todos = [];
    const datas = gerarRangeDatas(dtIni, dtFim);

    for (const data of datas) {
      let offset = 0;
      while (true) {
        let url = `${API_HORAS}?data=${data}&limit=1000&offset=${offset}`;
        if (funcaoApi) url += `&funcao=${funcaoApi}`;

        try {
          const res = await fetch(url);
          if (!res.ok) break;
          const d = await res.json();
          const items = d.items || [];
          todos.push(...items);
          if (todos.length >= (d.total || 0) || items.length === 0) break;
          offset += 1000;
        } catch (e) {
          console.error("Erro na busca", e);
          break;
        }
      }
    }
    return todos;
  }

  // ==========================================
  // FILTROS
  // ==========================================
  async function carregarFiltros() {
    try {
      const r = await fetch(`${API_FILTROS}?limit=2000`);
      const d = await r.json();
      dadosFiltros = d.items || [];

      let gars = new Set(), lotes = new Set(), linhas = new Set();

      dadosFiltros.forEach(f => {
        const lin = normLinha(f.linha);
        if (f.gar) { mapaLinhaGar[lin] = f.gar; gars.add(f.gar); }
        if (f.lote) { mapaLinhaLote[lin] = f.lote; lotes.add(f.lote); }
        linhas.add(lin);
      });

      preencheSelect('selGaragemH', [...gars].sort(), 'Todas as Garagens');
      preencheSelect('selLoteH', [...lotes].sort(), 'Todos os Lotes');
      preencheSelect('selLinhaH', [...linhas].sort(), 'Todas as Linhas');
      preencheSelect('selFuncaoH', ['motorista', 'cobrador'], 'Todas as Funções');

    } catch(e) { console.error("Erro filtros", e); }
  }

  function preencheSelect(id, list, label) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `<option value="">${label}</option>` + 
                   list.map(v => `<option value="${v}">${v}</option>`).join('');
  }

  // ==========================================
  // RENDERIZAÇÃO PRINCIPAL DO DASHBOARD
  // ==========================================
  function renderDashboard(dadosFull) {

    // Aplicar filtros Client-side
    const garFiltro = document.getElementById('selGaragemH')?.value || '';
    const loteFiltro = document.getElementById('selLoteH')?.value || '';
    const linhaFiltro = document.getElementById('selLinhaH')?.value || '';

    let dados = dadosFull;
    if (garFiltro || loteFiltro || linhaFiltro) {
       dados = dadosFull.filter(item => {
          const l = normLinha(item.linha);
          if (linhaFiltro && l !== linhaFiltro) return false;
          if (garFiltro && mapaLinhaGar[l] !== garFiltro) return false;
          if (loteFiltro && mapaLinhaLote[l] !== loteFiltro) return false;
          return true;
       });
    }

    if (!dados || dados.length === 0) {
      setEl('kpiTotalHoras', '0h 00m');
      setEl('kpiCump', '0%');
      setEl('kpiHoraExtra', '0h 00m');
      return;
    }

    let sumHL = 0, sumHE = 0, sumHN = 0, sumProg = 0;
    let nMot = 0, nCob = 0;
    const garM = {}, linhaM = {}, evoDia = {}, colabs = new Set(), heat = {};

    dados.forEach(item => {
      const { hl, he, hn, prog, horaPg } = calcJornada(item);
      const func = (item.funcao || '').toLowerCase();
      const lin  = normLinha(item.linha);
      const gar  = mapaLinhaGar[lin] || 'Outros';
      const data = (item.data || '').substring(0, 10);
      const funcId = item.colaborador || '';

      sumHL += hl; sumHE += he; sumHN += hn; sumProg += prog;
      if (funcId) {
         if (!colabs.has(funcId)) {
            colabs.add(funcId);
            if (func === 'motorista') nMot++;
            if (func === 'cobrador') nCob++;
         }
      }

      if (!garM[gar]) garM[gar] = { hl:0, he:0, hn:0 };
      garM[gar].hl += hl; garM[gar].he += he; garM[gar].hn += hn;

      if (!linhaM[lin]) linhaM[lin] = { hl:0, he:0, hn:0, prog:0, n:0, dobras:0, gar };
      linhaM[lin].hl += hl; linhaM[lin].he += he; linhaM[lin].hn += hn; linhaM[lin].prog += prog;
      linhaM[lin].n++;
      if ((item.dobra||'').toLowerCase().includes('sim')) linhaM[lin].dobras++;

      if (!evoDia[data]) evoDia[data] = 0;
      evoDia[data] += hl;

      // Heatmap (Agrupando por linha e hora, somando qty)
      if (horaPg >= 4 && horaPg <= 22) {
         if (!heat[lin]) heat[lin] = {};
         if (!heat[lin][horaPg]) heat[lin][horaPg] = 0;
         heat[lin][horaPg]++;
      }
    });

    const pctReal = sumProg > 0 ? (sumHL / sumProg * 100).toFixed(1) : 0;

    // PREENCHE KPIs (IDs do HTML atual)
    setEl('kpiTotalHoras', fmtHoras(sumHL));
    setEl('kpiTotalSub', `${fmtNum(dados.length)} jornadas analisadas`);

    setEl('kpiCump', pctReal + '%');
    setEl('kpiCumpSub', `${fmtHoras(sumProg)} horas programadas`);

    setEl('kpiHoraExtra', fmtHoras(sumHE));
    setEl('kpiExtraSub', `${fmtHoras(sumHN)} horas normais`);

    renderChartBarGar(garM);
    renderChartDonut(nMot, nCob, sumHN, sumHE);
    renderChartEvo(evoDia);
    renderChartRank(linhaM);
    renderHeatmap(heat);
    renderTabelaLinhas(linhaM);
  }

  // ==========================================
  // GRÁFICOS E TABELAS
  // ==========================================
  function renderChartBarGar(garM) {
    const el = document.getElementById('cBarGar');
    if (!el) return;
    if (chartBar) chartBar.destroy();

    const labs = Object.keys(garM).sort();
    chartBar = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: {
        labels: labs,
        datasets: [
          { label: 'H. Normal', data: labs.map(g => garM[g].hn.toFixed(1)), backgroundColor: '#3d7ef5' },
          { label: 'H. Extra',  data: labs.map(g => garM[g].he.toFixed(1)), backgroundColor: '#f6a623' }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { x:{grid:{color:'#1a3560'},ticks:{color:'#7a9cc8'}}, y:{grid:{color:'#1a3560'},ticks:{color:'#7a9cc8'}} }, plugins:{legend:{labels:{color:'#7a9cc8'}}} }
    });
  }

  function renderChartDonut(nMot, nCob, sumHN, sumHE) {
    const el = document.getElementById('cDonut');
    if (!el) return;
    if (chartDonut) chartDonut.destroy();

    const tot = nMot + nCob || 1;
    const pMot = (nMot/tot*100).toFixed(1);
    const pCob = (nCob/tot*100).toFixed(1);

    setHTML('legendDonut', `
      <div style="display:flex;align-items:center;margin-bottom:6px">
        <span style="width:12px;height:12px;background:#3d7ef5;border-radius:50%;margin-right:8px;"></span>
        Motoristas: ${fmtNum(nMot)} (${pMot}%) — Normal: ${fmtHoras(sumHN)}
      </div>
      <div style="display:flex;align-items:center;">
        <span style="width:12px;height:12px;background:#19d46e;border-radius:50%;margin-right:8px;"></span>
        Cobradores: ${fmtNum(nCob)} (${pCob}%) — Extra: ${fmtHoras(sumHE)}
      </div>
    `);

    chartDonut = new Chart(el.getContext('2d'), {
      type: 'doughnut',
      data: { labels: ['Motoristas', 'Cobradores'], datasets: [{ data: [nMot, nCob], backgroundColor: ['#3d7ef5', '#19d46e'], borderWidth:0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout:'65%', plugins: { legend: { display:false } } }
    });
  }

  function renderChartEvo(evoDia) {
    const el = document.getElementById('cEvo');
    if (!el) return;
    if (chartEvo) chartEvo.destroy();

    const labs = Object.keys(evoDia).sort();
    chartEvo = new Chart(el.getContext('2d'), {
      type: 'line',
      data: {
        labels: labs.map(d => d.substring(5)),
        datasets: [{ label: 'Horas Líquidas', data: labs.map(d => evoDia[d].toFixed(1)), borderColor: '#19d46e', backgroundColor: 'rgba(25, 212, 110, 0.1)', fill: true, tension: 0.3 }]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { x:{grid:{color:'#1a3560'},ticks:{color:'#7a9cc8'}}, y:{grid:{color:'#1a3560'},ticks:{color:'#7a9cc8'}} }, plugins:{legend:{display:false}} }
    });
  }

  function renderChartRank(linhaM) {
    const el = document.getElementById('cRank');
    if (!el) return;
    if (chartRank) chartRank.destroy();

    const arr = Object.entries(linhaM).filter(i => i[1].he > 0).sort((a,b)=>b[1].he - a[1].he).slice(0, 8);
    chartRank = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: { labels: arr.map(i=>i[0]), datasets: [{ label: 'Hora Extra', data: arr.map(i=>i[1].he.toFixed(1)), backgroundColor: '#f6a623', borderRadius:4 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x:{grid:{color:'#1a3560'},ticks:{color:'#7a9cc8'}}, y:{grid:{color:'#1a3560'},ticks:{color:'#c8dcff'}} }, plugins:{legend:{display:false}} }
    });
  }

  function renderHeatmap(heat) {
    const tbody = document.getElementById('tbHeatmapHoras');
    if (!tbody) return;

    let html = '';
    const linhasHeat = Object.keys(heat).sort().slice(0,15); // Top 15 para não travar

    linhasHeat.forEach(l => {
      html += `<tr><td class="lh">${l}</td>`;
      for(let h=4; h<=22; h++) {
        const val = heat[l][h] || 0;
        let bg = '#111f3a'; let col = '#fff';
        if (val > 0) {
           if (val >= 15) { bg = '#f65858'; col = '#fff'; }
           else if (val >= 8) { bg = '#f6a623'; col = '#000'; }
           else { bg = '#19d46e'; col = '#000'; }
        }
        html += `<td style="background:${bg};color:${col};font-weight:${val>0?'bold':'normal'};">${val}</td>`;
      }
      html += `</tr>`;
    });
    tbody.innerHTML = html;
  }

  function renderTabelaLinhas(linhaM) {
    const tbody = document.getElementById('tbLinhas');
    if (!tbody) return;

    const arr = Object.entries(linhaM).sort((a,b)=>b[1].hl - a[1].hl);
    tbody.innerHTML = arr.map((x,i) => {
      const p = x[1].prog; const hl = x[1].hl; const hn = x[1].hn; const he = x[1].he;
      const pct = p > 0 ? (hl/p*100).toFixed(1) : 0;
      const dif = hl - p;
      return `<tr>
        <td style="color:#4a6d9c">${i+1}</td>
        <td style="color:#c8dcff;font-weight:700">${x[0]}</td>
        <td>${x[1].gar}</td>
        <td>${mapaLinhaLote[x[0]]||'-'}</td>
        <td style="color:#fff">${fmtHoras(p)}</td>
        <td style="color:#fff">${fmtHoras(hl)}</td>
        <td style="color:${pct>=100?'#19d46e':'#f6a623'};font-weight:700">${pct}%</td>
        <td style="color:#fff">${fmtHoras(hn)}</td>
        <td style="color:#fff">${fmtHoras(Math.min(p, hl))}</td>
        <td style="color:${dif>=0?'#19d46e':'#f65858'}">${fmtHoras(dif)}</td>
        <td style="color:#fff">0h 00m</td>
        <td style="color:#f6a623;font-weight:bold">${fmtHoras(he)}</td>
        <td>${x[1].n}</td>
        <td>${x[1].dobras}</td>
        <td><button class="btn-ver">Ver</button></td>
      </tr>`;
    }).join('');
  }

  // ==========================================
  // INICIALIZAÇÃO E EVENTOS
  // ==========================================
  const btn = document.getElementById('btnConsultarH');
  const dI  = document.getElementById('dataInicioH');
  const dF  = document.getElementById('dataFimH');

  if (dI) dI.value = DATA_PADRAO;
  if (dF) dF.value = DATA_PADRAO;

  if (btn) {
    btn.addEventListener('click', async () => {
      const ini = dI ? dI.value : DATA_PADRAO;
      const fim = dF ? dF.value : DATA_PADRAO;
      const func = document.getElementById('selFuncaoH')?.value || '';

      btn.textContent = '⏳ Carregando...'; btn.disabled = true;
      dadosAPI = await buscarTodos(ini, fim, func);
      renderDashboard(dadosAPI);
      btn.textContent = 'Consultar'; btn.disabled = false;
    });
  }

  // BOOT MÁGICO
  try {
    await carregarFiltros();
    // Inicia com os dados do dia Padrão
    if (btn) {
       btn.textContent = '⏳ Carregando...'; btn.disabled = true;
    }
    dadosAPI = await buscarTodos(DATA_PADRAO, DATA_PADRAO, '');
    renderDashboard(dadosAPI);
    if (btn) {
       btn.textContent = 'Consultar'; btn.disabled = false;
    }
  } catch(e) { console.error('Erro Fatal', e); }

});

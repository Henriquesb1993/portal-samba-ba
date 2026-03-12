/**
 * MÓDULO HORAS — Portal Sambaíba
 * Versão: 6.0 — REGRAS DEFINITIVAS + TODAS AS FUNCIONALIDADES
 */
document.addEventListener("DOMContentLoaded", async () => {

  const API_HORAS   = 'https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_horas_nimer';
  const API_FILTROS = 'https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_linha_garagens';
  const DATA_PADRAO = '2026-03-05';

  let dadosAPI = [];
  let dadosFiltros = [];
  let mapaLinhaGar  = {};
  let mapaLinhaLote = {};
  let linhaMapModal = {}; // dados brutos por linha para o modal
  let opSortKey = 'hePer', opSortAsc = false;
  let opDadosCache = [];

  let chartBar = null, chartDonut = null, chartEvo = null, chartRank = null;

  // ─── UTILITÁRIOS ─────────────────────────────────────
  function setEl(id, v) { const e = document.getElementById(id); if(e) e.textContent = v; }
  function setHTML(id, v) { const e = document.getElementById(id); if(e) e.innerHTML = v; }

  function fmtH(h) {
    if (!h || isNaN(h)) return '0h 00m';
    const neg = h < 0; const abs = Math.abs(h);
    const hh = Math.floor(abs);
    const mm = Math.round((abs - hh) * 60);
    return (neg?'-':'') + hh + 'h ' + String(mm).padStart(2,'0') + 'm';
  }
  function fmtPct(v) { return (isNaN(v)||!isFinite(v)) ? '—' : v.toFixed(1)+'%'; }
  function fmtN(n) { return Number(n||0).toLocaleString('pt-BR'); }

  function parseDt(s) {
    if (!s || s==='nan'||s==='None') return null;
    try { return new Date(String(s).substring(0,19).replace(' ','T')); } catch { return null; }
  }
  function normLinha(l) {
    if (!l) return '';
    return String(l).trim().replace(/^L\s+/i,'').replace(/\./g,'-').toUpperCase();
  }

  // ─── REGRAS DEFINITIVAS ───────────────────────────────
  function calcJornada(item) {
    const pg  = parseDt(item.pegada_considerada);
    const lg  = parseDt(item.largada_considerada);
    const esp = parseDt(item.esperado);
    const es1 = parseDt(item.esperado_1);

    if (!pg || !lg) return { hb:0, interv:0, hl:0, he:0, hn:0, prog:0, heProg:0, hnProg:0, horaPg:0 };

    // HORAS BRUTAS
    const hb = (lg - pg) / 3600000;

    // INTERVALO: desconta oque exceder 7h, máximo 1h
    const interv = hb > 7.0 ? Math.min(hb - 7.0, 1.0) : 0;

    // HORAS LÍQUIDAS
    const hl = hb - interv;

    // HORA EXTRA / NORMAL
    const isExtra = (item.extra||'').toLowerCase().includes('sim');
    const isDobra = (item.dobra ||'').toLowerCase().includes('sim');
    let he, hn;
    if (isExtra || isDobra) { he = hl; hn = 0; }
    else { he = Math.max(hl - 7.0, 0); hn = Math.min(hl, 7.0); }

    // PROGRAMADO: esperado_1 - esperado
    let prog = 0, heProg = 0, hnProg = 0;
    if (esp && es1) {
      prog   = (es1 - esp) / 3600000;
      hnProg = Math.min(prog, 7.0);
      heProg = Math.max(prog - 7.0, 0);
    }

    return { hb, interv, hl, he, hn, prog, heProg, hnProg, horaPg: pg.getHours() };
  }

  // ─── PAGINAÇÃO ───────────────────────────────────────
  function gerarDatas(ini, fim) {
    const arr = []; let d = new Date(ini+'T12:00:00'), f = new Date(fim+'T12:00:00');
    while (d <= f) { arr.push(d.toISOString().split('T')[0]); d.setDate(d.getDate()+1); }
    return arr;
  }

  async function buscarTodos(dtIni, dtFim) {
    const todos = [], datas = gerarDatas(dtIni, dtFim);
    for (const data of datas) {
      let offset = 0;
      while (true) {
        try {
          const res = await fetch(`${API_HORAS}?data=${data}&limit=1000&offset=${offset}`);
          if (!res.ok) break;
          const d = await res.json();
          const items = d.items||[];
          todos.push(...items);
          if (items.length === 0 || todos.length >= (d.total||0)) break;
          offset += 1000;
        } catch { break; }
      }
    }
    return todos;
  }

  // ─── FILTROS ─────────────────────────────────────────
  async function carregarFiltros() {
    try {
      const r = await fetch(`${API_FILTROS}?limit=2000`);
      const d = await r.json();
      dadosFiltros = d.items||[];
      let gars=new Set(), lotes=new Set(), linhas=new Set();
      dadosFiltros.forEach(f => {
        const l = normLinha(f.linha);
        if (f.gar)  { mapaLinhaGar[l]  = f.gar;  gars.add(f.gar); }
        if (f.lote) { mapaLinhaLote[l] = f.lote; lotes.add(f.lote); }
        linhas.add(l);
      });
      fillSel('selGaragemH', [...gars].sort(),  'Todas as Garagens');
      fillSel('selLoteH',    [...lotes].sort(), 'Todos os Lotes');
      fillSel('selLinhaH',   [...linhas].sort(),'Todas as Linhas');
      fillSel('selFuncaoH',  ['motorista','cobrador'],'Todas as Funções');
    } catch(e) { console.error('Filtros',e); }
  }
  function fillSel(id, list, label) {
    const el = document.getElementById(id); if (!el) return;
    el.innerHTML = `<option value="">${label}</option>` + list.map(v=>`<option value="${v}">${v}</option>`).join('');
  }

  // ─── DASHBOARD PRINCIPAL ─────────────────────────────
  function renderDashboard(dadosFull) {
    // Filtros client-side
    const garF  = document.getElementById('selGaragemH')?.value||'';
    const loteF = document.getElementById('selLoteH')?.value||'';
    const linF  = document.getElementById('selLinhaH')?.value||'';
    const funF  = document.getElementById('selFuncaoH')?.value||'';

    let dados = dadosFull;
    if (garF||loteF||linF||funF) {
      dados = dadosFull.filter(i => {
        const l = normLinha(i.linha);
        if (linF  && l !== linF) return false;
        if (garF  && mapaLinhaGar[l]  !== garF)  return false;
        if (loteF && mapaLinhaLote[l] !== loteF) return false;
        if (funF  && (i.funcao||'').toLowerCase() !== funF) return false;
        return true;
      });
    }

    if (!dados.length) {
      setEl('kpiTotalHoras','Sem dados'); setEl('kpiCump','—'); setEl('kpiHoraExtra','—'); return;
    }

    let sumHL=0, sumHE=0, sumHN=0, sumProg=0, sumHEProg=0, sumHNProg=0;
    let nMot=0, nCob=0;
    const garM={}, linhaM={}, evoDia={}, heat={}, opM={};
    const colabFunc = {};

    dados.forEach(item => {
      const { hl, he, hn, prog, heProg, hnProg, horaPg } = calcJornada(item);
      const lin  = normLinha(item.linha);
      const gar  = mapaLinhaGar[lin]||'Outros';
      const data = (item.data||'').substring(0,10);
      const dia  = parseInt((item.data||'').substring(8,10))||0;
      const colab= String(item.colaborador||'').trim();
      const nome = String(item['nome do funcionario']||item.nome||'').trim();
      const re   = String(item.noreg||item.re||colab).trim();
      const func = (item.funcao||'').toLowerCase();
      const tab  = String(item.tabela||'').trim();

      sumHL += hl; sumHE += he; sumHN += hn;
      sumProg += prog; sumHEProg += heProg; sumHNProg += hnProg;

      // Contagem de funções únicas por colaborador
      if (colab && !colabFunc[colab]) {
        colabFunc[colab] = func;
        if (func==='motorista') nMot++; else if (func==='cobrador') nCob++;
      }

      // Por garagem
      if (!garM[gar]) garM[gar] = {hl:0,he:0,hn:0};
      garM[gar].hl+=hl; garM[gar].he+=he; garM[gar].hn+=hn;

      // Por linha
      if (!linhaM[lin]) linhaM[lin] = {hl:0,he:0,hn:0,prog:0,heProg:0,hnProg:0,n:0,dobras:0,gar,tabs:{}};
      linhaM[lin].hl+=hl; linhaM[lin].he+=he; linhaM[lin].hn+=hn;
      linhaM[lin].prog+=prog; linhaM[lin].heProg+=heProg; linhaM[lin].hnProg+=hnProg;
      linhaM[lin].n++;
      if ((item.dobra||'').toLowerCase().includes('sim')) linhaM[lin].dobras++;
      // Tabelas para modal
      if (tab) {
        if (!linhaM[lin].tabs[tab]) linhaM[lin].tabs[tab]={heProg:0,heReal:0};
        linhaM[lin].tabs[tab].heProg += heProg;
        linhaM[lin].tabs[tab].heReal += he;
      }

      // Evolução por dia
      if (!evoDia[data]) evoDia[data] = 0;
      evoDia[data] += hl;

      // Heatmap linha x dias (HE acumulada)
      if (dia >= 1 && dia <= 31) {
        if (!heat[lin]) heat[lin] = {};
        if (!heat[lin][dia]) heat[lin][dia] = 0;
        heat[lin][dia] += he;
      }

      // Operadores
      if (!opM[re]) opM[re] = {re, nome, func, heDia:0, hePer:0, dobras:0, jornadas:0};
      opM[re].hePer += he;
      opM[re].heDia  = Math.max(opM[re].heDia, he);
      opM[re].jornadas++;
      if ((item.dobra||'').toLowerCase().includes('sim')) opM[re].dobras++;
    });

    // KPIs
    const pct = sumProg > 0 ? sumHL/sumProg*100 : 0;
    setEl('kpiTotalHoras', fmtH(sumHL));
    setEl('kpiTotalSub', `${fmtN(dados.length)} jornadas | ${fmtN(Object.keys(opM).length)} operadores`);
    setEl('kpiCump', fmtPct(pct));
    setEl('kpiCumpSub', `${fmtH(sumProg)} horas programadas`);
    setEl('kpiHoraExtra', fmtH(sumHE));
    setEl('kpiExtraSub', `${fmtH(sumHN)} horas normais`);

    linhaMapModal = linhaM;
    opDadosCache  = Object.values(opM);

    renderBarGar(garM);
    renderDonut(nMot, nCob, sumHN, sumHE);
    renderEvo(evoDia);
    renderRank(linhaM);
    renderHeatmap(heat);
    renderTabelaLinhas(linhaM);
    renderOperadores(opDadosCache);
  }

  // ─── GRÁFICO BARRAS GARAGEM (Normal + Extra + %HE) ───
  function renderBarGar(garM) {
    const el = document.getElementById('cBarGar'); if(!el) return;
    if (chartBar) chartBar.destroy();
    const labs = Object.keys(garM).sort();
    const pctHE = labs.map(g => {
      const tot = garM[g].hn + garM[g].he;
      return tot > 0 ? parseFloat((garM[g].he/tot*100).toFixed(1)) : 0;
    });
    chartBar = new Chart(el.getContext('2d'), {
      data: {
        labels: labs,
        datasets: [
          { type:'bar',  label:'H. Normal', data: labs.map(g=>garM[g].hn.toFixed(1)), backgroundColor:'#3d7ef5', yAxisID:'y' },
          { type:'bar',  label:'H. Extra',  data: labs.map(g=>garM[g].he.toFixed(1)), backgroundColor:'#f6a623', yAxisID:'y' },
          { type:'line', label:'%HE',        data: pctHE, borderColor:'#f65858', tension:0.3, yAxisID:'y2', pointRadius:3 }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        scales: {
          y:  { stacked:false, grid:{color:'#1a3560'}, ticks:{color:'#7a9cc8'} },
          y2: { position:'right', grid:{drawOnChartArea:false}, ticks:{color:'#f65858', callback:v=>v+'%'}, max:100, min:0 },
          x:  { grid:{color:'#1a3560'}, ticks:{color:'#7a9cc8'} }
        },
        plugins:{ legend:{ labels:{ color:'#7a9cc8', font:{size:10} } } }
      }
    });
  }

  // ─── DONUT ───────────────────────────────────────────
  function renderDonut(nMot, nCob, sumHN, sumHE) {
    const el = document.getElementById('cDonut'); if(!el) return;
    if (chartDonut) chartDonut.destroy();
    const tot = nMot+nCob||1;
    setHTML('legendDonut', `
      <div style="display:flex;align-items:center;margin-bottom:5px">
        <span style="width:10px;height:10px;background:#3d7ef5;border-radius:50%;margin-right:6px"></span>
        Motoristas: ${fmtN(nMot)} (${(nMot/tot*100).toFixed(1)}%)
      </div>
      <div style="display:flex;align-items:center;margin-bottom:5px">
        <span style="width:10px;height:10px;background:#19d46e;border-radius:50%;margin-right:6px"></span>
        Cobradores: ${fmtN(nCob)} (${(nCob/tot*100).toFixed(1)}%)
      </div>
      <div style="margin-top:5px;font-size:10px;color:#4a6d9c;">Normal: ${fmtH(sumHN)} | Extra: ${fmtH(sumHE)}</div>
    `);
    chartDonut = new Chart(el.getContext('2d'), {
      type:'doughnut',
      data:{ labels:['Motoristas','Cobradores'], datasets:[{ data:[nMot,nCob], backgroundColor:['#3d7ef5','#19d46e'], borderWidth:0 }] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{ legend:{display:false} } }
    });
  }

  // ─── EVOLUÇÃO MENSAL ──────────────────────────────────
  function renderEvo(evoDia) {
    const el = document.getElementById('cEvo'); if(!el) return;
    if (chartEvo) chartEvo.destroy();
    const labs = Object.keys(evoDia).sort();
    chartEvo = new Chart(el.getContext('2d'), {
      type:'line',
      data:{ labels: labs.map(d=>d.substring(5)), datasets:[{ label:'Horas Líquidas', data: labs.map(d=>evoDia[d].toFixed(1)), borderColor:'#19d46e', backgroundColor:'rgba(25,212,110,0.08)', fill:true, tension:0.3 }] },
      options:{ responsive:true, maintainAspectRatio:false, scales:{ x:{grid:{color:'#1a3560'},ticks:{color:'#7a9cc8'}}, y:{grid:{color:'#1a3560'},ticks:{color:'#7a9cc8'}} }, plugins:{legend:{display:false}} }
    });
  }

  // ─── RANK (HE Real > HE Prog) ─────────────────────────
  function renderRank(linhaM) {
    const el = document.getElementById('cRank'); if(!el) return;
    if (chartRank) chartRank.destroy();
    const arr = Object.entries(linhaM)
      .filter(([,v]) => v.he > v.heProg)
      .sort((a,b) => (b[1].he - b[1].heProg) - (a[1].he - a[1].heProg))
      .slice(0,8);
    chartRank = new Chart(el.getContext('2d'), {
      type:'bar',
      data:{ labels: arr.map(i=>i[0]), datasets:[{ label:'HE Real > Prog', data: arr.map(i=>(i[1].he - i[1].heProg).toFixed(1)), backgroundColor:'#f65858', borderRadius:4 }] },
      options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, scales:{ x:{grid:{color:'#1a3560'},ticks:{color:'#7a9cc8'}}, y:{grid:{color:'#1a3560'},ticks:{color:'#c8dcff'}} }, plugins:{legend:{display:false}} }
    });
  }

  // ─── HEATMAP LINHA x DIAS ────────────────────────────
  let hmDadosCache = {}, hmFiltroAtual = '';
  function renderHeatmap(heat) {
    hmDadosCache = heat;
    hmFiltroAtual = '';
    const filtroEl = document.getElementById('hmFiltroLinha');
    if (filtroEl) filtroEl.value = '';
    _pintarHeatmap(heat,'');
  }
  function _pintarHeatmap(heat, filtro) {
    const head = document.getElementById('hmHead');
    const body = document.getElementById('tbHeatmapHoras');
    if (!head||!body) return;

    // Header: Linha | 1..31 | Total
    head.innerHTML = '<tr>' +
      '<th class="lh">LINHA</th>' +
      Array.from({length:31},(_,i)=>`<th onclick="sortHm(${i+1})">${i+1}</th>`).join('') +
      '<th onclick="sortHm(\'tot\')" class="td-tot">Total</th>' +
      '</tr>';

    let linhas = Object.keys(heat).sort();
    if (filtro) linhas = linhas.filter(l => l.includes(filtro.toUpperCase()));

    body.innerHTML = linhas.map(l => {
      let tot = 0;
      const cells = Array.from({length:31},(_,i)=>{
        const d = i+1;
        const val = heat[l][d]||0;
        tot += val;
        let bg='#111f3a', col='#4a6d9c';
        if (val > 0) {
          if (val >= 5)    { bg='#f65858'; col='#fff'; }
          else if (val >= 2){ bg='#f6a623'; col='#000'; }
          else               { bg='#19d46e'; col='#000'; }
        }
        return `<td style="background:${bg};color:${col}">${val>0?fmtH(val):''}</td>`;
      }).join('');
      const totBg = tot>=20?'#f65858':tot>=10?'#f6a623':'#1f3860';
      return `<tr><td class="lh">${l}</td>${cells}<td class="td-tot" style="background:${totBg};color:#fff">${fmtH(tot)}</td></tr>`;
    }).join('');
  }
  window.sortHm = function(key) {
    const body = document.getElementById('tbHeatmapHoras'); if(!body) return;
    const rows = [...body.querySelectorAll('tr')];
    rows.sort((a,b) => {
      const ia = key==='tot'?14:key;
      const va = parseFloat(a.cells[key==='tot'?32:key].textContent)||0;
      const vb = parseFloat(b.cells[key==='tot'?32:key].textContent)||0;
      return vb - va;
    });
    rows.forEach(r=>body.appendChild(r));
  };

  // ─── TABELA LINHAS ────────────────────────────────────
  function renderTabelaLinhas(linhaM) {
    const tbody = document.getElementById('tbLinhas'); if(!tbody) return;
    const arr = Object.entries(linhaM).sort((a,b)=>b[1].hl - a[1].hl);
    tbody.innerHTML = arr.map(([lin,v],i) => {
      const pct  = v.prog > 0 ? v.hl/v.prog*100 : 0;
      const dif  = v.hl - v.prog;
      const cor  = pct>=100?'#19d46e':pct>=90?'#f6a623':'#f65858';
      const corDif = dif>=0?'#19d46e':'#f65858';
      return `<tr>
        <td>${i+1}</td>
        <td style="color:#c8dcff;font-weight:700">${lin}</td>
        <td>${v.gar}</td>
        <td>${mapaLinhaLote[lin]||'—'}</td>
        <td>${fmtH(v.prog)}</td>
        <td>${fmtH(v.hl)}</td>
        <td style="color:${cor};font-weight:700">${fmtPct(pct)}</td>
        <td>${fmtH(v.hnProg)}</td>
        <td>${fmtH(v.hn)}</td>
        <td style="color:${corDif}">${fmtH(dif)}</td>
        <td style="color:#f6a623">${fmtH(v.heProg)}</td>
        <td style="color:${v.he>v.heProg?'#f65858':'#f6a623'};font-weight:700">${fmtH(v.he)}</td>
        <td>${v.dobras}</td>
        <td><button class="btn-ver" onclick="abrirModal('${lin}')">Ver</button></td>
      </tr>`;
    }).join('');
  }

  // ─── MODAL VER (Tabela | HE Prog | HE Real | Dif) ────
  window.abrirModal = function(lin) {
    const v = linhaMapModal[lin]; if(!v) return;
    document.getElementById('modTit').textContent = lin;
    const tabs = v.tabs||{};
    const rows = Object.entries(tabs).sort((a,b)=>b[1].heReal - a[1].heReal);
    const tbody = document.getElementById('tbModal');
    if (tbody) tbody.innerHTML = rows.map(([tab,d]) => {
      const dif = d.heReal - d.heProg;
      const c = dif>0?'#f65858':dif<0?'#19d46e':'#7a9cc8';
      return `<tr>
        <td style="color:#c8dcff;font-weight:700">${tab}</td>
        <td>${fmtH(d.heProg)}</td>
        <td style="color:#f6a623;font-weight:700">${fmtH(d.heReal)}</td>
        <td style="color:${c};font-weight:700">${fmtH(dif)}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="4" style="color:#4a6d9c">Sem dados de tabela</td></tr>';
    const modal = document.getElementById('modal');
    if (modal) modal.classList.add('open');
  };
  window.fecharModal = function() {
    const modal = document.getElementById('modal');
    if (modal) modal.classList.remove('open');
  };

  // ─── TABELA OPERADORES ────────────────────────────────
  function renderOperadores(dados) {
    const filtro = (document.getElementById('opFiltro')?.value||'').toLowerCase();
    let arr = dados;
    if (filtro) arr = arr.filter(o => o.re.toLowerCase().includes(filtro) || o.nome.toLowerCase().includes(filtro));
    arr.sort((a,b) => opSortAsc ? a[opSortKey]-b[opSortKey] : b[opSortKey]-a[opSortKey]);
    const tbody = document.getElementById('tbOperador'); if(!tbody) return;
    tbody.innerHTML = arr.slice(0,200).map(o => `<tr>
      <td style="color:#c8dcff;font-weight:700">${o.re}</td>
      <td style="text-align:left;color:#fff">${o.nome||'—'}</td>
      <td>${o.func}</td>
      <td style="color:#f6a623">${fmtH(o.heDia)}</td>
      <td style="color:#f6a623;font-weight:700">${fmtH(o.hePer)}</td>
      <td style="color:${o.dobras>0?'#f65858':'#7a9cc8'}">${o.dobras}</td>
    </tr>`).join('') || '<tr><td colspan="6" style="color:#4a6d9c">Sem dados</td></tr>';
  }

  window.sortOp = function(key) {
    if (opSortKey===key) opSortAsc=!opSortAsc;
    else { opSortKey=key; opSortAsc=false; }
    renderOperadores(opDadosCache);
  };

  // ─── EVENTOS ─────────────────────────────────────────
  document.getElementById('opFiltro')?.addEventListener('input', () => renderOperadores(opDadosCache));
  document.getElementById('hmFiltroLinha')?.addEventListener('input', e => _pintarHeatmap(hmDadosCache, e.target.value));

  document.getElementById('btnConsultarH')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnConsultarH');
    const ini = document.getElementById('dataInicioH')?.value || DATA_PADRAO;
    const fim = document.getElementById('dataFimH')?.value || ini;
    btn.textContent='⏳ Carregando...'; btn.disabled=true;
    dadosAPI = await buscarTodos(ini, fim);
    renderDashboard(dadosAPI);
    btn.textContent='Consultar'; btn.disabled=false;
  });

  // ─── BOOT ─────────────────────────────────────────────
  Chart.defaults.color = '#7a9cc8';
  Chart.defaults.font.size = 10;

  const dI = document.getElementById('dataInicioH');
  const dF = document.getElementById('dataFimH');
  if (dI) dI.value = DATA_PADRAO;
  if (dF) dF.value = DATA_PADRAO;

  const btn = document.getElementById('btnConsultarH');
  try {
    await carregarFiltros();
    if (btn) { btn.textContent='⏳ Carregando...'; btn.disabled=true; }
    dadosAPI = await buscarTodos(DATA_PADRAO, DATA_PADRAO);
    renderDashboard(dadosAPI);
    if (btn) { btn.textContent='Consultar'; btn.disabled=false; }
  } catch(e) { console.error('Erro Boot:', e); if(btn){btn.textContent='Consultar';btn.disabled=false;} }
});

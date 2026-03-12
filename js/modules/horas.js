/**
 * MÓDULO HORAS — Portal Sambaíba
 * Versão: 4.0 — REGRAS OPERACIONAIS CONFIRMADAS
 *
 * REGRAS DE CÁLCULO:
 * horas_brutas   = largada_considerada - pegada_considerada
 * intervalo      = se hb <= 7h → 0 | se hb > 7h → MIN(hb - 7h, 1h)
 * horas_liquidas = horas_brutas - intervalo
 * hora_extra     = se extra==Sim OU dobra==Sim → hl | senão MAX(hl - 7h, 0)
 * hora_normal    = MIN(hl, 7h)
 * programado     = esperado_1 - esperado
 *
 * APIs:
 *   sb_horas_nimer      → dados operacionais (?data=YYYY-MM-DD &funcao= &colaborador= &linha=)
 *   sb_linha_garagens   → filtros garagem/lote/linha
 *
 * Normalização linha:
 *   API horas   → "L 106A-10"
 *   API filtros → "106A.10"
 *   Conversão   → remove "L ", troca "." por "-", upper()
 */

document.addEventListener("DOMContentLoaded", async () => {

  // ───────────────────────────────────────────────────────
  // CONSTANTES
  // ───────────────────────────────────────────────────────
  const API_HORAS   = 'https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_horas_nimer';
  const API_FILTROS = 'https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_linha_garagens';
  const DATA_PADRAO = '2026-03-05';

  // ───────────────────────────────────────────────────────
  // ESTADO
  // ───────────────────────────────────────────────────────
  let dadosAPI     = [];
  let dadosFiltros = [];
  let mapaLinhaGar  = {};  // { "106A-10": "G4" }
  let mapaLinhaLote = {};  // { "106A-10": "E2" }
  let chartBar = null, chartDonut = null, chartEvo = null, chartRank = null;

  // ───────────────────────────────────────────────────────
  // LOG DA API
  // ───────────────────────────────────────────────────────
  const logBox = document.getElementById('logBoxH');
  function log(msg, tipo = 'linfo') {
    if (!logBox) { console.log(msg); return; }
    const s = document.createElement('span');
    s.className = tipo;
    s.textContent = '[' + new Date().toLocaleTimeString('pt-BR') + '] ' + msg;
    logBox.appendChild(s);
    logBox.scrollTop = logBox.scrollHeight;
  }

  // ───────────────────────────────────────────────────────
  // UTILITÁRIOS
  // ───────────────────────────────────────────────────────
  function setEl(id, v)    { const e = document.getElementById(id); if (e) e.textContent = v; }
  function setHTML(id, h)  { const e = document.getElementById(id); if (e) e.innerHTML = h; }

  function fmtHoras(h) {
    if (!h || isNaN(h)) return '0h 00m';
    const hh = Math.floor(Math.abs(h));
    const mm = Math.round((Math.abs(h) - hh) * 60);
    return (h < 0 ? '-' : '') + hh + 'h ' + String(mm).padStart(2, '0') + 'm';
  }

  function fmtNum(n) {
    return Number(n || 0).toLocaleString('pt-BR');
  }

  function parseDt(s) {
    if (!s || s === 'nan' || s === 'None' || s === 'null') return null;
    try { return new Date(String(s).substring(0, 19).replace(' ', 'T')); }
    catch { return null; }
  }

  // Normaliza linha da API horas para o mesmo formato da API filtros
  // "L 106A-10" → "106A-10"
  function normLinha(l) {
    if (!l) return '';
    return String(l).trim().replace(/^L\s+/i, '').replace(/\./g, '-').toUpperCase();
  }

  // ───────────────────────────────────────────────────────
  // REGRAS DE CÁLCULO OPERACIONAL
  // ───────────────────────────────────────────────────────
  function calcJornada(item) {
    const pg  = parseDt(item.pegada_considerada);
    const lg  = parseDt(item.largada_considerada);
    const esp = parseDt(item.esperado);
    const es1 = parseDt(item.esperado_1);

    if (!pg || !lg) return { hb: 0, interv: 0, hl: 0, he: 0, hn: 0, prog: 0 };

    // HORAS BRUTAS
    const hb = (lg - pg) / 3600000;

    // INTERVALO: se hb <= 7h → 0; se hb > 7h → MIN(hb - 7h, 1h)
    let interv = 0;
    if (hb > 7.0) interv = Math.min(hb - 7.0, 1.0);

    // HORAS LÍQUIDAS
    const hl = hb - interv;

    // HORA EXTRA / HORA NORMAL
    const isExtra = (item.extra || '').toLowerCase().includes('sim');
    const isDobra = (item.dobra  || '').toLowerCase().includes('sim');
    let he = 0, hn = 0;
    if (isExtra || isDobra) {
      he = hl;        // toda a jornada é extra
      hn = 0;
    } else {
      he = Math.max(hl - 7.0, 0);
      hn = Math.min(hl, 7.0);
    }

    // PROGRAMADO: esperado_1 - esperado
    let prog = 0;
    if (esp && es1) prog = (es1 - esp) / 3600000;

    return { hb, interv, hl, he, hn, prog };
  }

  // ───────────────────────────────────────────────────────
  // PAGINAÇÃO COMPLETA
  // ───────────────────────────────────────────────────────
  async function buscarTodos(params = {}) {
    const todos = [];
    let offset  = 0;
    const LIMIT = 1000;
    let total   = null;

    log('Iniciando busca... params: ' + JSON.stringify(params), 'linfo');

    // Buscar datas
    const datas = params.datas || [];
    delete params.datas;

    const datasParaBuscar = datas.length > 0 ? datas : [params.data || DATA_PADRAO];

    for (const data of datasParaBuscar) {
      offset = 0;
      while (true) {
        const qs  = new URLSearchParams({ ...params, data, limit: LIMIT, offset });
        const res = await fetch(`${API_HORAS}?${qs}`);
        if (!res.ok) { log('Erro HTTP ' + res.status, 'lerro'); break; }
        const d = await res.json();
        const items = d.items || [];
        total = d.total || 0;
        todos.push(...items);
        log(`data=${data} | offset=${offset} | recebidos=${items.length} | total=${total} | acum=${todos.length}`, 'linfo');
        if (todos.length >= total || items.length === 0) break;
        offset += LIMIT;
      }
    }

    log(`✅ ${todos.length} registros carregados`, 'lok');
    return todos;
  }

  // ───────────────────────────────────────────────────────
  // GERAR LISTA DE DATAS ENTRE INICIO E FIM
  // ───────────────────────────────────────────────────────
  function gerarDatas(inicio, fim) {
    const datas = [];
    const d = new Date(inicio + 'T00:00:00');
    const f = new Date(fim    + 'T00:00:00');
    while (d <= f) {
      datas.push(d.toISOString().split('T')[0]);
      d.setDate(d.getDate() + 1);
    }
    return datas;
  }

  // ───────────────────────────────────────────────────────
  // CARREGAR FILTROS (GARAGEM / LOTE / LINHA)
  // ───────────────────────────────────────────────────────
  async function carregarFiltros() {
    log('Carregando filtros...', 'linfo');
    const r = await fetch(`${API_FILTROS}?limit=2000`);
    const d = await r.json();
    dadosFiltros = d.items || [];

    // Mapas de conversão linha → garagem/lote
    dadosFiltros.forEach(f => {
      const lin = normLinha(f.linha);  // "106A-10"
      if (f.gar)  mapaLinhaGar[lin]  = f.gar;
      if (f.lote) mapaLinhaLote[lin] = f.lote;
    });

    const gars  = [...new Set(dadosFiltros.map(f => f.gar ).filter(Boolean))].sort();
    const lotes = [...new Set(dadosFiltros.map(f => f.lote).filter(Boolean))].sort();

    preencheSelect('selGaragemH', gars,  'Todas as Garagens');
    preencheSelect('selLoteH',    lotes, 'Todos os Lotes');
    preencheSelect('selFuncaoH', ['motorista', 'cobrador'], 'Todas as Funções');

    log(`Filtros carregados: ${gars.length} garagens, ${lotes.length} lotes`, 'lok');
  }

  function preencheSelect(id, vals, label) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `<option value="">${label}</option>`;
    vals.forEach(v => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      el.appendChild(o);
    });
  }

  // ───────────────────────────────────────────────────────
  // RENDERIZAR DASHBOARD
  // ───────────────────────────────────────────────────────
  function renderDashboard(dados) {
    if (!dados || dados.length === 0) {
      log('Nenhum dado encontrado para os filtros selecionados.', 'lwarn');
      setEl('kpiTotalHoras', '0h 00m');
      setEl('kpiHoraNormal', '0h 00m');
      setEl('kpiHoraExtra',  '0h 00m');
      setEl('kpiProg',       '0h 00m');
      setEl('kpiMotoristas', '0');
      setEl('kpiCobradores', '0');
      setEl('kpiDobras',     '0');
      setEl('kpiTabelas',    '0');
      return;
    }

    // ── ACUMULADORES ──────────────────────────────────────
    let sumHL = 0, sumHE = 0, sumHN = 0, sumProg = 0;
    const motoristas = new Set();
    const cobradores = new Set();
    const tabelas    = new Set();
    let cntDobras = 0;

    // Agrupamentos para gráficos e tabelas
    const garM   = {};  // { G4: { hl, he, hn, prog, n } }
    const linhaM = {};  // { "106A-10": { hl, he, hn, prog, n, nMot, nCob, dobras } }
    const evoDia = {};  // { "2026-03-05": hl }

    dados.forEach(item => {
      const { hl, he, hn, prog } = calcJornada(item);
      const func  = (item.funcao || '').toLowerCase();
      const re    = (item.colaborador || '').trim();
      const lin   = normLinha(item.linha);
      const gar   = mapaLinhaGar[lin]  || (item.local || '').replace('Garagem ', 'G').replace('Garagem', 'G').trim() || 'Outros';
      const data  = (item.data || '').substring(0, 10);
      const isDob = (item.dobra || '').toLowerCase().includes('sim');

      sumHL   += hl;
      sumHE   += he;
      sumHN   += hn;
      sumProg += prog;
      if (isDob) cntDobras++;

      if (func === 'motorista') motoristas.add(re);
      else if (func === 'cobrador') cobradores.add(re);

      if (item.tabela) tabelas.add(item.tabela);

      // Por garagem
      if (!garM[gar]) garM[gar] = { hl: 0, he: 0, hn: 0, prog: 0, n: 0 };
      garM[gar].hl   += hl;
      garM[gar].he   += he;
      garM[gar].hn   += hn;
      garM[gar].prog += prog;
      garM[gar].n++;

      // Por linha
      if (lin) {
        if (!linhaM[lin]) linhaM[lin] = { hl: 0, he: 0, hn: 0, prog: 0, n: 0, nMot: 0, nCob: 0, dobras: 0, gar: gar };
        linhaM[lin].hl   += hl;
        linhaM[lin].he   += he;
        linhaM[lin].hn   += hn;
        linhaM[lin].prog += prog;
        linhaM[lin].n++;
        if (func === 'motorista') linhaM[lin].nMot++;
        if (func === 'cobrador')  linhaM[lin].nCob++;
        if (isDob) linhaM[lin].dobras++;
      }

      // Evolução por dia
      if (!evoDia[data]) evoDia[data] = 0;
      evoDia[data] += hl;
    });

    const pctCump = sumProg > 0 ? (sumHL / sumProg * 100) : 0;

    // ── KPIs ──────────────────────────────────────────────
    setEl('kpiTotalHoras', fmtHoras(sumHL));
    setEl('kpiHoraNormal', fmtHoras(sumHN));
    setEl('kpiHoraExtra',  fmtHoras(sumHE));
    setEl('kpiProg',       fmtHoras(sumProg));
    setEl('kpiCump',       pctCump.toFixed(1) + '%');
    setEl('kpiMotoristas', fmtNum(motoristas.size));
    setEl('kpiCobradores', fmtNum(cobradores.size));
    setEl('kpiDobras',     fmtNum(cntDobras));
    setEl('kpiTabelas',    fmtNum(tabelas.size));
    setEl('kpiTotal',      fmtNum(dados.length));

    // ── GRÁFICOS ───────────────────────────────────────────
    renderBarGaragem(garM);
    renderDonutFuncao(motoristas.size, cobradores.size, sumHN, sumHE);
    renderEvolucao(evoDia);
    renderRankLinhas(linhaM);

    // ── TABELA ─────────────────────────────────────────────
    renderTabela(linhaM);

    log(`Dashboard renderizado: ${dados.length} jornadas | HN:${fmtHoras(sumHN)} | HE:${fmtHoras(sumHE)} | Prog:${fmtHoras(sumProg)}`, 'lok');
  }

  // ───────────────────────────────────────────────────────
  // GRÁFICO 1 — BARRAS POR GARAGEM
  // ───────────────────────────────────────────────────────
  function renderBarGaragem(garM) {
    const el = document.getElementById('cBarGar');
    if (!el) return;
    if (chartBar) chartBar.destroy();

    const labels = Object.keys(garM).sort();
    const hlVals = labels.map(g => parseFloat(garM[g].hl.toFixed(1)));
    const heVals = labels.map(g => parseFloat(garM[g].he.toFixed(1)));
    const hnVals = labels.map(g => parseFloat(garM[g].hn.toFixed(1)));

    chartBar = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'H. Normal', data: hnVals, backgroundColor: '#3d7ef5', borderRadius: 4 },
          { label: 'H. Extra',  data: heVals, backgroundColor: '#f6a623', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#7a9cc8', boxWidth: 10, padding: 10, font: { size: 10 } } },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${fmtHoras(ctx.raw)}`
            }
          }
        },
        scales: {
          x: { stacked: false, ticks: { color: '#7a9cc8', font: { size: 10 } }, grid: { color: '#1a3560' } },
          y: { ticks: { color: '#7a9cc8', font: { size: 10 }, callback: v => v + 'h' }, grid: { color: '#1a3560' } }
        }
      }
    });
  }

  // ───────────────────────────────────────────────────────
  // GRÁFICO 2 — DONUT FUNÇÃO
  // ───────────────────────────────────────────────────────
  function renderDonutFuncao(nMot, nCob, sumHN, sumHE) {
    const el = document.getElementById('cDonut');
    if (!el) return;
    if (chartDonut) chartDonut.destroy();

    const total = nMot + nCob;
    const pMot  = total > 0 ? (nMot / total * 100).toFixed(1) : 0;
    const pCob  = total > 0 ? (nCob / total * 100).toFixed(1) : 0;

    // Legenda
    const leg = document.getElementById('legendDonut');
    if (leg) leg.innerHTML = `
      <div style="margin-bottom:6px;display:flex;align-items:center;gap:8px">
        <span style="width:12px;height:12px;background:#3d7ef5;border-radius:50%;display:inline-block"></span>
        <span>Motoristas: ${fmtNum(nMot)} (${pMot}%) — ${fmtHoras(sumHN)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="width:12px;height:12px;background:#19d46e;border-radius:50%;display:inline-block"></span>
        <span>Cobradores: ${fmtNum(nCob)} (${pCob}%) — ${fmtHoras(sumHE)}</span>
      </div>`;

    chartDonut = new Chart(el.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: [`Motoristas (${nMot})`, `Cobradores (${nCob})`],
        datasets: [{
          data: [nMot, nCob],
          backgroundColor: ['#3d7ef5', '#19d46e'],
          borderWidth: 0, hoverOffset: 6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${ctx.raw} operadores`
            }
          }
        }
      }
    });
  }

  // ───────────────────────────────────────────────────────
  // GRÁFICO 3 — EVOLUÇÃO POR DIA
  // ───────────────────────────────────────────────────────
  function renderEvolucao(evoDia) {
    const el = document.getElementById('cEvo');
    if (!el) return;
    if (chartEvo) chartEvo.destroy();

    const datas = Object.keys(evoDia).sort();
    const vals  = datas.map(d => parseFloat(evoDia[d].toFixed(1)));
    const labs  = datas.map(d => d.substring(5));  // "03-05"

    chartEvo = new Chart(el.getContext('2d'), {
      type: 'line',
      data: {
        labels: labs,
        datasets: [{
          label: 'Horas Realizadas',
          data: vals,
          borderColor: '#3d7ef5', backgroundColor: 'rgba(61,126,245,0.15)',
          borderWidth: 2, tension: 0.3, pointRadius: 3, fill: true
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#7a9cc8', font: { size: 9 } }, grid: { color: '#1a3560' } },
          y: { ticks: { color: '#7a9cc8', font: { size: 9 }, callback: v => v + 'h' }, grid: { color: '#1a3560' } }
        }
      }
    });
  }

  // ───────────────────────────────────────────────────────
  // GRÁFICO 4 — RANK LINHAS COM MAIS HORA EXTRA
  // ───────────────────────────────────────────────────────
  function renderRankLinhas(linhaM) {
    const el = document.getElementById('cRank');
    if (!el) return;
    if (chartRank) chartRank.destroy();

    const arr = Object.entries(linhaM)
      .map(([l, v]) => ({ l, he: v.he }))
      .filter(x => x.he > 0)
      .sort((a, b) => b.he - a.he)
      .slice(0, 8);

    chartRank = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: {
        labels: arr.map(x => x.l),
        datasets: [{
          label: 'Hora Extra',
          data: arr.map(x => parseFloat(x.he.toFixed(1))),
          backgroundColor: '#f6a623',
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#7a9cc8', font: { size: 9 }, callback: v => v + 'h' }, grid: { color: '#1a3560' } },
          y: { ticks: { color: '#c8dcff', font: { size: 9 } }, grid: { color: '#1a3560' } }
        }
      }
    });
  }

  // ───────────────────────────────────────────────────────
  // TABELA — 14 COLUNAS POR LINHA
  // ───────────────────────────────────────────────────────
  function renderTabela(linhaM) {
    const tbody = document.getElementById('tbLinhas');
    if (!tbody) return;

    const arr = Object.entries(linhaM)
      .map(([l, v]) => ({ l, ...v }))
      .sort((a, b) => b.hl - a.hl);

    let idx = 1;
    tbody.innerHTML = arr.map(x => {
      const pctReal  = x.prog > 0 ? (x.hl   / x.prog * 100).toFixed(1) : '—';
      const dif      = x.hl - x.prog;
      const corReal  = parseFloat(pctReal) >= 100 ? '#19d46e' : parseFloat(pctReal) >= 95 ? '#f6a623' : '#f65858';
      const corDif   = dif >= 0 ? '#19d46e' : '#f65858';
      const corHE    = x.he > 0 ? '#f6a623' : '#4a6d9c';
      const corDob   = x.dobras > 0 ? '#f65858' : '#4a6d9c';
      const lote     = mapaLinhaLote[x.l] || '—';
      return `<tr>
        <td style="color:#4a6d9c">${idx++}</td>
        <td style="text-align:left;color:#c8dcff;font-weight:700">${x.l}</td>
        <td style="color:#7a9cc8">${x.gar}</td>
        <td style="color:#7a9cc8">${lote}</td>
        <td style="color:#fff">${fmtHoras(x.prog)}</td>
        <td style="color:#fff">${fmtHoras(x.hl)}</td>
        <td style="color:${corReal};font-weight:700">${pctReal}%</td>
        <td style="color:#fff">${fmtHoras(x.hn)}</td>
        <td style="color:#fff">${fmtHoras(Math.min(x.prog, x.hl * (x.hn / (x.hl || 1))))}</td>
        <td style="color:${corDif};font-weight:700">${fmtHoras(dif)}</td>
        <td style="color:#fff">${fmtHoras(Math.max(x.prog - x.hn, 0))}</td>
        <td style="color:${corHE};font-weight:700">${fmtHoras(x.he)}</td>
        <td style="color:#fff">${x.n}</td>
        <td style="color:${corDob};font-weight:700">${x.dobras}</td>
        <td><button class="btn-ver" onclick="verLinha('${x.l}')">Ver</button></td>
      </tr>`;
    }).join('');
  }

  // ───────────────────────────────────────────────────────
  // MODAL LINHA
  // ───────────────────────────────────────────────────────
  window.verLinha = function(lin) {
    const recs = dadosAPI.filter(i => normLinha(i.linha) === lin);
    if (!recs.length) { alert('Sem dados para linha ' + lin); return; }

    let sumHL = 0, sumHE = 0, sumHN = 0, sumProg = 0;
    recs.forEach(i => {
      const { hl, he, hn, prog } = calcJornada(i);
      sumHL += hl; sumHE += he; sumHN += hn; sumProg += prog;
    });

    const tit = document.getElementById('modTit');
    const tbody = document.querySelector('#modal .tbl tbody');
    if (tit) tit.textContent = 'Linha ' + lin;

    if (tbody) {
      // Amostra dos operadores desta linha
      const ops = recs.slice(0, 20);
      tbody.innerHTML = ops.map(i => {
        const { hl, he, hn } = calcJornada(i);
        const corH = hl > 7 ? '#f6a623' : '#19d46e';
        return `<tr>
          <td>${(i.data || '').substring(0,10)}</td>
          <td><b>${i.colaborador}</b> — ${(i.nome_colaborador || '').split(' ').slice(0,2).join(' ')}</td>
          <td>${i.funcao || '—'}</td>
          <td style="color:${corH};font-weight:700">${fmtHoras(hl)}</td>
          <td style="color:#f6a623">${fmtHoras(he)}</td>
        </tr>`;
      }).join('');
    }

    const m = document.getElementById('modal');
    if (m) m.style.display = 'flex';
  };

  window.fecharModal = function() {
    const m = document.getElementById('modal');
    if (m) m.style.display = 'none';
  };

  // ───────────────────────────────────────────────────────
  // EXPORTAR EXCEL
  // ───────────────────────────────────────────────────────
  function exportarExcel() {
    if (!dadosAPI.length) { alert('Sem dados para exportar.'); return; }
    const linhas = [];
    linhas.push(['RE','Nome','Função','Linha','Garagem','Data','H.Bruta','Intervalo','H.Líquida','H.Normal','H.Extra','Programado','Extra?','Dobra?']);
    dadosAPI.forEach(i => {
      const { hb, interv, hl, he, hn, prog } = calcJornada(i);
      const lin = normLinha(i.linha);
      const gar = mapaLinhaGar[lin] || '—';
      linhas.push([
        i.colaborador, i.nome_colaborador, i.funcao, lin, gar,
        (i.data||'').substring(0,10),
        fmtHoras(hb), fmtHoras(interv), fmtHoras(hl),
        fmtHoras(hn), fmtHoras(he), fmtHoras(prog),
        i.extra, i.dobra
      ]);
    });

    const csv = linhas.map(r => r.map(c => '"'+(c||'').toString().replace(/"/g,'""')+'"').join(',')).join('\n');
    const bom  = '\uFEFF';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `horas_${new Date().toISOString().substring(0,10)}.csv`;
    a.click();
    log('Exportação concluída.', 'lok');
  }

  // ───────────────────────────────────────────────────────
  // EVENTO CONSULTAR
  // ───────────────────────────────────────────────────────
  const btnConsultar = document.getElementById('btnConsultarH');
  if (btnConsultar) {
    btnConsultar.addEventListener('click', async () => {
      const dtI    = document.getElementById('dataInicioH')?.value || DATA_PADRAO;
      const dtF    = document.getElementById('dataFimH')?.value    || dtI;
      const funcao = document.getElementById('selFuncaoH')?.value  || '';
      const gar    = document.getElementById('selGaragemH')?.value || '';
      const lote   = document.getElementById('selLoteH')?.value    || '';

      btnConsultar.textContent = '⏳ Carregando...';
      btnConsultar.disabled    = true;

      const params = {};
      if (funcao) params.funcao = funcao;

      // Gerar lista de datas
      const datas = gerarDatas(dtI, dtF);
      log(`Buscando ${datas.length} dia(s) de ${dtI} a ${dtF}`, 'linfo');

      dadosAPI = await buscarTodos({ ...params, datas });

      // Filtro client-side por garagem/lote
      let filtrado = dadosAPI;
      if (gar || lote) {
        const linhasFilt = new Set(
          dadosFiltros
            .filter(f => {
              if (gar  && f.gar  !== gar)  return false;
              if (lote && f.lote !== lote) return false;
              return true;
            })
            .map(f => normLinha(f.linha))
        );
        filtrado = dadosAPI.filter(i => linhasFilt.has(normLinha(i.linha)));
        log(`Filtro garagem/lote: ${filtrado.length} de ${dadosAPI.length} registros`, 'lwarn');
      }

      renderDashboard(filtrado);

      btnConsultar.textContent = 'Consultar';
      btnConsultar.disabled    = false;
    });
  }

  // Exportar
  const btnExcel = document.querySelector('.btn-excel');
  if (btnExcel) btnExcel.addEventListener('click', exportarExcel);

  // Fechar log
  const btnClrLog = document.getElementById('btnClrLogH');
  if (btnClrLog) btnClrLog.addEventListener('click', () => { if (logBox) logBox.innerHTML = ''; });

  // ───────────────────────────────────────────────────────
  // INICIALIZAÇÃO
  // ───────────────────────────────────────────────────────
  Chart.defaults.color       = '#7a9cc8';
  Chart.defaults.font.family = "'Inter','Segoe UI',sans-serif";
  Chart.defaults.font.size   = 10;

  try {
    await carregarFiltros();

    // Setar data padrão
    const elI = document.getElementById('dataInicioH');
    const elF = document.getElementById('dataFimH');
    if (elI) elI.value = DATA_PADRAO;
    if (elF) elF.value = DATA_PADRAO;

    dadosAPI = await buscarTodos({ datas: [DATA_PADRAO] });
    renderDashboard(dadosAPI);

  } catch (err) {
    log('Erro crítico: ' + err.message, 'lerro');
    console.error('[HORAS]', err);
  }

});

/**
 * MÓDULO HORAS — Portal Sambaíba v9.0
 *
 * REGRA CORRETA DE CÁLCULO (v9):
 *
 * Total Bruto = largada_considerada - pegada_considerada
 *
 * Refeição:
 * Total < 7h00 → 0
 * 7h00 ≤ Total < 8h00 → (Total - 7h00) ex: 7h45 → refeição = 0h45
 * Total ≥ 8h00 → 1h00
 *
 * Total Líquido = Total Bruto - Refeição
 *
 * Se extra="Sim" OU dobra="Sim":
 *   H.Normal = 0 | H.Extra = Total Líquido
 * Senão:
 *   H.Normal = min(Total Líquido, 7h00)
 *   H.Extra = max(0, Total Líquido - 7h00)
 *
 * API: limit=10000, busca paralela (8 req simultâneas)
 */
document.addEventListener('DOMContentLoaded', async () => {
  const API_HORAS   = 'https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_horas_nimer';
  const API_FILTROS = 'https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_linha_garagens';
  const API_HEADERS = { 'Authorization': 'Bearer ' + CONFIG.API_TOKEN };
  const DATA_PADRAO = '2026-03-05';
  const LIMIT = 5000;

  let dadosBrutos = [];
  let dadosFiltros = [];
  let mapaGar = {};
  let mapaLote = {};
  let dadosProcessados = [];
  let evoData = { dia: [], mes: [], ano: [] };
  let evoModo = 'dia';
  let heatData = [];
  let heatDias = [];
  let heatSortDir = { linha: 1, total: -1 };
  let sortState = {};
  let colabDados = [];
  let chartBar = null, chartDonut = null, chartEvo = null, chartRank = null, chartGarH = null, chartGarHE = null;
  let dadosAnoProcessados = null; // cache do ano inteiro (Jan→hoje)

  // Cache de dados brutos por dia — evita refetch
  const cacheDia = {};

  // Libera a thread para animações/UI não travarem
  function yieldToUI() { return new Promise(function(r) { setTimeout(r, 0); }); }

  // Busca ano inteiro UMA VEZ e alimenta garagens, heatmap e evolução
  async function carregarDadosAno() {
    const hoje = hojeISO();
    log('Carregando ano inteiro: 01/01/2026 → ' + hoje + '...', 'linfo');
    const brutos = await buscarAPI('2026-01-01', hoje, '', true);
    await yieldToUI();
    const comPegada = brutos.filter(function(item) {
      var p = item.pegada_considerada;
      return p && p !== 'NaN' && p !== 'nan' && p !== 'null' && p !== 'None';
    });
    // Processar em chunks para não travar a UI
    dadosAnoProcessados = [];
    var CHUNK = 2000;
    for (var i = 0; i < comPegada.length; i += CHUNK) {
      var slice = comPegada.slice(i, i + CHUNK);
      for (var j = 0; j < slice.length; j++) {
        dadosAnoProcessados.push(calcJornada(slice[j]));
      }
      if (i + CHUNK < comPegada.length) await yieldToUI();
    }
    log('Ano carregado: ' + dadosAnoProcessados.length + ' registros processados', 'lok');
    // Renderizar cada módulo com yield entre eles
    renderGaragens(dadosAnoProcessados);
    await yieldToUI();
    renderHeatmapFromData(dadosAnoProcessados);
    await yieldToUI();
    renderEvolucaoFromData(dadosAnoProcessados);
  }

  const $ = id => document.getElementById(id);
  const setEl = (id, v) => { const e = $(id); if (e) e.textContent = v; };

  function normLinha(l) {
    return (l || '').trim().replace(/^L\s+/i, '').replace(/\./g, '-').toUpperCase();
  }

  function extrairTabela(item) {
    return item.tabela || item.tb || item.linha_original || '';
  }

  function parseDt(s) {
    if (!s || s === 'nan' || s === 'NaN' || s === 'None' || s === 'null') return null;
    try { const d = new Date(String(s).substring(0, 19).replace(' ', 'T')); return isNaN(d) ? null : d; } catch { return null; }
  }

  // Diferença em horas entre duas datas
  function diffH(a, b) {
    if (!a || !b) return 0;
    return Math.max((b - a) / 3600000, 0);
  }

  function fmtH(h) {
    if (h === null || h === undefined || isNaN(h)) return '—';
    const neg = h < 0; h = Math.abs(h);
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return (neg ? '-' : '') + hh.toLocaleString('pt-BR') + 'h ' + String(mm).padStart(2, '0') + 'm';
  }

  function dBR(iso) {
    if (!iso || iso.length < 10) return iso || '';
    const [y, m, d] = iso.split('-');
    return d + '/' + m + '/' + y;
  }

  function hojeISO() {
    const d = new Date();
    d.setHours(d.getHours() - 3);
    return d.toISOString().split('T')[0];
  }

  function gerarDatas(ini, fim) {
    const arr = [], f = new Date(fim + 'T12:00:00');
    let d = new Date(ini + 'T12:00:00');
    while (d <= f) { arr.push(d.toISOString().split('T')[0]); d.setDate(d.getDate() + 1); }
    return arr;
  }

  function log(msg, tipo = 'linfo') {
    const box = $('logBox');
    if (!box) return;
    const span = document.createElement('span');
    span.className = tipo;
    span.textContent = '[' + new Date().toLocaleTimeString('pt-BR') + '] ' + msg;
    box.appendChild(span);
    box.scrollTop = box.scrollHeight;
    const st = $('apiStatusTxt');
    if (st) st.textContent = msg;
  }

  // ── CÁLCULO DE JORNADA (NOVA REGRA CORRETA) ──────────────────────────────
  function calcJornada(item) {
    const pg  = parseDt(item.pegada_considerada);
    const lg  = parseDt(item.largada_considerada);
    const esp = parseDt(item.esperado);
    const es1 = parseDt(item.esperado_1);
    const ttProg  = (esp && es1) ? diffH(esp, es1) : 0;
    const ttBruto = (pg && lg)   ? diffH(pg, lg)   : 0;

    // ── REFEIÇÃO ──────────────────────────────────────────────────────────
    // < 7h → 0 | 7h ≤ x < 8h → (x - 7h) | ≥ 8h → 1h
    let refeicao = 0;
    if (ttBruto >= 8) refeicao = 1;
    else if (ttBruto >= 7) refeicao = ttBruto - 7;
    // else < 7h → refeicao = 0

    const ttLiq = Math.max(ttBruto - refeicao, 0);

    // ── HE PROGRAMADA (mesma regra sobre ttProg) ──────────────────────────
    let refProg = 0;
    if (ttProg >= 8) refProg = 1;
    else if (ttProg >= 7) refProg = ttProg - 7;
    const ttLiqProg = Math.max(ttProg - refProg, 0);
    const hrNProg = Math.min(ttLiqProg, 7);
    const heProg  = Math.max(ttLiqProg - 7, 0);

    // ── HE / HR NORMAL REAL ────────────────────────────────────────────────
    const isDobra = (item.dobra || '').toLowerCase() === 'sim';
    const isExtra = (item.extra || '').toLowerCase() === 'sim';
    // extra=Sim → tabela extra (cálculo normal de HN/HE)
    // dobra=Sim → toda jornada líquida vira H.Extra
    let hrNReal = 0, heReal = 0;
    if (isDobra) {
      hrNReal = 0;
      heReal  = ttLiq;
    } else {
      hrNReal = Math.min(ttLiq, 7);
      heReal  = Math.max(ttLiq - 7, 0);
    }

    // Horas não realizadas (quando real < prog)
    const hnr  = ttProg > ttBruto ? ttProg - ttBruto : 0;
    const data = (item.pegada_considerada || item.data || '').substring(0, 10);

    return {
      ttProg, ttBruto, ttLiq, refeicao,
      heProg, heReal, hrNProg, hrNReal, hnr,
      isDobra, isExtra, data,
      tabela:      extrairTabela(item),
      colaborador: item.colaborador || item.re || '',
      nome:        item.nome_colaborador || item.nome || '',
      funcao:      (item.funcao || '').toLowerCase(),
      linha:       normLinha(item.linha),
      pegada:      item.pegada_considerada  || '',
      largada:     item.largada_considerada || '',
      rawItem:     item
    };
  }

  // ── BUSCAR API: limit=5000, PARALELO, COM CACHE ────────────────────────────
  async function buscarAPI(dtIni, dtFim, funcao, silencioso) {
    if (funcao === undefined) funcao = '';
    if (silencioso === undefined) silencioso = false;
    const datas = gerarDatas(dtIni, dtFim);

    // Separar dias já cacheados vs pendentes (cache só sem filtro de função)
    const usarCache = !funcao;
    const pendentes = usarCache ? datas.filter(d => !cacheDia[d]) : datas;
    const cacheados = usarCache ? datas.filter(d => cacheDia[d]) : [];

    if (!silencioso) {
      if (cacheados.length) log('Cache: ' + cacheados.length + ' dia(s) | API: ' + pendentes.length + ' dia(s)', 'linfo');
      else log('Buscando ' + datas.length + ' dia(s): ' + dtIni + ' -> ' + dtFim, 'linfo');
    }

    // Buscar apenas dias pendentes
    const todos = [];
    const BATCH = 10;
    for (let i = 0; i < pendentes.length; i += BATCH) {
      const lote = pendentes.slice(i, i + BATCH);
      const resultados = await Promise.all(lote.map(async function(data) {
        const diaTodos = [];
        let offset = 0;
        while (true) {
          let url = API_HORAS + '?data=' + data + '&limit=' + LIMIT + '&offset=' + offset;
          if (funcao) url += '&funcao=' + funcao;
          const r = await fetch(url, { headers: API_HEADERS });
          if (!r.ok) { if (!silencioso) log('HTTP ' + r.status + ' em ' + data, 'lwarn'); break; }
          const d = await r.json();
          const items = d.items || [];
          diaTodos.push(...items);
          const total = d.total || 0;
          if (items.length === 0 || offset + LIMIT >= total) break;
          offset += LIMIT;
        }
        // Guardar no cache (apenas sem filtro de função)
        if (usarCache) cacheDia[data] = diaTodos;
        return diaTodos;
      }));
      resultados.forEach(function(items) { todos.push(...items); });
      if (!silencioso) log('Carregando... ' + todos.length + ' registros (' + Math.min(i+BATCH,pendentes.length) + '/' + pendentes.length + ' dias)', 'linfo');
    }

    // Juntar com dados do cache
    cacheados.forEach(d => todos.push(...cacheDia[d]));

    if (!silencioso) log('✓ ' + todos.length + ' registros carregados', 'lok');
    return todos;
  }

  async function carregarFiltros() {
    try {
      const r = await fetch(API_FILTROS + '?limit=2000', { headers: API_HEADERS });
      const d = await r.json();
      dadosFiltros = d.items || [];
      mapaGar = {}; mapaLote = {};
      const gars = new Set(), lotes = new Set(), linhas = new Set();
      dadosFiltros.forEach(f => {
        const l = normLinha(f.linha);
        if (f.gar)  { mapaGar[l]  = f.gar;  gars.add(f.gar);   }
        if (f.lote) { mapaLote[l] = f.lote; lotes.add(f.lote); }
        linhas.add(l);
      });
      preencheSelect('selGaragem', [...gars].sort(),   'Todas');
      preencheSelect('selLote',    [...lotes].sort(),  'Todos');
      preencheSelect('selLinha',   [...linhas].sort(), 'Todas');
      log('Filtros: ' + gars.size + ' garagens | ' + lotes.size + ' lotes | ' + linhas.size + ' linhas', 'lok');
    } catch (e) {
      log('Erro filtros: ' + e.message, 'lerro');
    }
  }

  function preencheSelect(id, arr, label) {
    const el = $(id);
    if (!el) return;
    const val = el.value;
    el.innerHTML = '<option value="">' + label + '</option>' + arr.map(v => '<option value="' + v + '">' + v + '</option>').join('');
    if (val) el.value = val;
  }

  const inputLinha = $('inputLinha');
  const selLinha   = $('selLinha');

  if (inputLinha) {
    inputLinha.addEventListener('input', () => {
      const v = inputLinha.value.trim().toUpperCase();
      if (selLinha) selLinha.value = '';
      if (dadosFiltros.length) {
        const todas = [...new Set(dadosFiltros.map(f => normLinha(f.linha)).filter(Boolean))].sort();
        const matches = v ? todas.filter(l => l.includes(v)) : todas;
        preencheSelect('selLinha', matches, 'Todas');
      }
    });
  }

  if (selLinha) {
    selLinha.addEventListener('change', () => {
      if (selLinha.value && inputLinha) inputLinha.value = selLinha.value;
      else if (!selLinha.value && inputLinha) inputLinha.value = '';
      if (dadosProcessados.length) { const f = aplicarFiltros(dadosProcessados); renderizar(f); }
    });
  }

  function aplicarFiltros(processados) {
    const g    = $('selGaragem')?.value || '';
    const lo   = $('selLote')?.value    || '';
    const liTxt = ($('inputLinha')?.value || '').trim().toUpperCase();
    const liSel = $('selLinha')?.value  || '';
    const li   = liTxt || liSel;
    const fn   = $('selFuncao')?.value  || '';
    return processados.filter(p => {
      if (g  && (mapaGar[p.linha]  || '') !== g)  return false;
      if (lo && (mapaLote[p.linha] || '') !== lo)  return false;
      if (li && !p.linha.includes(li))             return false;
      if (fn && p.funcao !== fn.toLowerCase())     return false;
      return true;
    });
  }

  // ── RENDERIZAR DASHBOARD ────────────────────────────────────────────────
  function renderizar(dados) {
    if (!dados?.length) {
      ['kTtProg','kTtReal','kPctReal','kHeProg','kHeReal','kHnr'].forEach(id => setEl(id, '0h 00m'));
      return;
    }
    let sumProg=0, sumReal=0, sumLiq=0, sumRef=0, sumHN=0, sumHeProg=0, sumHeReal=0, sumHnr=0;
    dados.forEach(p => {
      sumProg   += p.ttProg;
      sumReal   += p.ttBruto;
      sumLiq    += p.ttLiq;
      sumRef    += p.refeicao;
      sumHN     += p.hrNReal;
      sumHeProg += p.heProg;
      sumHeReal += p.heReal;
      sumHnr    += p.hnr;
    });
    const pct   = sumProg > 0 ? (sumReal / sumProg * 100).toFixed(1) : 0;
    const difHe = sumHeReal - sumHeProg;
    setEl('kTtProg',   fmtH(sumProg));
    setEl('kTtReal',   fmtH(sumReal));
    setEl('kPctReal',  pct + '%');
    setEl('kPctSub',   'DIF: ' + (sumReal >= sumProg ? '+' : '') + fmtH(sumReal - sumProg));
    setEl('kHeProg',   fmtH(sumHeProg));
    setEl('kHeReal',   fmtH(sumHeReal));
    setEl('kHeRealSub','DIF: ' + (difHe >= 0 ? '+' : '') + fmtH(difHe));
    setEl('kHnr',      fmtH(sumHnr));
    renderColaboradores(dados);
    renderGraficoBarra(dados);
    renderDonutGaragem(dados);
    renderRanking(dados);
    renderDetalhamento(dados);
    if (dadosAnoProcessados) renderGaragens(dadosAnoProcessados);
    renderInsights(dados);
  }

  // ── ANÁLISE POR GARAGEM — GRÁFICOS MENSAIS (Jan→Atual) ──────────────
  function renderGaragens(proc) {
    try {
      const nomeMes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

      // Agrupar por mês + garagem
      var mesGar = {};
      var garFound = new Set();
      proc.forEach(function(p) {
        var mes = p.data.substring(0, 7);
        var g = mapaGar[p.linha] || 'Outras';
        garFound.add(g);
        if (!mesGar[mes]) mesGar[mes] = {};
        if (!mesGar[mes][g]) mesGar[mes][g] = { ttProg: 0, ttReal: 0, heProg: 0, heReal: 0 };
        mesGar[mes][g].ttProg += p.ttProg;
        mesGar[mes][g].ttReal += p.ttBruto;
        mesGar[mes][g].heProg += p.heProg;
        mesGar[mes][g].heReal += p.heReal;
      });

      var meses = Object.keys(mesGar).sort();
      var labels = meses.map(function(m) { var parts = m.split('-'); return nomeMes[+parts[1]-1] + '/' + parts[0].slice(2); });
      // Usar garagens encontradas nos dados (G1, G3, G4 se existirem)
      var garagens = ['G1', 'G3', 'G4'].filter(function(g) { return garFound.has(g); });
      if (!garagens.length) garagens = Array.from(garFound).filter(function(g) { return g !== 'Outras'; }).sort();
      log('Garagens encontradas: ' + Array.from(garFound).join(', ') + ' | Usando: ' + garagens.join(', '), 'linfo');
      var paletaP = ['rgba(147,197,253,0.7)', 'rgba(134,239,172,0.7)', 'rgba(253,230,138,0.7)', 'rgba(196,181,253,0.7)', 'rgba(252,165,165,0.7)'];
      var paletaR = ['#2563eb', '#16a34a', '#d97706', '#7c3aed', '#dc2626'];
      var coresP = {}, coresR = {};
      garagens.forEach(function(g, i) { coresP[g] = paletaP[i % paletaP.length]; coresR[g] = paletaR[i % paletaR.length]; });

      // ── Gráfico Total Horas (barras agrupadas, não empilhadas) ──
      function buildChart(canvasId, chartRef, datasetsConfig, titleY) {
        var el = $(canvasId);
        if (!el) return null;
        if (chartRef) chartRef.destroy();
        return new Chart(el.getContext('2d'), {
          type: 'bar',
          data: { labels: labels, datasets: datasetsConfig },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { position: 'top', labels: { color: '#475569', boxWidth: 10, font: { size: 9 } } },
              tooltip: {
                mode: 'index', intersect: false,
                callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + Number(ctx.parsed.y).toLocaleString('pt-BR') + 'h'; } }
              }
            },
            scales: {
              x: { grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { color: '#475569', font: { size: 10 } } },
              y: { grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { color: '#475569', callback: function(v) { return Number(v).toLocaleString('pt-BR') + 'h'; } },
                   title: { display: true, text: titleY, color: '#475569', font: { size: 9 } } }
            }
          }
        });
      }

      // Dataset: para cada garagem, 2 barras (Prog e Real) lado a lado
      var dsHoras = [];
      garagens.forEach(function(g) {
        dsHoras.push({
          label: g + ' Prog', data: meses.map(function(m) { return +((mesGar[m][g] || {}).ttProg || 0).toFixed(1); }),
          backgroundColor: coresP[g], borderRadius: 4, barPercentage: 0.8, categoryPercentage: 0.85
        });
        dsHoras.push({
          label: g + ' Real', data: meses.map(function(m) { return +((mesGar[m][g] || {}).ttReal || 0).toFixed(1); }),
          backgroundColor: coresR[g], borderRadius: 4, barPercentage: 0.8, categoryPercentage: 0.85
        });
      });

      chartGarH = buildChart('cGarHoras', chartGarH, dsHoras, 'Horas');

      // Dataset HE
      var dsHE = [];
      garagens.forEach(function(g) {
        dsHE.push({
          label: g + ' HE Prog', data: meses.map(function(m) { return +((mesGar[m][g] || {}).heProg || 0).toFixed(1); }),
          backgroundColor: coresP[g], borderRadius: 4, barPercentage: 0.8, categoryPercentage: 0.85
        });
        dsHE.push({
          label: g + ' HE Real', data: meses.map(function(m) { return +((mesGar[m][g] || {}).heReal || 0).toFixed(1); }),
          backgroundColor: coresR[g], borderRadius: 4, barPercentage: 0.8, categoryPercentage: 0.85
        });
      });

      chartGarHE = buildChart('cGarHE', chartGarHE, dsHE, 'Hora Extra');

      log('Garagens: ' + meses.length + ' meses | ' + proc.length + ' registros', 'lok');
    } catch (e) {
      log('Erro garagens: ' + e.message, 'lerro');
    }
  }

  // ── INSIGHTS OPERACIONAIS ──────────────────────────────────────────────
  function renderInsights(dados) {
    if (!dados?.length) return;
    const grid = $('insightsGrid');
    const ts = $('insightTimestamp');
    if (!grid) return;
    if (ts) ts.textContent = 'Atualizado: ' + new Date().toLocaleTimeString('pt-BR');

    // ── Cálculos ──
    let sumHeReal = 0, sumHeProg = 0, sumReal = 0, sumProg = 0, sumHnr = 0;
    let dobras = 0, jornadasAltas = [], semPegadaCount = 0;
    const linhaDesperdicio = {};
    const garDesperdicio = {};
    const colabHe = {};
    const diaHe = {};

    dados.forEach(p => {
      sumHeReal += p.heReal;
      sumHeProg += p.heProg;
      sumReal += p.ttBruto;
      sumProg += p.ttProg;
      sumHnr += p.hnr;
      if (p.isDobra) dobras++;
      if (p.ttBruto > 10) jornadasAltas.push(p);

      // Desperdício por linha (HE não programada)
      const heExcedente = Math.max(p.heReal - p.heProg, 0);
      if (!linhaDesperdicio[p.linha]) linhaDesperdicio[p.linha] = 0;
      linhaDesperdicio[p.linha] += heExcedente;

      // Desperdício por garagem
      const g = mapaGar[p.linha] || 'Outras';
      if (!garDesperdicio[g]) garDesperdicio[g] = 0;
      garDesperdicio[g] += heExcedente;

      // HE por colaborador
      if (!colabHe[p.colaborador]) colabHe[p.colaborador] = { nome: p.nome, funcao: p.funcao, he: 0 };
      colabHe[p.colaborador].he += p.heReal;

      // HE por dia
      if (!diaHe[p.data]) diaHe[p.data] = { heReal: 0, heProg: 0 };
      diaHe[p.data].heReal += p.heReal;
      diaHe[p.data].heProg += p.heProg;
    });

    const heExcedenteTotal = Math.max(sumHeReal - sumHeProg, 0);
    const topLinhas = Object.entries(linhaDesperdicio).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topColabs = Object.values(colabHe).sort((a, b) => b.he - a.he).slice(0, 5);
    const pioresDias = Object.entries(diaHe).sort((a, b) => (b[1].heReal - b[1].heProg) - (a[1].heReal - a[1].heProg)).slice(0, 5);
    const jornadasAltasTop = jornadasAltas.sort((a, b) => b.ttBruto - a.ttBruto).slice(0, 5);
    const topGar = Object.entries(garDesperdicio).sort((a, b) => b[1] - a[1]);

    // ── Construir cards ──
    let html = '';

    // 1. EXCEDENTE HE
    html += '<div class="insight-card ' + (heExcedenteTotal > 50 ? 'danger' : heExcedenteTotal > 20 ? 'warning' : 'success') + '">' +
      '<div class="insight-icon">&#9888;&#65039;</div>' +
      '<div class="insight-title">Hora Extra Excedente</div>' +
      '<div class="insight-value ' + (heExcedenteTotal > 50 ? 'red' : heExcedenteTotal > 20 ? 'orange' : 'green') + '">' + fmtH(heExcedenteTotal) + '</div>' +
      '<div class="insight-desc">Acima do programado. Representa ' + (sumHeProg > 0 ? ((heExcedenteTotal / sumHeProg) * 100).toFixed(1) : 0) + '% a mais do que o previsto.</div>' +
      '<ul class="insight-list">' +
      topGar.map(function(x) { return '<li><span class="il-name">' + x[0] + '</span><span class="il-val" style="color:var(--danger);">+' + fmtH(x[1]) + '</span></li>'; }).join('') +
      '</ul></div>';

    // 2. LINHAS COM MAIOR DESPERDÍCIO
    html += '<div class="insight-card warning">' +
      '<div class="insight-icon">&#128200;</div>' +
      '<div class="insight-title">Linhas com Maior Desperdicio</div>' +
      '<div class="insight-desc">HE realizada acima do programado por linha:</div>' +
      '<ul class="insight-list">' +
      topLinhas.map(function(x) { return '<li><span class="il-name">' + x[0] + '</span><span class="il-val" style="color:var(--warning);">+' + fmtH(x[1]) + '</span></li>'; }).join('') +
      '</ul></div>';

    // 3. COLABORADORES COM MAIS HE
    html += '<div class="insight-card danger">' +
      '<div class="insight-icon">&#128104;&#8205;&#128295;</div>' +
      '<div class="insight-title">Top 5 Colaboradores HE</div>' +
      '<div class="insight-desc">Maior acumulo de hora extra no periodo:</div>' +
      '<ul class="insight-list">' +
      topColabs.map(function(c) { return '<li><span class="il-name">' + (c.nome || '—') + '</span><span class="il-val" style="color:var(--danger);">' + fmtH(c.he) + '</span></li>'; }).join('') +
      '</ul></div>';

    // 4. JORNADAS ACIMA DE 10H
    html += '<div class="insight-card ' + (jornadasAltas.length > 20 ? 'danger' : jornadasAltas.length > 5 ? 'warning' : 'success') + '">' +
      '<div class="insight-icon">&#9200;</div>' +
      '<div class="insight-title">Jornadas Acima de 10h</div>' +
      '<div class="insight-value ' + (jornadasAltas.length > 20 ? 'red' : jornadasAltas.length > 5 ? 'orange' : 'green') + '">' + jornadasAltas.length + '</div>' +
      '<div class="insight-desc">registros com jornada bruta acima de 10 horas.</div>' +
      '<ul class="insight-list">' +
      jornadasAltasTop.map(function(p) {
        var dtParts = (p.data||'').split('-');
        var dtBR = dtParts.length===3 ? dtParts[2]+'/'+dtParts[1]+'/'+dtParts[0] : p.data;
        var peg = p.pegada ? p.pegada.substring(11,16) : '—';
        var lar = p.largada ? p.largada.substring(11,16) : '—';
        var tip = 'Data: ' + dtBR + '\nPegada: ' + peg + '\nLargada: ' + lar + '\nBruto: ' + fmtH(p.ttBruto) + '\nLinha: ' + p.linha + '\nFuncao: ' + (p.funcao||'—');
        return '<li>' +
          '<span class="il-name">' + (p.nome || p.colaborador) +
          ' <span title="' + tip + '" style="cursor:help;color:var(--warning);font-weight:800;font-size:13px;">&#9888;</span></span>' +
          '<span class="il-val" style="color:var(--danger);">' + fmtH(p.ttBruto) + '</span>' +
          '</li>';
      }).join('') +
      '</ul></div>';

    // 5. DOBRAS
    html += '<div class="insight-card ' + (dobras > 30 ? 'danger' : dobras > 10 ? 'warning' : 'info') + '">' +
      '<div class="insight-icon">&#128260;</div>' +
      '<div class="insight-title">Dobras no Periodo</div>' +
      '<div class="insight-value ' + (dobras > 30 ? 'red' : dobras > 10 ? 'orange' : 'blue') + '">' + dobras + '</div>' +
      '<div class="insight-desc">registros com dobra=Sim. Toda jornada liquida vira HE integral (' + fmtH(dados.filter(function(p){return p.isDobra;}).reduce(function(a,p){return a+p.heReal;},0)) + ' em HE de dobras).</div>' +
      '</div>';

    // 6. PIORES DIAS
    html += '<div class="insight-card warning">' +
      '<div class="insight-icon">&#128197;</div>' +
      '<div class="insight-title">Dias com Maior Excedente</div>' +
      '<div class="insight-desc">Dias onde a HE realizada mais ultrapassou a programada:</div>' +
      '<ul class="insight-list">' +
      pioresDias.map(function(x) {
        var dif = x[1].heReal - x[1].heProg;
        var dtParts = x[0].split('-');
        var dtBR = dtParts[2] + '/' + dtParts[1] + '/' + dtParts[0];
        return '<li><span class="il-name">' + dtBR + '</span><span class="il-val" style="color:' + (dif > 0 ? 'var(--danger)' : 'var(--success)') + ';">' + (dif >= 0 ? '+' : '') + fmtH(dif) + '</span></li>';
      }).join('') +
      '</ul></div>';

    grid.innerHTML = html;
  }

  // ── TABELA COLABORADORES ────────────────────────────────────────────────
  function renderColaboradores(dados) {
    const porDia = {};
    dados.forEach(p => {
      const key = p.colaborador + '|' + p.data;
      if (!porDia[key]) porDia[key] = {
        re: p.colaborador, nome: p.nome, funcao: p.funcao, data: p.data,
        ttBruto: 0, refeicao: 0, ttLiq: 0, hrNReal: 0, heReal: 0,
        temDobra: false, temExtra: false, registros: []
      };
      porDia[key].ttBruto  += p.ttBruto;
      porDia[key].refeicao += p.refeicao;
      porDia[key].ttLiq    += p.ttLiq;
      porDia[key].hrNReal  += p.hrNReal;
      porDia[key].heReal   += p.heReal;
      if (p.isDobra) porDia[key].temDobra = true;
      if (p.isExtra) porDia[key].temExtra = true;
      porDia[key].registros.push(p);
    });

    Object.values(porDia).forEach(d => {
      d.qtdDobra = d.registros.filter(r => r.isDobra).length;
      d.qtdExtra = d.registros.filter(r => r.isExtra).length;
    });

    const porColab = {};
    Object.values(porDia).forEach(d => {
      if (!porColab[d.re]) porColab[d.re] = {
        re: d.re, nome: d.nome, funcao: d.funcao,
        totalHN: 0, totalHe: 0, totalDobra: 0, totalExtra: 0, dias: []
      };
      porColab[d.re].totalHN     += d.hrNReal;
      porColab[d.re].totalHe     += d.heReal;
      porColab[d.re].totalDobra  += d.qtdDobra;
      porColab[d.re].totalExtra  += d.qtdExtra;
      porColab[d.re].dias.push(d);
    });

    colabDados = Object.values(porColab);
    // 1 linha por colaborador (totais do período)
    window._colabRows = colabDados.map(c => ({
      re: c.re, nome: c.nome, funcao: c.funcao,
      totalHN: c.totalHN, totalHe: c.totalHe,
      totalDobra: c.totalDobra, qtdDias: c.dias.length
    }));
    renderColabTabela(window._colabRows);
  }

  function renderColabTabela(rows) {
    const q = ($('searchColab')?.value || '').toLowerCase();
    const filtrados = q ? rows.filter(r =>
      r.re.toLowerCase().includes(q) || r.nome.toLowerCase().includes(q)
    ) : rows;
    const tb = $('tbColab');
    if (!tb) return;
    if (!filtrados.length) {
      tb.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:16px;">Nenhum resultado</td></tr>';
      return;
    }
    tb.innerHTML = filtrados.map(r => {
      const corHe = r.totalHe > 8 ? 'clr-r' : r.totalHe > 4 ? 'clr-o' : 'clr-g';
      return '<tr>' +
        '<td style="font-weight:700;">' + r.re + '</td>' +
        '<td>' + (r.nome || '—') + '</td>' +
        '<td style="text-transform:capitalize;color:var(--text-secondary);">' + (r.funcao || '—') + '</td>' +
        '<td>' + fmtH(r.totalHN) + '</td>' +
        '<td class="' + corHe + '">' + fmtH(r.totalHe) + '</td>' +
        '<td>' + r.totalDobra + '</td>' +
        '<td>' + r.qtdDias + '</td>' +
        '<td><button class="btn-ver" onclick="window.verColab(\'' + r.re + '\')">Ver</button></td>' +
        '</tr>';
    }).join('');
  }

  let _modalColabData = null; // para exportar

  window.verColab = function(re) {
    const c = colabDados.find(x => x.re === re);
    if (!c) return;
    _modalColabData = c;

    $('modalColabTitulo').textContent = 'RE ' + re + ' — ' + (c.nome || '');
    const resumo = $('modalColabResumo');
    if (resumo) resumo.textContent = 'H.Normal: ' + fmtH(c.totalHN) + '  |  H.Extra: ' + fmtH(c.totalHe) + '  |  Dobras: ' + c.totalDobra + '  |  Dias: ' + c.dias.length;

    const rows = [];
    let gtBruto=0, gtRef=0, gtHN=0, gtHE=0;

    c.dias.sort((a, b) => a.data.localeCompare(b.data));
    c.dias.forEach(d => {
      // Registros do dia
      d.registros.forEach(p => {
        rows.push('<tr>' +
          '<td>' + dBR(p.data) + '</td>' +
          '<td style="font-family:Consolas,monospace;color:var(--primary);">' + (p.tabela || '—') + '</td>' +
          '<td style="color:var(--text);font-weight:700;">' + p.linha + '</td>' +
          '<td style="text-transform:capitalize;color:var(--text-secondary);">' + (p.funcao || '—') + '</td>' +
          '<td style="font-family:monospace;">' + (p.pegada ? p.pegada.substring(11,16) : '—') + '</td>' +
          '<td style="font-family:monospace;">' + (p.largada ? p.largada.substring(11,16) : '—') + '</td>' +
          '<td>' + fmtH(p.ttBruto) + '</td>' +
          '<td style="color:var(--text-secondary);">' + fmtH(p.refeicao) + '</td>' +
          '<td>' + fmtH(p.hrNReal) + '</td>' +
          '<td class="' + (p.heReal > 0 ? 'clr-o' : '') + '">' + fmtH(p.heReal) + '</td>' +
          '<td style="color:' + (p.isExtra ? '#f6a623' : 'var(--muted)') + ';font-weight:' + (p.isExtra ? '800' : '400') + ';">' + (p.isExtra ? 'SIM' : 'Não') + '</td>' +
          '<td style="color:' + (p.isDobra ? '#a855f7' : 'var(--muted)') + ';font-weight:' + (p.isDobra ? '800' : '400') + ';">' + (p.isDobra ? 'SIM' : 'Não') + '</td>' +
          '</tr>');
      });
      // Subtotal do dia
      const corDia = d.heReal > 4 ? 'var(--danger)' : d.heReal > 0 ? 'var(--warning)' : 'var(--success)';
      rows.push('<tr style="background:var(--primary-soft);font-weight:700;">' +
        '<td colspan="6" style="text-align:right;color:var(--text-secondary);">TOTAL ' + dBR(d.data) + '</td>' +
        '<td>' + fmtH(d.ttBruto) + '</td>' +
        '<td>' + fmtH(d.refeicao) + '</td>' +
        '<td>' + fmtH(d.hrNReal) + '</td>' +
        '<td style="color:' + corDia + ';">' + fmtH(d.heReal) + '</td>' +
        '<td colspan="2" style="color:var(--text-secondary);font-size:10px;">' + d.registros.length + ' registro(s)</td>' +
        '</tr>');
      gtBruto += d.ttBruto; gtRef += d.refeicao; gtHN += d.hrNReal; gtHE += d.heReal;
    });

    // Total geral
    rows.push('<tr style="background:var(--primary);color:#fff;font-weight:800;">' +
      '<td colspan="6" style="text-align:right;">TOTAL GERAL (' + c.dias.length + ' dias)</td>' +
      '<td>' + fmtH(gtBruto) + '</td>' +
      '<td>' + fmtH(gtRef) + '</td>' +
      '<td>' + fmtH(gtHN) + '</td>' +
      '<td>' + fmtH(gtHE) + '</td>' +
      '<td colspan="2"></td>' +
      '</tr>');

    $('tbModalColab').innerHTML = rows.join('');
    $('modalColab').classList.add('open');
  };

  // Exportar modal colaborador
  $('btnExportColab')?.addEventListener('click', function() {
    const c = _modalColabData;
    if (!c) return;
    let csv = 'DATA;TABELA;LINHA;FUNCAO;PEGADA;LARGADA;BRUTO;REFEICAO;H.NORMAL;H.EXTRA;EXTRA;DOBRA\n';
    c.dias.forEach(d => {
      d.registros.forEach(p => {
        csv += dBR(p.data) + ';' + (p.tabela||'') + ';' + p.linha + ';' + (p.funcao||'') + ';' +
          (p.pegada ? p.pegada.substring(11,16) : '') + ';' + (p.largada ? p.largada.substring(11,16) : '') + ';' +
          p.ttBruto.toFixed(2) + ';' + p.refeicao.toFixed(2) + ';' + p.hrNReal.toFixed(2) + ';' + p.heReal.toFixed(2) + ';' +
          (p.isExtra ? 'SIM' : 'NAO') + ';' + (p.isDobra ? 'SIM' : 'NAO') + '\n';
      });
      // Subtotal dia
      csv += 'TOTAL ' + dBR(d.data) + ';;;;;;;;' + d.hrNReal.toFixed(2) + ';' + d.heReal.toFixed(2) + ';;\n';
    });
    csv += 'TOTAL GERAL;;;;;;;;' + c.totalHN.toFixed(2) + ';' + c.totalHe.toFixed(2) + ';;\n';
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF' + csv);
    a.download = 'colaborador_' + c.re + '_' + (c.nome||'').replace(/\s+/g,'_') + '.csv';
    a.click();
  });

  $('searchColab')?.addEventListener('input', () => renderColabTabela(window._colabRows || []));

  window.sortH = function(tabela, col) {
    const key = tabela + col;
    sortState[key] = (sortState[key] || 1) * -1;
    const dir = sortState[key];
    if (tabela === 'colab' && window._colabRows) {
      window._colabRows.sort((a, b) =>
        typeof a[col] === 'string' ? a[col].localeCompare(b[col]) * dir : ((a[col] || 0) - (b[col] || 0)) * dir
      );
      renderColabTabela(window._colabRows);
    }
    if (tabela === 'det' && window._detRows) {
      window._detRows.sort((a, b) =>
        typeof a[col] === 'string' ? a[col].localeCompare(b[col]) * dir : ((a[col] || 0) - (b[col] || 0)) * dir
      );
      renderDetTbody(window._detRows);
    }
  };

  // ── GRÁFICO BARRAS: PROG vs REAL ──────────────────────────────────────
  function renderGraficoBarra(dados) {
    const linhaM = {};
    dados.forEach(p => {
      if (!linhaM[p.linha]) linhaM[p.linha] = { prog: 0, real: 0 };
      linhaM[p.linha].prog += p.ttProg;
      linhaM[p.linha].real += p.ttBruto;
    });
    const tops  = Object.entries(linhaM).sort((a, b) => b[1].prog - a[1].prog).slice(0, 12);
    const labs  = tops.map(x => x[0]);
    const progs = tops.map(x => +x[1].prog.toFixed(1));
    const reais = tops.map(x => +x[1].real.toFixed(1));
    const difs  = tops.map(x => +(x[1].real - x[1].prog).toFixed(1));
    const el = $('cBarLinha');
    if (!el) return;
    if (chartBar) chartBar.destroy();
    chartBar = new Chart(el.getContext('2d'), {
      data: {
        labels: labs,
        datasets: [
          { type: 'bar',  label: 'Programado', data: progs, backgroundColor: '#3d7ef5', borderRadius: 3, yAxisID: 'y' },
          { type: 'bar',  label: 'Realizado',  data: reais, backgroundColor: '#19d46e', borderRadius: 3, yAxisID: 'y' },
          { type: 'line', label: 'Dif (Real-Prog)', data: difs, borderColor: '#f6a623', borderWidth: 2,
            pointRadius: 5, pointBackgroundColor: difs.map(v => v >= 0 ? '#19d46e' : '#f65858'),
            tension: 0.3, fill: false, yAxisID: 'y2' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: '#475569', boxWidth: 10, font: { size: 10 } } },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          x:  { grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { color: '#475569', font: { size: 9 } } },
          y:  { grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { color: '#475569', callback: v => Number(v).toLocaleString('pt-BR') + 'h' },
                title: { display: true, text: 'Horas', color: '#475569', font: { size: 9 } } },
          y2: { position: 'right', grid: { display: false },
                ticks: { color: '#f6a623', callback: v => (v >= 0 ? '+' : '') + v + 'h', font: { size: 9 } },
                title: { display: true, text: 'Diferença', color: '#f6a623', font: { size: 9 } } }
        }
      }
    });
  }

  // ── DONUT GARAGEM ──────────────────────────────────────────────────────
  function renderDonutGaragem(dados) {
    const garM = {};
    dados.forEach(p => {
      const g = mapaGar[p.linha] || 'Outras';
      garM[g] = (garM[g] || 0) + p.heReal;
    });
    const total = Object.values(garM).reduce((a, b) => a + b, 0);
    const labs  = Object.keys(garM).sort();
    const vals  = labs.map(g => +garM[g].toFixed(1));
    const cores = ['#3d7ef5','#19d46e','#f6a623','#a855f7','#f65858','#00d4ff'];
    const el = $('cDonutGar');
    if (!el) return;
    if (chartDonut) chartDonut.destroy();
    chartDonut = new Chart(el.getContext('2d'), {
      type: 'doughnut',
      data: { labels: labs, datasets: [{ data: vals, backgroundColor: cores, borderWidth: 0 }] },
      options: { cutout: '65%', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
    const tb = $('tbDonutGar');
    if (!tb) return;
    tb.innerHTML = labs.map((g, i) =>
      '<tr><td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + cores[i] + ';margin-right:6px;"></span>' + g + '</td>' +
      '<td style="color:var(--text);">' + fmtH(garM[g]) + '</td>' +
      '<td class="' + (total > 0 && garM[g]/total > 0.35 ? 'clr-o' : 'clr-g') + '">' + (total > 0 ? (garM[g]/total*100).toFixed(1) : 0) + '%</td></tr>'
    ).join('');
  }

  // ── HEATMAP (reutiliza cache, só busca dias faltantes) ──────────────────
  function renderHeatmapFromData(proc) {
    const ini = $('dataInicio')?.value || DATA_PADRAO;
    const [ano, mes] = ini.split('-');
    const primeiroDia = ano + '-' + mes + '-01';
    const ultimoDia   = new Date(+ano, +mes, 0).toISOString().split('T')[0];
    // Filtrar dados do mês
    const doMes = proc.filter(p => p.data >= primeiroDia && p.data <= ultimoDia);
    const filtrados = aplicarFiltros(doMes);
    const todosOsDias = gerarDatas(primeiroDia, ultimoDia);
    const linhaM = {};
    filtrados.forEach(p => {
      if (!linhaM[p.linha]) linhaM[p.linha] = { dias: {}, totalHe: 0 };
      linhaM[p.linha].dias[p.data] = (linhaM[p.linha].dias[p.data] || 0) + p.heReal;
      linhaM[p.linha].totalHe += p.heReal;
    });
    heatData = Object.entries(linhaM).map(([linha, v]) => ({ linha, dias: v.dias, totalHe: v.totalHe }));
    heatData.sort((a, b) => b.totalHe - a.totalHe);
    heatDias = todosOsDias;
    renderHeatmapTabela();
    log('Heatmap ' + mes + '/' + ano + ': ' + filtrados.length + ' registros', 'lok');
  }

  // Compatibilidade
  async function carregarHeatmap() { if (dadosAnoProcessados) renderHeatmapFromData(dadosAnoProcessados); }

  function renderHeatmapTabela() {
    const head = $('hmHead');
    const body = $('hmBody');
    if (!head || !body || !heatDias.length) return;
    head.innerHTML = '<tr><th class="lh">LINHA</th>' +
      heatDias.map(dt => '<th title="' + dBR(dt) + '">' + dt.substring(8) + '</th>').join('') +
      '<th>TOTAL</th></tr>';
    body.innerHTML = heatData.map(row => {
      const cells = heatDias.map(dt => {
        const v = row.dias[dt] || 0;
        let bg = 'transparent', color = 'rgba(255,255,255,0.12)';
        if (v > 0) {
          if (v > 40)       { bg = 'rgba(246,88,88,0.85)';  color = '#fff';     }
          else if (v > 10)  { bg = 'rgba(246,88,88,0.45)';  color = '#ffd0d0';  }
          else if (v > 5)   { bg = 'rgba(246,166,35,0.45)'; color = '#ffd26a';  }
          else              { bg = 'rgba(25,212,110,0.25)';  color = '#5fe394';  }
        }
        return '<td style="background:' + bg + ';color:' + color + '">' + (v > 0 ? fmtH(v) : '—') + '</td>';
      }).join('');
      return '<tr><td class="rh">' + row.linha + '</td>' + cells + '<td class="tot">' + fmtH(row.totalHe) + '</td></tr>';
    }).join('');
  }

  window.sortHeat = function(campo) {
    if (campo === 'total') {
      heatSortDir.total *= -1;
      heatData.sort((a, b) => (a.totalHe - b.totalHe) * heatSortDir.total);
    } else {
      heatSortDir.linha *= -1;
      heatData.sort((a, b) => a.linha.localeCompare(b.linha) * heatSortDir.linha);
    }
    renderHeatmapTabela();
  };

  // ── EVOLUÇÃO ──────────────────────────────────────────────────────────
  function renderEvolucaoFromData(proc) {
    const hoje = hojeISO();
    const diaM = {}, mesM = {}, anoM = {};
    proc.forEach(p => {
      if (!diaM[p.data]) diaM[p.data] = { heReal: 0, heProg: 0 };
      diaM[p.data].heReal += p.heReal;
      diaM[p.data].heProg += p.heProg;
    });
    Object.entries(diaM).forEach(([dt, v]) => {
      const mes = dt.substring(0, 7);
      if (!mesM[mes]) mesM[mes] = { heReal: 0, heProg: 0 };
      mesM[mes].heReal += v.heReal;
      mesM[mes].heProg += v.heProg;
    });
    Object.entries(diaM).forEach(([dt, v]) => {
      const ano = dt.substring(0, 4);
      if (!anoM[ano]) anoM[ano] = { heReal: 0, heProg: 0 };
      anoM[ano].heReal += v.heReal;
      anoM[ano].heProg += v.heProg;
    });
    const nomeMes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    evoData.dia = Object.entries(diaM).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v]) =>
      ({ lab: dBR(k), heReal: v.heReal, heProg: v.heProg, dif: v.heReal-v.heProg }));
    evoData.mes = Object.entries(mesM).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v]) => {
      const [y,m]=k.split('-');
      return { lab: nomeMes[+m-1]+'/'+y.slice(2), heReal: v.heReal, heProg: v.heProg, dif: v.heReal-v.heProg };
    });
    evoData.ano = Object.entries(anoM).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v]) =>
      ({ lab: k, heReal: v.heReal, heProg: v.heProg, dif: v.heReal-v.heProg }));
    log('Evolução: ' + Object.keys(diaM).length + ' dias | ' + Object.keys(mesM).length + ' meses', 'lok');
    renderEvo();
  }

  // Compatibilidade
  async function carregarEvolucao() { if (dadosAnoProcessados) renderEvolucaoFromData(dadosAnoProcessados); }

  function renderEvo() {
    const serie = evoData[evoModo];
    if (!serie?.length) return;
    const labs  = serie.map(x => x.lab);
    const reais = serie.map(x => +x.heReal.toFixed(1));
    const progs = serie.map(x => +x.heProg.toFixed(1));
    const difs  = serie.map(x => +x.dif.toFixed(1));
    const hoje  = dBR(hojeISO());
    setEl('evoSubtitle', {
      dia: '01/01/2026 → ' + hoje + ' — diário',
      mes: '01/01/2026 → ' + hoje + ' — mensal',
      ano: 'Visão anual'
    }[evoModo]);
    const el = $('cEvo');
    if (!el) return;
    if (chartEvo) chartEvo.destroy();
    chartEvo = new Chart(el.getContext('2d'), {
      data: {
        labels: labs,
        datasets: [
          { type: 'line', label: 'HE Realizada', data: reais, borderColor: '#19d46e',
            backgroundColor: 'rgba(25,212,110,0.08)', fill: true, tension: 0.3, pointRadius: 2, yAxisID: 'y' },
          { type: 'line', label: 'HE Programada', data: progs, borderColor: '#f6a623',
            borderDash: [5,5], fill: false, tension: 0.3, pointRadius: 2, yAxisID: 'y' },
          { type: 'bar', label: 'Diferença', data: difs,
            backgroundColor: difs.map(v => v >= 0 ? 'rgba(25,212,110,0.35)' : 'rgba(246,88,88,0.35)'),
            borderColor: difs.map(v => v >= 0 ? '#19d46e' : '#f65858'),
            borderWidth: 1, borderRadius: 2, yAxisID: 'y2' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: '#475569', boxWidth: 10, font: { size: 10 } } },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          x:  { grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { color: '#475569', font: { size: 9 }, maxRotation: 45, maxTicksLimit: 20 } },
          y:  { grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { color: '#475569', callback: v => Number(v).toLocaleString('pt-BR') + 'h' } },
          y2: { position: 'right', grid: { display: false },
                ticks: { color: '#f6a623', callback: v => (v >= 0 ? '+' : '') + v + 'h', font: { size: 9 } },
                title: { display: true, text: 'Diferença', color: '#f6a623', font: { size: 9 } } }
        }
      }
    });
  }

  window.mudarEvo = function(modo) {
    evoModo = modo;
    ['Dia','Mes','Ano'].forEach(m => {
      const b = $('btnEvo'+m);
      if (b) b.classList.toggle('active', m.toLowerCase() === modo);
    });
    renderEvo();
  };

  // ── RANKING ────────────────────────────────────────────────────────────
  function renderRanking(dados) {
    const linhaM = {};
    dados.forEach(p => { linhaM[p.linha] = (linhaM[p.linha] || 0) + p.heReal; });
    const tops = Object.entries(linhaM).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const el = $('cRankHe');
    if (!el) return;
    if (chartRank) chartRank.destroy();
    chartRank = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: {
        labels: tops.map(x => x[0]),
        datasets: [{ label: 'HE Real (h)', data: tops.map(x => +x[1].toFixed(1)), backgroundColor: '#f6a623', borderRadius: 4 }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { color: '#475569', callback: v => Number(v).toLocaleString('pt-BR') + 'h' } },
          y: { grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { color: '#475569', font: { size: 9 } } }
        }
      }
    });
  }

  // ── DETALHAMENTO ──────────────────────────────────────────────────────
  function renderDetalhamento(dados) {
    const linhaM = {};
    dados.forEach(p => {
      if (!linhaM[p.linha]) linhaM[p.linha] = {
        linha: p.linha, gar: mapaGar[p.linha]||'—', lote: mapaLote[p.linha]||'—',
        ttProg:0, ttReal:0, hrNProg:0, hrNReal:0, heProg:0, heReal:0, hnr:0, dobra:0, registros:[]
      };
      const r = linhaM[p.linha];
      r.ttProg  += p.ttProg;  r.ttReal  += p.ttBruto;
      r.hrNProg += p.hrNProg; r.hrNReal += p.hrNReal;
      r.heProg  += p.heProg;  r.heReal  += p.heReal;
      r.hnr     += p.hnr;
      if (p.isDobra) r.dobra++;
      r.registros.push(p);
    });
    window._detRows = Object.values(linhaM).map(r => ({
      ...r,
      pctReal: r.ttProg > 0 ? r.ttReal/r.ttProg*100 : 0,
      difN:  r.hrNReal - r.hrNProg,
      difHe: r.heReal  - r.heProg
    }));
    renderDetTbody(window._detRows);
  }

  function renderDetTbody(rows) {
    const tb = $('tbDet');
    if (!tb) return;
    tb.innerHTML = rows.map(r => {
      const pC  = r.pctReal >= 100 ? 'clr-g' : r.pctReal >= 90 ? 'clr-o' : 'clr-r';
      const dNC = r.difN  >= 0 ? 'clr-g' : 'clr-r';
      const dHC = r.difHe >= 0 ? 'clr-r' : 'clr-g';
      return '<tr><td style="font-weight:700;color:var(--text);">' + r.linha + '</td><td>' + r.gar + '</td><td>' + r.lote + '</td>' +
        '<td>' + fmtH(r.ttProg) + '</td><td>' + fmtH(r.ttReal) + '</td><td class="' + pC + '">' + r.pctReal.toFixed(1) + '%</td>' +
        '<td>' + fmtH(r.hrNProg) + '</td><td>' + fmtH(r.hrNReal) + '</td><td class="' + dNC + '">' + (r.difN>=0?'+':'') + fmtH(r.difN) + '</td>' +
        '<td>' + fmtH(r.heProg) + '</td><td>' + fmtH(r.heReal) + '</td><td class="' + dHC + '">' + (r.difHe>=0?'+':'') + fmtH(r.difHe) + '</td>' +
        '<td>' + r.dobra + '</td>' +
        '<td><button class="btn-ver" onclick="window.verLinha(\'' + r.linha + '\')">Ver</button></td></tr>';
    }).join('');
  }

  window.verLinha = function(linha) {
    const row = window._detRows?.find(r => r.linha === linha);
    if (!row) return;
    $('modalLinhaTitulo').textContent = 'Linha ' + linha + ' — Garagem: ' + row.gar + ' | Lote: ' + row.lote + ' | HE Real: ' + fmtH(row.heReal);
    const porDataTabela = {};
    row.registros.forEach(p => {
      const chave = p.data + '|' + (p.tabela || p.linha);
      if (!porDataTabela[chave]) porDataTabela[chave] = {
        data: p.data, tabela: p.tabela || '—', linha: p.linha,
        ttProg: 0, ttReal: 0, mot: 0, cob: 0
      };
      const r = porDataTabela[chave];
      r.ttProg += p.ttProg; r.ttReal += p.ttBruto;
      if (p.funcao === 'motorista') r.mot++;
      if (p.funcao === 'cobrador')  r.cob++;
    });
    const linhas = Object.values(porDataTabela).sort((a, b) => a.data.localeCompare(b.data) || a.tabela.localeCompare(b.tabela));
    $('tbModalLinha').innerHTML = linhas.map(v =>
      '<tr><td>' + dBR(v.data) + '</td>' +
      '<td style="font-family:Consolas,monospace;color:#6aadff;">' + v.tabela + '</td>' +
      '<td style="font-weight:700;color:var(--text);">' + v.linha + '</td>' +
      '<td>' + fmtH(v.ttProg) + '</td>' +
      '<td>' + fmtH(v.ttReal) + '</td>' +
      '<td>' + v.mot + '</td>' +
      '<td>' + v.cob + '</td></tr>'
    ).join('');
    $('modalLinha').classList.add('open');
  };

  // ── CONTROLES ────────────────────────────────────────────────────────
  $('btnTogLog')?.addEventListener('click', () => {
    const box = $('logBox');
    if (!box) return;
    const hidden = box.style.display === 'none';
    box.style.display = hidden ? 'block' : 'none';
    $('btnTogLog').textContent = hidden ? '👁 Ocultar Log' : '👁 Exibir Log';
  });

  $('btnLimparLog')?.addEventListener('click', () => {
    const b = $('logBox');
    if (b) b.innerHTML = '';
  });

  $('btnConectar')?.addEventListener('click', () => $('btnConsultar')?.click());

  const dIni = $('dataInicio');
  const dFim = $('dataFim');
  if (dIni) dIni.value = DATA_PADRAO;
  if (dFim) dFim.value = DATA_PADRAO;

  dIni?.addEventListener('change', () => {
    if (!dFim.value || dFim.value < dIni.value) dFim.value = dIni.value;
  });

  // Re-renderizar dashboard com dados já carregados (sem chamar API)
  function reRenderizar() {
    if (!dadosProcessados.length) return;
    const filtrados = aplicarFiltros(dadosProcessados);
    log('Filtro local: ' + filtrados.length + '/' + dadosProcessados.length + ' registros', 'linfo');
    renderizar(filtrados);
  }

  $('selGaragem')?.addEventListener('change', () => {
    const g    = $('selGaragem').value;
    const base = g ? dadosFiltros.filter(f => f.gar === g) : dadosFiltros;
    preencheSelect('selLote',  [...new Set(base.map(f=>f.lote).filter(Boolean))].sort(), 'Todos');
    preencheSelect('selLinha', [...new Set(base.map(f=>normLinha(f.linha)).filter(Boolean))].sort(), 'Todas');
    if (inputLinha) inputLinha.value = '';
    reRenderizar();
  });

  $('selLote')?.addEventListener('change', () => {
    const g  = ($('selGaragem')?.value || '');
    const lo = ($('selLote')?.value    || '');
    let base = dadosFiltros;
    if (g)  base = base.filter(f => f.gar  === g);
    if (lo) base = base.filter(f => f.lote === lo);
    preencheSelect('selLinha', [...new Set(base.map(f=>normLinha(f.linha)).filter(Boolean))].sort(), 'Todas');
    if (inputLinha) inputLinha.value = '';
    reRenderizar();
  });

  $('selFuncao')?.addEventListener('change', reRenderizar);

  // ── BOTÃO CONSULTAR ──────────────────────────────────────────────────
  $('btnConsultar')?.addEventListener('click', async () => {
    const ini  = $('dataInicio')?.value || DATA_PADRAO;
    const fim  = $('dataFim')?.value   || DATA_PADRAO;
    const func = $('selFuncao')?.value || '';
    const btn  = $('btnConsultar');
    const box  = $('logBox');
    if (box) box.style.display = 'block';
    const tog = $('btnTogLog');
    if (tog) tog.textContent = '👁 Ocultar Log';
    btn.textContent = '⏳ Carregando...';
    btn.disabled = true;
    try {
      log('CONSULTA: ' + ini + ' → ' + fim, 'linfo');
      dadosBrutos     = await buscarAPI(ini, fim, func);
      await yieldToUI();
      // Ignora registros sem pegada realizada (colaborador não veio)
      const comPegada  = dadosBrutos.filter(item => {
        const p = item.pegada_considerada;
        return p && p !== 'NaN' && p !== 'nan' && p !== 'null' && p !== 'None';
      });
      log('Filtrado: ' + comPegada.length + '/' + dadosBrutos.length + ' com pegada realizada', 'linfo');
      dadosProcessados = comPegada.map(item => calcJornada(item));
      await yieldToUI();
      const filtrados  = aplicarFiltros(dadosProcessados);
      renderizar(filtrados);
      const btnApi = $('btnConectar');
      if (btnApi) { btnApi.classList.add('ok'); btnApi.textContent = '✓ Conectado'; }
      log('Dashboard: ' + filtrados.length + ' registros', 'lok');
      // Buscar ano inteiro UMA VEZ e compartilhar entre garagens, heatmap e evolução
      carregarDadosAno();
    } catch (e) {
      log('ERRO: ' + e.message, 'lerro');
    } finally {
      btn.textContent = 'Consultar';
      btn.disabled = false;
    }
  });

  // ── EXPORTAR CSV ──────────────────────────────────────────────────────
  function exportarCSV() {
    const rows = window._detRows;
    if (!rows?.length) { alert('Consulte os dados primeiro.'); return; }
    let csv = 'Linha,Garagem,Lote,TT Prog,TT Real,% Real,HR N Prog,HR N Real,Dif N,HE Prog,HE Real,Dif HE,Dobra\n';
    rows.forEach(r => {
      csv += r.linha + ',' + r.gar + ',' + r.lote + ',' +
        r.ttProg.toFixed(2) + ',' + r.ttReal.toFixed(2) + ',' + r.pctReal.toFixed(1) + '%,' +
        r.hrNProg.toFixed(2) + ',' + r.hrNReal.toFixed(2) + ',' + r.difN.toFixed(2) + ',' +
        r.heProg.toFixed(2)  + ',' + r.heReal.toFixed(2)  + ',' + r.difHe.toFixed(2) + ',' +
        r.dobra + '\n';
    });
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF' + csv);
    a.download = 'horas_nimer_' + ($('dataInicio')?.value||'').replace(/-/g,'') + '.csv';
    a.click();
  }

  $('btnExportarExcel')?.addEventListener('click', exportarCSV);
  $('btnExportDet')?.addEventListener('click',     exportarCSV);

  document.querySelectorAll('.modal-bg').forEach(m =>
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); })
  );

  Chart.defaults.color       = '#475569';
  Chart.defaults.font.family = "'Segoe UI', sans-serif";
  Chart.defaults.font.size   = 10;

  try {
    await carregarFiltros();
    $('btnConsultar')?.click();
  } catch (e) {
    log('Erro na inicialização: ' + e.message, 'lerro');
  }
});

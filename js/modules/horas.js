/**
 * MÓDULO HORAS — Portal Sambaíba
 * Versão: 6.0 — COMPLETAMENTE REFEITO
 *
 * LÓGICA DE CÁLCULO:
 * - TT PROG     = esperado_1 - esperado
 * - TT REAL     = largada_considerada - pegada_considerada
 * - HE PROG     = se TT_PROG >= 8h → (TT_PROG - 7h = HE_PROG), senão 0
 *                 (desconta 1h refeição de tabelas >= 8h, ficam 7h normais)
 * - HE REAL     = se DOBRA=SIM ou EXTRA=SIM → toda TT_REAL é HE (exceto 1h refeição se >= 8h)
 *                 senão se TT_REAL >= 8h → HE = TT_REAL - 7h (desconta 1h refeição)
 *                 senão 0
 * - HNR         = quando programado mas não realizado (prog - real, quando real < prog)
 */

document.addEventListener('DOMContentLoaded', async () => {

  // ── CONSTANTES ──────────────────────────────────────────────────
  const API_HORAS   = 'https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_horas_nimer';
  const API_FILTROS = 'https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_linha_garagens';

  // ── ESTADO GLOBAL ───────────────────────────────────────────────
  let dadosBrutos   = [];   // todos os itens da API no período
  let dadosFiltros  = [];   // garagens/lotes/linhas
  let mapaGar       = {};   // linha → garagem
  let mapaLote      = {};   // linha → lote
  let dadosProcessados = []; // após calcular HE etc por item
  let evoData       = { dia: [], mes: [], ano: [] };
  let evoModo       = 'dia';
  let heatData      = [];   // { linha, dias:{}, totalHe }
  let heatSortDir   = { linha: 1, total: -1 };
  let colabSortDir  = {};
  let detSortDir    = {};
  let chartBar = null, chartDonut = null, chartEvo = null, chartRank = null;

  // ── UTILITÁRIOS ─────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const setEl = (id, v) => { const e = $(id); if (e) e.textContent = v; };

  function normLinha(l) {
    return (l || '').trim().replace(/^L\s+/i, '').replace(/\./g, '-').toUpperCase();
  }

  function parseDt(s) {
    if (!s || s === 'nan' || s === 'None' || s === 'null') return null;
    try { return new Date(String(s).substring(0, 19).replace(' ', 'T')); } catch { return null; }
  }

  function diffHoras(a, b) {
    if (!a || !b) return 0;
    return Math.max((b - a) / 3600000, 0);
  }

  function fmtH(h) {
    if (h === null || h === undefined || isNaN(h)) return '—';
    const neg = h < 0;
    h = Math.abs(h);
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return (neg ? '-' : '') + hh + 'h ' + String(mm).padStart(2, '0') + 'm';
  }

  function fmtPct(v, total) {
    if (!total) return '0%';
    return (v / total * 100).toFixed(1) + '%';
  }

  function dataStrBR(isoStr) {
    if (!isoStr) return '';
    const [y, m, d] = isoStr.split('-');
    return `${d}/${m}/${y}`;
  }

  function log(msg, tipo = 'linfo') {
    const box = $('logBox');
    if (!box) return;
    const span = document.createElement('span');
    span.className = tipo;
    span.textContent = `[${new Date().toLocaleTimeString('pt-BR')}] ${msg}`;
    box.appendChild(span);
    box.scrollTop = box.scrollHeight;
    $('apiStatusTxt').textContent = msg;
  }

  // ── CÁLCULO DE JORNADA ─────────────────────────────────────────
  function calcJornada(item) {
    const pg  = parseDt(item.pegada_considerada);
    const lg  = parseDt(item.largada_considerada);
    const esp = parseDt(item.esperado);
    const es1 = parseDt(item.esperado_1);

    const ttProg = (esp && es1) ? diffHoras(esp, es1) : 0;
    const ttReal = (pg && lg)   ? diffHoras(pg, lg)   : 0;

    // Hora extra PROGRAMADA
    // Se tabela >= 8h: desconta 1h refeição → 7h normais, resto é HE
    let heProg = 0;
    let hrNProg = 0;
    if (ttProg >= 8) {
      hrNProg = 7;
      heProg  = ttProg - 8; // 8h total - 1h refeição - 7h normal = HE
    } else {
      hrNProg = ttProg;
      heProg  = 0;
    }

    // Hora extra REALIZADA
    const isDobra = (item.dobra  || '').toLowerCase() === 'sim';
    const isExtra = (item.extra  || '').toLowerCase() === 'sim';
    let heReal = 0;
    let hrNReal = 0;
    let refeicao = 0;

    if (isDobra || isExtra) {
      // Toda a jornada é HE, descontando 1h refeição se >= 8h
      refeicao = ttReal >= 8 ? 1 : 0;
      heReal   = ttReal - refeicao;
      hrNReal  = 0;
    } else {
      if (ttReal >= 8) {
        refeicao = 1;
        hrNReal  = 7;
        heReal   = ttReal - 8; // desconta 7h normal + 1h refeição
      } else {
        hrNReal  = ttReal;
        heReal   = 0;
      }
    }

    // HNR = programado não realizado (quando real < prog)
    const hnr = ttReal < ttProg ? ttProg - ttReal : 0;

    const data = (item.pegada_considerada || item.data || '').substring(0, 10);
    const pg_hora = pg ? pg.getHours() : -1;

    return {
      ttProg, ttReal, heProg, heReal, hrNProg, hrNReal, hnr, refeicao,
      isDobra, isExtra, data, pg_hora,
      colaborador: item.colaborador || item.re || '',
      funcao: (item.funcao || '').toLowerCase(),
      linha: normLinha(item.linha),
      nome: item.nome_colaborador || item.nome || ''
    };
  }

  // ── BUSCAR API COM PAGINAÇÃO ────────────────────────────────────
  function gerarDatas(ini, fim) {
    const arr = [];
    let d = new Date(ini + 'T12:00:00');
    const f = new Date(fim + 'T12:00:00');
    while (d <= f) { arr.push(d.toISOString().split('T')[0]); d.setDate(d.getDate() + 1); }
    return arr;
  }

  async function buscarAPI(dtIni, dtFim, funcao) {
    const datas = gerarDatas(dtIni, dtFim);
    const todos = [];
    log(`Buscando ${datas.length} dia(s) de dados...`, 'linfo');

    for (const data of datas) {
      let offset = 0;
      let tentativas = 0;
      while (true) {
        try {
          let url = `${API_HORAS}?data=${data}&limit=1000&offset=${offset}`;
          if (funcao) url += `&funcao=${funcao}`;
          const res = await fetch(url);
          if (!res.ok) { log(`⚠ Erro HTTP ${res.status} em ${data}`, 'lwarn'); break; }
          const d = await res.json();
          const items = d.items || [];
          todos.push(...items);
          const total = d.total || 0;
          log(`✓ ${data}: ${items.length} registros (offset ${offset}, total ${total})`, 'lok');
          if (todos.length >= total || items.length === 0 || offset + 1000 >= total) break;
          offset += 1000;
        } catch (e) {
          tentativas++;
          log(`✗ Erro em ${data}: ${e.message}`, 'lerro');
          if (tentativas >= 2) break;
        }
      }
    }
    log(`✅ Total: ${todos.length} registros carregados`, 'lok');
    return todos;
  }

  // ── CARREGAR FILTROS (garagens/lotes/linhas) ────────────────────
  async function carregarFiltros() {
    try {
      const r = await fetch(`${API_FILTROS}?limit=2000`);
      const d = await r.json();
      dadosFiltros = d.items || [];
      mapaGar = {}; mapaLote = {};
      const gars = new Set(), lotes = new Set(), linhas = new Set();
      dadosFiltros.forEach(f => {
        const l = normLinha(f.linha);
        if (f.gar)  { mapaGar[l]  = f.gar;  gars.add(f.gar); }
        if (f.lote) { mapaLote[l] = f.lote; lotes.add(f.lote); }
        linhas.add(l);
      });
      preencheSelect('selGaragem', [...gars].sort(),   'Todas');
      preencheSelect('selLote',    [...lotes].sort(),  'Todos');
      preencheSelect('selLinha',   [...linhas].sort(), 'Todas');
      log(`Filtros carregados: ${gars.size} garagens, ${lotes.size} lotes, ${linhas.size} linhas`, 'lok');
    } catch (e) {
      log(`Erro ao carregar filtros: ${e.message}`, 'lerro');
    }
  }

  function preencheSelect(id, arr, label) {
    const el = $(id); if (!el) return;
    const val = el.value;
    el.innerHTML = `<option value="">${label}</option>` + arr.map(v => `<option value="${v}">${v}</option>`).join('');
    if (val) el.value = val;
  }

  // ── PROCESSAR DADOS ─────────────────────────────────────────────
  function processarDados(brutos) {
    return brutos.map(item => ({
      ...calcJornada(item),
      raw: item
    }));
  }

  // ── APLICAR FILTROS CLIENT-SIDE ─────────────────────────────────
  function aplicarFiltros(processados) {
    const g  = $('selGaragem')?.value || '';
    const lo = $('selLote')?.value    || '';
    const li = $('selLinha')?.value   || '';
    const fn = $('selFuncao')?.value  || '';

    return processados.filter(p => {
      const gar  = mapaGar[p.linha]  || '';
      const lote = mapaLote[p.linha] || '';
      if (g  && gar  !== g)  return false;
      if (lo && lote !== lo) return false;
      if (li && p.linha !== li) return false;
      if (fn && p.funcao !== fn.toLowerCase()) return false;
      return true;
    });
  }

  // ── RENDERIZAR DASHBOARD ────────────────────────────────────────
  function renderizar(dados) {
    if (!dados || dados.length === 0) {
      ['kTtProg','kTtReal','kPctReal','kHeProg','kHeReal','kHnr'].forEach(id => setEl(id, '0h 00m'));
      return;
    }

    // Totais
    let sumProg=0, sumReal=0, sumHeProg=0, sumHeReal=0, sumHnr=0, sumHrNReal=0;
    dados.forEach(p => {
      sumProg    += p.ttProg;
      sumReal    += p.ttReal;
      sumHeProg  += p.heProg;
      sumHeReal  += p.heReal;
      sumHnr     += p.hnr;
      sumHrNReal += p.hrNReal;
    });

    const pct = sumProg > 0 ? (sumReal / sumProg * 100).toFixed(1) : 0;
    const difHe = sumHeReal - sumHeProg;

    setEl('kTtProg',  fmtH(sumProg));
    setEl('kTtReal',  fmtH(sumReal));
    setEl('kPctReal', pct + '%');
    setEl('kPctSub',  sumProg > 0 ? `DIF: ${fmtH(sumReal - sumProg)}` : 'Meta: >= 95%');
    setEl('kHeProg',  fmtH(sumHeProg));
    setEl('kHeReal',  fmtH(sumHeReal));
    setEl('kHeRealSub', `DIF: ${difHe >= 0 ? '+' : ''}${fmtH(difHe)}`);
    setEl('kHnr',     fmtH(sumHnr));

    renderColaboradores(dados);
    renderGraficoBarra(dados);
    renderDonutGaragem(dados);
    renderHeatmap(dados);
    prepararEvo(dados);
    renderRanking(dados);
    renderDetalhamento(dados);
  }

  // ── TABELA COLABORADORES ────────────────────────────────────────
  let colabDados = [];

  function renderColaboradores(dados) {
    // Agrupa por colaborador + data
    const map = {};
    dados.forEach(p => {
      const key = p.colaborador + '|' + p.data;
      if (!map[key]) map[key] = { re: p.colaborador, nome: p.nome, data: p.data, heDia: 0, totalHe: 0, dobra: 0, detalhes: [] };
      map[key].heDia   += p.heReal;
      map[key].totalHe += p.heReal;
      if (p.isDobra) map[key].dobra++;
      map[key].detalhes.push(p);
    });

    // Agrupa totalHe por colaborador (soma de todos os dias)
    const porColab = {};
    Object.values(map).forEach(r => {
      if (!porColab[r.re]) porColab[r.re] = { re: r.re, nome: r.nome, totalHe: 0, dobra: 0, dias: [] };
      porColab[r.re].totalHe += r.heDia;
      porColab[r.re].dobra   += r.dobra;
      porColab[r.re].dias.push({ data: r.data, heDia: r.heDia, detalhes: r.detalhes });
    });

    colabDados = Object.values(porColab);

    // Renderiza com última data
    const rows = [];
    colabDados.forEach(c => {
      c.dias.sort((a,b) => a.data.localeCompare(b.data));
      c.dias.forEach(d => {
        rows.push({ re: c.re, nome: c.nome, data: d.data, heDia: d.heDia, totalHe: c.totalHe, dobra: c.dobra, dias: c.dias });
      });
    });

    window._colabRows = rows;
    renderColabTabela(rows);
  }

  function renderColabTabela(rows) {
    const q = ($('searchColab')?.value || '').toLowerCase();
    const filtrados = q ? rows.filter(r => r.re.toLowerCase().includes(q) || r.data.includes(q) || r.nome.toLowerCase().includes(q)) : rows;

    const tb = $('tbColab'); if (!tb) return;
    if (!filtrados.length) { tb.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:16px;">Nenhum resultado</td></tr>'; return; }

    tb.innerHTML = filtrados.map(r => {
      const cor = r.totalHe > 8 ? 'clr-r' : r.totalHe > 4 ? 'clr-o' : 'clr-g';
      return `<tr>
        <td>${dataStrBR(r.data)}</td>
        <td style="font-weight:700;">${r.re}</td>
        <td>${r.nome || '—'}</td>
        <td>${fmtH(r.heDia)}</td>
        <td class="${cor}">${fmtH(r.totalHe)}</td>
        <td>${r.dobra}</td>
        <td><button class="btn-ver" onclick="window.verColab('${r.re}')">Ver</button></td>
      </tr>`;
    }).join('');
  }

  window.verColab = function(re) {
    const colab = colabDados.find(c => c.re === re);
    if (!colab) return;
    $('modalColabTitulo').textContent = `RE ${re} — ${colab.nome || ''} | Total HE: ${fmtH(colab.totalHe)}`;
    const tb = $('tbModalColab');
    tb.innerHTML = colab.dias.flatMap(d => d.detalhes.map(p =>
      `<tr>
        <td>${dataStrBR(p.data)}</td>
        <td>${p.linha}</td>
        <td>${fmtH(p.ttProg)}</td>
        <td>${fmtH(p.ttReal)}</td>
        <td class="${p.heReal > 0 ? 'clr-o' : 'clr-g'}">${fmtH(p.heReal)}</td>
      </tr>`
    )).join('');
    $('modalColab').classList.add('open');
  };

  $('searchColab')?.addEventListener('input', () => renderColabTabela(window._colabRows || []));

  // ── SORTING GENÉRICO ────────────────────────────────────────────
  const sortState = {};
  window.sortH = function(tabela, col) {
    const key = tabela + col;
    sortState[key] = (sortState[key] || 1) * -1;
    const dir = sortState[key];

    if (tabela === 'colab') {
      window._colabRows?.sort((a, b) => {
        let va = a[col] ?? 0, vb = b[col] ?? 0;
        if (typeof va === 'string') return va.localeCompare(vb) * dir;
        return (va - vb) * dir;
      });
      renderColabTabela(window._colabRows || []);
    }
    if (tabela === 'det') {
      window._detRows?.sort((a, b) => {
        let va = a[col] ?? 0, vb = b[col] ?? 0;
        if (typeof va === 'string') return va.localeCompare(vb) * dir;
        return (va - vb) * dir;
      });
      renderDetTbody(window._detRows || []);
    }
  };

  // ── GRÁFICO BARRAS (PROG vs REAL por LINHA) ─────────────────────
  function renderGraficoBarra(dados) {
    const linhaM = {};
    dados.forEach(p => {
      if (!linhaM[p.linha]) linhaM[p.linha] = { prog: 0, real: 0 };
      linhaM[p.linha].prog += p.ttProg;
      linhaM[p.linha].real += p.ttReal;
    });
    const tops = Object.entries(linhaM).sort((a,b) => b[1].prog - a[1].prog).slice(0, 12);
    const labs  = tops.map(x => x[0]);
    const progs = tops.map(x => +x[1].prog.toFixed(1));
    const reais = tops.map(x => +x[1].real.toFixed(1));

    const el = $('cBarLinha'); if (!el) return;
    if (chartBar) chartBar.destroy();
    chartBar = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: {
        labels: labs,
        datasets: [
          { label: 'Programado', data: progs, backgroundColor: '#3d7ef5', borderRadius: 3 },
          { label: 'Realizado',  data: reais, backgroundColor: '#19d46e', borderRadius: 3 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: '#7a9cc8', boxWidth: 10, font: { size: 10 } } },
          datalabels: false
        },
        scales: {
          x: { grid: { color: '#1a3560' }, ticks: { color: '#7a9cc8', font: { size: 9 } } },
          y: { grid: { color: '#1a3560' }, ticks: { color: '#7a9cc8', callback: v => v + 'h' } }
        }
      }
    });
  }

  // ── DONUT GARAGEM ───────────────────────────────────────────────
  function renderDonutGaragem(dados) {
    const garM = {};
    dados.forEach(p => {
      const g = mapaGar[p.linha] || 'Outras';
      if (!garM[g]) garM[g] = 0;
      garM[g] += p.heReal;
    });
    const total = Object.values(garM).reduce((a,b) => a+b, 0);
    const labs  = Object.keys(garM).sort();
    const vals  = labs.map(g => +garM[g].toFixed(1));
    const cores = ['#3d7ef5','#19d46e','#f6a623','#a855f7','#f65858','#00d4ff'];

    const el = $('cDonutGar'); if (!el) return;
    if (chartDonut) chartDonut.destroy();
    chartDonut = new Chart(el.getContext('2d'), {
      type: 'doughnut',
      data: { labels: labs, datasets: [{ data: vals, backgroundColor: cores, borderWidth: 0 }] },
      options: { cutout: '65%', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    const tb = $('tbDonutGar'); if (!tb) return;
    tb.innerHTML = labs.map((g, i) => `
      <tr>
        <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${cores[i]};margin-right:6px;"></span>${g}</td>
        <td style="color:#fff;">${fmtH(garM[g])}</td>
        <td class="${garM[g]/total > 0.35 ? 'clr-o' : 'clr-g'}">${(garM[g]/total*100).toFixed(1)}%</td>
      </tr>`).join('');
  }

  // ── HEATMAP HE POR LINHA × DIA ──────────────────────────────────
  function renderHeatmap(dados) {
    // Descobrir todos os dias únicos
    const diasSet = new Set();
    dados.forEach(p => { if (p.data) diasSet.add(p.data); });
    const dias = [...diasSet].sort();

    // Agrupar por linha
    const linhaM = {};
    dados.forEach(p => {
      if (!linhaM[p.linha]) linhaM[p.linha] = { dias: {}, totalHe: 0 };
      if (!linhaM[p.linha].dias[p.data]) linhaM[p.linha].dias[p.data] = 0;
      linhaM[p.linha].dias[p.data] += p.heReal;
      linhaM[p.linha].totalHe      += p.heReal;
    });

    heatData = Object.entries(linhaM).map(([linha, v]) => ({ linha, dias: v.dias, totalHe: v.totalHe }));
    heatData.sort((a,b) => b.totalHe - a.totalHe);

    renderHeatmapTabela(dias);
  }

  function renderHeatmapTabela(dias) {
    if (!dias) return;
    window._heatDias = dias || window._heatDias || [];
    const d = window._heatDias;

    const head = $('hmHead'); const body = $('hmBody');
    if (!head || !body) return;

    // Cabeçalho com dias (formato DD)
    head.innerHTML = `<tr>
      <th class="lh">LINHA</th>
      ${d.map(dt => `<th>${dt.substring(8)}</th>`).join('')}
      <th>TOTAL</th>
    </tr>`;

    body.innerHTML = heatData.map(row => {
      const cells = d.map(dt => {
        const v = row.dias[dt] || 0;
        let bg = 'transparent', color = 'rgba(255,255,255,0.2)';
        if (v > 0) {
          if      (v > 40) { bg = 'rgba(246,88,88,0.85)';   color = '#fff'; }
          else if (v > 10) { bg = 'rgba(246,88,88,0.45)';   color = '#fff'; }
          else if (v > 5)  { bg = 'rgba(246,166,35,0.45)';  color = '#ffd26a'; }
          else             { bg = 'rgba(25,212,110,0.25)';  color = '#5fe394'; }
        }
        const lbl = v > 0 ? (v >= 1 ? fmtH(v) : v.toFixed(1)+'h') : '—';
        return `<td style="background:${bg};color:${color}">${lbl}</td>`;
      }).join('');
      return `<tr><td class="rh">${row.linha}</td>${cells}<td class="tot">${fmtH(row.totalHe)}</td></tr>`;
    }).join('');
  }

  window.sortHeat = function(campo) {
    if (campo === 'total') {
      heatSortDir.total *= -1;
      heatData.sort((a,b) => (a.totalHe - b.totalHe) * heatSortDir.total);
    } else {
      heatSortDir.linha *= -1;
      heatData.sort((a,b) => a.linha.localeCompare(b.linha) * heatSortDir.linha);
    }
    renderHeatmapTabela();
  };

  // ── EVOLUÇÃO HE ─────────────────────────────────────────────────
  function prepararEvo(dados) {
    // Por dia
    const diaM = {};
    dados.forEach(p => {
      if (!diaM[p.data]) diaM[p.data] = { heReal: 0, heProg: 0 };
      diaM[p.data].heReal += p.heReal;
      diaM[p.data].heProg += p.heProg;
    });

    // Por mês
    const mesM = {};
    Object.entries(diaM).forEach(([dt, v]) => {
      const mes = dt.substring(0, 7); // YYYY-MM
      if (!mesM[mes]) mesM[mes] = { heReal: 0, heProg: 0 };
      mesM[mes].heReal += v.heReal;
      mesM[mes].heProg += v.heProg;
    });

    // Por ano
    const anoM = {};
    Object.entries(diaM).forEach(([dt, v]) => {
      const ano = dt.substring(0, 4);
      if (!anoM[ano]) anoM[ano] = { heReal: 0, heProg: 0 };
      anoM[ano].heReal += v.heReal;
      anoM[ano].heProg += v.heProg;
    });

    evoData.dia = Object.entries(diaM).sort((a,b) => a[0].localeCompare(b[0])).map(([k,v]) => ({ lab: dataStrBR(k), heReal: v.heReal, heProg: v.heProg }));
    evoData.mes = Object.entries(mesM).sort((a,b) => a[0].localeCompare(b[0])).map(([k,v]) => {
      const [y,m] = k.split('-');
      const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
      return { lab: meses[+m-1]+'/'+y.slice(2), heReal: v.heReal, heProg: v.heProg };
    });
    evoData.ano = Object.entries(anoM).sort((a,b) => a[0].localeCompare(b[0])).map(([k,v]) => ({ lab: k, heReal: v.heReal, heProg: v.heProg }));

    renderEvo();
  }

  function renderEvo() {
    const serie = evoData[evoModo];
    if (!serie?.length) return;
    const labs   = serie.map(x => x.lab);
    const reais  = serie.map(x => +x.heReal.toFixed(1));
    const progs  = serie.map(x => +x.heProg.toFixed(1));

    // Subtitle
    const subtitles = { dia: `Período filtrado — ${labs[0] || ''} a ${labs[labs.length-1] || ''}`, mes: 'Visão Mensal', ano: 'Visão Anual' };
    setEl('evoSubtitle', subtitles[evoModo]);

    const el = $('cEvo'); if (!el) return;
    if (chartEvo) chartEvo.destroy();
    chartEvo = new Chart(el.getContext('2d'), {
      type: 'line',
      data: {
        labels: labs,
        datasets: [
          { label: 'HE Realizada', data: reais, borderColor: '#19d46e', backgroundColor: 'rgba(25,212,110,0.1)', fill: true, tension: 0.3, pointRadius: 3 },
          { label: 'HE Programada', data: progs, borderColor: '#f6a623', borderDash: [5,5], fill: false, tension: 0.3, pointRadius: 3 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: '#7a9cc8', boxWidth: 10, font: { size: 10 } } }
        },
        scales: {
          x: { grid: { color: '#1a3560' }, ticks: { color: '#7a9cc8', font: { size: 9 }, maxRotation: 45 } },
          y: { grid: { color: '#1a3560' }, ticks: { color: '#7a9cc8', callback: v => v+'h' } }
        }
      }
    });
  }

  window.mudarEvo = function(modo) {
    evoModo = modo;
    ['Dia','Mes','Ano'].forEach(m => {
      const b = $('btnEvo' + m);
      if (b) b.classList.toggle('active', m.toLowerCase() === modo);
    });
    renderEvo();
  };

  // ── RANKING LINHAS COM MAIS HE ──────────────────────────────────
  function renderRanking(dados) {
    const linhaM = {};
    dados.forEach(p => {
      if (!linhaM[p.linha]) linhaM[p.linha] = 0;
      linhaM[p.linha] += p.heReal;
    });
    const tops = Object.entries(linhaM).sort((a,b) => b[1]-a[1]).slice(0,10);

    const el = $('cRankHe'); if (!el) return;
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
          x: { grid: { color: '#1a3560' }, ticks: { color: '#7a9cc8', callback: v => v+'h' } },
          y: { grid: { color: '#1a3560' }, ticks: { color: '#c8dcff', font: { size: 9 } } }
        }
      }
    });
  }

  // ── DETALHAMENTO 14 COLUNAS ─────────────────────────────────────
  function renderDetalhamento(dados) {
    const linhaM = {};
    dados.forEach(p => {
      const gar  = mapaGar[p.linha]  || '—';
      const lote = mapaLote[p.linha] || '—';
      if (!linhaM[p.linha]) linhaM[p.linha] = { linha: p.linha, gar, lote, ttProg: 0, ttReal: 0, hrNProg: 0, hrNReal: 0, heProg: 0, heReal: 0, hnr: 0, dobra: 0, registros: [] };
      linhaM[p.linha].ttProg   += p.ttProg;
      linhaM[p.linha].ttReal   += p.ttReal;
      linhaM[p.linha].hrNProg  += p.hrNProg;
      linhaM[p.linha].hrNReal  += p.hrNReal;
      linhaM[p.linha].heProg   += p.heProg;
      linhaM[p.linha].heReal   += p.heReal;
      linhaM[p.linha].hnr      += p.hnr;
      if (p.isDobra) linhaM[p.linha].dobra++;
      linhaM[p.linha].registros.push(p);
    });

    window._detRows = Object.values(linhaM).map(r => ({
      ...r,
      pctReal: r.ttProg > 0 ? r.ttReal / r.ttProg * 100 : 0,
      difN:    r.hrNReal - r.hrNProg,
      difHe:   r.heReal  - r.heProg
    }));

    renderDetTbody(window._detRows);
  }

  function renderDetTbody(rows) {
    const tb = $('tbDet'); if (!tb) return;
    tb.innerHTML = rows.map(r => {
      const pct   = r.pctReal.toFixed(1);
      const pCor  = r.pctReal >= 100 ? 'clr-g' : r.pctReal >= 90 ? 'clr-o' : 'clr-r';
      const difNCor = r.difN >= 0 ? 'clr-g' : 'clr-r';
      const difHCor = r.difHe >= 0 ? 'clr-r' : 'clr-g';
      return `<tr>
        <td style="font-weight:700;color:#c8dcff;">${r.linha}</td>
        <td>${r.gar}</td>
        <td>${r.lote}</td>
        <td>${fmtH(r.ttProg)}</td>
        <td>${fmtH(r.ttReal)}</td>
        <td class="${pCor}">${pct}%</td>
        <td>${fmtH(r.hrNProg)}</td>
        <td>${fmtH(r.hrNReal)}</td>
        <td class="${difNCor}">${r.difN>=0?'+':''}${fmtH(r.difN)}</td>
        <td>${fmtH(r.heProg)}</td>
        <td>${fmtH(r.heReal)}</td>
        <td class="${difHCor}">${r.difHe>=0?'+':''}${fmtH(r.difHe)}</td>
        <td>${r.dobra}</td>
        <td><button class="btn-ver" onclick="window.verLinha('${r.linha}')">Ver</button></td>
      </tr>`;
    }).join('');
  }

  window.verLinha = function(linha) {
    const row = window._detRows?.find(r => r.linha === linha);
    if (!row) return;
    $('modalLinhaTitulo').textContent = `Linha ${linha} | HE Real: ${fmtH(row.heReal)}`;

    // Agrupar por data
    const porData = {};
    row.registros.forEach(p => {
      if (!porData[p.data]) porData[p.data] = { ttProg:0, ttReal:0, mot:0, cob:0 };
      porData[p.data].ttProg += p.ttProg;
      porData[p.data].ttReal += p.ttReal;
      if (p.funcao === 'motorista') porData[p.data].mot++;
      if (p.funcao === 'cobrador')  porData[p.data].cob++;
    });

    $('tbModalLinha').innerHTML = Object.entries(porData).sort((a,b) => a[0].localeCompare(b[0])).map(([dt, v]) => `
      <tr>
        <td>${dataStrBR(dt)}</td>
        <td>${linha}</td>
        <td>${fmtH(v.ttProg)}</td>
        <td>${fmtH(v.ttReal)}</td>
        <td>${v.mot}</td>
        <td>${v.cob}</td>
      </tr>`).join('');

    $('modalLinha').classList.add('open');
  };

  // ── LOG / API PANEL ─────────────────────────────────────────────
  $('btnTogLog')?.addEventListener('click', () => {
    const box = $('logBox');
    if (!box) return;
    const hidden = box.style.display === 'none';
    box.style.display = hidden ? 'block' : 'none';
    $('btnTogLog').textContent = hidden ? '👁 Ocultar Log' : '👁 Exibir Log';
  });
  $('btnLimparLog')?.addEventListener('click', () => { const b = $('logBox'); if (b) b.innerHTML = ''; });

  // ── DATAS: preencher hoje e sincronizar ─────────────────────────
  function hoje() {
    const d = new Date();
    d.setHours(d.getHours() - 3);
    return d.toISOString().split('T')[0];
  }

  const DATA_PADRAO = '2026-03-05';
  const dIni = $('dataInicio');
  const dFim = $('dataFim');
  if (dIni) dIni.value = DATA_PADRAO;
  if (dFim) dFim.value = DATA_PADRAO;

  // Sincroniza: ao mudar início, copia para fim se vazio ou anterior
  dIni?.addEventListener('change', () => {
    if (!dFim.value || dFim.value < dIni.value) dFim.value = dIni.value;
  });

  // ── CASCATA GARAGEM → LOTE → LINHA ──────────────────────────────
  $('selGaragem')?.addEventListener('change', () => {
    const g = $('selGaragem').value;
    const base = g ? dadosFiltros.filter(f => f.gar === g) : dadosFiltros;
    const lotes  = [...new Set(base.map(f => f.lote).filter(Boolean))].sort();
    const linhas = [...new Set(base.map(f => normLinha(f.linha)).filter(Boolean))].sort();
    preencheSelect('selLote',  lotes,  'Todos');
    preencheSelect('selLinha', linhas, 'Todas');
  });
  $('selLote')?.addEventListener('change', () => {
    const g  = $('selGaragem').value;
    const lo = $('selLote').value;
    let base = dadosFiltros;
    if (g)  base = base.filter(f => f.gar  === g);
    if (lo) base = base.filter(f => f.lote === lo);
    const linhas = [...new Set(base.map(f => normLinha(f.linha)).filter(Boolean))].sort();
    preencheSelect('selLinha', linhas, 'Todas');
  });

  // ── BOTÃO CONSULTAR ─────────────────────────────────────────────
  $('btnConsultar')?.addEventListener('click', async () => {
    const ini  = $('dataInicio')?.value || DATA_PADRAO;
    const fim  = $('dataFim')?.value    || DATA_PADRAO;
    const func = $('selFuncao')?.value  || '';
    const btn  = $('btnConsultar');

    // Exibir log automaticamente
    const box = $('logBox');
    if (box) box.style.display = 'block';
    $('btnTogLog').textContent = '👁 Ocultar Log';

    btn.textContent = '⏳ Carregando...';
    btn.disabled = true;

    try {
      log(`Iniciando busca: ${ini} → ${fim}${func ? ' | Função: '+func : ''}`, 'linfo');
      dadosBrutos = await buscarAPI(ini, fim, func);
      dadosProcessados = processarDados(dadosBrutos);
      const filtrados  = aplicarFiltros(dadosProcessados);
      renderizar(filtrados);
      log(`✅ Dashboard atualizado com ${filtrados.length} registros`, 'lok');
      const btnApi = $('btnConectar');
      if (btnApi) { btnApi.classList.add('ok'); btnApi.textContent = '✓ Conectado'; }
    } catch (e) {
      log(`ERRO FATAL: ${e.message}`, 'lerro');
    } finally {
      btn.textContent = 'Consultar';
      btn.disabled = false;
    }
  });

  // Botão conectar API (força consulta com dados atuais)
  $('btnConectar')?.addEventListener('click', () => $('btnConsultar')?.click());

  // ── EXPORTAR EXCEL BÁSICO (CSV) ─────────────────────────────────
  $('btnExportarExcel')?.addEventListener('click', () => {
    const rows = window._detRows;
    if (!rows?.length) { alert('Consulte os dados primeiro.'); return; }
    let csv = 'Linha,Garagem,Lote,TT Prog (h),TT Real (h),% Real,HR N Prog,HR N Real,Dif N,HE Prog,HE Real,Dif HE,Dobra\n';
    rows.forEach(r => {
      csv += `${r.linha},${r.gar},${r.lote},${r.ttProg.toFixed(2)},${r.ttReal.toFixed(2)},${r.pctReal.toFixed(1)}%,${r.hrNProg.toFixed(2)},${r.hrNReal.toFixed(2)},${r.difN.toFixed(2)},${r.heProg.toFixed(2)},${r.heReal.toFixed(2)},${r.difHe.toFixed(2)},${r.dobra}\n`;
    });
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF' + csv);
    a.download = 'horas_nimer.csv';
    a.click();
  });

  $('btnExportDet')?.addEventListener('click', () => $('btnExportarExcel')?.click());

  // Fechar modais clicando fora
  document.querySelectorAll('.modal-bg').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
  });

  // ── INICIALIZAÇÃO ────────────────────────────────────────────────
  Chart.defaults.color       = '#7a9cc8';
  Chart.defaults.font.family = "'Segoe UI', sans-serif";
  Chart.defaults.font.size   = 10;

  try {
    await carregarFiltros();
    // Boot automático com data padrão
    $('btnConsultar')?.click();
  } catch (e) {
    log(`Erro na inicialização: ${e.message}`, 'lerro');
  }

});

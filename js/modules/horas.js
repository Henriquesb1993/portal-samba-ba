/**
 * MÃDULO HORAS â Portal SambaÃ­ba v9.0
 *
 * REGRA CORRETA DE CÃLCULO (v9):
 *
 *  Total Bruto = largada_considerada - pegada_considerada
 *
 *  RefeiÃ§Ã£o:
 *    Total < 7h00  â 0
 *    7h00 â¤ Total < 8h00 â (Total - 7h00)   ex: 7h45 â refeiÃ§Ã£o = 0h45
 *    Total â¥ 8h00  â 1h00
 *
 *  Total LÃ­quido = Total Bruto - RefeiÃ§Ã£o
 *
 *  Se extra="Sim" OU dobra="Sim":
 *    H.Normal = 0  |  H.Extra = Total LÃ­quido
 *  SenÃ£o:
 *    H.Normal = min(Total LÃ­quido, 7h00)
 *    H.Extra  = max(0, Total LÃ­quido - 7h00)
 *
 *  API: limit=10000, busca paralela (8 req simultÃ¢neas)
 */

document.addEventListener('DOMContentLoaded', async () => {

  const API_HORAS   = 'https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_horas_nimer';
  const API_FILTROS = 'https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_linha_garagens';
  const API_HEADERS = { 'Authorization': 'Bearer ' + CONFIG.API_TOKEN };
  const DATA_PADRAO = '2026-03-05';
  const LIMIT       = 5000;

  let dadosBrutos      = [];
  let dadosFiltros     = [];
  let mapaGar          = {};
  let mapaLote         = {};
  let dadosProcessados = [];
  let evoData          = { dia: [], mes: [], ano: [] };
  let evoModo          = 'dia';
  let heatData         = [];
  let heatDias         = [];
  let heatSortDir      = { linha: 1, total: -1 };
  let sortState        = {};
  let colabDados       = [];
  let chartBar = null, chartDonut = null, chartEvo = null, chartRank = null;

  const $     = id => document.getElementById(id);
  const setEl = (id, v) => { const e = $(id); if (e) e.textContent = v; };

  function normLinha(l) {
    return (l || '').trim().replace(/^L\s+/i, '').replace(/\./g, '-').toUpperCase();
  }

  function extrairTabela(item) {
    return item.tabela || item.tb || item.linha_original || '';
  }

  function parseDt(s) {
    if (!s || s === 'nan' || s === 'None' || s === 'null') return null;
    try { return new Date(String(s).substring(0, 19).replace(' ', 'T')); } catch { return null; }
  }

  // DiferenÃ§a em horas entre duas datas
  function diffH(a, b) {
    if (!a || !b) return 0;
    return Math.max((b - a) / 3600000, 0);
  }

  function fmtH(h) {
    if (h === null || h === undefined || isNaN(h)) return 'â';
    const neg = h < 0; h = Math.abs(h);
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return (neg ? '-' : '') + hh + 'h ' + String(mm).padStart(2, '0') + 'm';
  }

  function dBR(iso) {
    if (!iso || iso.length < 10) return iso || '';
    const [y, m, d] = iso.split('-');
    return d + '/' + m + '/' + y;
  }

  function hojeISO() {
    const d = new Date(); d.setHours(d.getHours() - 3);
    return d.toISOString().split('T')[0];
  }

  function gerarDatas(ini, fim) {
    const arr = [], f = new Date(fim + 'T12:00:00');
    let d = new Date(ini + 'T12:00:00');
    while (d <= f) { arr.push(d.toISOString().split('T')[0]); d.setDate(d.getDate() + 1); }
    return arr;
  }

  function log(msg, tipo = 'linfo') {
    const box = $('logBox'); if (!box) return;
    const span = document.createElement('span');
    span.className = tipo;
    span.textContent = '[' + new Date().toLocaleTimeString('pt-BR') + '] ' + msg;
    box.appendChild(span);
    box.scrollTop = box.scrollHeight;
    const st = $('apiStatusTxt'); if (st) st.textContent = msg;
  }

  // ââ CÃLCULO DE JORNADA (NOVA REGRA CORRETA) âââââââââââââââââââââ
  function calcJornada(item) {
    const pg  = parseDt(item.pegada_considerada);
    const lg  = parseDt(item.largada_considerada);
    const esp = parseDt(item.esperado);
    const es1 = parseDt(item.esperado_1);

    const ttProg = (esp && es1) ? diffH(esp, es1) : 0;
    const ttBruto = (pg && lg) ? diffH(pg, lg) : 0;

    // ââ REFEIÃÃO ââââââââââââââââââââââââââââââââââââââââââââââââââ
    // < 7h â 0 | 7h â¤ x < 8h â (x - 7h) | â¥ 8h â 1h
    let refeicao = 0;
    if (ttBruto >= 8)      refeicao = 1;
    else if (ttBruto >= 7) refeicao = ttBruto - 7;
    // else < 7h â refeicao = 0

    const ttLiq = Math.max(ttBruto - refeicao, 0);

    // ââ HE PROGRAMADA (mesma regra sobre ttProg) ââââââââââââââââââ
    let refProg = 0;
    if (ttProg >= 8)      refProg = 1;
    else if (ttProg >= 7) refProg = ttProg - 7;
    const ttLiqProg = Math.max(ttProg - refProg, 0);
    const hrNProg   = Math.min(ttLiqProg, 7);
    const heProg    = Math.max(ttLiqProg - 7, 0);

    // ââ HE / HR NORMAL REAL ââââââââââââââââââââââââââââââââââââââââ
    const isDobra = (item.dobra || '').toLowerCase() === 'sim';
    const isExtra = (item.extra || '').toLowerCase() === 'sim';
    let hrNReal = 0, heReal = 0;

    if (isDobra || isExtra) {
      // Toda jornada lÃ­quida Ã© H.Extra
      hrNReal = 0;
      heReal  = ttLiq;
    } else {
      hrNReal = Math.min(ttLiq, 7);
      heReal  = Math.max(ttLiq - 7, 0);
    }

    // Horas nÃ£o realizadas (quando real < prog)
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
      pegada:      item.pegada_considerada || '',
      largada:     item.largada_considerada || '',
      rawItem:     item
    };
  }

  // ââ BUSCAR API: limit=10000, PARALELO ââââââââââââââââââââââââââââ
  async function buscarAPI(dtIni, dtFim, funcao = '', silencioso = false) {
    if (!silencioso) log('Conectando Ã  API...', 'linfo');

    // 1. Primeira pÃ¡gina para saber o total
    let url0 = API_HORAS + '?limit=' + LIMIT + '&offset=0&data_inicio=' + dtIni + '&data_fim=' + dtFim;
    if (funcao) url0 += '&funcao=' + funcao;
    const r0 = await fetch(url0, { headers: API_HEADERS });
    if (!r0.ok) throw new Error('HTTP ' + r0.status);
    const d0 = await r0.json();
    const items0 = d0.items || d0 || [];
    const total  = d0.total || 0;

    if (!silencioso) log('Carregando... ' + items0.length + (total ? ' / ' + total : '') + ' registros', 'linfo');
    if (!total || items0.length >= total) {
      if (!silencioso) log('\u2713 ' + items0.length + ' registros carregados', 'lok');
      return items0;
    }

    // 2. Offsets restantes em paralelo (lotes de 8)
    const offsets = [];
    for (let off = LIMIT; off < total; off += LIMIT) offsets.push(off);
    const BATCH = 8;
    const todos = [...items0];

    for (let i = 0; i < offsets.length; i += BATCH) {
      const lote = offsets.slice(i, i + BATCH);
      const resultados = await Promise.all(lote.map(async off => {
        let url = API_HORAS + '?limit=' + LIMIT + '&offset=' + off + '&data_inicio=' + dtIni + '&data_fim=' + dtFim;
        if (funcao) url += '&funcao=' + funcao;
        const r = await fetch(url, { headers: API_HEADERS });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        return d.items || d || [];
      }));
      resultados.forEach(items => todos.push(...items));
      if (!silencioso) log('Carregando... ' + todos.length + ' / ' + total + ' registros', 'linfo');
    }

    if (!silencioso) log('\u2713 ' + todos.length + ' registros carregados', 'lok');
    return todos;
  }

  // ââ CARREGAR FILTROS ââââââââââââââââââââââââââââââââââââââââââââââ
  async function carregarFiltros() {
    try {
      const r = await fetch(API_FILTROS + '?limit=2000', { headers: API_HEADERS });
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
      log('Filtros: ' + gars.size + ' garagens | ' + lotes.size + ' lotes | ' + linhas.size + ' linhas', 'lok');
    } catch (e) { log('Erro filtros: ' + e.message, 'lerro'); }
  }

  function preencheSelect(id, arr, label) {
    const el = $(id); if (!el) return;
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
      if (lo && (mapaLote[p.linha] || '') !== lo) return false;
      if (li && !p.linha.includes(li))             return false;
      if (fn && p.funcao !== fn.toLowerCase())     return false;
      return true;
    });
  }

  // ââ RENDERIZAR DASHBOARD ââââââââââââââââââââââââââââââââââââââââââ
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

    setEl('kTtProg',    fmtH(sumProg));
    setEl('kTtReal',    fmtH(sumReal));
    setEl('kPctReal',   pct + '%');
    setEl('kPctSub',    'DIF: ' + (sumReal >= sumProg ? '+' : '') + fmtH(sumReal - sumProg));
    setEl('kHeProg',    fmtH(sumHeProg));
    setEl('kHeReal',    fmtH(sumHeReal));
    setEl('kHeRealSub', 'DIF: ' + (difHe >= 0 ? '+' : '') + fmtH(difHe));
    setEl('kHnr',       fmtH(sumHnr));

    renderColaboradores(dados);
    renderGraficoBarra(dados);
    renderDonutGaragem(dados);
    renderRanking(dados);
    renderDetalhamento(dados);
  }

  // ââ TABELA COLABORADORES ââââââââââââââââââââââââââââââââââââââââââ
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
      porColab[d.re].totalHN    += d.hrNReal;
      porColab[d.re].totalHe    += d.heReal;
      porColab[d.re].totalDobra += d.qtdDobra;
      porColab[d.re].totalExtra += d.qtdExtra;
      porColab[d.re].dias.push(d);
    });

    colabDados = Object.values(porColab);
    window._colabRows = [];

    colabDados.forEach(c => {
      c.dias.sort((a, b) => a.data.localeCompare(b.data));
      c.dias.forEach(d => {
        window._colabRows.push({
          re: c.re, nome: c.nome, funcao: c.funcao,
          data: d.data,
          ttDia:    d.ttBruto,
          refDia:   d.refeicao,
          hnDia:    d.hrNReal,
          heDia:    d.heReal,
          totalHN:  c.totalHN,
          totalHe:  c.totalHe,
          dobra:    c.totalDobra,
          extra:    c.totalExtra,
          registros: d.registros
        });
      });
    });

    renderColabTabela(window._colabRows);
  }

  function renderColabTabela(rows) {
    const q = ($('searchColab')?.value || '').toLowerCase();
    const filtrados = q ? rows.filter(r =>
      r.re.toLowerCase().includes(q) ||
      r.nome.toLowerCase().includes(q) ||
      r.data.includes(q)
    ) : rows;
    const tb = $('tbColab'); if (!tb) return;
    if (!filtrados.length) {
      tb.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:16px;">Nenhum resultado</td></tr>';
      return;
    }
    tb.innerHTML = filtrados.map(r => {
      const corHe  = r.heDia  > 4 ? 'clr-r' : r.heDia  > 0 ? 'clr-o' : '';
      const corTHe = r.totalHe > 8 ? 'clr-r' : r.totalHe > 4 ? 'clr-o' : 'clr-g';
      return '<tr>' +
        '<td>' + dBR(r.data) + '</td>' +
        '<td style="font-weight:700;">' + r.re + '</td>' +
        '<td>' + (r.nome || 'â') + '</td>' +
        '<td style="text-transform:capitalize;color:#7a9cc8;">' + (r.funcao || 'â') + '</td>' +
        '<td style="color:#c8dcff;">' + fmtH(r.ttDia) + '</td>' +
        '<td style="color:#7a9cc8;">' + fmtH(r.refDia) + '</td>' +
        '<td>' + fmtH(r.hnDia) + '</td>' +
        '<td class="' + corHe + '">' + fmtH(r.heDia) + '</td>' +
        '<td class="' + corTHe + '">' + fmtH(r.totalHe) + '</td>' +
        '<td><button class="btn-ver" onclick="window.verColab(\'' + r.re + '\')">Ver</button></td>' +
        '</tr>';
    }).join('');
  }

  // Atualiza cabeÃ§alho da tabela colaboradores
  (function atualizaCabecalho() {
    const thead = document.querySelector('#tbColab')?.closest('table')?.querySelector('thead tr');
    if (!thead) return;
    thead.innerHTML =
      '<th onclick="window.sortH(\'colab\',\'data\')">DATA â</th>' +
      '<th onclick="window.sortH(\'colab\',\'re\')">RE â</th>' +
      '<th onclick="window.sortH(\'colab\',\'nome\')">NOME â</th>' +
      '<th onclick="window.sortH(\'colab\',\'funcao\')">FUNÃÃO â</th>' +
      '<th onclick="window.sortH(\'colab\',\'ttDia\')">TOTAL BRUTO â</th>' +
      '<th onclick="window.sortH(\'colab\',\'refDia\')">REFEIÃÃO â</th>' +
      '<th onclick="window.sortH(\'colab\',\'hnDia\')">H.NORMAL â</th>' +
      '<th onclick="window.sortH(\'colab\',\'heDia\')">H.EXTRA DIA â</th>' +
      '<th onclick="window.sortH(\'colab\',\'totalHe\')">TOTAL HE PERÃODO â</th>' +
      '<th>AÃÃO</th>';
  })();

  window.verColab = function(re) {
    const c = colabDados.find(x => x.re === re); if (!c) return;
    $('modalColabTitulo').textContent = 'RE ' + re + ' â ' + (c.nome || '') + ' | H.Normal: ' + fmtH(c.totalHN) + ' | Total HE: ' + fmtH(c.totalHe);
    // Atualiza cabeÃ§alho do modal
    const thead = $('tbModalColab')?.previousElementSibling;
    if (thead) {
      thead.innerHTML = '<tr>' +
        '<th>DATA</th><th>TABELA</th><th>LINHA</th><th>FUNÃÃO</th>' +
        '<th>PEGADA</th><th>LARGADA</th>' +
        '<th>TOTAL BRUTO</th><th>REFEIÃÃO</th><th>H.NORMAL</th><th>H.EXTRA</th>' +
        '<th>EXTRA?</th><th>DOBRA?</th>' +
        '</tr>';
    }
    $('tbModalColab').innerHTML = c.dias.flatMap(d =>
      d.registros.map(p => {
        const corHe = p.heReal > 0 ? 'clr-o' : '';
        return '<tr>' +
          '<td>' + dBR(p.data) + '</td>' +
          '<td style="font-family:Consolas,monospace;color:#6aadff;">' + (p.tabela || 'â') + '</td>' +
          '<td style="color:#c8dcff;font-weight:700;">' + p.linha + '</td>' +
          '<td style="text-transform:capitalize;color:#7a9cc8;">' + (p.funcao || 'â') + '</td>' +
          '<td style="font-family:monospace;">' + (p.pegada ? p.pegada.substring(11,16) : 'â') + '</td>' +
          '<td style="font-family:monospace;">' + (p.largada ? p.largada.substring(11,16) : 'â') + '</td>' +
          '<td>' + fmtH(p.ttBruto) + '</td>' +
          '<td style="color:#7a9cc8;">' + fmtH(p.refeicao) + '</td>' +
          '<td>' + fmtH(p.hrNReal) + '</td>' +
          '<td class="' + corHe + '">' + fmtH(p.heReal) + '</td>' +
          '<td style="color:' + (p.isExtra ? '#f6a623' : '#3a5a88') + ';font-weight:' + (p.isExtra ? '800' : '400') + ';">' + (p.isExtra ? 'SIM' : 'NÃ£o') + '</td>' +
          '<td style="color:' + (p.isDobra ? '#a855f7' : '#3a5a88') + ';font-weight:' + (p.isDobra ? '800' : '400') + ';">' + (p.isDobra ? 'SIM' : 'NÃ£o') + '</td>' +
          '</tr>';
      })
    ).join('');
    $('modalColab').classList.add('open');
  };

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

  // ââ GRÃFICO BARRAS: PROG vs REAL ââââââââââââââââââââââââââââââââââ
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
    const el = $('cBarLinha'); if (!el) return;
    if (chartBar) chartBar.destroy();
    chartBar = new Chart(el.getContext('2d'), {
      data: { labels: labs, datasets: [
        { type: 'bar',  label: 'Programado',     data: progs, backgroundColor: '#3d7ef5', borderRadius: 3, yAxisID: 'y' },
        { type: 'bar',  label: 'Realizado',       data: reais, backgroundColor: '#19d46e', borderRadius: 3, yAxisID: 'y' },
        { type: 'line', label: 'Dif (Real-Prog)', data: difs, borderColor: '#f6a623', borderWidth: 2,
          pointRadius: 5, pointBackgroundColor: difs.map(v => v >= 0 ? '#19d46e' : '#f65858'),
          tension: 0.3, fill: false, yAxisID: 'y2' }
      ]},
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { color: '#7a9cc8', boxWidth: 10, font: { size: 10 } } }, tooltip: { mode: 'index', intersect: false } },
        scales: {
          x:  { grid: { color: '#1a3560' }, ticks: { color: '#7a9cc8', font: { size: 9 } } },
          y:  { grid: { color: '#1a3560' }, ticks: { color: '#7a9cc8', callback: v => v + 'h' }, title: { display: true, text: 'Horas', color: '#7a9cc8', font: { size: 9 } } },
          y2: { position: 'right', grid: { display: false }, ticks: { color: '#f6a623', callback: v => (v >= 0 ? '+' : '') + v + 'h', font: { size: 9 } }, title: { display: true, text: 'DiferenÃ§a', color: '#f6a623', font: { size: 9 } } }
        }
      }
    });
  }

  // ââ DONUT GARAGEM ââââââââââââââââââââââââââââââââââââââââââââââââââ
  function renderDonutGaragem(dados) {
    const garM = {};
    dados.forEach(p => { const g = mapaGar[p.linha] || 'Outras'; garM[g] = (garM[g] || 0) + p.heReal; });
    const total = Object.values(garM).reduce((a, b) => a + b, 0);
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
    tb.innerHTML = labs.map((g, i) =>
      '<tr><td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + cores[i] + ';margin-right:6px;"></span>' + g + '</td>' +
      '<td style="color:#fff;">' + fmtH(garM[g]) + '</td>' +
      '<td class="' + (total > 0 && garM[g]/total > 0.35 ? 'clr-o' : 'clr-g') + '">' + (total > 0 ? (garM[g]/total*100).toFixed(1) : 0) + '%</td></tr>'
    ).join('');
  }

  // ââ HEATMAP ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  async function carregarHeatmap() {
    const ini = $('dataInicio')?.value || DATA_PADRAO;
    const func = $('selFuncao')?.value || '';
    const [ano, mes] = ini.split('-');
    const primeiroDia = ano + '-' + mes + '-01';
    const ultimoDia   = new Date(+ano, +mes, 0).toISOString().split('T')[0];
    log('Heatmap: buscando mÃªs ' + String(+mes).padStart(2,'0') + '/' + ano + '...', 'linfo');
    const brutos = await buscarAPI(primeiroDia, ultimoDia, func, false);
    const proc   = brutos.map(item => calcJornada(item));
    const g=($('selGaragem')?.value||''), lo=($('selLote')?.value||'');
    const liTxt=($('inputLinha')?.value||'').trim().toUpperCase(), liSel=($('selLinha')?.value||''), li=liTxt||liSel;
    const filtrados = proc.filter(p => {
      if (g  && (mapaGar[p.linha]  || '') !== g)  return false;
      if (lo && (mapaLote[p.linha] || '') !== lo) return false;
      if (li && !p.linha.includes(li))             return false;
      return true;
    });
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

  function renderHeatmapTabela() {
    const head = $('hmHead'); const body = $('hmBody');
    if (!head || !body || !heatDias.length) return;
    head.innerHTML = '<tr><th class="lh">LINHA</th>' + heatDias.map(dt => '<th title="' + dBR(dt) + '">' + dt.substring(8) + '</th>').join('') + '<th>TOTAL</th></tr>';
    body.innerHTML = heatData.map(row => {
      const cells = heatDias.map(dt => {
        const v = row.dias[dt] || 0;
        let bg = 'transparent', color = 'rgba(255,255,255,0.12)';
        if (v > 0) {
          if      (v > 40) { bg = 'rgba(246,88,88,0.85)';  color = '#fff'; }
          else if (v > 10) { bg = 'rgba(246,88,88,0.45)';  color = '#ffd0d0'; }
          else if (v > 5)  { bg = 'rgba(246,166,35,0.45)'; color = '#ffd26a'; }
          else             { bg = 'rgba(25,212,110,0.25)'; color = '#5fe394'; }
        }
        return '<td style="background:' + bg + ';color:' + color + '">' + (v > 0 ? fmtH(v) : 'â') + '</td>';
      }).join('');
      return '<tr><td class="rh">' + row.linha + '</td>' + cells + '<td class="tot">' + fmtH(row.totalHe) + '</td></tr>';
    }).join('');
  }

  window.sortHeat = function(campo) {
    if (campo === 'total') { heatSortDir.total *= -1; heatData.sort((a,b) => (a.totalHe - b.totalHe) * heatSortDir.total); }
    else                   { heatSortDir.linha *= -1; heatData.sort((a,b) => a.linha.localeCompare(b.linha) * heatSortDir.linha); }
    renderHeatmapTabela();
  };

  // ââ EVOLUÃÃO âââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  async function carregarEvolucao() {
    const hoje = hojeISO();
    log('EvoluÃ§Ã£o: buscando 01/01/2026 â ' + hoje + '...', 'lwarn');
    const brutos = await buscarAPI('2026-01-01', hoje, '', true);
    const proc   = brutos.map(item => calcJornada(item));
    const diaM = {}, mesM = {}, anoM = {};
    proc.forEach(p => {
      if (!diaM[p.data]) diaM[p.data] = { heReal: 0, heProg: 0 };
      diaM[p.data].heReal += p.heReal; diaM[p.data].heProg += p.heProg;
    });
    Object.entries(diaM).forEach(([dt, v]) => {
      const mes = dt.substring(0, 7);
      if (!mesM[mes]) mesM[mes] = { heReal: 0, heProg: 0 };
      mesM[mes].heReal += v.heReal; mesM[mes].heProg += v.heProg;
    });
    Object.entries(diaM).forEach(([dt, v]) => {
      const ano = dt.substring(0, 4);
      if (!anoM[ano]) anoM[ano] = { heReal: 0, heProg: 0 };
      anoM[ano].heReal += v.heReal; anoM[ano].heProg += v.heProg;
    });
    const nomeMes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    evoData.dia = Object.entries(diaM).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v]) => ({ lab: dBR(k), heReal: v.heReal, heProg: v.heProg, dif: v.heReal-v.heProg }));
    evoData.mes = Object.entries(mesM).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v]) => { const [y,m]=k.split('-'); return { lab: nomeMes[+m-1]+'/'+y.slice(2), heReal: v.heReal, heProg: v.heProg, dif: v.heReal-v.heProg }; });
    evoData.ano = Object.entries(anoM).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v]) => ({ lab: k, heReal: v.heReal, heProg: v.heProg, dif: v.heReal-v.heProg }));
    log('EvoluÃ§Ã£o: ' + Object.keys(diaM).length + ' dias | ' + Object.keys(mesM).length + ' meses', 'lok');
    renderEvo();
  }

  function renderEvo() {
    const serie = evoData[evoModo]; if (!serie?.length) return;
    const labs  = serie.map(x => x.lab);
    const reais = serie.map(x => +x.heReal.toFixed(1));
    const progs = serie.map(x => +x.heProg.toFixed(1));
    const difs  = serie.map(x => +x.dif.toFixed(1));
    const hoje  = dBR(hojeISO());
    setEl('evoSubtitle', { dia: '01/01/2026 â ' + hoje + ' â diÃ¡rio', mes: '01/01/2026 â ' + hoje + ' â mensal', ano: 'VisÃ£o anual' }[evoModo]);
    const el = $('cEvo'); if (!el) return;
    if (chartEvo) chartEvo.destroy();
    chartEvo = new Chart(el.getContext('2d'), {
      data: { labels: labs, datasets: [
        { type: 'line', label: 'HE Realizada', data: reais, borderColor: '#19d46e', backgroundColor: 'rgba(25,212,110,0.08)', fill: true, tension: 0.3, pointRadius: 2, yAxisID: 'y' },
        { type: 'line', label: 'HE Programada', data: progs, borderColor: '#f6a623', borderDash: [5,5], fill: false, tension: 0.3, pointRadius: 2, yAxisID: 'y' },
        { type: 'bar',  label: 'DiferenÃ§a', data: difs, backgroundColor: difs.map(v => v >= 0 ? 'rgba(25,212,110,0.35)' : 'rgba(246,88,88,0.35)'), borderColor: difs.map(v => v >= 0 ? '#19d46e' : '#f65858'), borderWidth: 1, borderRadius: 2, yAxisID: 'y2' }
      ]},
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { color: '#7a9cc8', boxWidth: 10, font: { size: 10 } } }, tooltip: { mode: 'index', intersect: false } },
        scales: {
          x:  { grid: { color: '#1a3560' }, ticks: { color: '#7a9cc8', font: { size: 9 }, maxRotation: 45, maxTicksLimit: 20 } },
          y:  { grid: { color: '#1a3560' }, ticks: { color: '#7a9cc8', callback: v => v + 'h' } },
          y2: { position: 'right', grid: { display: false }, ticks: { color: '#f6a623', callback: v => (v >= 0 ? '+' : '') + v + 'h', font: { size: 9 } }, title: { display: true, text: 'DiferenÃ§a', color: '#f6a623', font: { size: 9 } } }
        }
      }
    });
  }

  window.mudarEvo = function(modo) {
    evoModo = modo;
    ['Dia','Mes','Ano'].forEach(m => { const b = $('btnEvo'+m); if (b) b.classList.toggle('active', m.toLowerCase() === modo); });
    renderEvo();
  };

  // ââ RANKING ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  function renderRanking(dados) {
    const linhaM = {};
    dados.forEach(p => { linhaM[p.linha] = (linhaM[p.linha] || 0) + p.heReal; });
    const tops = Object.entries(linhaM).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const el = $('cRankHe'); if (!el) return;
    if (chartRank) chartRank.destroy();
    chartRank = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: { labels: tops.map(x => x[0]), datasets: [{ label: 'HE Real (h)', data: tops.map(x => +x[1].toFixed(1)), backgroundColor: '#f6a623', borderRadius: 4 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { grid: { color: '#1a3560' }, ticks: { color: '#7a9cc8', callback: v => v + 'h' } }, y: { grid: { color: '#1a3560' }, ticks: { color: '#c8dcff', font: { size: 9 } } } }
      }
    });
  }

  // ââ DETALHAMENTO âââââââââââââââââââââââââââââââââââââââââââââââââââ
  function renderDetalhamento(dados) {
    const linhaM = {};
    dados.forEach(p => {
      if (!linhaM[p.linha]) linhaM[p.linha] = { linha: p.linha, gar: mapaGar[p.linha]||'â', lote: mapaLote[p.linha]||'â', ttProg:0, ttReal:0, hrNProg:0, hrNReal:0, heProg:0, heReal:0, hnr:0, dobra:0, registros:[] };
      const r = linhaM[p.linha];
      r.ttProg+=p.ttProg; r.ttReal+=p.ttBruto;
      r.hrNProg+=p.hrNProg; r.hrNReal+=p.hrNReal;
      r.heProg+=p.heProg; r.heReal+=p.heReal; r.hnr+=p.hnr;
      if (p.isDobra) r.dobra++;
      r.registros.push(p);
    });
    window._detRows = Object.values(linhaM).map(r => ({
      ...r, pctReal: r.ttProg > 0 ? r.ttReal/r.ttProg*100 : 0, difN: r.hrNReal - r.hrNProg, difHe: r.heReal - r.heProg
    }));
    renderDetTbody(window._detRows);
  }

  function renderDetTbody(rows) {
    const tb = $('tbDet'); if (!tb) return;
    tb.innerHTML = rows.map(r => {
      const pC = r.pctReal >= 100 ? 'clr-g' : r.pctReal >= 90 ? 'clr-o' : 'clr-r';
      const dNC = r.difN  >= 0 ? 'clr-g' : 'clr-r';
      const dHC = r.difHe >= 0 ? 'clr-r' : 'clr-g';
      return '<tr><td style="font-weight:700;color:#c8dcff;">' + r.linha + '</td><td>' + r.gar + '</td><td>' + r.lote + '</td>' +
        '<td>' + fmtH(r.ttProg) + '</td><td>' + fmtH(r.ttReal) + '</td><td class="' + pC + '">' + r.pctReal.toFixed(1) + '%</td>' +
        '<td>' + fmtH(r.hrNProg) + '</td><td>' + fmtH(r.hrNReal) + '</td><td class="' + dNC + '">' + (r.difN>=0?'+':'') + fmtH(r.difN) + '</td>' +
        '<td>' + fmtH(r.heProg) + '</td><td>' + fmtH(r.heReal) + '</td><td class="' + dHC + '">' + (r.difHe>=0?'+':'') + fmtH(r.difHe) + '</td>' +
        '<td>' + r.dobra + '</td>' +
        '<td><button class="btn-ver" onclick="window.verLinha(\'' + r.linha + '\')">Ver</button></td></tr>';
    }).join('');
  }

  window.verLinha = function(linha) {
    const row = window._detRows?.find(r => r.linha === linha); if (!row) return;
    $('modalLinhaTitulo').textContent = 'Linha ' + linha + ' â Garagem: ' + row.gar + ' | Lote: ' + row.lote + ' | HE Real: ' + fmtH(row.heReal);
    const porDataTabela = {};
    row.registros.forEach(p => {
      const chave = p.data + '|' + (p.tabela || p.linha);
      if (!porDataTabela[chave]) porDataTabela[chave] = { data: p.data, tabela: p.tabela || 'â', linha: p.linha, ttProg: 0, ttReal: 0, mot: 0, cob: 0 };
      const r = porDataTabela[chave];
      r.ttProg += p.ttProg; r.ttReal += p.ttBruto;
      if (p.funcao === 'motorista') r.mot++;
      if (p.funcao === 'cobrador')  r.cob++;
    });
    const linhas = Object.values(porDataTabela).sort((a, b) => a.data.localeCompare(b.data) || a.tabela.localeCompare(b.tabela));
    $('tbModalLinha').innerHTML = linhas.map(v =>
      '<tr><td>' + dBR(v.data) + '</td>' +
      '<td style="font-family:Consolas,monospace;color:#6aadff;">' + v.tabela + '</td>' +
      '<td style="font-weight:700;color:#c8dcff;">' + v.linha + '</td>' +
      '<td>' + fmtH(v.ttProg) + '</td>' +
      '<td>' + fmtH(v.ttReal) + '</td>' +
      '<td>' + v.mot + '</td>' +
      '<td>' + v.cob + '</td></tr>'
    ).join('');
    $('modalLinha').classList.add('open');
  };

  // ââ CONTROLES ââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  $('btnTogLog')?.addEventListener('click', () => {
    const box = $('logBox'); if (!box) return;
    const hidden = box.style.display === 'none';
    box.style.display = hidden ? 'block' : 'none';
    $('btnTogLog').textContent = hidden ? 'ð Ocultar Log' : 'ð Exibir Log';
  });
  $('btnLimparLog')?.addEventListener('click', () => { const b = $('logBox'); if (b) b.innerHTML = ''; });
  $('btnConectar')?.addEventListener('click', () => $('btnConsultar')?.click());

  const dIni = $('dataInicio');
  const dFim = $('dataFim');
  if (dIni) dIni.value = DATA_PADRAO;
  if (dFim) dFim.value = DATA_PADRAO;
  dIni?.addEventListener('change', () => { if (!dFim.value || dFim.value < dIni.value) dFim.value = dIni.value; });

  $('selGaragem')?.addEventListener('change', () => {
    const g = $('selGaragem').value;
    const base = g ? dadosFiltros.filter(f => f.gar === g) : dadosFiltros;
    preencheSelect('selLote',  [...new Set(base.map(f=>f.lote).filter(Boolean))].sort(), 'Todos');
    preencheSelect('selLinha', [...new Set(base.map(f=>normLinha(f.linha)).filter(Boolean))].sort(), 'Todas');
    if (inputLinha) inputLinha.value = '';
  });
  $('selLote')?.addEventListener('change', () => {
    const g=($('selGaragem')?.value||''), lo=($('selLote')?.value||'');
    let base = dadosFiltros;
    if (g)  base = base.filter(f => f.gar  === g);
    if (lo) base = base.filter(f => f.lote === lo);
    preencheSelect('selLinha', [...new Set(base.map(f=>normLinha(f.linha)).filter(Boolean))].sort(), 'Todas');
    if (inputLinha) inputLinha.value = '';
  });

  // ââ BOTÃO CONSULTAR ââââââââââââââââââââââââââââââââââââââââââââââââ
  $('btnConsultar')?.addEventListener('click', async () => {
    const ini  = $('dataInicio')?.value || DATA_PADRAO;
    const fim  = $('dataFim')?.value    || DATA_PADRAO;
    const func = $('selFuncao')?.value  || '';
    const btn  = $('btnConsultar');
    const box  = $('logBox');
    if (box) box.style.display = 'block';
    const tog = $('btnTogLog'); if (tog) tog.textContent = 'ð Ocultar Log';
    btn.textContent = 'â³ Carregando...'; btn.disabled = true;
    try {
      log('CONSULTA: ' + ini + ' â ' + fim, 'linfo');
      dadosBrutos      = await buscarAPI(ini, fim, func);
      dadosProcessados = dadosBrutos.map(item => calcJornada(item));
      const filtrados  = aplicarFiltros(dadosProcessados);
      renderizar(filtrados);
      const btnApi = $('btnConectar');
      if (btnApi) { btnApi.classList.add('ok'); btnApi.textContent = 'â Conectado'; }
      log('Dashboard: ' + filtrados.length + ' registros', 'lok');
      carregarHeatmap();
      carregarEvolucao();
    } catch (e) { log('ERRO: ' + e.message, 'lerro'); }
    finally { btn.textContent = 'Consultar'; btn.disabled = false; }
  });

  // ââ EXPORTAR CSV âââââââââââââââââââââââââââââââââââââââââââââââââââ
  function exportarCSV() {
    const rows = window._detRows;
    if (!rows?.length) { alert('Consulte os dados primeiro.'); return; }
    let csv = 'Linha,Garagem,Lote,TT Prog,TT Real,% Real,HR N Prog,HR N Real,Dif N,HE Prog,HE Real,Dif HE,Dobra\n';
    rows.forEach(r => {
      csv += r.linha + ',' + r.gar + ',' + r.lote + ',' + r.ttProg.toFixed(2) + ',' + r.ttReal.toFixed(2) + ',' + r.pctReal.toFixed(1) + '%,' + r.hrNProg.toFixed(2) + ',' + r.hrNReal.toFixed(2) + ',' + r.difN.toFixed(2) + ',' + r.heProg.toFixed(2) + ',' + r.heReal.toFixed(2) + ',' + r.difHe.toFixed(2) + ',' + r.dobra + '\n';
    });
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF' + csv);
    a.download = 'horas_nimer_' + ($('dataInicio')?.value||'').replace(/-/g,'') + '.csv';
    a.click();
  }
  $('btnExportarExcel')?.addEventListener('click', exportarCSV);
  $('btnExportDet')?.addEventListener('click', exportarCSV);

  document.querySelectorAll('.modal-bg').forEach(m =>
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); })
  );

  Chart.defaults.color       = '#7a9cc8';
  Chart.defaults.font.family = "'Segoe UI', sans-serif";
  Chart.defaults.font.size   = 10;

  try {
    await carregarFiltros();
    $('btnConsultar')?.click();
  } catch (e) { log('Erro na inicializaÃ§Ã£o: ' + e.message, 'lerro'); }

});

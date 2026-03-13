/**
 * SIMULADOR DE RECARGA ELÉTRICA — Portal Sambaíba
 * js/modules/simulador_recarga.js
 *
 * Colunas da planilha aceitas:
 *   TAB | LINHA | KM PROG | BAT. CHEGADA | CHEGADA GAR | SAÍDA GAR | TOTAL BATERIA DO CARRO
 *
 * Regras:
 * - Cada carregador tem 2 bicos (conectores)
 * - No Gantt: Carregador 1.1 / 1.2, Carregador 2.1 / 2.2 ...
 * - Veículo deve terminar carga antes de SAÍDA GAR; se não der → aviso
 * - Soma de energia não pode ultrapassar Energia Disponível → alerta
 * - Dois veículos nunca ocupam o mesmo bico ao mesmo tempo
 */

document.addEventListener('DOMContentLoaded', () => {

  /* ═══════ ESTADO GLOBAL ═══════ */
  let veiculosBrutos  = [];
  let simulacaoResult = [];   // [{veiculo, carregadorId, carregadorNome, bico, inicio, fim, kwh, potUsada, aguardou, cargaIncompleta}]
  let chartPotencia   = null;
  let paramsSim       = null;
  let panelAberto     = true;

  const CORES = [
    '#00e5a0','#00aaff','#f9e000','#a78bfa','#ff8c00',
    '#19d46e','#3d7ef5','#f65858','#e879f9','#fb923c',
    '#34d399','#60a5fa','#fbbf24','#c084fc','#f87171',
    '#67e8f9','#86efac','#fde68a','#d8b4fe','#fca5a5',
    '#38bdf8','#4ade80','#facc15','#e879f9','#fb7185'
  ];

  /* ═══════ UTILITÁRIOS ═══════ */
  const $ = id => document.getElementById(id);
  const setTxt = (id, v) => { const e = $(id); if (e) e.textContent = v; };

  function fmtHora(min) {
    if (min === null || min === undefined || isNaN(min)) return '—';
    const total = ((Math.round(min) % 1440) + 1440) % 1440;
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }

  function parseHora(str) {
    if (str === null || str === undefined || str === '') return null;
    str = String(str).trim();
    if (str === '' || str === '—') return null;
    // Excel serial fracionário
    if (!isNaN(str) && str.includes('.')) return Math.round((parseFloat(str) % 1) * 1440);
    // Número inteiro = horas
    if (!isNaN(str) && !str.includes(':')) return parseInt(str) * 60;
    // HH:MM ou HH:MM:SS
    const m = str.match(/(\d{1,2})[:\h](\d{2})/);
    if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
    return null;
  }

  function duracaoTexto(min) {
    if (!min || min < 0) return '0min';
    const h = Math.floor(min / 60), m = Math.round(min % 60);
    return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`;
  }

  function corVeiculo(idx) { return CORES[idx % CORES.length]; }

  /* ═══════ TOGGLE PARÂMETROS ═══════ */
  $('btn_toggle_params')?.addEventListener('click', () => {
    panelAberto = !panelAberto;
    const panel = $('params_panel');
    const btn   = $('btn_toggle_params');
    if (panel) panel.style.display = panelAberto ? '' : 'none';
    if (btn)   btn.textContent = (panelAberto ? '▲' : '▼') + ' Parâmetros';
  });

  /* ═══════ LEITURA DOS PARÂMETROS ═══════ */
  function getParams() {
    const preparo      = parseInt($('p_preparo')?.value)       || 30;
    const tolerancia   = parseInt($('p_tolerancia')?.value)    || 20;
    const energiaTotal = parseFloat($('p_energia_total')?.value) || 99999;

    // Cenários de carregadores
    const cenarios = [];
    for (let i = 1; i <= 5; i++) {
      const qtd = parseInt($(`carr_qtd_${i}`)?.value) || 0;
      const pot = parseFloat($(`carr_pot_${i}`)?.value) || 0;
      if (qtd > 0 && pot > 0) cenarios.push({ qtd, pot });
    }
    if (!cenarios.length) cenarios.push({ qtd: 10, pot: 180 });

    // Expande em lista de bicos independentes
    // Carregador 1 → bicos 1.1 e 1.2; Carregador 2 → 2.1 e 2.2 etc.
    const listaBicos = [];
    let numCarr = 1;
    cenarios.forEach(c => {
      for (let k = 0; k < c.qtd; k++) {
        for (let b = 1; b <= 2; b++) {
          listaBicos.push({
            carregadorId:  numCarr,
            carregadorNome: `Carregador ${numCarr}`,
            bicoNum:        b,
            bicoNome:       `Carregador ${numCarr}.${b}`,
            potencia:       c.pot / 2,   // potência por bico = metade do carregador
            potCarregador:  c.pot,
            slots: []                    // [{inicio, fim, veiculoIdx}]
          });
        }
        numCarr++;
      }
    });
    listaBicos.sort((a, b) => b.potencia - a.potencia);

    const totalCarregadores = numCarr - 1;
    const totalBicos        = listaBicos.length;
    const potenciaTotal     = cenarios.reduce((s, c) => s + c.qtd * c.pot, 0);

    // Tipos de veículos (fallback de bateria)
    const tiposVeiculos = [];
    for (let i = 1; i <= 5; i++) {
      const qtd = parseInt($(`veh_qtd_${i}`)?.value) || 0;
      const bat = parseFloat($(`veh_bat_${i}`)?.value) || 0;
      if (qtd > 0 && bat > 0) tiposVeiculos.push({ qtd, bateriaTotal: bat });
    }
    const batFallback = tiposVeiculos[0]?.bateriaTotal || 280;

    return { preparo, tolerancia, energiaTotal, cenarios, listaBicos, totalCarregadores, totalBicos, potenciaTotal, tiposVeiculos, batFallback };
  }

  /* ═══════ RESUMO CONFIGURAÇÃO ═══════ */
  function atualizarResumo() {
    const p = getParams();
    setTxt('res_total_carr', p.totalCarregadores);
    setTxt('res_total_conn', p.totalBicos);
    setTxt('res_total_pot',  p.potenciaTotal + ' kW');
    const det = p.cenarios.map(c => `${c.qtd}× ${c.pot}kW (${c.pot / 2}kW/bico)`).join(' | ');
    const el = $('res_detalhes'); if (el) el.textContent = det;
  }

  document.querySelectorAll('[data-cfg]').forEach(el => {
    el.addEventListener('input',  atualizarResumo);
    el.addEventListener('change', atualizarResumo);
  });

  /* ═══════ UPLOAD ═══════ */
  $('upload_zone')?.addEventListener('click', () => $('file_input')?.click());
  $('upload_zone')?.addEventListener('dragover', e => { e.preventDefault(); $('upload_zone').classList.add('drag-over'); });
  $('upload_zone')?.addEventListener('dragleave', () => $('upload_zone').classList.remove('drag-over'));
  $('upload_zone')?.addEventListener('drop', e => {
    e.preventDefault(); $('upload_zone').classList.remove('drag-over');
    const f = e.dataTransfer.files[0]; if (f) processarArquivo(f);
  });
  $('file_input')?.addEventListener('change', e => {
    const f = e.target.files[0]; if (f) processarArquivo(f);
  });

  function processarArquivo(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        let dados;
        if (file.name.toLowerCase().endsWith('.csv')) {
          dados = parsearCSV(e.target.result);
        } else {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          dados = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        }
        veiculosBrutos = normalizarDados(dados);
        marcarZonaOk(file.name, veiculosBrutos.length);
        mostrarPreview(veiculosBrutos, []);
        setTxt('k_veiculos', veiculosBrutos.length);
        resetarResultado();
      } catch (err) { alert('Erro ao ler arquivo: ' + err.message); console.error(err); }
    };
    file.name.toLowerCase().endsWith('.csv') ? reader.readAsText(file, 'UTF-8') : reader.readAsArrayBuffer(file);
  }

  function parsearCSV(text) {
    const sep   = text.includes(';') ? ';' : ',';
    const lines = text.split('\n').filter(l => l.trim());
    const hdrs  = lines[0].split(sep).map(h => h.trim().replace(/"/g, ''));
    return lines.slice(1).map(line => {
      const vals = line.split(sep).map(v => v.trim().replace(/"/g, ''));
      const obj  = {};
      hdrs.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
      return obj;
    });
  }

  /* Normaliza colunas: aceita exatamente os nomes definidos (case-insensitive, ignora pontos e espaços extras) */
  function normCol(row, ...aliases) {
    for (const alias of aliases) {
      const norm = k => k.trim().toUpperCase().replace(/[.\s]+/g, ' ');
      const found = Object.keys(row).find(k => norm(k) === norm(alias));
      if (found !== undefined && row[found] !== '') return row[found];
    }
    return '';
  }

  function normalizarDados(dados) {
    const p = getParams();
    return dados.map((row, idx) => {
      const tb        = String(normCol(row, 'TAB', 'TB', 'TABELA', 'VEICULO') || `V${String(idx + 1).padStart(3, '0')}`);
      const linha     = String(normCol(row, 'LINHA', 'LINE') || '');
      const kmProg    = parseFloat(normCol(row, 'KM PROG', 'KM_PROG', 'KM') || 0);
      const batCheg   = parseFloat(normCol(row, 'BAT. CHEGADA', 'BAT CHEGADA', 'BATERIA_CHEGADA', 'BATERIA CHEGADA', 'BATERIA') || 50);
      const horaCheg  = parseHora(normCol(row, 'CHEGADA GAR', 'CHEGADA_GAR', 'HORARIO_CHEGADA_GARAGEM', 'CHEGADA'));
      const horaSaida = parseHora(normCol(row, 'SAÍDA GAR', 'SAIDA GAR', 'SAÍDA_GAR', 'SAIDA_GAR', 'SAÍDA GAR.'));
      const batTotal  = parseFloat(normCol(row, 'TOTAL BATERIA DO CARRO', 'TOTAL_BATERIA_DO_CARRO', 'BATERIA_TOTAL') || 0) || p.batFallback;

      return {
        idx, tb, linha, kmProg,
        batChegada:   isNaN(batCheg) ? 50 : Math.min(Math.max(batCheg, 0), 100),
        bateriaTotal: batTotal,
        horaChegada:  horaCheg !== null ? horaCheg : (21 * 60 + idx * 5),
        horaSaida,
        cor: corVeiculo(idx)
      };
    });
  }

  function marcarZonaOk(nome, qtd) {
    const z = $('upload_zone'); if (!z) return;
    z.classList.add('has-file');
    const ico = z.querySelector('.u-ico'); if (ico) ico.textContent = '✅';
    const lbl = $('upload_lbl'); if (lbl) lbl.textContent = `${nome} — ${qtd} veículos`;
  }

  /* ═══════ PREVIEW DA PLANILHA ═══════ */
  function mostrarPreview(dados, resultados) {
    const wrap = $('preview_wrap'); if (!wrap) return;
    wrap.style.display = '';
    const info = $('preview_info'); if (info) info.textContent = `${dados.length} veículos importados`;
    const tbl  = $('tbl_preview');  if (!tbl) return;
    const comRes = resultados && resultados.length > 0;

    const linhas = dados.map(v => {
      const s = comRes ? resultados.find(r => r.veiculo.tb === v.tb) : null;

      let conclHtml;
      if (!s) {
        conclHtml = `<td style="color:#3a6a8a;text-align:center;">—</td>`;
      } else if (s.cargaIncompleta) {
        conclHtml = `<td style="color:#ff3d3d;font-weight:800;font-family:Consolas,monospace;" title="Carga termina após saída programada (${fmtHora(v.horaSaida)})">⚠ ${fmtHora(s.fim)}</td>`;
      } else {
        conclHtml = `<td style="color:#00e5a0;font-weight:800;font-family:Consolas,monospace;" title="Carga concluída antes da saída">✅ ${fmtHora(s.fim)}</td>`;
      }

      return `<tr>
        <td style="font-weight:800;color:${v.cor}">${v.tb}</td>
        <td>${v.linha || '—'}</td>
        <td style="color:#7a9cc8;">${v.kmProg || '—'}</td>
        <td style="font-weight:700;color:${v.batChegada < 30 ? '#ff3d3d' : v.batChegada < 60 ? '#f9e000' : '#00e5a0'};">${v.batChegada}%</td>
        <td style="font-family:Consolas,monospace;">${fmtHora(v.horaChegada)}</td>
        <td style="font-family:Consolas,monospace;">${v.horaSaida !== null ? fmtHora(v.horaSaida) : '—'}</td>
        ${conclHtml}
      </tr>`;
    });

    tbl.innerHTML = `
      <thead><tr>
        <th>TAB</th><th>Linha</th><th>KM Prog</th>
        <th>Bat. Chegada</th><th>Chegada Gar.</th><th>Saída Gar.</th>
        <th style="color:#00e5a0;">⚡ Conclusão Recarga</th>
      </tr></thead>
      <tbody>${linhas.join('')}</tbody>`;
  }

  /* ═══════ MOTOR DE SIMULAÇÃO ═══════ */
  function simular() {
    if (!veiculosBrutos.length) { alert('Importe uma planilha ou clique em Demo!'); return; }

    const p = getParams();
    paramsSim = p;

    // Prepara veículos
    const veiculos = veiculosBrutos.map(v => {
      const energiaNec = Math.max(v.bateriaTotal * (1 - v.batChegada / 100), 1);
      return {
        ...v,
        horaDisponivel: v.horaChegada + p.preparo,
        energiaNec,
        // Prazo máximo para concluir: saída - tolerância
        prazoMaximo: v.horaSaida !== null ? v.horaSaida - p.tolerancia : null
      };
    }).sort((a, b) => a.horaDisponivel - b.horaDisponivel || a.batChegada - b.batChegada);

    // Copia bicos (limpa slots)
    const bicos = p.listaBicos.map(b => ({ ...b, slots: [] }));

    simulacaoResult = [];

    // FIFO: para cada veículo, tenta alocar no bico disponível mais cedo
    veiculos.forEach(veiculo => {
      const inicio = veiculo.horaDisponivel;

      // Bicos livres no momento em que o veículo está disponível
      const bicosLivres = bicos.filter(b => {
        const ocupado = b.slots.some(s => s.inicio < inicio + 0.01 && s.fim > inicio - 0.01);
        return !ocupado;
      });

      // Ordenar: mais potentes primeiro
      bicosLivres.sort((a, b) => b.potencia - a.potencia);

      if (bicosLivres.length > 0) {
        const bico = bicosLivres[0];
        alocarVeiculo(bico, veiculo, inicio, false);
      } else {
        // Fila: encontra o bico que libera mais cedo
        const bicoMaisRapido = bicos.reduce((best, b) => {
          const lib = b.slots.length ? Math.max(...b.slots.map(s => s.fim)) : 0;
          return lib < best.lib ? { bico: b, lib } : best;
        }, { bico: bicos[0], lib: Infinity });

        const horaEspera = Math.max(bicoMaisRapido.lib, inicio);
        alocarVeiculo(bicoMaisRapido.bico, veiculo, horaEspera, true);
      }
    });

    renderizarTudo(bicos, p);
  }

  function alocarVeiculo(bico, veiculo, inicio, aguardou) {
    const tempoCargaMin  = Math.ceil((veiculo.energiaNec / bico.potencia) * 60);
    const fim            = inicio + tempoCargaMin;
    const cargaIncompleta = veiculo.prazoMaximo !== null && fim > veiculo.prazoMaximo;

    bico.slots.push({ inicio, fim, veiculoTb: veiculo.tb });

    simulacaoResult.push({
      veiculo,
      carregadorId:   bico.carregadorId,
      carregadorNome: bico.carregadorNome,
      bicoNum:        bico.bicoNum,
      bicoNome:       bico.bicoNome,
      potencia:       bico.potencia,
      potCarregador:  bico.potCarregador,
      inicio, fim,
      kwh:            Math.round(veiculo.energiaNec),
      tempoCargaMin,
      aguardou,
      tempoEspera:    aguardou ? inicio - veiculo.horaDisponivel : 0,
      cargaIncompleta
    });
  }

  /* ═══════ RENDERIZAÇÃO PRINCIPAL ═══════ */
  function renderizarTudo(bicos, p) {
    const slots = simulacaoResult;
    if (!slots.length) return;

    const horaMin = Math.min(...slots.map(s => s.inicio));
    const horaMax = Math.max(...slots.map(s => s.fim));
    const FAIXA   = 30;

    // Ocupação por faixa horária
    const ocupacao = [];
    for (let t = Math.floor(horaMin / FAIXA) * FAIXA; t <= horaMax; t += FAIXA) {
      const ativos    = slots.filter(s => s.inicio <= t && s.fim > t);
      const carrAtivos = new Set(ativos.map(s => s.carregadorId));
      const potTotal   = ativos.reduce((sum, s) => sum + s.potencia, 0);
      ocupacao.push({ hora: t, veiculos: ativos.length, carregadores: carrAtivos.size, bicos: ativos.length, potencia: Math.round(potTotal) });
    }

    // Métricas
    const picoCarr    = Math.max(...ocupacao.map(o => o.carregadores));
    const picoBicos   = Math.max(...ocupacao.map(o => o.bicos));
    const potMax      = Math.max(...ocupacao.map(o => o.potencia));
    const horaPico    = ocupacao.find(o => o.potencia === potMax);
    const energiaTotal = slots.reduce((s, r) => s + r.kwh, 0);
    const emFila       = slots.filter(s => s.aguardou).length;
    const incompletos  = slots.filter(s => s.cargaIncompleta).length;
    const gargalo      = picoCarr >= p.totalCarregadores;
    const semEnergia   = energiaTotal > p.energiaTotal;

    // KPIs
    setTxt('k_veiculos',      veiculosBrutos.length);
    setTxt('k_pico_carr',     `${picoCarr}/${p.totalCarregadores}`);
    setTxt('k_pico_carr_sub', picoCarr >= p.totalCarregadores ? '⚠ CAPACIDADE MÁXIMA' : 'simultâneos');
    setTxt('k_pico_conn',     `${picoBicos}/${p.totalBicos}`);
    setTxt('k_pico_conn_sub', 'simultâneos');
    setTxt('k_energia',       energiaTotal.toLocaleString('pt-BR'));
    setTxt('k_energia_sub',   `de ${p.energiaTotal.toLocaleString('pt-BR')} kWh disponíveis`);
    setTxt('k_hora_pico',     horaPico ? fmtHora(horaPico.hora) : '—');
    setTxt('k_pot_max',       `${potMax} kW no pico`);
    setTxt('k_fila',          emFila);
    setTxt('k_fila_sub',      emFila > 0 ? 'aguardaram bico' : 'sem fila de espera');
    setTxt('k_incompleto',    incompletos);

    const kG = $('k_gargalo'), kGS = $('k_gargalo_sub');
    if (kG) {
      if (semEnergia)        { kG.innerHTML = '<span style="color:#ff3d3d">⚠ SEM ENERGIA</span>'; if (kGS) kGS.textContent = 'Limite de energia excedido!'; }
      else if (gargalo)      { kG.innerHTML = '<span style="color:#ff3d3d">⚠ GARGALO</span>';    if (kGS) kGS.textContent = 'Carregadores insuficientes!'; }
      else if (incompletos)  { kG.innerHTML = '<span style="color:#ff3d3d">⚠ INCOMPLETO</span>'; if (kGS) kGS.textContent = `${incompletos} sem carga total`; }
      else if (emFila)       { kG.innerHTML = '<span style="color:#f9e000">⚠ FILA</span>';       if (kGS) kGS.textContent = `${emFila} aguardaram`; }
      else                   { kG.innerHTML = '<span style="color:#00e5a0">✓ OK</span>';          if (kGS) kGS.textContent = 'Tudo carregado a tempo'; }
    }

    // Badge topbar
    const badge = $('badge_status');
    if (badge) {
      if (semEnergia || gargalo || incompletos) { badge.textContent = '⚠ ATENÇÃO'; badge.className = 'badge-ev error'; }
      else { badge.textContent = '✅ SIMULADO'; badge.className = 'badge-ev simulated'; }
    }

    // Alerta energia
    const aE = $('alerta_energia');
    if (aE) {
      if (semEnergia) {
        aE.style.display = '';
        aE.innerHTML = `⚡ <b>ENERGIA INSUFICIENTE:</b> A simulação consome <b>${energiaTotal.toLocaleString('pt-BR')} kWh</b>, mas o limite configurado é <b>${p.energiaTotal.toLocaleString('pt-BR')} kWh</b>. Faltam <b>${(energiaTotal - p.energiaTotal).toLocaleString('pt-BR')} kWh</b>. Aumente o limite ou reduza a quantidade de veículos.`;
      } else { aE.style.display = 'none'; }
    }

    // Alerta carga incompleta
    const aI = $('alerta_incompleto');
    if (aI) {
      if (incompletos > 0) {
        const lista = slots.filter(s => s.cargaIncompleta).map(s => `${s.veiculo.tb} (termina ${fmtHora(s.fim)}, sai ${fmtHora(s.veiculo.horaSaida)})`).join(', ');
        aI.style.display = '';
        aI.innerHTML = `⚠ <b>${incompletos} veículo(s) não conseguiram carregar 100% antes da saída programada:</b> ${lista}`;
      } else { aI.style.display = 'none'; }
    }

    // Alerta fila
    const aF = $('fila_alert');
    if (aF) {
      if (emFila > 0) { aF.textContent = `⏳ ${emFila} veículo(s) aguardaram bico disponível. Considere adicionar mais carregadores.`; aF.classList.add('visible'); }
      else { aF.classList.remove('visible'); }
    }

    // Exibe resultado
    const secRes = $('secao_resultado'); if (secRes) secRes.style.display = '';
    const ts = $('sim_timestamp'); if (ts) ts.textContent = `Simulado: ${new Date().toLocaleTimeString('pt-BR')} — ${slots.length} veículos`;

    renderMapaCarregadores(p);
    renderGantt(bicos, slots, horaMin, horaMax, p);
    renderTabelaOcupacao(ocupacao, p);
    renderGraficoPotencia(ocupacao, p);
    renderListaVeiculos(slots);
    mostrarPreview(veiculosBrutos, slots);
  }

  /* ═══════ MAPA DE CARREGADORES ═══════ */
  function renderMapaCarregadores(p) {
    const grid = $('charger_grid'); if (!grid) return;

    // Agrupa por carregador
    const mapaCarr = {};
    simulacaoResult.forEach(s => {
      const id = s.carregadorId;
      if (!mapaCarr[id]) mapaCarr[id] = { nome: s.carregadorNome, pot: s.potCarregador, bicos: {} };
      if (!mapaCarr[id].bicos[s.bicoNum]) mapaCarr[id].bicos[s.bicoNum] = [];
      mapaCarr[id].bicos[s.bicoNum].push(s);
    });

    // Adiciona carregadores sem veículos
    p.listaBicos.forEach(b => {
      if (!mapaCarr[b.carregadorId]) mapaCarr[b.carregadorId] = { nome: b.carregadorNome, pot: b.potCarregador, bicos: {} };
    });

    const ids = Object.keys(mapaCarr).map(Number).sort((a, b) => a - b);

    grid.innerHTML = ids.map(id => {
      const carr    = mapaCarr[id];
      const totalVeh = Object.values(carr.bicos).flat().length;
      const temIncompleto = Object.values(carr.bicos).flat().some(s => s.cargaIncompleta);
      const temFila       = Object.values(carr.bicos).flat().some(s => s.aguardou);
      const bordaCor = temIncompleto ? '#ff3d3d' : temFila ? '#ff8c00' : totalVeh > 0 ? '#00e5a0' : '#1a3a5c';

      // Renderiza os 2 bicos
      const bicosHtml = [1, 2].map(bn => {
        const lista = carr.bicos[bn] || [];
        const label = `<div class="bico-label">Bico ${bn}</div>`;
        if (!lista.length) return `<div class="bico-col">${label}<div class="bico-vazio">— livre —</div></div>`;
        const vehs = lista.map(s => `
          <div class="bico-veh ${s.cargaIncompleta ? 'incompleto' : s.aguardou ? 'aguardou' : ''}">
            <span style="font-weight:800;color:${s.veiculo.cor}">🚌 ${s.veiculo.tb}</span>
            <span class="bico-linha">${s.veiculo.linha || ''}</span>
            <span class="bico-hora">${fmtHora(s.inicio)} → ${fmtHora(s.fim)}</span>
            ${s.cargaIncompleta ? '<span class="bico-tag tag-inc">⚠ incompleto</span>' : ''}
            ${s.aguardou ? '<span class="bico-tag tag-fila">⏳ fila</span>' : ''}
          </div>`).join('');
        return `<div class="bico-col">${label}${vehs}</div>`;
      }).join('');

      return `<div class="charger-card-new" style="border-color:${bordaCor}">
        <div class="charger-head-new">
          <span class="charger-name-new">${carr.nome}</span>
          <span class="charger-kw-new">${carr.pot} kW · ${carr.pot / 2} kW/bico</span>
        </div>
        <div class="bicos-row">${bicosHtml}</div>
        <div class="charger-foot-new">${totalVeh} veículo(s) agendado(s)</div>
      </div>`;
    }).join('');
  }

  /* ═══════ GANTT ═══════ */
  function renderGantt(bicos, slots, horaMin, horaMax, p) {
    const wrap = $('gantt_wrap'); if (!wrap) return;
    const FAIXA  = 30;
    const PX_MIN = 3;
    const cols   = [];
    for (let t = Math.floor(horaMin / FAIXA) * FAIXA; t <= horaMax + FAIXA; t += FAIXA) cols.push(t);
    const base    = cols[0];
    const totalPx = (cols[cols.length - 1] - base) * PX_MIN;

    // Uma linha por bico
    const linhasBicos = [];
    p.listaBicos.slice().sort((a, b) => a.carregadorId - b.carregadorId || a.bicoNum - b.bicoNum).forEach(b => {
      linhasBicos.push(b);
    });

    const thead = `<tr>
      <th class="row-head" style="min-width:130px;">Bico</th>
      ${cols.map(t => `<th style="min-width:${FAIXA * PX_MIN}px;font-size:9px;">${fmtHora(t)}</th>`).join('')}
    </tr>`;

    const rows = linhasBicos.map(b => {
      const bicoSlots = slots.filter(s => s.carregadorId === b.carregadorId && s.bicoNum === b.bicoNum)
        .sort((a, c) => a.inicio - c.inicio);

      // Verifica sobreposição (não deve haver, mas log defensivo)
      for (let i = 1; i < bicoSlots.length; i++) {
        if (bicoSlots[i].inicio < bicoSlots[i - 1].fim - 0.5) {
          console.warn(`Sobreposição detectada no ${b.bicoNome}: ${bicoSlots[i - 1].veiculo.tb} e ${bicoSlots[i].veiculo.tb}`);
        }
      }

      const blocos = bicoSlots.map(s => {
        const left  = (s.inicio - base) * PX_MIN;
        const width = Math.max((s.fim - s.inicio) * PX_MIN, 30);
        const cls   = s.cargaIncompleta ? 'gantt-block incompleto-block' : s.aguardou ? 'gantt-block fila-block' : 'gantt-block';
        return `<div class="${cls}"
          style="left:${left}px;width:${width}px;background:${s.veiculo.cor};"
          data-tb="${s.veiculo.tb}" data-linha="${s.veiculo.linha || '—'}"
          data-inicio="${fmtHora(s.inicio)}" data-fim="${fmtHora(s.fim)}"
          data-kwh="${s.kwh}" data-pot="${Math.round(s.potencia)}"
          data-bat="${s.veiculo.batChegada}" data-tempo="${s.tempoCargaMin}"
          data-bico="${b.bicoNome}"
          data-aguardou="${s.aguardou ? 'SIM' : 'NÃO'}"
          data-inc="${s.cargaIncompleta ? 'SIM' : 'NÃO'}"
          data-saida="${s.veiculo.horaSaida !== null ? fmtHora(s.veiculo.horaSaida) : '—'}"
          onmouseenter="window.evTooltipShow(event,this)"
          onmouseleave="window.evTooltipHide()"
        >${s.veiculo.tb}</div>`;
      }).join('');

      // Linha de saída programada para cada veículo
      const saidasHtml = bicoSlots.filter(s => s.veiculo.horaSaida !== null).map(s => {
        const left = (s.veiculo.horaSaida - base) * PX_MIN;
        return `<div class="gantt-saida" style="left:${left}px;" title="Saída: ${fmtHora(s.veiculo.horaSaida)}"></div>`;
      }).join('');

      return `<tr>
        <td class="row-head">
          ${b.bicoNome}<br>
          <span style="font-size:9px;color:#3d7ef5;">${b.potencia}kW</span>
        </td>
        <td colspan="${cols.length}" style="position:relative;padding:0;height:26px;min-width:${totalPx}px;">
          ${saidasHtml}${blocos}
        </td>
      </tr>`;
    }).join('');

    wrap.innerHTML = `<table class="gantt-tbl" style="min-width:${totalPx + 140}px;">
      <thead>${thead}</thead><tbody>${rows}</tbody>
    </table>`;
  }

  // Tooltip do Gantt
  window.evTooltipShow = function (e, el) {
    const tt = $('gantt_tooltip'); if (!tt) return;
    const cor = el.style.background;
    tt.innerHTML = `
      <div style="font-weight:900;color:${cor};margin-bottom:5px;">🚌 Veículo ${el.dataset.tb}</div>
      <div style="color:#7a9cc8;">Linha: ${el.dataset.linha}</div>
      <div style="color:#c8dcff;">📍 ${el.dataset.bico}</div>
      <div>⏱ ${el.dataset.inicio} → ${el.dataset.fim} (${duracaoTexto(parseInt(el.dataset.tempo))})</div>
      <div style="color:#f9e000;">⚡ ${el.dataset.kwh} kWh · ${el.dataset.pot} kW</div>
      <div style="color:${parseFloat(el.dataset.bat) < 30 ? '#ff3d3d' : parseFloat(el.dataset.bat) < 60 ? '#f9e000' : '#00e5a0'};">
        🔋 Bat. chegada: ${el.dataset.bat}%
      </div>
      <div style="color:#5a8ab0;">🚪 Saída programada: ${el.dataset.saida}</div>
      ${el.dataset.aguardou === 'SIM' ? '<div style="color:#ff8c00;margin-top:3px;">⏳ Aguardou bico disponível</div>' : ''}
      ${el.dataset.inc === 'SIM' ? '<div style="color:#ff3d3d;margin-top:3px;">⚠ Carga não completa antes da saída!</div>' : ''}`;
    tt.style.display = 'block';
    tt.style.left    = (e.clientX + 16) + 'px';
    tt.style.top     = (e.clientY - 10) + 'px';
  };
  window.evTooltipHide = () => { const tt = $('gantt_tooltip'); if (tt) tt.style.display = 'none'; };
  document.addEventListener('mousemove', e => {
    const tt = $('gantt_tooltip');
    if (tt && tt.style.display !== 'none') { tt.style.left = (e.clientX + 16) + 'px'; tt.style.top = (e.clientY - 10) + 'px'; }
  });

  /* ═══════ TABELA DE OCUPAÇÃO ═══════ */
  function renderTabelaOcupacao(ocupacao, p) {
    const tb = $('tb_ocupacao'); if (!tb) return;
    const potMax = Math.max(...ocupacao.map(o => o.potencia), 1);

    tb.innerHTML = ocupacao.map(o => {
      const pctOcup   = Math.round(o.bicos / p.totalBicos * 100);
      const pctPot    = Math.round(o.potencia / potMax * 100);
      const isPico    = o.potencia === potMax;
      const corOcup   = pctOcup >= 100 ? '#ff3d3d' : pctOcup >= 80 ? '#f9e000' : '#00e5a0';
      const status    = pctOcup >= 100 ? '⚠ MÁXIMO' : pctOcup >= 80 ? '⚠ ALTO' : '✓ OK';
      const statusCor = pctOcup >= 100 ? '#ff3d3d' : pctOcup >= 80 ? '#f9e000' : '#00e5a0';

      return `<tr ${isPico ? 'class="pico"' : ''}>
        <td style="font-family:Consolas,monospace;font-weight:800;color:${isPico ? '#ff3d3d' : '#eaf2ff'};">${fmtHora(o.hora)}${isPico ? ' 🔺' : ''}</td>
        <td><b style="color:#00aaff;">${o.carregadores}</b><span style="color:#3a6a8a;"> / ${p.totalCarregadores}</span></td>
        <td><b style="color:#f9e000;">${o.bicos}</b><span style="color:#3a6a8a;"> / ${p.totalBicos}</span></td>
        <td style="color:#5a8ab0;">${p.totalBicos}</td>
        <td>
          <span class="ocp-bar" style="width:${Math.max(pctOcup * 0.7, 3)}px;background:${corOcup};"></span>
          <b style="color:${corOcup};">${pctOcup}%</b>
        </td>
        <td>
          <span class="ocp-bar" style="width:${Math.max(pctPot * 0.6, 3)}px;background:#f9e000;"></span>
          <b style="color:#f9e000;">${o.potencia}</b><span style="color:#3a6a8a;"> kW</span>
        </td>
        <td><span style="color:${statusCor};font-weight:800;font-size:10px;">${status}</span></td>
      </tr>`;
    }).join('');
  }

  /* ═══════ GRÁFICO DE POTÊNCIA ═══════ */
  function renderGraficoPotencia(ocupacao, p) {
    const el = $('c_potencia'); if (!el) return;
    if (chartPotencia) { chartPotencia.destroy(); chartPotencia = null; }

    chartPotencia = new Chart(el.getContext('2d'), {
      data: {
        labels: ocupacao.map(o => fmtHora(o.hora)),
        datasets: [
          { type: 'line', label: 'Potência (kW)', data: ocupacao.map(o => o.potencia), borderColor: '#f9e000', backgroundColor: 'rgba(249,224,0,0.08)', fill: true, tension: 0.4, pointRadius: 3, borderWidth: 2, yAxisID: 'y' },
          { type: 'bar',  label: 'Bicos em uso',  data: ocupacao.map(o => o.bicos),    backgroundColor: 'rgba(0,229,160,0.2)', borderColor: '#00e5a0', borderWidth: 1, borderRadius: 3, yAxisID: 'y2' },
          { type: 'line', label: 'Carreg. em uso', data: ocupacao.map(o => o.carregadores), borderColor: '#00aaff', borderDash: [4, 3], pointRadius: 0, fill: false, tension: 0, borderWidth: 1.5, yAxisID: 'y2' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top', labels: { color: '#7a9cc8', boxWidth: 10, font: { size: 10 } } } },
        scales: {
          x:  { grid: { color: 'rgba(26,58,92,0.5)' }, ticks: { color: '#5a8ab0', font: { size: 9 }, maxRotation: 45, maxTicksLimit: 18 } },
          y:  { grid: { color: 'rgba(26,58,92,0.5)' }, ticks: { color: '#f9e000', callback: v => v + ' kW', font: { size: 9 } }, position: 'left' },
          y2: { grid: { display: false }, ticks: { color: '#00e5a0', callback: v => v + ' b', font: { size: 9 } }, position: 'right', min: 0 }
        }
      }
    });
  }

  /* ═══════ LISTA DE VEÍCULOS ═══════ */
  function renderListaVeiculos(slots) {
    const el = $('veh_list'); if (!el) return;
    el.innerHTML = veiculosBrutos.map(v => {
      const s = slots.find(x => x.veiculo.tb === v.tb);
      if (!s) return `<span class="veh-badge sem-carga" title="Sem alocação">🚫 ${v.tb}</span>`;
      if (s.cargaIncompleta) return `<span class="veh-badge incompleto-v" style="color:#ff3d3d;border-color:rgba(255,61,61,0.3);background:rgba(255,61,61,0.07);" title="Carga incompleta — termina ${fmtHora(s.fim)}, sai ${fmtHora(v.horaSaida)}">⚠ ${v.tb}</span>`;
      if (s.aguardou)        return `<span class="veh-badge fila-v" title="Linha ${v.linha || '—'} | Aguardou ${duracaoTexto(s.tempoEspera)} | ${s.bicoNome}">⏳ ${v.tb}</span>`;
      return `<span class="veh-badge ok" style="color:${v.cor};border-color:${v.cor}30;background:${v.cor}10;" title="Linha ${v.linha || '—'} | ${s.bicoNome} | ${fmtHora(s.inicio)}→${fmtHora(s.fim)} | ${s.kwh}kWh">⚡ ${v.tb}</span>`;
    }).join('');
  }

  /* ═══════ EXPORTAR EXCEL DO GANTT ═══════ */
  $('btn_exportar_gantt')?.addEventListener('click', exportarExcel);
  function exportarExcel() {
    if (!simulacaoResult.length) { alert('Execute a simulação primeiro.'); return; }
    const p = paramsSim || getParams();

    const aba1 = simulacaoResult.map(s => ({
      'TAB / Veículo':        s.veiculo.tb,
      'Linha':                s.veiculo.linha,
      'KM Prog':              s.veiculo.kmProg,
      'Bat. Chegada (%)':     s.veiculo.batChegada,
      'Bat. Total (kWh)':     s.veiculo.bateriaTotal,
      'Energia Carregada (kWh)': s.kwh,
      'Carregador':           s.carregadorNome,
      'Bico':                 s.bicoNome,
      'Potência Bico (kW)':   Math.round(s.potencia),
      'Chegada Garagem':      fmtHora(s.veiculo.horaChegada),
      'Hora Disponível':      fmtHora(s.veiculo.horaDisponivel),
      'Início Carga':         fmtHora(s.inicio),
      'Fim Carga':            fmtHora(s.fim),
      'Duração':              duracaoTexto(s.tempoCargaMin),
      'Saída Programada':     s.veiculo.horaSaida !== null ? fmtHora(s.veiculo.horaSaida) : '—',
      'Carga Incompleta':     s.cargaIncompleta ? 'SIM' : 'NÃO',
      'Aguardou Fila':        s.aguardou ? 'SIM' : 'NÃO',
      'Tempo Espera':         s.tempoEspera > 0 ? duracaoTexto(s.tempoEspera) : '—'
    }));

    const horaMin = Math.min(...simulacaoResult.map(s => s.inicio));
    const horaMax = Math.max(...simulacaoResult.map(s => s.fim));
    const aba2 = [];
    for (let t = Math.floor(horaMin / 30) * 30; t <= horaMax; t += 30) {
      const ativos     = simulacaoResult.filter(s => s.inicio <= t && s.fim > t);
      const carrAtivos = new Set(ativos.map(s => s.carregadorId));
      aba2.push({
        'Hora':                fmtHora(t),
        'Carregadores em uso': carrAtivos.size,
        'Total Carregadores':  p.totalCarregadores,
        'Bicos em uso':        ativos.length,
        'Total Bicos':         p.totalBicos,
        'Ocupação %':          Math.round(ativos.length / p.totalBicos * 100) + '%',
        'Potência (kW)':       Math.round(ativos.reduce((s, x) => s + x.potencia, 0)),
        'Status':              ativos.length >= p.totalBicos ? 'MÁXIMO' : 'OK'
      });
    }

    const wb  = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(aba1);
    ws1['!cols'] = Object.keys(aba1[0]).map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, ws1, 'Gantt por Veículo');
    const ws2 = XLSX.utils.json_to_sheet(aba2);
    ws2['!cols'] = Object.keys(aba2[0]).map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws2, 'Ocupação por Hora');
    XLSX.writeFile(wb, `gantt_recarga_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /* ═══════ DEMO ═══════ */
  $('btn_demo')?.addEventListener('click', carregarDemo);
  function carregarDemo() {
    const demo = [
      { TAB:'3105', LINHA:'8012-10', 'KM PROG':180, 'BAT. CHEGADA':25, 'CHEGADA GAR':'21:30', 'SAÍDA GAR':'06:30', 'TOTAL BATERIA DO CARRO':280 },
      { TAB:'4108', LINHA:'8022-10', 'KM PROG':160, 'BAT. CHEGADA':35, 'CHEGADA GAR':'21:45', 'SAÍDA GAR':'06:00', 'TOTAL BATERIA DO CARRO':280 },
      { TAB:'3120', LINHA:'8023-10', 'KM PROG':200, 'BAT. CHEGADA':15, 'CHEGADA GAR':'22:00', 'SAÍDA GAR':'05:30', 'TOTAL BATERIA DO CARRO':350 },
      { TAB:'4112', LINHA:'8012-10', 'KM PROG':140, 'BAT. CHEGADA':45, 'CHEGADA GAR':'22:10', 'SAÍDA GAR':'06:30', 'TOTAL BATERIA DO CARRO':280 },
      { TAB:'3201', LINHA:'8003-10', 'KM PROG':175, 'BAT. CHEGADA':30, 'CHEGADA GAR':'22:15', 'SAÍDA GAR':'06:00', 'TOTAL BATERIA DO CARRO':280 },
      { TAB:'4205', LINHA:'8050-10', 'KM PROG':190, 'BAT. CHEGADA':20, 'CHEGADA GAR':'22:20', 'SAÍDA GAR':'05:45', 'TOTAL BATERIA DO CARRO':350 },
      { TAB:'3300', LINHA:'8022-10', 'KM PROG':155, 'BAT. CHEGADA':55, 'CHEGADA GAR':'22:30', 'SAÍDA GAR':'06:15', 'TOTAL BATERIA DO CARRO':280 },
      { TAB:'4301', LINHA:'8023-10', 'KM PROG':210, 'BAT. CHEGADA':10, 'CHEGADA GAR':'22:35', 'SAÍDA GAR':'05:30', 'TOTAL BATERIA DO CARRO':350 },
      { TAB:'3402', LINHA:'8012-10', 'KM PROG':168, 'BAT. CHEGADA':40, 'CHEGADA GAR':'22:40', 'SAÍDA GAR':'06:30', 'TOTAL BATERIA DO CARRO':280 },
      { TAB:'4403', LINHA:'8003-10', 'KM PROG':195, 'BAT. CHEGADA':28, 'CHEGADA GAR':'22:45', 'SAÍDA GAR':'06:00', 'TOTAL BATERIA DO CARRO':280 },
      { TAB:'3501', LINHA:'8050-10', 'KM PROG':145, 'BAT. CHEGADA':60, 'CHEGADA GAR':'23:00', 'SAÍDA GAR':'06:30', 'TOTAL BATERIA DO CARRO':280 },
      { TAB:'4502', LINHA:'8022-10', 'KM PROG':185, 'BAT. CHEGADA':18, 'CHEGADA GAR':'23:10', 'SAÍDA GAR':'05:45', 'TOTAL BATERIA DO CARRO':350 },
      { TAB:'3600', LINHA:'8023-10', 'KM PROG':170, 'BAT. CHEGADA':33, 'CHEGADA GAR':'23:15', 'SAÍDA GAR':'06:00', 'TOTAL BATERIA DO CARRO':280 },
      { TAB:'4601', LINHA:'8012-10', 'KM PROG':205, 'BAT. CHEGADA':12, 'CHEGADA GAR':'23:20', 'SAÍDA GAR':'05:30', 'TOTAL BATERIA DO CARRO':350 },
      { TAB:'3700', LINHA:'8003-10', 'KM PROG':160, 'BAT. CHEGADA':48, 'CHEGADA GAR':'23:30', 'SAÍDA GAR':'06:15', 'TOTAL BATERIA DO CARRO':280 },
      { TAB:'4701', LINHA:'8050-10', 'KM PROG':175, 'BAT. CHEGADA':22, 'CHEGADA GAR':'23:40', 'SAÍDA GAR':'06:00', 'TOTAL BATERIA DO CARRO':280 },
      { TAB:'3800', LINHA:'8012-10', 'KM PROG':190, 'BAT. CHEGADA':38, 'CHEGADA GAR':'23:50', 'SAÍDA GAR':'06:30', 'TOTAL BATERIA DO CARRO':280 },
      { TAB:'4801', LINHA:'8022-10', 'KM PROG':165, 'BAT. CHEGADA':55, 'CHEGADA GAR':'00:10', 'SAÍDA GAR':'06:15', 'TOTAL BATERIA DO CARRO':350 },
      { TAB:'3900', LINHA:'8023-10', 'KM PROG':155, 'BAT. CHEGADA':42, 'CHEGADA GAR':'00:20', 'SAÍDA GAR':'06:00', 'TOTAL BATERIA DO CARRO':280 },
      { TAB:'4901', LINHA:'8003-10', 'KM PROG':200, 'BAT. CHEGADA':8,  'CHEGADA GAR':'00:30', 'SAÍDA GAR':'05:45', 'TOTAL BATERIA DO CARRO':350 },
    ];
    veiculosBrutos = normalizarDados(demo);
    marcarZonaOk('dados_demo.xlsx', veiculosBrutos.length);
    mostrarPreview(veiculosBrutos, []);
    setTxt('k_veiculos', veiculosBrutos.length);
    resetarResultado();
  }

  /* ═══════ BOTÃO SIMULAR ═══════ */
  $('btn_simular')?.addEventListener('click', () => {
    const btn = $('btn_simular');
    if (btn) { btn.textContent = '⏳ Simulando...'; btn.disabled = true; }
    setTimeout(() => {
      try { simular(); }
      catch (err) { alert('Erro na simulação: ' + err.message); console.error(err); }
      finally { if (btn) { btn.textContent = '⚡ SIMULAR'; btn.disabled = false; } }
    }, 30);
  });

  // Recalcula ao mudar parâmetros se já simulou
  document.querySelectorAll('[data-cfg]').forEach(el => {
    el.addEventListener('change', () => { if (simulacaoResult.length > 0) setTimeout(simular, 60); });
  });

  function resetarResultado() {
    const sec = $('secao_resultado'); if (sec) sec.style.display = 'none';
    const badge = $('badge_status'); if (badge) { badge.textContent = '⚡ PRONTO'; badge.className = 'badge-ev'; }
    const aE = $('alerta_energia');    if (aE) aE.style.display = 'none';
    const aI = $('alerta_incompleto'); if (aI) aI.style.display = 'none';
    const aF = $('fila_alert');        if (aF) aF.classList.remove('visible');
    simulacaoResult = [];
  }

  /* ═══════ INICIALIZAÇÃO ═══════ */
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color       = '#7a9cc8';
    Chart.defaults.font.family = "'Segoe UI', sans-serif";
    Chart.defaults.font.size   = 10;
  }

  atualizarResumo();
  carregarDemo();
});

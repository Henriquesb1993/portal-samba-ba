/**
 * SIMULADOR DE RECARGA ELÉTRICA — Portal Sambaíba  v4
 * js/modules/simulador_recarga.js
 *
 * FAIXA HORÁRIA: 30 MINUTOS em tudo
 * Timeline fixo: 08:00 → 07:30 do dia seguinte (47 faixas de 30min)
 *
 * REGRAS:
 * 1. Energia por faixa de 30min (kW) — soma potência ativa ÷ limite da faixa
 * 2. Importação separada dos parâmetros
 * 3. Mapa carregadores com drill-down Mostrar/Ocultar
 * 4. Veículo permanece no bico até 100% — sem interrupção
 * 5. Gantt e todas as tabelas com faixas de 30min, 08:00→07:30 sem repetição
 * 6. Gráfico 1: bicos utilizados por faixa de 30min
 * 7. Tabela Mapa: veículos × faixas 30min com ID do bico
 * 8. Gráfico 2 (Matriz): bicos × faixas 30min com X
 */

document.addEventListener('DOMContentLoaded', () => {

  /* ══════════ CONSTANTES GLOBAIS ══════════ */
  const FAIXA     = 30;                       // minutos por faixa
  const TL_INICIO = 8 * 60;                   // 480 min = 08:00
  const TL_FIM    = (7 * 60 + 30) + 1440;    // 07:30 do dia seguinte = 1470 min (em escala >1440)

  // Gera todas as faixas de 30min de 08:00 até 07:30 (inclusive)
  // Usamos escala "timeline" onde horas após meia-noite = +1440
  const FAIXAS_30 = [];
  for (let t = TL_INICIO; t <= TL_FIM; t += FAIXA) FAIXAS_30.push(t);
  // FAIXAS_30: [480, 510, 540 ... 1440, 1470, ... 1890] (47 elementos: 08:00 → 07:30)

  const CORES = [
    '#00e5a0','#00aaff','#f9e000','#a78bfa','#ff8c00',
    '#19d46e','#3d7ef5','#f65858','#e879f9','#fb923c',
    '#34d399','#60a5fa','#fbbf24','#c084fc','#f87171',
    '#67e8f9','#86efac','#fde68a','#d8b4fe','#fca5a5',
    '#38bdf8','#4ade80','#facc15','#fb7185','#a3e635'
  ];

  /* ══════════ ESTADO ══════════ */
  let veiculosBrutos  = [];
  let simulacaoResult = [];
  let chartTimeline   = null;
  let paramsSim       = null;
  let mapaDetOpen     = false;

  /* ══════════ UTILITÁRIOS ══════════ */
  const $ = id => document.getElementById(id);
  const setTxt = (id, v) => { const e = $(id); if (e) e.textContent = v; };

  /** Minutos → "HH:MM" (normaliza para 0-1439) */
  function fmtHora(min) {
    if (min === null || min === undefined || isNaN(min)) return '—';
    const norm = ((Math.round(min) % 1440) + 1440) % 1440;
    return String(Math.floor(norm / 60)).padStart(2, '0') + ':' + String(norm % 60).padStart(2, '0');
  }

  /** Parse string/number de hora → minutos (0-1439) */
  function parseHora(str) {
    if (str === null || str === undefined) return null;
    str = String(str).trim();
    if (!str || str === '—') return null;
    if (!isNaN(str) && str.includes('.')) return Math.round((parseFloat(str) % 1) * 1440);
    if (!isNaN(str) && !str.includes(':')) return parseInt(str) * 60;
    const m = str.match(/(\d{1,2})[:\h](\d{2})/);
    if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
    return null;
  }

  /**
   * Converte minutos (0-1439) para escala timeline (480-1890).
   * Horários antes das 08:00 (< 480) são tratados como dia seguinte (+1440).
   */
  function toTL(min) {
    const m = ((Math.round(min) % 1440) + 1440) % 1440;
    return m < TL_INICIO ? m + 1440 : m;
  }

  function duracaoTexto(min) {
    if (!min || min <= 0) return '0min';
    const h = Math.floor(min / 60), m = Math.round(min % 60);
    return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`;
  }

  function corVeiculo(idx) { return CORES[idx % CORES.length]; }

  /* ══════════ TOGGLE PARÂMETROS ══════════ */
  $('btn_toggle_params')?.addEventListener('click', () => {
    const panel = $('params_panel'), btn = $('btn_toggle_params');
    const aberto = panel.style.display !== 'none';
    panel.style.display = aberto ? 'none' : '';
    btn.textContent = (aberto ? '▼' : '▲') + ' Parâmetros';
  });

  /* ══════════ TOGGLE MAPA DETALHE ══════════ */
  $('btn_toggle_mapa')?.addEventListener('click', () => {
    mapaDetOpen = !mapaDetOpen;
    const det = $('mapa_detalhe'), btn = $('btn_toggle_mapa');
    if (det) det.style.display = mapaDetOpen ? '' : 'none';
    if (btn) btn.textContent = mapaDetOpen ? '▲ Ocultar detalhe' : '▼ Mostrar detalhe';
  });

  /* ══════════ PARÂMETROS ══════════ */
  function getParams() {
    const preparo      = parseInt($('p_preparo')?.value)        || 30;
    const tolerancia   = parseInt($('p_tolerancia')?.value)     || 20;
    const energiaFaixa = parseFloat($('p_energia_total')?.value) || 99999;

    const cenarios = [];
    for (let i = 1; i <= 5; i++) {
      const qtd = parseInt($(`carr_qtd_${i}`)?.value) || 0;
      const pot = parseFloat($(`carr_pot_${i}`)?.value) || 0;
      if (qtd > 0 && pot > 0) cenarios.push({ qtd, pot });
    }
    if (!cenarios.length) cenarios.push({ qtd: 10, pot: 180 });

    // Expande em bicos: carregador N → bico N.1 e N.2
    const listaBicos = [];
    let numCarr = 1;
    cenarios.forEach(c => {
      for (let k = 0; k < c.qtd; k++) {
        for (let b = 1; b <= 2; b++) {
          listaBicos.push({
            carregadorId:   numCarr,
            carregadorNome: `Carregador ${numCarr}`,
            bicoNum:        b,
            bicoId:         `${numCarr}.${b}`,
            potencia:       c.pot / 2,
            potCarregador:  c.pot,
            slots: []
          });
        }
        numCarr++;
      }
    });
    listaBicos.sort((a, b) => b.potencia - a.potencia);

    const totalCarregadores = numCarr - 1;
    const totalBicos        = listaBicos.length;
    const potenciaTotal     = cenarios.reduce((s, c) => s + c.qtd * c.pot, 0);

    const batFallback = (() => {
      for (let i = 1; i <= 5; i++) {
        const q = parseInt($(`veh_qtd_${i}`)?.value) || 0;
        const b = parseFloat($(`veh_bat_${i}`)?.value) || 0;
        if (q > 0 && b > 0) return b;
      }
      return 280;
    })();

    return { preparo, tolerancia, energiaFaixa, cenarios, listaBicos, totalCarregadores, totalBicos, potenciaTotal, batFallback };
  }

  function atualizarResumo() {
    const p = getParams();
    setTxt('res_total_carr', p.totalCarregadores);
    setTxt('res_total_conn', p.totalBicos);
    setTxt('res_total_pot',  p.potenciaTotal + ' kW');
    const el = $('res_detalhes');
    if (el) el.textContent = p.cenarios.map(c => `${c.qtd}× ${c.pot}kW (${c.pot / 2}kW/bico)`).join(' | ');
  }
  document.querySelectorAll('[data-cfg]').forEach(el => {
    el.addEventListener('input',  atualizarResumo);
    el.addEventListener('change', atualizarResumo);
  });

  /* ══════════ UPLOAD ══════════ */
  $('upload_zone')?.addEventListener('click', () => $('file_input')?.click());
  $('upload_zone')?.addEventListener('dragover', e => { e.preventDefault(); $('upload_zone').classList.add('drag-over'); });
  $('upload_zone')?.addEventListener('dragleave', () => $('upload_zone').classList.remove('drag-over'));
  $('upload_zone')?.addEventListener('drop', e => {
    e.preventDefault(); $('upload_zone').classList.remove('drag-over');
    const f = e.dataTransfer.files[0]; if (f) processarArquivo(f);
  });
  $('file_input')?.addEventListener('change', e => { const f = e.target.files[0]; if (f) processarArquivo(f); });

  function processarArquivo(file) {
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        let dados;
        if (file.name.toLowerCase().endsWith('.csv')) {
          dados = parsearCSV(ev.target.result);
        } else {
          const wb = XLSX.read(ev.target.result, { type: 'array' });
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
    const sep = text.includes(';') ? ';' : ',';
    const lines = text.split('\n').filter(l => l.trim());
    const hdrs  = lines[0].split(sep).map(h => h.trim().replace(/"/g, ''));
    return lines.slice(1).map(line => {
      const vals = line.split(sep).map(v => v.trim().replace(/"/g, ''));
      const obj  = {}; hdrs.forEach((h, i) => { obj[h] = vals[i] ?? ''; }); return obj;
    });
  }

  function normCol(row, ...aliases) {
    const norm = k => k.trim().toUpperCase().replace(/[.\s]+/g, ' ');
    for (const alias of aliases) {
      const found = Object.keys(row).find(k => norm(k) === norm(alias));
      if (found !== undefined && row[found] !== '') return row[found];
    }
    return '';
  }

  function normalizarDados(dados) {
    const p = getParams();
    // Rastreia IDs já usados para garantir unicidade
    const idsUsados = new Set();
    return dados.map((row, idx) => {
      // ID CARRO é o identificador único — nunca pode repetir
      let idCarro = String(normCol(row, 'ID CARRO', 'ID_CARRO', 'IDCARRO') || '').trim();
      if (!idCarro) {
        // fallback: TAB + índice para garantir unicidade
        const tab = String(normCol(row, 'TAB', 'TB', 'TABELA') || '');
        idCarro = tab ? `${tab}-${idx}` : `V${String(idx + 1).padStart(3, '0')}`;
      }
      // Se por algum motivo vier duplicado, adiciona sufixo
      if (idsUsados.has(idCarro)) idCarro = `${idCarro}_${idx}`;
      idsUsados.add(idCarro);

      const tb        = String(normCol(row, 'TAB', 'TB', 'TABELA', 'VEICULO') || idCarro);
      const linha     = String(normCol(row, 'LINHA', 'LINE') || '');
      const kmProg    = parseFloat(normCol(row, 'KM PROG', 'KM_PROG', 'KM') || 0);
      const batCheg   = parseFloat(normCol(row, 'BAT. CHEGADA', 'BAT CHEGADA', 'BATERIA_CHEGADA', 'BATERIA') || 50);
      const horaCheg  = parseHora(normCol(row, 'CHEGADA GAR', 'CHEGADA_GAR', 'CHEGADA GAR.', 'CHEGADA'));
      const horaSaida = parseHora(normCol(row, 'SAÍDA GAR', 'SAIDA GAR', 'SAÍDA_GAR', 'SAIDA_GAR', 'SAÍDA GAR.'));
      const batTotal  = parseFloat(normCol(row, 'TOTAL BATERIA DO CARRO', 'TOTAL_BATERIA_DO_CARRO', 'BATERIA_TOTAL') || 0) || p.batFallback;
      return {
        idx,
        idCarro,   // identificador ÚNICO — usado em todos os lookups
        tb,        // TAB original — exibição
        linha, kmProg,
        batChegada:   isNaN(batCheg) ? 50 : Math.min(Math.max(batCheg * (batCheg <= 1 ? 100 : 1), 0), 100),
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
    const lbl = $('upload_lbl');           if (lbl) lbl.textContent = `${nome} — ${qtd} veículos`;
  }

  /* ══════════ PREVIEW ══════════ */
  function mostrarPreview(dados, resultados) {
    const wrap = $('preview_wrap'); if (!wrap) return;
    wrap.style.display = '';
    const info = $('preview_info'); if (info) info.textContent = `${dados.length} veículos importados`;
    const tbl  = $('tbl_preview');  if (!tbl) return;
    const comRes = resultados && resultados.length > 0;

    const linhas = dados.map(v => {
      const s = comRes ? resultados.find(r => r.veiculo.idCarro === v.idCarro) : null;
      let conclHtml;
      if (!s)              conclHtml = `<td style="color:#3a6a8a;text-align:center;">—</td>`;
      else if (s.cargaInc) conclHtml = `<td style="color:#ff3d3d;font-weight:800;font-family:Consolas,monospace;">⚠ ${fmtHora(s.fim)}</td>`;
      else                 conclHtml = `<td style="color:#00e5a0;font-weight:800;font-family:Consolas,monospace;">✅ ${fmtHora(s.fim)}</td>`;
      return `<tr>
        <td style="font-weight:900;color:${v.cor};font-family:Consolas,monospace;">${v.idCarro}</td>
        <td style="color:#7a9cc8;">${v.tb}</td>
        <td>${v.linha || '—'}</td>
        <td style="color:#7a9cc8;">${v.kmProg || '—'}</td>
        <td style="font-weight:700;color:${v.batChegada<30?'#ff3d3d':v.batChegada<60?'#f9e000':'#00e5a0'};">${v.batChegada}%</td>
        <td style="font-family:Consolas,monospace;">${fmtHora(v.horaChegada)}</td>
        <td style="font-family:Consolas,monospace;">${v.horaSaida!==null?fmtHora(v.horaSaida):'—'}</td>
        ${conclHtml}
      </tr>`;
    });
    tbl.innerHTML = `<thead><tr>
      <th style="color:#00e5a0;">ID CARRO</th><th>TAB</th><th>Linha</th><th>KM</th><th>Bat.</th><th>Chegada</th><th>Saída</th>
      <th style="color:#00e5a0;">⚡ Conclusão</th>
    </tr></thead><tbody>${linhas.join('')}</tbody>`;
  }

  /* ══════════ MOTOR DE SIMULAÇÃO ══════════ */
  function simular() {
    if (!veiculosBrutos.length) { alert('Importe uma planilha ou clique em Demo!'); return; }
    const p = getParams();
    paramsSim = p;

    const veiculos = veiculosBrutos.map(v => ({
      ...v,
      horaDisponivel: v.horaChegada + p.preparo,
      energiaNec:     Math.max(v.bateriaTotal * (1 - v.batChegada / 100), 1),
      prazoMax:       v.horaSaida !== null ? v.horaSaida - p.tolerancia : null
    })).sort((a, b) => a.horaDisponivel - b.horaDisponivel || a.batChegada - b.batChegada);

    const bicos = p.listaBicos.map(b => ({ ...b, slots: [] }));
    simulacaoResult = [];

    veiculos.forEach(veiculo => {
      const inicio = veiculo.horaDisponivel;

      // REGRA PRINCIPAL: cada idCarro só pode ocupar UM bico em todo o dia
      // Bico livre = nenhum slot ativo no momento E idCarro ainda não alocado neste bico
      const idCarroJaAlocado = simulacaoResult.some(r => r.veiculo.idCarro === veiculo.idCarro);
      if (idCarroJaAlocado) return; // segurança extra — não aloca duas vezes o mesmo carro

      const bicosLivres = bicos
        .filter(b => {
          // Verifica que o idCarro não está já neste bico (em nenhum slot)
          const carroNesteB = b.slots.some(s => s.idCarro === veiculo.idCarro);
          if (carroNesteB) return false;
          // Verifica disponibilidade temporal: último slot terminou antes do veículo estar pronto
          if (!b.slots.length) return true;
          const ultimoFim = Math.max(...b.slots.map(s => s.fim));
          return ultimoFim <= inicio + 0.01;
        })
        .sort((a, c) => c.potencia - a.potencia); // prefere maior potência

      if (bicosLivres.length > 0) {
        alocar(bicosLivres[0], veiculo, inicio, false);
      } else {
        // Fila: bico que libera mais cedo (excluindo os que já têm este carro)
        const candidatos = bicos.filter(b => !b.slots.some(s => s.idCarro === veiculo.idCarro));
        if (!candidatos.length) return; // segurança
        const melhor = candidatos.reduce((best, b) => {
          const lib = b.slots.length ? Math.max(...b.slots.map(s => s.fim)) : 0;
          return lib < best.lib ? { b, lib } : best;
        }, { b: candidatos[0], lib: Infinity });
        alocar(melhor.b, veiculo, Math.max(melhor.lib, inicio), true);
      }
    });

    renderizarTudo(bicos, p);
  }

  function alocar(bico, veiculo, inicio, aguardou) {
    const tempoCarga = Math.ceil((veiculo.energiaNec / bico.potencia) * 60);
    const fim        = inicio + tempoCarga;
    const cargaInc   = veiculo.prazoMax !== null && fim > veiculo.prazoMax;
    // Guarda idCarro no slot — garantia de unicidade por bico
    bico.slots.push({ inicio, fim, idCarro: veiculo.idCarro });
    simulacaoResult.push({
      veiculo,
      carregadorId:   bico.carregadorId,
      carregadorNome: bico.carregadorNome,
      bicoNum:        bico.bicoNum,
      bicoId:         bico.bicoId,
      potencia:       bico.potencia,
      potCarregador:  bico.potCarregador,
      inicio, fim, kwh: Math.round(veiculo.energiaNec),
      tempoCarga, aguardou, cargaInc,
      tempoEspera: aguardou ? inicio - veiculo.horaDisponivel : 0
    });
  }

  /* ══════════ RENDERIZAÇÃO ══════════ */
  function renderizarTudo(bicos, p) {
    const slots = simulacaoResult;
    if (!slots.length) return;

    // Ocupação por faixa de 30min — conta bicos FÍSICOS únicos em uso
    // Um bico nunca pode estar em 2 veículos ao mesmo tempo
    const ocupacao = FAIXAS_30.map(t => {
      const fim_t  = t + FAIXA;
      // Para cada bico físico, verifica se tem exatamente 1 slot ativo nessa faixa
      const bicosEmUso = new Set();
      const carrEmUso  = new Set();
      let potUsada = 0;
      const ativosSlots = [];

      slots.forEach(s => {
        const sIn  = toTL(s.inicio);
        const sFim = toTL(s.fim);
        if (sIn < fim_t && sFim > t) {
          // Só conta se o bico ainda não foi contado nessa faixa (unicidade)
          if (!bicosEmUso.has(s.bicoId)) {
            bicosEmUso.add(s.bicoId);
            carrEmUso.add(s.carregadorId);
            potUsada += s.potencia;
            ativosSlots.push(s);
          }
        }
      });

      return {
        t,
        bicos:        bicosEmUso.size,
        carregadores: carrEmUso.size,
        potencia:     Math.round(potUsada),
        ativos:       ativosSlots
      };
    });

    // Agrupa faixas de 30min em horas cheias para cálculo de potência por hora
    // Cada hora = 2 faixas de 30min; a potência da hora = max das 2 faixas
    const potMaxPorHora = [];
    for (let i = 0; i < ocupacao.length; i += 2) {
      const f1 = ocupacao[i]?.potencia || 0;
      const f2 = ocupacao[i + 1]?.potencia || 0;
      potMaxPorHora.push(Math.max(f1, f2));
    }
    const potMaxHora   = Math.max(...potMaxPorHora, 0);
    const potMax       = Math.max(...ocupacao.map(o => o.potencia), 0); // pico real 30min
    const picoBicos    = Math.max(...ocupacao.map(o => o.bicos), 0);
    const picoCarr     = Math.max(...ocupacao.map(o => o.carregadores), 0);
    const faixaPico    = ocupacao.find(o => o.potencia === potMax);
    const emFila       = slots.filter(s => s.aguardou).length;
    const incomp       = slots.filter(s => s.cargaInc).length;
    const gargalo      = picoCarr >= p.totalCarregadores;
    const excedeE      = potMaxHora > p.energiaFaixa;  // compara por hora
    const pctEner      = p.energiaFaixa > 0 ? Math.round(potMaxHora / p.energiaFaixa * 100) : 0;

    // KPIs
    setTxt('k_veiculos',      veiculosBrutos.length);
    setTxt('k_pico_carr',     `${picoCarr}/${p.totalCarregadores}`);
    setTxt('k_pico_carr_sub', picoCarr >= p.totalCarregadores ? '⚠ MÁXIMO' : 'simultâneos');
    setTxt('k_pico_conn',     `${picoBicos}/${p.totalBicos}`);
    setTxt('k_pico_conn_sub', 'simultâneos');
    setTxt('k_energia',       `${potMaxHora.toLocaleString('pt-BR')} kW / ${p.energiaFaixa.toLocaleString('pt-BR')} kW — ${pctEner}%`);
    setTxt('k_energia_sub',   excedeE ? '⚠ LIMITE EXCEDIDO por hora' : 'dentro do limite por hora');
    setTxt('k_hora_pico',     faixaPico ? fmtHora(faixaPico.t) : '—');
    setTxt('k_pot_max',       `${potMax} kW no pico`);
    setTxt('k_fila',          emFila);
    setTxt('k_fila_sub',      emFila > 0 ? 'aguardaram bico' : 'sem fila');
    setTxt('k_incompleto',    incomp);

    const kG = $('k_gargalo'), kGS = $('k_gargalo_sub');
    if (kG) {
      if (excedeE)       { kG.innerHTML = '<span style="color:#ff3d3d">⚠ ENERGIA</span>';    if (kGS) kGS.textContent = 'Limite de potência excedido!'; }
      else if (gargalo)  { kG.innerHTML = '<span style="color:#ff3d3d">⚠ GARGALO</span>';    if (kGS) kGS.textContent = 'Carregadores insuficientes!'; }
      else if (incomp)   { kG.innerHTML = '<span style="color:#ff3d3d">⚠ INCOMPLETO</span>'; if (kGS) kGS.textContent = `${incomp} sem carga total`; }
      else if (emFila)   { kG.innerHTML = '<span style="color:#f9e000">⚠ FILA</span>';       if (kGS) kGS.textContent = `${emFila} aguardaram`; }
      else               { kG.innerHTML = '<span style="color:#00e5a0">✓ OK</span>';           if (kGS) kGS.textContent = 'Tudo carregado a tempo'; }
    }

    const badge = $('badge_status');
    if (badge) {
      badge.textContent = (excedeE || gargalo || incomp) ? '⚠ ATENÇÃO' : '✅ SIMULADO';
      badge.className   = 'badge-ev ' + ((excedeE || gargalo || incomp) ? 'error' : 'simulated');
    }

    // Alerta energia
    const aE = $('alerta_energia');
    if (aE) {
      if (excedeE) {
        // Agrupa em horas e mostra quais horas excedem
        const horasRuins = [];
        for (let i = 0; i < ocupacao.length; i += 2) {
          const f1 = ocupacao[i], f2 = ocupacao[i+1];
          const potHora = Math.max(f1?.potencia||0, f2?.potencia||0);
          if (potHora > p.energiaFaixa) horasRuins.push(`${fmtHora(f1.t)} → ${potHora} kW`);
        }
        aE.style.display = '';
        aE.innerHTML = `⚡ <b>LIMITE EXCEDIDO em ${horasRuins.length} hora(s):</b> `
          + horasRuins.slice(0, 5).join(' | ')
          + (horasRuins.length > 5 ? ` e mais ${horasRuins.length - 5}...` : '');
      } else aE.style.display = 'none';
    }

    const aI = $('alerta_incompleto');
    if (aI) {
      if (incomp > 0) {
        const lista = slots.filter(s => s.cargaInc).map(s => `${s.veiculo.tb} (termina ${fmtHora(s.fim)}, sai ${fmtHora(s.veiculo.horaSaida)})`).join(', ');
        aI.style.display = '';
        aI.innerHTML = `⚠ <b>${incomp} veículo(s) não carregaram 100% antes da saída:</b> ${lista}`;
      } else aI.style.display = 'none';
    }

    const aF = $('fila_alert');
    if (aF) {
      if (emFila > 0) { aF.textContent = `⏳ ${emFila} veículo(s) aguardaram bico disponível.`; aF.classList.add('visible'); }
      else aF.classList.remove('visible');
    }

    const ts = $('sim_timestamp'); if (ts) ts.textContent = `Simulado: ${new Date().toLocaleTimeString('pt-BR')}`;
    const sec = $('secao_resultado'); if (sec) sec.style.display = '';

    renderGantt(bicos, slots, p);
    renderMapaCarregadores(bicos, slots, p);
    renderGrafico1Timeline(ocupacao, p);
    renderMapaUtilizacao(slots);
    renderGrafico2Matriz(slots);
    renderTabelaOcupacao(ocupacao, p);
    renderListaVeiculos(slots);
    mostrarPreview(veiculosBrutos, slots);
  }

  /* ══════════ GANTT (08:00 → 07:30, faixas 30min) ══════════ */
  function renderGantt(bicos, slots, p) {
    const wrap = $('gantt_wrap'); if (!wrap) return;
    const PX_MIN = 2;             // pixels por minuto
    const BASE   = TL_INICIO;    // 480
    const TOTAL  = TL_FIM - BASE; // (07:30+1dia) - 08:00 = 23.5h = 1410 min

    // Cabeçalho: marcas a cada 30min (mas exibe label só a cada 60min para não lotar)
    const thCols = FAIXAS_30.map((t, i) => {
      const label = (i % 2 === 0) ? fmtHora(t) : '';
      return `<th style="min-width:${FAIXA * PX_MIN}px;font-size:8px;padding:3px 1px;">${label}</th>`;
    }).join('');

    const thead = `<tr>
      <th class="row-head" style="min-width:100px;">Bico</th>
      ${thCols}
    </tr>`;

    const linhasBicos = [...bicos].sort((a, b) => a.carregadorId - b.carregadorId || a.bicoNum - b.bicoNum);
    const totalPx = TOTAL * PX_MIN;

    const rows = linhasBicos.map(b => {
      const bicoSlots = slots.filter(s => s.carregadorId === b.carregadorId && s.bicoNum === b.bicoNum)
        .sort((a, c) => a.inicio - c.inicio);

      const blocos = bicoSlots.map(s => {
        const sIn   = toTL(s.inicio);
        const sFim  = toTL(s.fim);
        const left  = Math.max(sIn - BASE, 0) * PX_MIN;
        const width = Math.max((sFim - sIn) * PX_MIN, 24);
        const cls   = s.cargaInc ? 'gantt-block incompleto-block' : s.aguardou ? 'gantt-block fila-block' : 'gantt-block';
        return `<div class="${cls}"
          style="left:${left}px;width:${width}px;background:${s.veiculo.cor};"
          data-tb="${s.veiculo.tb}" data-linha="${s.veiculo.linha || '—'}"
          data-inicio="${fmtHora(s.inicio)}" data-fim="${fmtHora(s.fim)}"
          data-kwh="${s.kwh}" data-pot="${Math.round(s.potencia)}"
          data-bat="${s.veiculo.batChegada}" data-tempo="${s.tempoCarga}"
          data-bico="${b.bicoId}"
          data-aguardou="${s.aguardou ? 'SIM' : 'NÃO'}"
          data-inc="${s.cargaInc ? 'SIM' : 'NÃO'}"
          data-saida="${s.veiculo.horaSaida !== null ? fmtHora(s.veiculo.horaSaida) : '—'}"
          onmouseenter="window.evTooltipShow(event,this)" onmouseleave="window.evTooltipHide()"
        >${s.veiculo.tb}</div>`;
      }).join('');

      const saidasHtml = bicoSlots.filter(s => s.veiculo.horaSaida !== null).map(s => {
        const left = Math.max(toTL(s.veiculo.horaSaida) - BASE, 0) * PX_MIN;
        return `<div class="gantt-saida" style="left:${left}px;" title="Saída: ${fmtHora(s.veiculo.horaSaida)}"></div>`;
      }).join('');

      return `<tr>
        <td class="row-head">${b.bicoId}<br><span style="font-size:9px;color:#3d7ef5;">${b.potencia}kW</span></td>
        <td colspan="${FAIXAS_30.length}" style="position:relative;padding:0;height:26px;min-width:${totalPx}px;">
          ${saidasHtml}${blocos}
        </td>
      </tr>`;
    }).join('');

    wrap.innerHTML = `<table class="gantt-tbl" style="min-width:${totalPx + 106}px;">
      <thead>${thead}</thead><tbody>${rows}</tbody>
    </table>`;
  }

  window.evTooltipShow = (e, el) => {
    const tt = $('gantt_tooltip'); if (!tt) return;
    tt.innerHTML = `
      <div style="font-weight:900;color:${el.style.background};margin-bottom:4px;">🚌 ${el.dataset.tb}</div>
      <div style="color:#7a9cc8;">Linha: ${el.dataset.linha}</div>
      <div style="color:#c8dcff;">📍 ${el.dataset.bico}</div>
      <div>⏱ ${el.dataset.inicio} → ${el.dataset.fim} (${duracaoTexto(parseInt(el.dataset.tempo))})</div>
      <div style="color:#f9e000;">⚡ ${el.dataset.kwh} kWh · ${el.dataset.pot} kW</div>
      <div style="color:${+el.dataset.bat<30?'#ff3d3d':+el.dataset.bat<60?'#f9e000':'#00e5a0'};">🔋 Bat. chegada: ${el.dataset.bat}%</div>
      <div style="color:#5a8ab0;">🚪 Saída: ${el.dataset.saida}</div>
      ${el.dataset.aguardou==='SIM'?'<div style="color:#ff8c00;margin-top:2px;">⏳ Aguardou bico</div>':''}
      ${el.dataset.inc==='SIM'?'<div style="color:#ff3d3d;margin-top:2px;">⚠ Carga incompleta!</div>':''}`;
    tt.style.display = 'block';
    tt.style.left    = (e.clientX + 16) + 'px';
    tt.style.top     = (e.clientY - 10) + 'px';
  };
  window.evTooltipHide = () => { const tt = $('gantt_tooltip'); if (tt) tt.style.display = 'none'; };
  document.addEventListener('mousemove', e => {
    const tt = $('gantt_tooltip');
    if (tt && tt.style.display !== 'none') { tt.style.left = (e.clientX + 16) + 'px'; tt.style.top = (e.clientY - 10) + 'px'; }
  });

  /* ══════════ MAPA CARREGADORES ══════════ */
  function renderMapaCarregadores(bicos, slots, p) {
    const resumo  = $('mapa_resumo');  if (!resumo)  return;
    const detalhe = $('mapa_detalhe'); if (!detalhe) return;

    // Agrupa por carregador
    const mapaCarr = {};
    slots.forEach(s => {
      const id = s.carregadorId;
      if (!mapaCarr[id]) mapaCarr[id] = { nome: s.carregadorNome, pot: s.potCarregador, b1: [], b2: [] };
      if (s.bicoNum === 1) mapaCarr[id].b1.push(s);
      else                 mapaCarr[id].b2.push(s);
    });
    bicos.forEach(b => {
      if (!mapaCarr[b.carregadorId]) mapaCarr[b.carregadorId] = { nome: b.carregadorNome, pot: b.potCarregador, b1: [], b2: [] };
    });

    const ids = Object.keys(mapaCarr).map(Number).sort((a, b) => a - b);

    // RESUMO: grid compacto, um card por carregador
    resumo.innerHTML = ids.map(id => {
      const c = mapaCarr[id];
      const total = c.b1.length + c.b2.length;
      const hasInc = [...c.b1, ...c.b2].some(s => s.cargaInc);
      const cor = hasInc ? '#ff3d3d' : total > 0 ? '#00e5a0' : '#3a6a8a';
      return `<div class="carr-resumo-card" style="border-color:${cor}40;">
        <div style="font-size:10px;font-weight:900;color:${cor};">${c.nome}</div>
        <div style="font-size:9px;color:#5a8ab0;">${c.pot} kW</div>
        <div style="font-size:14px;font-weight:900;color:${cor};margin-top:4px;">${total}</div>
        <div style="font-size:9px;color:#3a6a8a;">B1: ${c.b1.length} · B2: ${c.b2.length}</div>
      </div>`;
    }).join('');

    // DETALHE: drill-down completo
    detalhe.innerHTML = ids.map(id => {
      const c = mapaCarr[id];
      const hasInc = [...c.b1, ...c.b2].some(s => s.cargaInc);
      const bordaCor = hasInc ? '#ff3d3d' : (c.b1.length + c.b2.length) > 0 ? '#00e5a0' : '#1a3a5c';

      const bicosHtml = [{ n: 1, lista: c.b1 }, { n: 2, lista: c.b2 }].map(({ n, lista }) => {
        if (!lista.length) return `<div class="bico-col"><div class="bico-label">Bico ${n}</div><div class="bico-vazio">— livre —</div></div>`;
        const vehs = lista.map(s => `
          <div class="bico-veh ${s.cargaInc ? 'incompleto' : s.aguardou ? 'aguardou' : ''}">
            <span style="font-weight:900;color:${s.veiculo.cor};font-family:Consolas,monospace;">🚌 ${s.veiculo.idCarro}</span>
            <span class="bico-linha">${s.veiculo.tb !== s.veiculo.idCarro ? ' · '+s.veiculo.tb : ''} ${s.veiculo.linha || ''}</span>
            <span class="bico-hora">${fmtHora(s.inicio)} → ${fmtHora(s.fim)}</span>
            ${s.cargaInc ? '<span class="bico-tag tag-inc">⚠ incompleto</span>' : ''}
            ${s.aguardou  ? '<span class="bico-tag tag-fila">⏳ fila</span>' : ''}
          </div>`).join('');
        return `<div class="bico-col"><div class="bico-label">Bico ${n}</div>${vehs}</div>`;
      }).join('');

      return `<div class="charger-card-new" style="border-color:${bordaCor};">
        <div class="charger-head-new">
          <span class="charger-name-new">${c.nome}</span>
          <span class="charger-kw-new">${c.pot} kW · ${c.pot / 2} kW/bico</span>
        </div>
        <div class="bicos-row">${bicosHtml}</div>
      </div>`;
    }).join('');
  }

  /* ══════════ GRÁFICO 1 — TIMELINE BICOS POR 30MIN ══════════ */
  function renderGrafico1Timeline(ocupacao, p) {
    const el = $('c_timeline'); if (!el) return;
    if (chartTimeline) { chartTimeline.destroy(); chartTimeline = null; }

    // Labels: exibe HH:MM mas só a cada 60min (2 faixas) para não lotar
    const labels = ocupacao.map((o, i) => i % 2 === 0 ? fmtHora(o.t) : '');
    const bicos  = ocupacao.map(o => o.bicos);
    const pots   = ocupacao.map(o => o.potencia);
    const limite = ocupacao.map(() => p.energiaFaixa);

    chartTimeline = new Chart(el.getContext('2d'), {
      data: {
        labels,
        datasets: [
          {
            type: 'bar', label: 'Bicos em uso (30min)', data: bicos,
            backgroundColor: ocupacao.map(o => o.potencia > p.energiaFaixa ? 'rgba(255,61,61,.55)' : 'rgba(0,229,160,.45)'),
            borderColor:     ocupacao.map(o => o.potencia > p.energiaFaixa ? '#ff3d3d' : '#00e5a0'),
            borderWidth: 1, borderRadius: 2, yAxisID: 'y2'
          },
          {
            type: 'line', label: 'Potência (kW)', data: pots,
            borderColor: '#f9e000', backgroundColor: 'rgba(249,224,0,.05)',
            fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2, yAxisID: 'y'
          },
          {
            type: 'line', label: `Limite (${p.energiaFaixa} kW)`, data: limite,
            borderColor: 'rgba(255,61,61,.5)', borderDash: [5, 3],
            pointRadius: 0, fill: false, borderWidth: 1.5, yAxisID: 'y'
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top', labels: { color: '#7a9cc8', boxWidth: 10, font: { size: 10 } } } },
        scales: {
          x:  { grid: { color: 'rgba(26,58,92,.5)' }, ticks: { color: '#5a8ab0', font: { size: 8 }, maxRotation: 45 } },
          y:  { position: 'left',  grid: { color: 'rgba(26,58,92,.3)' }, ticks: { color: '#f9e000', callback: v => v + ' kW', font: { size: 9 } } },
          y2: { position: 'right', grid: { display: false }, ticks: { color: '#00e5a0', callback: v => v + ' b', font: { size: 9 } }, min: 0 }
        }
      }
    });
  }

  /* ══════════ MAPA DE UTILIZAÇÃO (veículos × faixas 30min) ══════════ */
  function renderMapaUtilizacao(slots) {
    const tbl = $('tbl_mapa_util'); if (!tbl) return;
    const p   = paramsSim || getParams();

    const faixasAtivas = FAIXAS_30.filter(t => {
      const fim_t = t + FAIXA;
      return slots.some(s => { const sI = toTL(s.inicio), sF = toTL(s.fim); return sI < fim_t && sF > t; });
    });

    // Linha QTD CONECTADO: conta bicos ÚNICOS por faixa
    const qtdConectado = faixasAtivas.map(t => {
      const fim_t = t + FAIXA;
      const bicosSet = new Set();
      slots.forEach(s => {
        const sI = toTL(s.inicio), sF = toTL(s.fim);
        if (sI < fim_t && sF > t) bicosSet.add(s.bicoId);
      });
      return bicosSet.size;
    });

    const thead = `<thead>
      <tr>
        <th class="mu-th-fix" style="color:#00e5a0;">ID CARRO</th>
        <th class="mu-th-fix2">TAB</th>
        <th class="mu-th-fix2">Linha</th>
        ${faixasAtivas.map(t => `<th style="min-width:42px;font-size:8px;">${fmtHora(t)}</th>`).join('')}
      </tr>
      <tr style="background:#060c18;">
        <td class="mu-td-fix" colspan="3" style="font-size:9px;font-weight:800;color:#f9e000;white-space:nowrap;">QTD CONECTADO</td>
        ${qtdConectado.map(q => {
          const pct  = Math.round(q / p.totalBicos * 100);
          const cor  = pct >= 100 ? '#ff3d3d' : pct >= 80 ? '#f9e000' : '#00e5a0';
          return `<td style="text-align:center;font-size:9px;font-weight:900;color:${cor};">${q}/${p.totalBicos}</td>`;
        }).join('')}
      </tr>
    </thead>`;

    const rows = veiculosBrutos.map(v => {
      const s = slots.find(r => r.veiculo.idCarro === v.idCarro);
      const cells = faixasAtivas.map(t => {
        if (!s) return '<td></td>';
        const fim_t = t + FAIXA;
        const sI = toTL(s.inicio), sF = toTL(s.fim);
        if (sI < fim_t && sF > t) {
          return `<td style="background:${v.cor}18;color:${v.cor};font-weight:800;font-size:10px;text-align:center;font-family:Consolas,monospace;">${s.bicoId}</td>`;
        }
        return '<td></td>';
      }).join('');
      return `<tr>
        <td class="mu-td-fix" style="color:${v.cor};font-family:Consolas,monospace;font-weight:900;">${v.idCarro}</td>
        <td style="color:#7a9cc8;font-size:10px;white-space:nowrap;">${v.tb}</td>
        <td style="color:#5a8ab0;font-size:10px;white-space:nowrap;">${v.linha || '—'}</td>
        ${cells}
      </tr>`;
    }).join('');

    tbl.innerHTML = thead + `<tbody>${rows}</tbody>`;
  }

  /* ══════════ GRÁFICO 2 — MATRIZ BICOS × FAIXAS 30MIN ══════════ */
  function renderGrafico2Matriz(slots) {
    const tbl = $('tbl_matriz'); if (!tbl) return;
    const p   = paramsSim || getParams();

    const bicosAtivos = [...new Set(slots.map(s => s.bicoId))].sort((a, b) => {
      const [ca, ba] = a.split('.').map(Number);
      const [cb, bb] = b.split('.').map(Number);
      return ca - cb || ba - bb;
    });

    const faixasAtivas = FAIXAS_30.filter(t => {
      const fim_t = t + FAIXA;
      return slots.some(s => { const sI = toTL(s.inicio), sF = toTL(s.fim); return sI < fim_t && sF > t; });
    });

    // Linha QTD: bicos únicos em uso por faixa
    const qtdPorFaixa = faixasAtivas.map(t => {
      const fim_t = t + FAIXA;
      const usados = new Set();
      slots.forEach(s => { const sI = toTL(s.inicio), sF = toTL(s.fim); if (sI < fim_t && sF > t) usados.add(s.bicoId); });
      return usados.size;
    });

    const thead = `<thead>
      <tr>
        <th style="position:sticky;left:0;z-index:2;min-width:52px;background:var(--ev-card2);">Bico</th>
        ${faixasAtivas.map(t => `<th style="min-width:42px;font-size:8px;">${fmtHora(t)}</th>`).join('')}
      </tr>
      <tr style="background:#060c18;">
        <td style="position:sticky;left:0;background:#060c18;font-size:9px;font-weight:800;color:#f9e000;padding:3px 7px;white-space:nowrap;">QTD</td>
        ${qtdPorFaixa.map(q => {
          const pct = Math.round(q / p.totalBicos * 100);
          const cor = pct >= 100 ? '#ff3d3d' : pct >= 80 ? '#f9e000' : '#00e5a0';
          return `<td style="text-align:center;font-size:9px;font-weight:900;color:${cor};">${q}/${p.totalBicos}</td>`;
        }).join('')}
      </tr>
    </thead>`;

    const rows = bicosAtivos.map(bicoId => {
      const bicoSlots = slots.filter(s => s.bicoId === bicoId);
      const cells = faixasAtivas.map(t => {
        const fim_t = t + FAIXA;
        const ativo = bicoSlots.find(s => { const sI = toTL(s.inicio), sF = toTL(s.fim); return sI < fim_t && sF > t; });
        if (ativo) return `<td style="background:${ativo.veiculo.cor}22;color:${ativo.veiculo.cor};text-align:center;font-weight:900;font-size:11px;" title="${ativo.veiculo.idCarro}">X</td>`;
        return `<td style="text-align:center;color:#1a3a5c;font-size:9px;">·</td>`;
      }).join('');
      return `<tr>
        <td style="position:sticky;left:0;background:var(--ev-card2);font-weight:800;color:#3d7ef5;font-size:10px;padding:3px 7px;font-family:Consolas,monospace;">${bicoId}</td>
        ${cells}
      </tr>`;
    }).join('');

    tbl.innerHTML = thead + `<tbody>${rows}</tbody>`;
  }

  /* ══════════ TABELA OCUPAÇÃO DETALHADA (30min) ══════════ */
  function renderTabelaOcupacao(ocupacao, p) {
    const tb = $('tb_ocupacao'); if (!tb) return;
    const potMaxGlobal = Math.max(...ocupacao.map(o => o.potencia), 1);

    tb.innerHTML = ocupacao
      .filter(o => o.bicos > 0 || o.potencia > 0)
      .map(o => {
        const pctOcup = Math.round(o.bicos / p.totalBicos * 100);
        const excedeE = o.potencia > p.energiaFaixa;
        const isPico  = o.potencia === potMaxGlobal;
        const corOcup = pctOcup >= 100 ? '#ff3d3d' : pctOcup >= 80 ? '#f9e000' : '#00e5a0';
        const corPot  = excedeE ? '#ff3d3d' : '#f9e000';
        const status  = excedeE ? '⚠ ENERGIA' : pctOcup >= 100 ? '⚠ MÁXIMO' : pctOcup >= 80 ? '⚠ ALTO' : '✓ OK';
        const stCor   = excedeE ? '#ff3d3d' : pctOcup >= 100 ? '#ff3d3d' : pctOcup >= 80 ? '#f9e000' : '#00e5a0';
        const barW    = Math.max(Math.round(o.potencia / p.energiaFaixa * 60), 3);

        return `<tr ${isPico ? 'class="pico"' : ''}>
          <td style="font-family:Consolas,monospace;font-weight:800;color:${isPico?'#ff3d3d':'#eaf2ff'};">${fmtHora(o.t)}${isPico?' 🔺':''}</td>
          <td><b style="color:#00aaff;">${o.carregadores}</b><span style="color:#3a6a8a;"> / ${p.totalCarregadores}</span></td>
          <td><b style="color:#f9e000;">${o.bicos}</b><span style="color:#3a6a8a;"> / ${p.totalBicos}</span></td>
          <td style="color:#5a8ab0;">${p.totalBicos}</td>
          <td><span class="ocp-bar" style="width:${Math.max(pctOcup*.6,3)}px;background:${corOcup};"></span><b style="color:${corOcup};">${pctOcup}%</b></td>
          <td><span class="ocp-bar" style="width:${barW}px;background:${corPot};"></span><b style="color:${corPot};">${o.potencia}</b></td>
          <td style="color:#5a8ab0;">${p.energiaFaixa.toLocaleString('pt-BR')}</td>
          <td><span style="color:${stCor};font-weight:800;font-size:10px;">${status}</span></td>
        </tr>`;
      }).join('');
  }

  /* ══════════ LISTA VEÍCULOS ══════════ */
  function renderListaVeiculos(slots) {
    const el = $('veh_list'); if (!el) return;
    el.innerHTML = veiculosBrutos.map(v => {
      const s = slots.find(x => x.veiculo.idCarro === v.idCarro);
      if (!s)         return `<span class="veh-badge sem-carga" title="Sem alocação">🚫 ${v.idCarro}</span>`;
      if (s.cargaInc) return `<span class="veh-badge" style="color:#ff3d3d;border-color:rgba(255,61,61,.3);background:rgba(255,61,61,.07);" title="Incompleto — termina ${fmtHora(s.fim)}, sai ${fmtHora(v.horaSaida)}">⚠ ${v.idCarro}</span>`;
      if (s.aguardou) return `<span class="veh-badge fila-v" title="Aguardou ${duracaoTexto(s.tempoEspera)} · ${s.bicoId}">⏳ ${v.idCarro}</span>`;
      return `<span class="veh-badge ok" style="color:${v.cor};border-color:${v.cor}30;background:${v.cor}10;" title="${s.bicoId} · ${fmtHora(s.inicio)}→${fmtHora(s.fim)} · ${s.kwh}kWh">⚡ ${v.idCarro}</span>`;
    }).join('');
  }

  /* ══════════ EXPORTAR EXCEL ══════════ */
  $('btn_exportar_gantt')?.addEventListener('click', () => {
    if (!simulacaoResult.length) { alert('Execute a simulação primeiro.'); return; }
    const p = paramsSim || getParams();

    const aba1 = simulacaoResult.map(s => ({
      'TAB':                  s.veiculo.tb,
      'Linha':                s.veiculo.linha,
      'KM Prog':              s.veiculo.kmProg,
      'Bat. Chegada (%)':     s.veiculo.batChegada,
      'Bat. Total (kWh)':     s.veiculo.bateriaTotal,
      'Energia Carregada (kWh)': s.kwh,
      'Carregador':           s.carregadorNome,
      'Bico':                 s.bicoId,
      'Potência Bico (kW)':   Math.round(s.potencia),
      'Chegada Garagem':      fmtHora(s.veiculo.horaChegada),
      'Hora Disponível':      fmtHora(s.veiculo.horaDisponivel),
      'Início Carga':         fmtHora(s.inicio),
      'Fim Carga':            fmtHora(s.fim),
      'Duração':              duracaoTexto(s.tempoCarga),
      'Saída Programada':     s.veiculo.horaSaida !== null ? fmtHora(s.veiculo.horaSaida) : '—',
      'Carga Incompleta':     s.cargaInc   ? 'SIM' : 'NÃO',
      'Aguardou Fila':        s.aguardou   ? 'SIM' : 'NÃO'
    }));

    const aba2 = FAIXAS_30.map(t => {
      const fim_t  = t + FAIXA;
      // Conta bicos ÚNICOS ativos (corrigido)
      const bicosSet = new Set();
      const carrSet  = new Set();
      let pot = 0;
      simulacaoResult.forEach(s => {
        const sI = toTL(s.inicio), sF = toTL(s.fim);
        if (sI < fim_t && sF > t && !bicosSet.has(s.bicoId)) {
          bicosSet.add(s.bicoId); carrSet.add(s.carregadorId); pot += s.potencia;
        }
      });
      const bicosUso = bicosSet.size;
      const potR = Math.round(pot);
      return {
        'Faixa (30min)':    fmtHora(t),
        'Bicos em uso':     bicosUso,
        'Cap. total bicos': p.totalBicos,
        'Carregadores':     carrSet.size,
        'Ocupação %':       Math.round(bicosUso / p.totalBicos * 100) + '%',
        'Potência (kW)':    potR,
        'Limite kW/hora':   p.energiaFaixa,
        'Status':           potR > p.energiaFaixa ? 'EXCEDE' : bicosUso >= p.totalBicos ? 'MÁXIMO' : 'OK'
      };
    });

    const wb  = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(aba1);
    ws1['!cols'] = Object.keys(aba1[0]).map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, ws1, 'Gantt por Veículo');
    const ws2 = XLSX.utils.json_to_sheet(aba2);
    ws2['!cols'] = Object.keys(aba2[0]).map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws2, 'Ocupação 30min');
    XLSX.writeFile(wb, `gantt_recarga_${new Date().toISOString().slice(0, 10)}.xlsx`);
  });

  /* ══════════ EXPORTAR MAPA DE UTILIZAÇÃO ══════════ */
  $('btn_exportar_mapa')?.addEventListener('click', () => {
    if (!simulacaoResult.length) { alert('Execute a simulação primeiro.'); return; }
    const p = paramsSim || getParams();
    const slots = simulacaoResult;

    const faixasAtivas = FAIXAS_30.filter(t => {
      const fim_t = t + FAIXA;
      return slots.some(s => { const sI = toTL(s.inicio), sF = toTL(s.fim); return sI < fim_t && sF > t; });
    });

    // Linha QTD CONECTADO
    const qtdRow = { 'ID CARRO': 'QTD CONECTADO', 'TAB': '', 'Linha': '' };
    faixasAtivas.forEach(t => {
      const fim_t = t + FAIXA;
      const usados = new Set();
      slots.forEach(s => { const sI = toTL(s.inicio), sF = toTL(s.fim); if (sI < fim_t && sF > t) usados.add(s.bicoId); });
      qtdRow[fmtHora(t)] = `${usados.size}/${p.totalBicos}`;
    });

    const rows = [qtdRow, ...veiculosBrutos.map(v => {
      const s = slots.find(r => r.veiculo.idCarro === v.idCarro);
      const row = { 'ID CARRO': v.idCarro, 'TAB': v.tb, 'Linha': v.linha || '' };
      faixasAtivas.forEach(t => {
        const fim_t = t + FAIXA;
        if (s) {
          const sI = toTL(s.inicio), sF = toTL(s.fim);
          row[fmtHora(t)] = (sI < fim_t && sF > t) ? s.bicoId : '';
        } else row[fmtHora(t)] = '';
      });
      return row;
    })];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0]).map(() => ({ wch: 14 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Mapa Utilização');
    XLSX.writeFile(wb, `mapa_utilizacao_${new Date().toISOString().slice(0, 10)}.xlsx`);
  });

  /* ══════════ EXPORTAR MATRIZ ══════════ */
  $('btn_exportar_matriz')?.addEventListener('click', () => {
    if (!simulacaoResult.length) { alert('Execute a simulação primeiro.'); return; }
    const p = paramsSim || getParams();
    const slots = simulacaoResult;

    const bicosAtivos = [...new Set(slots.map(s => s.bicoId))].sort((a, b) => {
      const [ca, ba] = a.split('.').map(Number);
      const [cb, bb] = b.split('.').map(Number);
      return ca - cb || ba - bb;
    });
    const faixasAtivas = FAIXAS_30.filter(t => {
      const fim_t = t + FAIXA;
      return slots.some(s => { const sI = toTL(s.inicio), sF = toTL(s.fim); return sI < fim_t && sF > t; });
    });

    // Linha QTD
    const qtdRow = { 'Bico': 'QTD' };
    faixasAtivas.forEach(t => {
      const fim_t = t + FAIXA;
      const usados = new Set();
      slots.forEach(s => { const sI = toTL(s.inicio), sF = toTL(s.fim); if (sI < fim_t && sF > t) usados.add(s.bicoId); });
      qtdRow[fmtHora(t)] = `${usados.size}/${p.totalBicos}`;
    });

    const rows = [qtdRow, ...bicosAtivos.map(bicoId => {
      const bicoSlots = slots.filter(s => s.bicoId === bicoId);
      const row = { 'Bico': bicoId };
      faixasAtivas.forEach(t => {
        const fim_t = t + FAIXA;
        const ativo = bicoSlots.find(s => { const sI = toTL(s.inicio), sF = toTL(s.fim); return sI < fim_t && sF > t; });
        row[fmtHora(t)] = ativo ? ativo.veiculo.idCarro : '';
      });
      return row;
    })];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0]).map(() => ({ wch: 14 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Matriz Bicos');
    XLSX.writeFile(wb, `matriz_bicos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  });

  /* ══════════ DEMO ══════════ */
  $('btn_demo')?.addEventListener('click', carregarDemo);
  function carregarDemo() {
    const demo = [
      { 'ID CARRO':'EL-001', TAB:'3105', LINHA:'8012-10', 'KM PROG':180, 'BAT. CHEGADA':25, 'CHEGADA GAR':'21:30', 'SAÍDA GAR':'06:30', 'TOTAL BATERIA DO CARRO':280 },
      { 'ID CARRO':'EL-002', TAB:'4108', LINHA:'8022-10', 'KM PROG':160, 'BAT. CHEGADA':35, 'CHEGADA GAR':'21:45', 'SAÍDA GAR':'06:00', 'TOTAL BATERIA DO CARRO':280 },
      { 'ID CARRO':'EL-003', TAB:'3120', LINHA:'8023-10', 'KM PROG':200, 'BAT. CHEGADA':15, 'CHEGADA GAR':'22:00', 'SAÍDA GAR':'05:30', 'TOTAL BATERIA DO CARRO':350 },
      { 'ID CARRO':'EL-004', TAB:'4112', LINHA:'8012-10', 'KM PROG':140, 'BAT. CHEGADA':45, 'CHEGADA GAR':'22:10', 'SAÍDA GAR':'06:30', 'TOTAL BATERIA DO CARRO':280 },
      { 'ID CARRO':'EL-005', TAB:'3201', LINHA:'8003-10', 'KM PROG':175, 'BAT. CHEGADA':30, 'CHEGADA GAR':'22:15', 'SAÍDA GAR':'06:00', 'TOTAL BATERIA DO CARRO':280 },
      { 'ID CARRO':'EL-006', TAB:'4205', LINHA:'8050-10', 'KM PROG':190, 'BAT. CHEGADA':20, 'CHEGADA GAR':'22:20', 'SAÍDA GAR':'05:45', 'TOTAL BATERIA DO CARRO':350 },
      { 'ID CARRO':'EL-007', TAB:'3300', LINHA:'8022-10', 'KM PROG':155, 'BAT. CHEGADA':55, 'CHEGADA GAR':'22:30', 'SAÍDA GAR':'06:15', 'TOTAL BATERIA DO CARRO':280 },
      { 'ID CARRO':'EL-008', TAB:'4301', LINHA:'8023-10', 'KM PROG':210, 'BAT. CHEGADA':10, 'CHEGADA GAR':'22:35', 'SAÍDA GAR':'05:30', 'TOTAL BATERIA DO CARRO':350 },
      { 'ID CARRO':'EL-009', TAB:'3402', LINHA:'8012-10', 'KM PROG':168, 'BAT. CHEGADA':40, 'CHEGADA GAR':'22:40', 'SAÍDA GAR':'06:30', 'TOTAL BATERIA DO CARRO':280 },
      { 'ID CARRO':'EL-010', TAB:'4403', LINHA:'8003-10', 'KM PROG':195, 'BAT. CHEGADA':28, 'CHEGADA GAR':'22:45', 'SAÍDA GAR':'06:00', 'TOTAL BATERIA DO CARRO':280 },
      { 'ID CARRO':'EL-011', TAB:'3501', LINHA:'8050-10', 'KM PROG':145, 'BAT. CHEGADA':60, 'CHEGADA GAR':'23:00', 'SAÍDA GAR':'06:30', 'TOTAL BATERIA DO CARRO':280 },
      { 'ID CARRO':'EL-012', TAB:'4502', LINHA:'8022-10', 'KM PROG':185, 'BAT. CHEGADA':18, 'CHEGADA GAR':'23:10', 'SAÍDA GAR':'05:45', 'TOTAL BATERIA DO CARRO':350 },
      { 'ID CARRO':'EL-013', TAB:'3600', LINHA:'8023-10', 'KM PROG':170, 'BAT. CHEGADA':33, 'CHEGADA GAR':'23:15', 'SAÍDA GAR':'06:00', 'TOTAL BATERIA DO CARRO':280 },
      { 'ID CARRO':'EL-014', TAB:'4601', LINHA:'8012-10', 'KM PROG':205, 'BAT. CHEGADA':12, 'CHEGADA GAR':'23:20', 'SAÍDA GAR':'05:30', 'TOTAL BATERIA DO CARRO':350 },
      { 'ID CARRO':'EL-015', TAB:'3700', LINHA:'8003-10', 'KM PROG':160, 'BAT. CHEGADA':48, 'CHEGADA GAR':'23:30', 'SAÍDA GAR':'06:15', 'TOTAL BATERIA DO CARRO':280 },
      { 'ID CARRO':'EL-016', TAB:'4701', LINHA:'8050-10', 'KM PROG':175, 'BAT. CHEGADA':22, 'CHEGADA GAR':'23:40', 'SAÍDA GAR':'06:00', 'TOTAL BATERIA DO CARRO':280 },
      { 'ID CARRO':'EL-017', TAB:'3800', LINHA:'8012-10', 'KM PROG':190, 'BAT. CHEGADA':38, 'CHEGADA GAR':'23:50', 'SAÍDA GAR':'06:30', 'TOTAL BATERIA DO CARRO':280 },
      { 'ID CARRO':'EL-018', TAB:'4801', LINHA:'8022-10', 'KM PROG':165, 'BAT. CHEGADA':55, 'CHEGADA GAR':'00:10', 'SAÍDA GAR':'06:15', 'TOTAL BATERIA DO CARRO':350 },
      { 'ID CARRO':'EL-019', TAB:'3900', LINHA:'8023-10', 'KM PROG':155, 'BAT. CHEGADA':42, 'CHEGADA GAR':'00:20', 'SAÍDA GAR':'06:00', 'TOTAL BATERIA DO CARRO':280 },
      { 'ID CARRO':'EL-020', TAB:'4901', LINHA:'8003-10', 'KM PROG':200, 'BAT. CHEGADA':8,  'CHEGADA GAR':'00:30', 'SAÍDA GAR':'05:45', 'TOTAL BATERIA DO CARRO':350 },
    ];
    veiculosBrutos = normalizarDados(demo);
    marcarZonaOk('dados_demo.xlsx', veiculosBrutos.length);
    mostrarPreview(veiculosBrutos, []);
    setTxt('k_veiculos', veiculosBrutos.length);
    resetarResultado();
  }

  /* ══════════ SIMULAR ══════════ */
  $('btn_simular')?.addEventListener('click', () => {
    const btn = $('btn_simular');
    if (btn) { btn.textContent = '⏳ Simulando...'; btn.disabled = true; }
    setTimeout(() => {
      try { simular(); }
      catch (err) { alert('Erro: ' + err.message); console.error(err); }
      finally { if (btn) { btn.textContent = '⚡ SIMULAR'; btn.disabled = false; } }
    }, 30);
  });

  document.querySelectorAll('[data-cfg]').forEach(el => {
    el.addEventListener('change', () => { if (simulacaoResult.length > 0) setTimeout(simular, 80); });
  });

  function resetarResultado() {
    simulacaoResult = [];
    const sec = $('secao_resultado'); if (sec) sec.style.display = 'none';
    const badge = $('badge_status'); if (badge) { badge.textContent = '⚡ PRONTO'; badge.className = 'badge-ev'; }
    ['alerta_energia','alerta_incompleto'].forEach(id => { const e = $(id); if (e) e.style.display = 'none'; });
    const aF = $('fila_alert'); if (aF) aF.classList.remove('visible');
  }

  /* ══════════ INIT ══════════ */
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color       = '#7a9cc8';
    Chart.defaults.font.family = "'Segoe UI', sans-serif";
    Chart.defaults.font.size   = 10;
  }
  atualizarResumo();
  carregarDemo();
});

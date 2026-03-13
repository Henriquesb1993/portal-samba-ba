/**
 * SIMULADOR DE RECARGA ELÉTRICA — Portal Sambaíba
 * Arquivo: js/simulador_recarga.js
 *
 * ALGORITMO:
 * 1. Lê planilha Excel com veículos (TB, LINHA, KM_PROG, BATERIA_CHEGADA, HORARIO_CHEGADA_GARAGEM, SAIDA_GARAGEM)
 * 2. Ordena por horário disponível (chegada + preparo), desempate por menor bateria
 * 3. Distribui veículos nos carregadores disponíveis via FIFO + First-Fit-Decreasing
 * 4. Respeita limite de 2 conectores por carregador
 * 5. Calcula potência por faixa horária
 * 6. Gera Mapa de Carregadores, Gantt, Tabela de Ocupação e Gráfico de Potência
 * 7. Sinaliza gargalos e veículos em fila
 */

document.addEventListener('DOMContentLoaded', () => {

  /* ═══════════════════════════════════════════
     ESTADO GLOBAL
  ═══════════════════════════════════════════ */
  let veiculosBrutos = [];   // dados normalizados da planilha
  let simulacaoResult = [];  // [{veiculo, carregador, conectorNum, inicio, fim, kwh, potenciaUsada, aguardou}]
  let carregadoresSim = [];  // estrutura dos carregadores usada na última simulação
  let chartPotencia   = null;
  let paramsSim       = null;

  const CORES = [
    '#00e5a0','#00aaff','#f9e000','#a78bfa','#ff8c00',
    '#19d46e','#3d7ef5','#f65858','#e879f9','#fb923c',
    '#34d399','#60a5fa','#fbbf24','#c084fc','#f87171',
    '#67e8f9','#86efac','#fde68a','#d8b4fe','#fca5a5'
  ];

  /* ═══════════════════════════════════════════
     UTILITÁRIOS
  ═══════════════════════════════════════════ */
  const $ = id => document.getElementById(id);
  const $q = sel => document.querySelector(sel);
  const setTxt = (id, v) => { const e=$(id); if(e) e.textContent=v; };

  function fmtHora(min) {
    // minutos desde meia-noite; suporta valores > 1440 (dia seguinte)
    const m = ((min % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60);
    const mm = Math.round(m % 60);
    return String(h).padStart(2,'0') + ':' + String(mm).padStart(2,'0');
  }

  function parseHora(str) {
    if (str === null || str === undefined || str === '') return null;
    str = String(str).trim();
    // Excel serial fracionário (fração de dia)
    if (!isNaN(str) && String(str).includes('.')) {
      const frac = parseFloat(str) % 1;
      return Math.round(frac * 1440);
    }
    // Número inteiro = hora cheia
    if (!isNaN(str) && !String(str).includes(':')) {
      return parseInt(str) * 60;
    }
    // HH:MM ou HH:MM:SS ou HHhMM
    const m = str.match(/(\d{1,2})[:\h](\d{2})/);
    if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
    return null;
  }

  function corVeiculo(idx) {
    return CORES[idx % CORES.length];
  }

  function duracaoTexto(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${m}min`;
  }

  /* ═══════════════════════════════════════════
     LEITURA DOS PARÂMETROS
  ═══════════════════════════════════════════ */
  function getParams() {
    const preparo    = parseInt($('p_preparo')?.value) || 30;
    const tolerancia = parseInt($('p_tolerancia')?.value) || 20;

    // Cenários de carregadores (até 5 linhas)
    const cenarios = [];
    for (let i = 1; i <= 5; i++) {
      const qtd = parseInt($(`carr_qtd_${i}`)?.value) || 0;
      const pot = parseFloat($(`carr_pot_${i}`)?.value) || 0;
      if (qtd > 0 && pot > 0) cenarios.push({ qtd, pot });
    }
    if (!cenarios.length) cenarios.push({ qtd: 10, pot: 180 });

    // Expande cenários em lista de carregadores
    const listaCarregadores = [];
    let idx = 1;
    cenarios.forEach(c => {
      for (let k = 0; k < c.qtd; k++) {
        listaCarregadores.push({
          id: idx,
          nome: `CARREGADOR ${String(idx).padStart(2,'0')}`,
          potencia: c.pot,
          slots: []
        });
        idx++;
      }
    });
    // Ordena pelos mais potentes primeiro (prioridade para veículos críticos)
    listaCarregadores.sort((a, b) => b.potencia - a.potencia);

    const totalCarregadores = listaCarregadores.length;
    const totalConectores   = totalCarregadores * 2; // regra: 2 por carregador
    const potenciaTotal     = listaCarregadores.reduce((s, c) => s + c.potencia, 0);

    // Tipos de veículos (até 5)
    const tiposVeiculos = [];
    for (let i = 1; i <= 5; i++) {
      const qtd = parseInt($(`veh_qtd_${i}`)?.value) || 0;
      const bat = parseFloat($(`veh_bat_${i}`)?.value) || 0;
      if (qtd > 0 && bat > 0) tiposVeiculos.push({ qtd, bateriaTotal: bat });
    }

    return {
      preparo,
      tolerancia,
      cenarios,
      listaCarregadores,
      totalCarregadores,
      totalConectores,
      potenciaTotal,
      tiposVeiculos,
      conectoresPorCarregador: 2
    };
  }

  /* ═══════════════════════════════════════════
     ATUALIZA RESUMO DE CONFIGURAÇÃO
  ═══════════════════════════════════════════ */
  function atualizarResumo() {
    const p = getParams();
    setTxt('res_total_carr', p.totalCarregadores);
    setTxt('res_total_conn', p.totalConectores);
    setTxt('res_total_pot',  p.potenciaTotal + ' kW');
    // kW por conector de cada cenário
    const detalhes = p.cenarios.map(c =>
      `${c.qtd}× ${c.pot}kW (${c.pot/2}kW/conector)`
    ).join(' | ');
    const el = $('res_detalhes');
    if (el) el.textContent = detalhes;
  }

  // Atualiza ao mudar qualquer campo de config
  document.querySelectorAll('[data-cfg]').forEach(el => {
    el.addEventListener('input', atualizarResumo);
    el.addEventListener('change', atualizarResumo);
  });

  /* ═══════════════════════════════════════════
     UPLOAD / PARSING EXCEL
  ═══════════════════════════════════════════ */
  $('btn_upload')?.addEventListener('click', () => $('file_input')?.click());
  $('upload_zone')?.addEventListener('click', () => $('file_input')?.click());

  $('upload_zone')?.addEventListener('dragover', e => {
    e.preventDefault();
    $('upload_zone').classList.add('drag-over');
  });
  $('upload_zone')?.addEventListener('dragleave', () => {
    $('upload_zone').classList.remove('drag-over');
  });
  $('upload_zone')?.addEventListener('drop', e => {
    e.preventDefault();
    $('upload_zone').classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) processarArquivo(f);
  });
  $('file_input')?.addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) processarArquivo(f);
  });

  function processarArquivo(file) {
    $('file_nome').textContent = file.name;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        let dados = [];
        if (file.name.toLowerCase().endsWith('.csv')) {
          dados = parsearCSV(e.target.result);
        } else {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          dados = XLSX.utils.sheet_to_json(ws, { defval: '' });
        }
        veiculosBrutos = normalizarDados(dados);
        mostrarPreview(veiculosBrutos);
        marcarZonaOk(file.name, veiculosBrutos.length);
        setTxt('k_veiculos', veiculosBrutos.length);
        resetarResultado();
      } catch(err) {
        alert('Erro ao ler arquivo: ' + err.message);
        console.error(err);
      }
    };
    file.name.toLowerCase().endsWith('.csv')
      ? reader.readAsText(file, 'UTF-8')
      : reader.readAsArrayBuffer(file);
  }

  function parsearCSV(text) {
    const sep = text.includes(';') ? ';' : ',';
    const lines = text.split('\n').filter(l => l.trim());
    const headers = lines[0].split(sep).map(h => h.trim().replace(/"/g,''));
    return lines.slice(1).map(line => {
      const vals = line.split(sep).map(v => v.trim().replace(/"/g,''));
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
      return obj;
    });
  }

  function normalizarDados(dados) {
    return dados.map((row, idx) => {
      const get = (...keys) => {
        for (const k of keys) {
          const found = Object.keys(row).find(r =>
            r.trim().toUpperCase().replace(/\s+/g,'_') === k.toUpperCase()
          );
          if (found !== undefined && row[found] !== '') return row[found];
        }
        return '';
      };
      const tb         = String(get('TB','TABELA','VEICULO','VEI','ID') || `V${String(idx+1).padStart(3,'0')}`);
      const linha      = String(get('LINHA','LINE','LINHA_ID') || '');
      const kmProg     = parseFloat(get('KM_PROG','KM','KM_PROGRAMADO') || 0);
      const batCheg    = parseFloat(get('BATERIA_CHEGADA','BAT_CHEGADA','BATERIA','BAT') || 50);
      const horaCheg   = parseHora(get('HORARIO_CHEGADA_GARAGEM','CHEGADA','HORA_CHEGADA','HORARIO_CHEGADA'));
      const horaSaida  = parseHora(get('SAIDA_GAR','SAIDA','HORARIO_SAIDA','SAÍDA_GAR','SAIDA_GARAGEM','SAÍDA GAR.'));

      // Determina capacidade da bateria pelo tipo de veículo configurado
      const p = getParams();
      let bateriaTotal = 280; // padrão
      if (p.tiposVeiculos.length > 0) {
        // Usa o tipo de maior bateria como padrão (pode ser refinado)
        bateriaTotal = p.tiposVeiculos[0]?.bateriaTotal || 280;
      }

      return {
        idx,
        tb, linha, kmProg,
        batChegada: isNaN(batCheg) ? 50 : Math.min(batCheg, 100),
        bateriaTotal,
        horaChegada: horaCheg !== null ? horaCheg : (22 * 60 + idx * 3),
        horaSaida:   horaSaida,
        cor: corVeiculo(idx)
      };
    });
  }

  function marcarZonaOk(nome, qtd) {
    const z = $('upload_zone');
    if (!z) return;
    z.classList.add('has-file');
    z.querySelector('.u-ico').textContent = '✅';
    z.querySelector('.u-lbl').textContent = `${nome} — ${qtd} veículos carregados`;
  }

  function mostrarPreview(dados) {
    const wrap = $('preview_wrap');
    if (!wrap) return;
    wrap.style.display = '';
    $('preview_info').textContent = `${dados.length} veículos importados`;
    const tbl = $('tbl_preview');
    tbl.innerHTML = `
      <thead><tr>
        <th>TB</th><th>Linha</th><th>KM Prog</th>
        <th>Bat. Chegada</th><th>Chegada</th><th>Saída</th>
      </tr></thead>
      <tbody>${dados.slice(0, 10).map(v => `<tr>
        <td style="font-weight:800;color:${v.cor}">${v.tb}</td>
        <td>${v.linha || '—'}</td>
        <td>${v.kmProg || '—'}</td>
        <td style="color:${v.batChegada<30?'#ff3d3d':v.batChegada<60?'#f9e000':'#00e5a0'};font-weight:700;">
          ${v.batChegada}%
        </td>
        <td style="font-family:Consolas,monospace;">${fmtHora(v.horaChegada)}</td>
        <td style="font-family:Consolas,monospace;">${v.horaSaida !== null ? fmtHora(v.horaSaida) : '—'}</td>
      </tr>`).join('')}
      ${dados.length > 10 ? `<tr><td colspan="6" style="text-align:center;color:#5a8ab0;font-size:10px;">... mais ${dados.length-10} veículos</td></tr>` : ''}
      </tbody>`;
  }

  /* ═══════════════════════════════════════════
     MOTOR DE SIMULAÇÃO
  ═══════════════════════════════════════════ */
  function simular() {
    if (!veiculosBrutos.length) {
      alert('Importe uma planilha ou carregue os dados de demonstração primeiro!');
      return;
    }

    const p = getParams();
    paramsSim = p;

    // 1. Prepara veículos
    const veiculos = veiculosBrutos.map(v => {
      // Calcula energia necessária baseada na bateria total do tipo do veículo
      const bateriaTotal = v.bateriaTotal || 280;
      const energiaNecessaria = Math.max(bateriaTotal * (1 - v.batChegada / 100), 10);
      return {
        ...v,
        horaDisponivel: v.horaChegada + p.preparo,
        energiaNecessaria,
        // Horário limite para conclusão: saída - tolerância
        horarioLimite: v.horaSaida !== null
          ? v.horaSaida - p.tolerancia
          : null
      };
    }).sort((a, b) =>
      a.horaDisponivel - b.horaDisponivel || a.batChegada - b.batChegada
    );

    // 2. Copia estrutura de carregadores (limpa slots)
    const carregadores = p.listaCarregadores.map(c => ({
      ...c,
      slots: []
    }));
    carregadoresSim = carregadores;

    simulacaoResult = [];
    const filaEspera = [];

    // 3. FIFO + First-Fit-Decreasing: aloca cada veículo
    veiculos.forEach(veiculo => {
      const horaInicio = veiculo.horaDisponivel;
      const kwhConect  = veiculo.energiaNecessaria;
      let alocado = false;

      // Ordena carregadores: menos ocupados primeiro, mais potentes em caso de empate
      const carrOrd = [...carregadores].sort((a, b) => {
        const ocA = a.slots.filter(s => s.fim > horaInicio).length;
        const ocB = b.slots.filter(s => s.fim > horaInicio).length;
        if (ocA !== ocB) return ocA - ocB;
        return b.potencia - a.potencia;
      });

      for (const carr of carrOrd) {
        const ocupados = carr.slots.filter(s => s.fim > horaInicio).length;
        if (ocupados >= p.conectoresPorCarregador) continue;

        // Potência por conector = potência do carregador / nº conectores simultâneos
        // Se 1 veículo = potência total; se 2 veículos = metade
        const potConector = carr.potencia / (ocupados + 1);
        // Reajusta veículos já em carga simultânea
        carr.slots.forEach(s => {
          if (s.fim > horaInicio) {
            s.potenciaUsada = carr.potencia / (ocupados + 1);
            // Recalcula fim com nova potência
            const novoTempo = Math.ceil((s.veiculo.energiaNecessaria / s.potenciaUsada) * 60);
            s.fim = s.inicio + novoTempo;
          }
        });

        const tempoCargaMin = Math.ceil((kwhConect / potConector) * 60);
        const fim = horaInicio + tempoCargaMin;
        const conectorNum = ocupados + 1;

        carr.slots.push({ veiculo, inicio: horaInicio, fim, potenciaUsada: potConector });

        simulacaoResult.push({
          veiculo,
          carregador: carr,
          conectorNum,
          inicio: horaInicio,
          fim,
          kwh: Math.round(kwhConect),
          tempoCargaMin,
          potenciaUsada: potConector,
          aguardou: false
        });

        alocado = true;
        break;
      }

      if (!alocado) filaEspera.push(veiculo);
    });

    // 4. Processa fila de espera (aguarda slot liberar)
    filaEspera.forEach(veiculo => {
      // Encontra o slot que libera mais cedo
      const proximoLivre = carregadores.reduce((best, carr) => {
        const liberaEm = carr.slots.length
          ? Math.min(...carr.slots.map(s => s.fim))
          : 0;
        return liberaEm < best.tempo ? { carr, tempo: liberaEm } : best;
      }, { carr: carregadores[0], tempo: Infinity });

      const carr = proximoLivre.carr;
      const horaInicio = Math.max(proximoLivre.tempo, veiculo.horaDisponivel);
      const ocupados = carr.slots.filter(s => s.fim > horaInicio).length;
      const potConector = carr.potencia / Math.max(ocupados + 1, 1);
      const kwhConect = veiculo.energiaNecessaria;
      const tempoCargaMin = Math.ceil((kwhConect / potConector) * 60);
      const fim = horaInicio + tempoCargaMin;

      carr.slots.push({ veiculo, inicio: horaInicio, fim, potenciaUsada: potConector });

      simulacaoResult.push({
        veiculo,
        carregador: carr,
        conectorNum: ocupados + 1,
        inicio: horaInicio,
        fim,
        kwh: Math.round(kwhConect),
        tempoCargaMin,
        potenciaUsada: potConector,
        aguardou: true,
        tempoEspera: horaInicio - veiculo.horaDisponivel
      });
    });

    renderizarTudo(carregadores, p);
  }

  /* ═══════════════════════════════════════════
     RENDERIZAÇÃO PRINCIPAL
  ═══════════════════════════════════════════ */
  function renderizarTudo(carregadores, p) {
    const slots = simulacaoResult;
    if (!slots.length) return;

    // Calcula faixas horárias (de 30 em 30 min)
    const horaMin = Math.min(...slots.map(s => s.inicio));
    const horaMax = Math.max(...slots.map(s => s.fim));
    const FAIXA   = 30;

    const ocupacao = [];
    for (let t = Math.floor(horaMin / FAIXA) * FAIXA; t <= horaMax; t += FAIXA) {
      const ativos    = slots.filter(s => s.inicio <= t && s.fim > t);
      const carrAtivos = new Set(ativos.map(s => s.carregador.id));
      const potTotal   = ativos.reduce((sum, s) => sum + s.potenciaUsada, 0);
      ocupacao.push({
        hora: t,
        veiculos: ativos.length,
        carregadores: carrAtivos.size,
        conectores: ativos.length,
        potencia: Math.round(potTotal),
        items: ativos
      });
    }

    // KPIs
    const picoCarreg  = Math.max(...ocupacao.map(o => o.carregadores));
    const picoConect  = Math.max(...ocupacao.map(o => o.conectores));
    const potMax      = Math.max(...ocupacao.map(o => o.potencia));
    const horaPico    = ocupacao.find(o => o.potencia === potMax);
    const emFila      = slots.filter(s => s.aguardou).length;
    const gargalo     = picoCarreg >= p.totalCarregadores;

    setTxt('k_veiculos',     veiculosBrutos.length);
    setTxt('k_pico_carr',    `${picoCarreg}/${p.totalCarregadores}`);
    setTxt('k_pico_carr_sub', picoCarreg >= p.totalCarregadores ? '⚠ CAPACIDADE MÁXIMA' : 'simultâneos');
    setTxt('k_pico_conn',    `${picoConect}/${p.totalConectores}`);
    setTxt('k_pico_conn_sub', 'simultâneos');
    setTxt('k_pot_max',      `${potMax} kW`);
    setTxt('k_pot_max_sub',  `de ${p.potenciaTotal} kW disponível`);
    setTxt('k_hora_pico',    horaPico ? fmtHora(horaPico.hora) : '—');
    setTxt('k_hora_pico_sub','maior demanda');
    setTxt('k_fila',         emFila);
    setTxt('k_fila_sub',     emFila > 0 ? 'aguardaram carregador' : 'sem fila de espera');

    // Gargalo KPI
    const kGargalo    = $('k_gargalo');
    const kGargaloSub = $('k_gargalo_sub');
    if (kGargalo) {
      if (gargalo) {
        kGargalo.innerHTML = '<span style="color:#ff3d3d">⚠ GARGALO</span>';
        if (kGargaloSub) kGargaloSub.textContent = 'Carregadores insuficientes!';
      } else if (emFila > 0) {
        kGargalo.innerHTML = '<span style="color:#f9e000">⚠ FILA</span>';
        if (kGargaloSub) kGargaloSub.textContent = `${emFila} veículo(s) aguardaram`;
      } else {
        kGargalo.innerHTML = '<span style="color:#00e5a0">✓ OK</span>';
        if (kGargaloSub) kGargaloSub.textContent = 'Capacidade adequada';
      }
    }

    // Atualiza badge
    const badge = $('badge_status');
    if (badge) {
      badge.textContent = gargalo ? '⚠ GARGALO' : '✅ SIMULADO';
      badge.className   = gargalo ? 'badge-ev error' : 'badge-ev simulated';
    }

    // Mostra seção de resultado
    $('secao_resultado').style.display = '';

    // Renderiza cada painel
    renderMapaCarregadores(carregadores, p);
    renderGantt(carregadores, slots, horaMin, horaMax, p);
    renderTabelaOcupacao(ocupacao, p);
    renderGraficoPotencia(ocupacao, p);
    renderListaVeiculos(slots);

    // Fila alert
    const alertFila = $('fila_alert');
    if (alertFila) {
      if (emFila > 0) {
        alertFila.textContent = `⚠ ${emFila} veículo(s) entraram em fila de espera. Considere adicionar mais carregadores ou aumentar a potência.`;
        alertFila.classList.add('visible');
      } else {
        alertFila.classList.remove('visible');
      }
    }

    // Timestamp
    const ts = $('sim_timestamp');
    if (ts) ts.textContent = `Simulado: ${new Date().toLocaleTimeString('pt-BR')} — ${slots.length} veículos alocados`;
  }

  /* ═══════════════════════════════════════════
     MAPA DE CARREGADORES
  ═══════════════════════════════════════════ */
  function renderMapaCarregadores(carregadores, p) {
    const grid = $('charger_grid');
    if (!grid) return;

    grid.innerHTML = carregadores.map(carr => {
      const slotsOrd = [...carr.slots].sort((a, b) => a.inicio - b.inicio);
      const ocupadosAgora = carr.slots.filter(s => {
        const agora = new Date().getHours() * 60 + new Date().getMinutes();
        return s.inicio <= agora && s.fim > agora;
      }).length;
      const cls = ocupadosAgora === 0 ? '' : ocupadosAgora >= p.conectoresPorCarregador ? 'cheio' : 'em-uso';
      const pctUso = (slotsOrd.length / Math.max(slotsOrd.length, 1)) * 100;

      const slotsHtml = slotsOrd.slice(0, 4).map((s, i) => {
        const isFila = s.veiculo.aguardou || simulacaoResult.find(r => r.veiculo.tb === s.veiculo.tb)?.aguardou;
        return `<div class="conn-slot ${isFila ? 'fila' : 'ocupado'}">
          <span style="font-size:11px;">${isFila ? '⏳' : '⚡'}</span>
          <span class="conn-veh" style="color:${s.veiculo.cor}">${s.veiculo.tb}</span>
          <span style="font-size:9px;color:#5a8ab0;margin-left:2px;">${s.veiculo.linha || ''}</span>
          <span class="conn-time">${fmtHora(s.inicio)}→${fmtHora(s.fim)}</span>
        </div>`;
      }).join('');

      return `<div class="charger-card ${cls}">
        <div class="charger-head">
          <span class="charger-name">${carr.nome}</span>
          <span class="charger-kw">${carr.potencia}kW · ${carr.potencia/2}kW/conector</span>
        </div>
        <div class="charger-conn">
          ${slotsHtml || '<div class="conn-empty">Nenhum veículo programado</div>'}
          ${slotsOrd.length > 4 ? `<div style="font-size:9px;color:#3a6a8a;text-align:center;padding:3px 0;">+${slotsOrd.length-4} mais...</div>` : ''}
        </div>
        <div class="charger-bar">
          <div class="charger-bar-fill" style="width:${Math.min(slotsOrd.length/p.totalCarregadores*100*3,100)}%"></div>
        </div>
        <div class="charger-footer">
          <span>${slotsOrd.length} veículo(s) programado(s)</span>
          <span style="color:var(--ev-yellow);">${carr.potencia/2}kW/conn</span>
        </div>
      </div>`;
    }).join('');
  }

  /* ═══════════════════════════════════════════
     GANTT
  ═══════════════════════════════════════════ */
  function renderGantt(carregadores, slots, horaMin, horaMax, p) {
    const wrap = $('gantt_wrap');
    if (!wrap) return;

    const FAIXA   = 30;
    const PX_MIN  = 2.8;
    const colunas = [];
    for (let t = Math.floor(horaMin/FAIXA)*FAIXA; t <= horaMax + FAIXA; t += FAIXA) {
      colunas.push(t);
    }
    const totalPx = (colunas[colunas.length-1] - colunas[0]) * PX_MIN;

    const thead = `<tr>
      <th class="row-head">Carregador</th>
      ${colunas.map(t => `<th style="min-width:${FAIXA*PX_MIN}px;">${fmtHora(t)}</th>`).join('')}
    </tr>`;

    const rows = carregadores.map(carr => {
      const carrSlots = slots.filter(s => s.carregador.id === carr.id)
        .sort((a, b) => a.inicio - b.inicio);

      const blocos = carrSlots.map(s => {
        const left  = (s.inicio - colunas[0]) * PX_MIN;
        const width = Math.max((s.fim - s.inicio) * PX_MIN, 28);
        const isFila = s.aguardou;
        return `<div class="gantt-block ${isFila ? 'fila-block' : ''}"
          style="left:${left}px;width:${width}px;background:${s.veiculo.cor};"
          data-tb="${s.veiculo.tb}" data-linha="${s.veiculo.linha||'—'}"
          data-inicio="${fmtHora(s.inicio)}" data-fim="${fmtHora(s.fim)}"
          data-kwh="${s.kwh}" data-pot="${Math.round(s.potenciaUsada)}"
          data-bat="${s.veiculo.batChegada}" data-tempo="${s.tempoCargaMin}"
          data-aguardou="${isFila ? 'SIM' : 'NÃO'}"
          onmouseenter="window.evTooltipShow(event,this)"
          onmouseleave="window.evTooltipHide()"
        >${s.veiculo.tb}</div>`;
      }).join('');

      // Linha de saída de cada veículo com saída programada
      const saidasHtml = carrSlots
        .filter(s => s.veiculo.horaSaida !== null)
        .map(s => {
          const left = (s.veiculo.horaSaida - colunas[0]) * PX_MIN;
          return `<div class="gantt-saida" style="left:${left}px;" title="Saída: ${fmtHora(s.veiculo.horaSaida)}"></div>`;
        }).join('');

      return `<tr>
        <td class="row-head">
          ${carr.nome}<br>
          <span style="font-size:9px;color:#3d7ef5;">${carr.potencia}kW</span>
        </td>
        <td colspan="${colunas.length}" style="position:relative;padding:0;height:28px;min-width:${totalPx}px;">
          ${saidasHtml}${blocos}
        </td>
      </tr>`;
    }).join('');

    wrap.innerHTML = `<table class="gantt-tbl" style="min-width:${totalPx+120}px;">
      <thead>${thead}</thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  // Tooltip do Gantt
  window.evTooltipShow = function(e, el) {
    const tt = $('gantt_tooltip');
    if (!tt) return;
    const cor = el.style.background;
    tt.innerHTML = `
      <div style="font-weight:900;color:${cor};margin-bottom:4px;">🚌 Veículo ${el.dataset.tb}</div>
      <div style="color:#7a9cc8;">Linha: ${el.dataset.linha}</div>
      <div>⏱ ${el.dataset.inicio} → ${el.dataset.fim} (${duracaoTexto(parseInt(el.dataset.tempo))})</div>
      <div style="color:#f9e000;">⚡ ${el.dataset.kwh} kWh · ${el.dataset.pot} kW</div>
      <div style="color:${parseFloat(el.dataset.bat)<30?'#ff3d3d':parseFloat(el.dataset.bat)<60?'#f9e000':'#00e5a0'};">
        🔋 Bateria chegada: ${el.dataset.bat}%
      </div>
      ${el.dataset.aguardou==='SIM' ? '<div style="color:#ff8c00;margin-top:3px;">⏳ Aguardou carregador disponível</div>' : ''}`;
    tt.style.display = 'block';
    tt.style.left    = (e.clientX + 14) + 'px';
    tt.style.top     = (e.clientY - 8)  + 'px';
  };
  window.evTooltipHide = () => {
    const tt = $('gantt_tooltip');
    if (tt) tt.style.display = 'none';
  };
  document.addEventListener('mousemove', e => {
    const tt = $('gantt_tooltip');
    if (tt && tt.style.display !== 'none') {
      tt.style.left = (e.clientX + 14) + 'px';
      tt.style.top  = (e.clientY - 8)  + 'px';
    }
  });

  /* ═══════════════════════════════════════════
     TABELA DE OCUPAÇÃO POR HORA
  ═══════════════════════════════════════════ */
  function renderTabelaOcupacao(ocupacao, p) {
    const tb = $('tb_ocupacao');
    if (!tb) return;
    const potMax     = Math.max(...ocupacao.map(o => o.potencia));
    const maxCarreg  = p.totalCarregadores;
    const maxConect  = p.totalConectores;

    tb.innerHTML = ocupacao.map(o => {
      const pctCarreg = o.carregadores / maxCarreg * 100;
      const pctPot    = potMax > 0 ? o.potencia / potMax * 100 : 0;
      const isPico    = o.potencia === potMax;

      const corCarreg = pctCarreg >= 100 ? '#ff3d3d' : pctCarreg >= 80 ? '#f9e000' : '#00e5a0';
      const status    = o.carregadores >= maxCarreg ? '⚠ MÁXIMO' : o.carregadores >= maxCarreg*0.8 ? '⚠ ALTO' : '✓ OK';
      const statusCor = o.carregadores >= maxCarreg ? '#ff3d3d' : o.carregadores >= maxCarreg*0.8 ? '#f9e000' : '#00e5a0';

      return `<tr ${isPico ? 'class="pico"' : ''}>
        <td style="font-weight:800;font-family:Consolas,monospace;color:${isPico?'#ff3d3d':'#eaf2ff'};">
          ${fmtHora(o.hora)}${isPico ? ' 🔺' : ''}
        </td>
        <td>
          <span class="ocp-bar" style="width:${Math.max(pctCarreg*0.8,4)}px;background:${corCarreg};"></span>
          <b style="color:${corCarreg}">${o.carregadores}</b>
          <span style="color:#5a8ab0;"> / ${maxCarreg}</span>
        </td>
        <td>
          <b style="color:var(--ev-blue)">${o.conectores}</b>
          <span style="color:#5a8ab0;"> / ${maxConect}</span>
        </td>
        <td><b style="color:var(--ev-purple)">${o.veiculos}</b></td>
        <td>
          <span class="ocp-bar" style="width:${Math.max(pctPot*0.7,4)}px;background:var(--ev-yellow);"></span>
          <b style="color:var(--ev-yellow)">${o.potencia}</b>
          <span style="color:#5a8ab0;"> kW</span>
        </td>
        <td><span style="color:${statusCor};font-weight:800;font-size:10px;">${status}</span></td>
      </tr>`;
    }).join('');
  }

  /* ═══════════════════════════════════════════
     GRÁFICO DE POTÊNCIA
  ═══════════════════════════════════════════ */
  function renderGraficoPotencia(ocupacao, p) {
    const el = $('c_potencia');
    if (!el) return;
    if (chartPotencia) { chartPotencia.destroy(); chartPotencia = null; }

    const labs    = ocupacao.map(o => fmtHora(o.hora));
    const pots    = ocupacao.map(o => o.potencia);
    const veics   = ocupacao.map(o => o.veiculos);
    const carregs = ocupacao.map(o => o.carregadores);

    chartPotencia = new Chart(el.getContext('2d'), {
      data: {
        labels: labs,
        datasets: [
          {
            type: 'line', label: 'Potência (kW)', data: pots,
            borderColor: '#f9e000', backgroundColor: 'rgba(249,224,0,0.08)',
            fill: true, tension: 0.4, pointRadius: 3, borderWidth: 2, yAxisID: 'y',
            pointBackgroundColor: '#f9e000'
          },
          {
            type: 'bar', label: 'Veículos carregando', data: veics,
            backgroundColor: 'rgba(0,229,160,0.25)', borderColor: '#00e5a0',
            borderWidth: 1, borderRadius: 3, yAxisID: 'y2'
          },
          {
            type: 'line', label: 'Carregadores usados', data: carregs,
            borderColor: '#00aaff', borderDash: [4, 3], pointRadius: 0,
            fill: false, tension: 0, borderWidth: 1.5, yAxisID: 'y2'
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { color: '#7a9cc8', boxWidth: 10, font: { size: 10 } } },
          tooltip: {
            callbacks: {
              afterBody: items => {
                const d = ocupacao[items[0].dataIndex];
                return [`Conectores: ${d.conectores}/${p.totalConectores}`];
              }
            }
          }
        },
        scales: {
          x:  {
            grid: { color: 'rgba(26,58,92,0.5)' },
            ticks: { color: '#5a8ab0', font: { size: 9 }, maxRotation: 45, maxTicksLimit: 18 }
          },
          y:  {
            grid: { color: 'rgba(26,58,92,0.5)' },
            ticks: { color: '#f9e000', callback: v => v + ' kW', font: { size: 9 } },
            position: 'left'
          },
          y2: {
            grid: { display: false },
            ticks: { color: '#00e5a0', callback: v => v + ' v', font: { size: 9 } },
            position: 'right',
            min: 0
          }
        }
      }
    });
  }

  /* ═══════════════════════════════════════════
     LISTA DE VEÍCULOS
  ═══════════════════════════════════════════ */
  function renderListaVeiculos(slots) {
    const el = $('veh_list');
    if (!el) return;
    el.innerHTML = veiculosBrutos.map(v => {
      const s = slots.find(x => x.veiculo.tb === v.tb);
      if (!s) return `<span class="veh-badge sem-carga" title="Sem carregador">🚫 ${v.tb}</span>`;
      if (s.aguardou) return `
        <span class="veh-badge fila-v"
          title="Linha ${v.linha||'—'} | Aguardou ${duracaoTexto(s.tempoEspera||0)} | ${s.carregador.nome} | ${fmtHora(s.inicio)}→${fmtHora(s.fim)}">
          ⏳ ${v.tb}
        </span>`;
      return `
        <span class="veh-badge ok"
          style="color:${v.cor};border-color:${v.cor}30;background:${v.cor}10;"
          title="Linha ${v.linha||'—'} | ${s.carregador.nome} | ${fmtHora(s.inicio)}→${fmtHora(s.fim)} | ${s.kwh}kWh">
          ⚡ ${v.tb}
        </span>`;
    }).join('');
  }

  /* ═══════════════════════════════════════════
     EXPORTAR EXCEL
  ═══════════════════════════════════════════ */
  $('btn_exportar')?.addEventListener('click', exportarExcel);
  function exportarExcel() {
    if (!simulacaoResult.length) { alert('Execute a simulação primeiro.'); return; }
    const p = paramsSim || getParams();

    // Aba 1: Resultado por veículo
    const aba1 = simulacaoResult.map(s => ({
      'TB / Veículo':       s.veiculo.tb,
      'Linha':              s.veiculo.linha,
      'KM Prog':            s.veiculo.kmProg,
      'Bat. Chegada (%)':   s.veiculo.batChegada,
      'Bat. Total (kWh)':   s.veiculo.bateriaTotal,
      'Energia Nec. (kWh)': s.kwh,
      'Chegada Garagem':    fmtHora(s.veiculo.horaChegada),
      'Hora Disponível':    fmtHora(s.veiculo.horaDisponivel),
      'Saída Programada':   s.veiculo.horaSaida !== null ? fmtHora(s.veiculo.horaSaida) : '—',
      'Carregador':         s.carregador.nome,
      'Pot. Carregador (kW)': s.carregador.potencia,
      'Conector':           s.conectorNum,
      'Início Carga':       fmtHora(s.inicio),
      'Fim Carga':          fmtHora(s.fim),
      'Duração Carga':      duracaoTexto(s.tempoCargaMin),
      'Pot. Usada (kW)':    Math.round(s.potenciaUsada),
      'Aguardou Fila':      s.aguardou ? 'SIM' : 'NÃO',
      'Tempo Espera':       s.tempoEspera ? duracaoTexto(s.tempoEspera) : '—'
    }));

    // Aba 2: Ocupação por hora
    const horaMin = Math.min(...simulacaoResult.map(s => s.inicio));
    const horaMax = Math.max(...simulacaoResult.map(s => s.fim));
    const aba2 = [];
    for (let t = Math.floor(horaMin/30)*30; t <= horaMax; t += 30) {
      const ativos = simulacaoResult.filter(s => s.inicio <= t && s.fim > t);
      const carrAtivos = new Set(ativos.map(s => s.carregador.id));
      aba2.push({
        'Hora':                fmtHora(t),
        'Carregadores Usados': carrAtivos.size,
        'Total Carregadores':  p.totalCarregadores,
        'Conectores Usados':   ativos.length,
        'Total Conectores':    p.totalConectores,
        'Veículos Carregando': ativos.length,
        'Potência kW':         Math.round(ativos.reduce((s, x) => s + x.potenciaUsada, 0)),
        'Potência Total kW':   p.potenciaTotal,
        'Status':              carrAtivos.size >= p.totalCarregadores ? 'MÁXIMO' : 'OK'
      });
    }

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(aba1);
    ws1['!cols'] = Object.keys(aba1[0]).map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws1, 'Resultado por Veículo');

    const ws2 = XLSX.utils.json_to_sheet(aba2);
    ws2['!cols'] = Object.keys(aba2[0]).map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws2, 'Ocupação por Hora');

    XLSX.writeFile(wb, `simulacao_recarga_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  /* ═══════════════════════════════════════════
     DADOS DE DEMONSTRAÇÃO
  ═══════════════════════════════════════════ */
  $('btn_demo')?.addEventListener('click', carregarDemo);
  function carregarDemo() {
    const demo = [
      { TB:'3105', LINHA:'8012-10', KM_PROG:180, BATERIA_CHEGADA:25, HORARIO_CHEGADA_GARAGEM:'21:30', 'SAÍDA GAR.':'06:30' },
      { TB:'4108', LINHA:'8022-10', KM_PROG:160, BATERIA_CHEGADA:35, HORARIO_CHEGADA_GARAGEM:'21:45', 'SAÍDA GAR.':'06:00' },
      { TB:'3120', LINHA:'8023-10', KM_PROG:200, BATERIA_CHEGADA:15, HORARIO_CHEGADA_GARAGEM:'22:00', 'SAÍDA GAR.':'05:30' },
      { TB:'4112', LINHA:'8012-10', KM_PROG:140, BATERIA_CHEGADA:45, HORARIO_CHEGADA_GARAGEM:'22:10', 'SAÍDA GAR.':'06:30' },
      { TB:'3201', LINHA:'8003-10', KM_PROG:175, BATERIA_CHEGADA:30, HORARIO_CHEGADA_GARAGEM:'22:15', 'SAÍDA GAR.':'06:00' },
      { TB:'4205', LINHA:'8050-10', KM_PROG:190, BATERIA_CHEGADA:20, HORARIO_CHEGADA_GARAGEM:'22:20', 'SAÍDA GAR.':'05:45' },
      { TB:'3300', LINHA:'8022-10', KM_PROG:155, BATERIA_CHEGADA:55, HORARIO_CHEGADA_GARAGEM:'22:30', 'SAÍDA GAR.':'06:15' },
      { TB:'4301', LINHA:'8023-10', KM_PROG:210, BATERIA_CHEGADA:10, HORARIO_CHEGADA_GARAGEM:'22:35', 'SAÍDA GAR.':'05:30' },
      { TB:'3402', LINHA:'8012-10', KM_PROG:168, BATERIA_CHEGADA:40, HORARIO_CHEGADA_GARAGEM:'22:40', 'SAÍDA GAR.':'06:30' },
      { TB:'4403', LINHA:'8003-10', KM_PROG:195, BATERIA_CHEGADA:28, HORARIO_CHEGADA_GARAGEM:'22:45', 'SAÍDA GAR.':'06:00' },
      { TB:'3501', LINHA:'8050-10', KM_PROG:145, BATERIA_CHEGADA:60, HORARIO_CHEGADA_GARAGEM:'23:00', 'SAÍDA GAR.':'06:30' },
      { TB:'4502', LINHA:'8022-10', KM_PROG:185, BATERIA_CHEGADA:18, HORARIO_CHEGADA_GARAGEM:'23:10', 'SAÍDA GAR.':'05:45' },
      { TB:'3600', LINHA:'8023-10', KM_PROG:170, BATERIA_CHEGADA:33, HORARIO_CHEGADA_GARAGEM:'23:15', 'SAÍDA GAR.':'06:00' },
      { TB:'4601', LINHA:'8012-10', KM_PROG:205, BATERIA_CHEGADA:12, HORARIO_CHEGADA_GARAGEM:'23:20', 'SAÍDA GAR.':'05:30' },
      { TB:'3700', LINHA:'8003-10', KM_PROG:160, BATERIA_CHEGADA:48, HORARIO_CHEGADA_GARAGEM:'23:30', 'SAÍDA GAR.':'06:15' },
      { TB:'4701', LINHA:'8050-10', KM_PROG:175, BATERIA_CHEGADA:22, HORARIO_CHEGADA_GARAGEM:'23:40', 'SAÍDA GAR.':'06:00' },
      { TB:'3800', LINHA:'8012-10', KM_PROG:190, BATERIA_CHEGADA:38, HORARIO_CHEGADA_GARAGEM:'23:50', 'SAÍDA GAR.':'06:30' },
      { TB:'4801', LINHA:'8022-10', KM_PROG:165, BATERIA_CHEGADA:55, HORARIO_CHEGADA_GARAGEM:'00:10', 'SAÍDA GAR.':'06:15' },
      { TB:'3900', LINHA:'8023-10', KM_PROG:155, BATERIA_CHEGADA:42, HORARIO_CHEGADA_GARAGEM:'00:20', 'SAÍDA GAR.':'06:00' },
      { TB:'4901', LINHA:'8003-10', KM_PROG:200, BATERIA_CHEGADA:8,  HORARIO_CHEGADA_GARAGEM:'00:30', 'SAÍDA GAR.':'05:45' },
    ];
    veiculosBrutos = normalizarDados(demo);
    mostrarPreview(veiculosBrutos);
    marcarZonaOk('dados_demo.xlsx', veiculosBrutos.length);
    setTxt('k_veiculos', veiculosBrutos.length);
    $('file_nome').textContent = 'dados_demo.xlsx';
    resetarResultado();
  }

  /* ═══════════════════════════════════════════
     BOTÕES E EVENTOS
  ═══════════════════════════════════════════ */
  $('btn_simular')?.addEventListener('click', () => {
    const btn = $('btn_simular');
    btn.textContent = '⏳ Simulando...';
    btn.disabled = true;
    setTimeout(() => {
      try {
        simular();
      } catch(err) {
        alert('Erro na simulação: ' + err.message);
        console.error(err);
      } finally {
        btn.textContent = '⚡ SIMULAR';
        btn.disabled = false;
      }
    }, 30);
  });

  // Recalcula ao mudar parâmetros (se já simulado)
  document.querySelectorAll('[data-cfg]').forEach(el => {
    el.addEventListener('change', () => {
      if (simulacaoResult.length > 0) {
        setTimeout(simular, 50);
      }
    });
  });

  function resetarResultado() {
    $('secao_resultado').style.display = 'none';
    const badge = $('badge_status');
    if (badge) { badge.textContent = '⚡ PRONTO'; badge.className = 'badge-ev'; }
  }

  /* ═══════════════════════════════════════════
     INICIALIZAÇÃO
  ═══════════════════════════════════════════ */
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color       = '#7a9cc8';
    Chart.defaults.font.family = "'Segoe UI', sans-serif";
    Chart.defaults.font.size   = 10;
  }

  atualizarResumo();
  carregarDemo(); // Carrega demo ao abrir

});

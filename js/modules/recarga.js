/**
 * MÓDULO RECARGA ELÉTRICA — Portal Sambaíba
 * Arquivo: js/modules/recarga.js
 *
 * ALGORITMO FIFO + First-Fit-Decreasing:
 * 1. Lê planilha Excel com veículos
 * 2. Ordena por hora disponível (chegada + preparo), desempate por menor bateria
 * 3. Distribui nos carregadores respeitando 2 conectores por carregador
 * 4. Potência dividida entre conectores simultâneos
 * 5. Fila de espera para veículos sem carregador disponível
 * 6. Gera Mapa, Gantt, Tabela de Ocupação e Gráfico de Potência
 */

document.addEventListener('DOMContentLoaded', () => {

  /* ═══════════════════════════════════════════
     ESTADO GLOBAL
  ═══════════════════════════════════════════ */
  let veiculosBrutos  = [];
  let simulacaoResult = [];
  let carregadoresSim = [];
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
  const $    = id  => document.getElementById(id);
  const setTxt = (id, v) => { const e=$(id); if(e) e.textContent=v; };

  function fmtHora(min) {
    const m  = ((min % 1440) + 1440) % 1440;
    const h  = Math.floor(m / 60);
    const mm = Math.round(m % 60);
    return String(h).padStart(2,'0') + ':' + String(mm).padStart(2,'0');
  }

  function parseHora(str) {
    if (str === null || str === undefined || str === '') return null;
    str = String(str).trim();
    if (!isNaN(str) && str.includes('.')) {
      return Math.round((parseFloat(str) % 1) * 1440);
    }
    if (!isNaN(str) && !str.includes(':')) return parseInt(str) * 60;
    const m = str.match(/(\d{1,2})[:\h](\d{2})/);
    if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
    return null;
  }

  function duracaoTexto(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${m}min`;
  }

  function corVeiculo(idx) { return CORES[idx % CORES.length]; }

  /* ═══════════════════════════════════════════
     LEITURA DOS PARÂMETROS DE CONFIGURAÇÃO
  ═══════════════════════════════════════════ */
  function getParams() {
    const preparo    = parseInt($('p_preparo')?.value)    || 30;
    const tolerancia = parseInt($('p_tolerancia')?.value) || 20;

    // Cenários de carregadores (linhas da tabela cfg)
    const cenarios = [];
    for (let i = 1; i <= 5; i++) {
      const qtd = parseInt($(`carr_qtd_${i}`)?.value) || 0;
      const pot = parseFloat($(`carr_pot_${i}`)?.value) || 0;
      if (qtd > 0 && pot > 0) cenarios.push({ qtd, pot });
    }
    if (!cenarios.length) cenarios.push({ qtd: 10, pot: 180 });

    // Expande em lista de carregadores individuais, mais potentes primeiro
    const lista = [];
    let idx = 1;
    cenarios.forEach(c => {
      for (let k = 0; k < c.qtd; k++) {
        lista.push({ id: idx, nome: `CARREGADOR ${String(idx).padStart(2,'0')}`, potencia: c.pot, slots: [] });
        idx++;
      }
    });
    lista.sort((a, b) => b.potencia - a.potencia);

    const totalCarregadores = lista.length;
    const totalConectores   = totalCarregadores * 2;
    const potenciaTotal     = lista.reduce((s, c) => s + c.potencia, 0);

    // Tipos de veículos
    const tiposVeiculos = [];
    for (let i = 1; i <= 5; i++) {
      const qtd = parseInt($(`veh_qtd_${i}`)?.value) || 0;
      const bat = parseFloat($(`veh_bat_${i}`)?.value) || 0;
      if (qtd > 0 && bat > 0) tiposVeiculos.push({ qtd, bateriaTotal: bat });
    }

    return { preparo, tolerancia, cenarios, listaCarregadores: lista,
             totalCarregadores, totalConectores, potenciaTotal,
             tiposVeiculos, conectoresPorCarregador: 2 };
  }

  /* ═══════════════════════════════════════════
     RESUMO AUTOMÁTICO DE CONFIGURAÇÃO
  ═══════════════════════════════════════════ */
  function atualizarResumo() {
    const p = getParams();
    setTxt('res_total_carr', p.totalCarregadores);
    setTxt('res_total_conn', p.totalConectores);
    setTxt('res_total_pot',  p.potenciaTotal + ' kW');
    const det = p.cenarios.map(c => `${c.qtd}× ${c.pot}kW (${c.pot/2}kW/conector)`).join(' | ');
    const el = $('res_detalhes'); if (el) el.textContent = det;
    // Atualiza coluna kW/conector na tabela
    for (let i = 1; i <= 5; i++) {
      const pot = parseFloat($(`carr_pot_${i}`)?.value) || 0;
      const el2 = $(`carr_por_conn_${i}`);
      if (el2) el2.textContent = pot > 0 ? (pot / 2) + ' kW' : '—';
    }
  }

  document.querySelectorAll('[data-cfg]').forEach(el => {
    el.addEventListener('input',  atualizarResumo);
    el.addEventListener('change', atualizarResumo);
  });

  /* ═══════════════════════════════════════════
     UPLOAD / PARSING
  ═══════════════════════════════════════════ */
  $('btn_upload')?.addEventListener('click', () => $('file_input')?.click());
  $('upload_zone')?.addEventListener('click', () => $('file_input')?.click());

  $('upload_zone')?.addEventListener('dragover', e => {
    e.preventDefault(); $('upload_zone').classList.add('drag-over');
  });
  $('upload_zone')?.addEventListener('dragleave', () => {
    $('upload_zone').classList.remove('drag-over');
  });
  $('upload_zone')?.addEventListener('drop', e => {
    e.preventDefault(); $('upload_zone').classList.remove('drag-over');
    const f = e.dataTransfer.files[0]; if (f) processarArquivo(f);
  });
  $('file_input')?.addEventListener('change', e => {
    const f = e.target.files[0]; if (f) processarArquivo(f);
  });

  function processarArquivo(file) {
    const nomeEl = $('file_nome'); if (nomeEl) nomeEl.textContent = file.name;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        let dados = [];
        if (file.name.toLowerCase().endsWith('.csv')) {
          dados = parsearCSV(e.target.result);
        } else {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          dados = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        }
        veiculosBrutos = normalizarDados(dados);
        mostrarPreview(veiculosBrutos);
        marcarZonaOk(file.name, veiculosBrutos.length);
        setTxt('k_veiculos', veiculosBrutos.length);
        resetarResultado();
      } catch(err) { alert('Erro ao ler arquivo: ' + err.message); console.error(err); }
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
      const obj = {}; headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; }); return obj;
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
      const tb        = String(get('TB','TABELA','VEICULO','ID') || `V${String(idx+1).padStart(3,'0')}`);
      const linha     = String(get('LINHA','LINE') || '');
      const kmProg    = parseFloat(get('KM_PROG','KM') || 0);
      const batCheg   = parseFloat(get('BATERIA_CHEGADA','BAT_CHEGADA','BATERIA','BAT') || 50);
      const horaCheg  = parseHora(get('HORARIO_CHEGADA_GARAGEM','CHEGADA','HORA_CHEGADA'));
      const horaSaida = parseHora(get('SAIDA_GAR','SAÍDA_GAR','SAÍDA GAR.','SAIDA','HORARIO_SAIDA'));

      // Bateria total: usa o primeiro tipo configurado como padrão
      const p = getParams();
      const bateriaTotal = p.tiposVeiculos[0]?.bateriaTotal || 280;

      return {
        idx, tb, linha, kmProg,
        batChegada:   isNaN(batCheg) ? 50 : Math.min(batCheg, 100),
        bateriaTotal,
        horaChegada:  horaCheg !== null ? horaCheg : (22 * 60 + idx * 3),
        horaSaida:    horaSaida,
        cor:          corVeiculo(idx)
      };
    });
  }

  function marcarZonaOk(nome, qtd) {
    const z = $('upload_zone'); if (!z) return;
    z.classList.add('has-file');
    const ico = z.querySelector('.u-ico'); if (ico) ico.textContent = '✅';
    const lbl = z.querySelector('.u-lbl'); if (lbl) lbl.textContent = `${nome} — ${qtd} veículos`;
  }

  function mostrarPreview(dados) {
    const wrap = $('preview_wrap'); if (!wrap) return;
    wrap.style.display = '';
    setTxt('preview_info', `${dados.length} veículos importados`);
    const tbl = $('tbl_preview'); if (!tbl) return;
    tbl.innerHTML = `
      <thead><tr><th>TB</th><th>Linha</th><th>KM</th><th>Bat%</th><th>Chegada</th><th>Saída</th></tr></thead>
      <tbody>${dados.slice(0,10).map(v => `<tr>
        <td style="font-weight:800;color:${v.cor}">${v.tb}</td>
        <td>${v.linha||'—'}</td>
        <td>${v.kmProg||'—'}</td>
        <td style="color:${v.batChegada<30?'#ff3d3d':v.batChegada<60?'#f9e000':'#00e5a0'};font-weight:700;">${v.batChegada}%</td>
        <td style="font-family:Consolas,monospace;">${fmtHora(v.horaChegada)}</td>
        <td style="font-family:Consolas,monospace;">${v.horaSaida!==null?fmtHora(v.horaSaida):'—'}</td>
      </tr>`).join('')}
      ${dados.length>10?`<tr><td colspan="6" style="text-align:center;color:#5a8ab0;font-size:10px;">... +${dados.length-10} veículos</td></tr>`:''}
      </tbody>`;
  }

  /* ═══════════════════════════════════════════
     MOTOR DE SIMULAÇÃO
  ═══════════════════════════════════════════ */
  function simular() {
    if (!veiculosBrutos.length) {
      alert('Importe uma planilha ou use o botão Demo primeiro!'); return;
    }
    const p = getParams();
    paramsSim = p;

    // Prepara veículos com hora disponível e energia necessária
    const veiculos = veiculosBrutos.map(v => {
      const energiaNecessaria = Math.max(v.bateriaTotal * (1 - v.batChegada / 100), 10);
      return {
        ...v,
        horaDisponivel:  v.horaChegada + p.preparo,
        energiaNecessaria,
        horarioLimite:   v.horaSaida !== null ? v.horaSaida - p.tolerancia : null
      };
    }).sort((a, b) => a.horaDisponivel - b.horaDisponivel || a.batChegada - b.batChegada);

    // Copia estrutura limpa de carregadores
    const carregadores = p.listaCarregadores.map(c => ({ ...c, slots: [] }));
    carregadoresSim = carregadores;
    simulacaoResult = [];
    const filaEspera = [];

    // FIFO: tenta alocar cada veículo
    veiculos.forEach(veiculo => {
      const horaInicio = veiculo.horaDisponivel;
      let alocado = false;

      // Ordena: menos ocupados primeiro, mais potentes em empate
      const carrOrd = [...carregadores].sort((a, b) => {
        const ocA = a.slots.filter(s => s.fim > horaInicio).length;
        const ocB = b.slots.filter(s => s.fim > horaInicio).length;
        if (ocA !== ocB) return ocA - ocB;
        return b.potencia - a.potencia;
      });

      for (const carr of carrOrd) {
        const ocupados = carr.slots.filter(s => s.fim > horaInicio).length;
        if (ocupados >= p.conectoresPorCarregador) continue;

        const potConector    = carr.potencia / (ocupados + 1);
        const tempoCargaMin  = Math.ceil((veiculo.energiaNecessaria / potConector) * 60);
        const fim            = horaInicio + tempoCargaMin;

        carr.slots.push({ veiculo, inicio: horaInicio, fim, potenciaUsada: potConector });
        simulacaoResult.push({
          veiculo, carregador: carr,
          conectorNum: ocupados + 1,
          inicio: horaInicio, fim,
          kwh: Math.round(veiculo.energiaNecessaria),
          tempoCargaMin, potenciaUsada: potConector, aguardou: false
        });
        alocado = true;
        break;
      }

      if (!alocado) filaEspera.push(veiculo);
    });

    // Processa fila de espera
    filaEspera.forEach(veiculo => {
      const melhor = carregadores.reduce((best, carr) => {
        const lib = carr.slots.length ? Math.max(...carr.slots.map(s => s.fim)) : 0;
        return lib < best.tempo ? { carr, tempo: lib } : best;
      }, { carr: carregadores[0], tempo: Infinity });

      const carr         = melhor.carr;
      const horaInicio   = Math.max(melhor.tempo, veiculo.horaDisponivel);
      const ocupados     = carr.slots.filter(s => s.fim > horaInicio).length;
      const potConector  = carr.potencia / Math.max(ocupados + 1, 1);
      const tempoCargaMin= Math.ceil((veiculo.energiaNecessaria / potConector) * 60);
      const fim          = horaInicio + tempoCargaMin;

      carr.slots.push({ veiculo, inicio: horaInicio, fim, potenciaUsada: potConector });
      simulacaoResult.push({
        veiculo, carregador: carr,
        conectorNum: ocupados + 1,
        inicio: horaInicio, fim,
        kwh: Math.round(veiculo.energiaNecessaria),
        tempoCargaMin, potenciaUsada: potConector,
        aguardou: true, tempoEspera: horaInicio - veiculo.horaDisponivel
      });
    });

    renderizarTudo(carregadores, p);
  }

  /* ═══════════════════════════════════════════
     RENDERIZAÇÃO COMPLETA
  ═══════════════════════════════════════════ */
  function renderizarTudo(carregadores, p) {
    const slots   = simulacaoResult;
    if (!slots.length) return;

    const horaMin = Math.min(...slots.map(s => s.inicio));
    const horaMax = Math.max(...slots.map(s => s.fim));
    const FAIXA   = 30;

    // Calcula ocupação por faixa
    const ocupacao = [];
    for (let t = Math.floor(horaMin/FAIXA)*FAIXA; t <= horaMax; t += FAIXA) {
      const ativos    = slots.filter(s => s.inicio <= t && s.fim > t);
      const carrAtiv  = new Set(ativos.map(s => s.carregador.id));
      const potTotal  = ativos.reduce((sum, s) => sum + s.potenciaUsada, 0);
      ocupacao.push({ hora: t, veiculos: ativos.length,
        carregadores: carrAtiv.size, conectores: ativos.length,
        potencia: Math.round(potTotal) });
    }

    // KPIs
    const picoCarreg = Math.max(...ocupacao.map(o => o.carregadores));
    const picoConect = Math.max(...ocupacao.map(o => o.conectores));
    const potMax     = Math.max(...ocupacao.map(o => o.potencia));
    const horaPico   = ocupacao.find(o => o.potencia === potMax);
    const emFila     = slots.filter(s => s.aguardou).length;
    const gargalo    = picoCarreg >= p.totalCarregadores;

    setTxt('k_veiculos',      veiculosBrutos.length);
    setTxt('k_pico_carr',     `${picoCarreg}/${p.totalCarregadores}`);
    setTxt('k_pico_carr_sub', gargalo ? '⚠ CAPACIDADE MÁXIMA' : 'simultâneos');
    setTxt('k_pico_conn',     `${picoConect}/${p.totalConectores}`);
    setTxt('k_pico_conn_sub', 'simultâneos');
    setTxt('k_pot_max',       `${potMax} kW`);
    setTxt('k_pot_max_sub',   `de ${p.potenciaTotal} kW disponível`);
    setTxt('k_hora_pico',     horaPico ? fmtHora(horaPico.hora) : '—');
    setTxt('k_fila',          emFila);
    setTxt('k_fila_sub',      emFila > 0 ? 'aguardaram carregador' : 'sem fila de espera');

    const kG  = $('k_gargalo'),    kGS = $('k_gargalo_sub');
    if (kG) {
      if (gargalo) {
        kG.innerHTML = '<span style="color:#ff3d3d">⚠ GARGALO</span>';
        if (kGS) kGS.textContent = 'Carregadores insuficientes!';
      } else if (emFila > 0) {
        kG.innerHTML = '<span style="color:#f9e000">⚠ FILA</span>';
        if (kGS) kGS.textContent = `${emFila} veículo(s) aguardaram`;
      } else {
        kG.innerHTML = '<span style="color:#00e5a0">✓ OK</span>';
        if (kGS) kGS.textContent = 'Capacidade adequada';
      }
    }

    // Badge topbar
    const badge = $('badgeStatus');
    if (badge) {
      badge.textContent = gargalo ? '⚠ GARGALO' : '✅ SIMULADO';
      badge.style.borderColor = gargalo ? '#ff3d3d' : '#00e5a0';
      badge.style.color       = gargalo ? '#ff3d3d' : '#00e5a0';
    }

    // Alerta de fila
    const alertFila = $('fila_alert');
    if (alertFila) {
      if (emFila > 0) {
        alertFila.textContent = `⚠ ${emFila} veículo(s) entraram em fila de espera. Considere adicionar mais carregadores ou aumentar a potência.`;
        alertFila.style.display = 'block';
      } else {
        alertFila.style.display = 'none';
      }
    }

    // Exibe seção de resultado
    const secRes = $('resultadoSimulacao');
    if (secRes) secRes.style.display = '';
    const secIni = $('estadoInicial');
    if (secIni) secIni.style.display = 'none';

    // Timestamp
    const ts = $('mapaTimestamp');
    if (ts) ts.textContent = `Simulado: ${new Date().toLocaleTimeString('pt-BR')} — ${slots.length} veículos`;

    renderMapaCarregadores(carregadores, p);
    renderGantt(carregadores, slots, horaMin, horaMax, p);
    renderTabelaOcupacao(ocupacao, p);
    renderGraficoPotencia(ocupacao, p);
    renderListaVeiculos(slots);
  }

  /* ═══════════════════════════════════════════
     MAPA DE CARREGADORES
  ═══════════════════════════════════════════ */
  function renderMapaCarregadores(carregadores, p) {
    const grid = $('chargerGrid'); if (!grid) return;

    grid.innerHTML = carregadores.map(carr => {
      const slotsOrd = [...carr.slots].sort((a, b) => a.inicio - b.inicio);
      const agora    = new Date().getHours() * 60 + new Date().getMinutes();
      const ativos   = carr.slots.filter(s => s.inicio <= agora && s.fim > agora).length;
      const cls      = ativos === 0 ? '' : ativos >= p.conectoresPorCarregador ? 'cheio' : 'em-uso';
      const pctBar   = Math.min((slotsOrd.length / Math.max(p.totalCarregadores * 0.5, 1)) * 100, 100);

      const slotsHtml = slotsOrd.slice(0,4).map(s => {
        const isFila = simulacaoResult.find(r => r.veiculo.tb === s.veiculo.tb)?.aguardou;
        return `<div class="conn-slot ${isFila ? 'dobra' : 'ocupado'}">
          <span class="conn-ico">${isFila ? '⏳' : '⚡'}</span>
          <span class="conn-veh" style="color:${s.veiculo.cor}">${s.veiculo.tb}</span>
          <span style="font-size:9px;color:#5a8ab0;margin-left:3px;">${s.veiculo.linha||''}</span>
          <span class="conn-time">${fmtHora(s.inicio)}→${fmtHora(s.fim)}</span>
        </div>`;
      }).join('') + (slotsOrd.length > 4
        ? `<div style="font-size:9px;color:var(--muted);text-align:center;padding:3px;">+${slotsOrd.length-4} mais</div>`
        : '') || '<div class="conn-empty">Nenhum veículo programado</div>';

      return `<div class="charger-card ${cls}">
        <div class="charger-head">
          <span class="charger-name">${carr.nome}</span>
          <span class="charger-kw">${carr.potencia}kW · ${carr.potencia/2}kW/conn</span>
        </div>
        <div class="charger-conn">${slotsHtml}</div>
        <div class="charger-bar"><div class="charger-bar-fill" style="width:${pctBar}%"></div></div>
        <div style="font-size:9px;color:var(--muted);margin-top:5px;">${slotsOrd.length} veículo(s) programado(s)</div>
      </div>`;
    }).join('');
  }

  /* ═══════════════════════════════════════════
     GANTT
  ═══════════════════════════════════════════ */
  function renderGantt(carregadores, slots, horaMin, horaMax, p) {
    const wrap = $('ganttWrap'); if (!wrap) return;
    const FAIXA  = 30;
    const PX_MIN = 2.8;
    const cols   = [];
    for (let t = Math.floor(horaMin/FAIXA)*FAIXA; t <= horaMax + FAIXA; t += FAIXA) cols.push(t);
    const totalPx = (cols[cols.length-1] - cols[0]) * PX_MIN;

    const thead = `<tr>
      <th class="row-head">Carregador</th>
      ${cols.map(t => `<th style="min-width:${FAIXA*PX_MIN}px;">${fmtHora(t)}</th>`).join('')}
    </tr>`;

    const rows = carregadores.map(carr => {
      const carrSlots = slots.filter(s => s.carregador.id === carr.id)
        .sort((a, b) => a.inicio - b.inicio);

      const blocos = carrSlots.map(s => {
        const left  = (s.inicio - cols[0]) * PX_MIN;
        const width = Math.max((s.fim - s.inicio) * PX_MIN, 28);
        return `<div class="gantt-block"
          style="left:${left}px;width:${width}px;background:${s.veiculo.cor};${s.aguardou?'opacity:0.65;outline:1px dashed #ff8c00;':''}"
          data-tb="${s.veiculo.tb}" data-linha="${s.veiculo.linha||'—'}"
          data-inicio="${fmtHora(s.inicio)}" data-fim="${fmtHora(s.fim)}"
          data-kwh="${s.kwh}" data-pot="${Math.round(s.potenciaUsada)}"
          data-bat="${s.veiculo.batChegada}" data-tempo="${s.tempoCargaMin}"
          data-aguardou="${s.aguardou?'SIM':'NÃO'}"
          onmouseenter="window.showGanttTooltip(event,this)"
          onmouseleave="window.hideGanttTooltip()"
        >${s.veiculo.tb}</div>`;
      }).join('');

      // Linhas de saída programada (traço vermelho vertical)
      const saidas = carrSlots.filter(s => s.veiculo.horaSaida !== null).map(s => {
        const left = (s.veiculo.horaSaida - cols[0]) * PX_MIN;
        return `<div style="position:absolute;top:0;bottom:0;left:${left}px;width:2px;background:rgba(255,61,61,0.7);z-index:4;"
                     title="Saída: ${fmtHora(s.veiculo.horaSaida)}"></div>`;
      }).join('');

      return `<tr>
        <td class="row-head">
          ${carr.nome}<br>
          <span style="font-size:9px;color:#3d7ef5;">${carr.potencia}kW</span>
        </td>
        <td colspan="${cols.length}" style="position:relative;padding:0;height:28px;min-width:${totalPx}px;">
          ${saidas}${blocos}
        </td>
      </tr>`;
    }).join('');

    wrap.innerHTML = `<table class="gantt-tbl" style="min-width:${totalPx+120}px;">
      <thead>${thead}</thead><tbody>${rows}</tbody>
    </table>`;
  }

  window.showGanttTooltip = function(e, el) {
    const tt = $('ganttTooltip'); if (!tt) return;
    tt.innerHTML = `
      <b style="color:${el.style.background}">🚌 Veículo ${el.dataset.tb}</b><br>
      <span style="color:#7a9cc8;">Linha: ${el.dataset.linha}</span><br>
      <span>⏱ ${el.dataset.inicio} → ${el.dataset.fim} (${duracaoTexto(parseInt(el.dataset.tempo))})</span><br>
      <span style="color:#f9e000;">⚡ ${el.dataset.kwh} kWh · ${el.dataset.pot} kW</span><br>
      <span style="color:${parseFloat(el.dataset.bat)<30?'#ff3d3d':parseFloat(el.dataset.bat)<60?'#f9e000':'#00e5a0'};">
        🔋 Bateria chegada: ${el.dataset.bat}%
      </span>
      ${el.dataset.aguardou==='SIM'?'<br><span style="color:#ff8c00;">⏳ Aguardou carregador</span>':''}`;
    tt.style.display = 'block';
    tt.style.left    = (e.clientX + 14) + 'px';
    tt.style.top     = (e.clientY - 8)  + 'px';
  };
  window.hideGanttTooltip = function() {
    const tt = $('ganttTooltip'); if (tt) tt.style.display = 'none';
  };
  document.addEventListener('mousemove', e => {
    const tt = $('ganttTooltip');
    if (tt && tt.style.display !== 'none') {
      tt.style.left = (e.clientX + 14) + 'px';
      tt.style.top  = (e.clientY - 8)  + 'px';
    }
  });

  /* ═══════════════════════════════════════════
     TABELA DE OCUPAÇÃO
  ═══════════════════════════════════════════ */
  function renderTabelaOcupacao(ocupacao, p) {
    const tb = $('tbOcupacao'); if (!tb) return;
    const potMax = Math.max(...ocupacao.map(o => o.potencia));

    tb.innerHTML = ocupacao.map(o => {
      const pctCarreg = o.carregadores / p.totalCarregadores * 100;
      const pctPot    = potMax > 0 ? o.potencia / potMax * 100 : 0;
      const isPico    = o.potencia === potMax;
      const corC      = pctCarreg >= 100 ? '#ff3d3d' : pctCarreg >= 80 ? '#f9e000' : '#00e5a0';
      const status    = o.carregadores >= p.totalCarregadores ? '⚠ MÁXIMO'
                      : o.carregadores >= p.totalCarregadores * 0.8 ? '⚠ ALTO' : '✓ OK';
      const statusCor = o.carregadores >= p.totalCarregadores ? '#ff3d3d'
                      : o.carregadores >= p.totalCarregadores * 0.8 ? '#f9e000' : '#00e5a0';
      return `<tr style="${isPico?'background:rgba(255,61,61,0.05);':''}">
        <td style="font-weight:800;font-family:Consolas,monospace;color:${isPico?'#ff3d3d':'#eaf2ff'};">
          ${fmtHora(o.hora)}${isPico?' 🔺':''}
        </td>
        <td>
          <span class="ocp-bar" style="width:${Math.max(pctCarreg*0.8,4)}px;background:${corC};"></span>
          <b style="color:${corC}">${o.carregadores}</b><span style="color:#5a8ab0;"> / ${p.totalCarregadores}</span>
        </td>
        <td><b style="color:#0af">${o.conectores}</b><span style="color:#5a8ab0;"> / ${p.totalConectores}</span></td>
        <td><b style="color:#a78bfa">${o.veiculos}</b></td>
        <td>
          <span class="ocp-bar" style="width:${Math.max(pctPot*0.7,4)}px;background:#f9e000;"></span>
          <b style="color:#f9e000">${o.potencia}</b><span style="color:#5a8ab0;"> kW</span>
        </td>
        <td><span style="color:${statusCor};font-weight:800;font-size:10px;">${status}</span></td>
      </tr>`;
    }).join('');
  }

  /* ═══════════════════════════════════════════
     GRÁFICO DE POTÊNCIA
  ═══════════════════════════════════════════ */
  function renderGraficoPotencia(ocupacao, p) {
    const el = $('cPotencia'); if (!el) return;
    if (chartPotencia) { chartPotencia.destroy(); chartPotencia = null; }

    chartPotencia = new Chart(el.getContext('2d'), {
      data: {
        labels: ocupacao.map(o => fmtHora(o.hora)),
        datasets: [
          {
            type: 'line', label: 'Potência (kW)',
            data: ocupacao.map(o => o.potencia),
            borderColor: '#f9e000', backgroundColor: 'rgba(249,224,0,0.08)',
            fill: true, tension: 0.4, pointRadius: 3, borderWidth: 2, yAxisID: 'y'
          },
          {
            type: 'bar', label: 'Veículos carregando',
            data: ocupacao.map(o => o.veiculos),
            backgroundColor: 'rgba(0,229,160,0.25)', borderColor: '#00e5a0',
            borderWidth: 1, borderRadius: 3, yAxisID: 'y2'
          },
          {
            type: 'line', label: 'Carregadores usados',
            data: ocupacao.map(o => o.carregadores),
            borderColor: '#00aaff', borderDash: [4,3], pointRadius: 0,
            fill: false, tension: 0, borderWidth: 1.5, yAxisID: 'y2'
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top', labels: { color: '#7a9cc8', boxWidth: 10, font: { size: 10 } } } },
        scales: {
          x:  { grid: { color: 'rgba(26,58,92,0.5)' }, ticks: { color: '#5a8ab0', font: { size: 9 }, maxRotation: 45, maxTicksLimit: 18 } },
          y:  { grid: { color: 'rgba(26,58,92,0.5)' }, ticks: { color: '#f9e000', callback: v => v + ' kW', font: { size: 9 } }, position: 'left' },
          y2: { grid: { display: false }, ticks: { color: '#00e5a0', callback: v => v + ' v', font: { size: 9 } }, position: 'right', min: 0 }
        }
      }
    });
  }

  /* ═══════════════════════════════════════════
     LISTA DE VEÍCULOS
  ═══════════════════════════════════════════ */
  function renderListaVeiculos(slots) {
    const el = $('vehList'); if (!el) return;
    el.innerHTML = veiculosBrutos.map(v => {
      const s = slots.find(x => x.veiculo.tb === v.tb);
      if (!s) return `<span class="veh-badge sem-carga" title="Sem carregador">🚫 ${v.tb}</span>`;
      if (s.aguardou) return `<span class="veh-badge aguardando"
        title="Linha ${v.linha||'—'} | Aguardou ${duracaoTexto(s.tempoEspera||0)} | ${s.carregador.nome}">
        ⏳ ${v.tb}</span>`;
      return `<span class="veh-badge"
        style="color:${v.cor};border-color:${v.cor}30;background:${v.cor}10;"
        title="Linha ${v.linha||'—'} | ${s.carregador.nome} | ${fmtHora(s.inicio)}→${fmtHora(s.fim)}">
        ⚡ ${v.tb}</span>`;
    }).join('');
  }

  /* ═══════════════════════════════════════════
     EXPORTAR EXCEL
  ═══════════════════════════════════════════ */
  $('btnExportar')?.addEventListener('click', exportarExcel);
  function exportarExcel() {
    if (!simulacaoResult.length) { alert('Execute a simulação primeiro.'); return; }
    const p = paramsSim || getParams();

    const aba1 = simulacaoResult.map(s => ({
      'TB / Veículo':         s.veiculo.tb,
      'Linha':                s.veiculo.linha,
      'Bat. Chegada (%)':     s.veiculo.batChegada,
      'Bat. Total (kWh)':     s.veiculo.bateriaTotal,
      'Energia Nec. (kWh)':   s.kwh,
      'Chegada Garagem':      fmtHora(s.veiculo.horaChegada),
      'Hora Disponível':      fmtHora(s.veiculo.horaDisponivel),
      'Saída Programada':     s.veiculo.horaSaida !== null ? fmtHora(s.veiculo.horaSaida) : '—',
      'Carregador':           s.carregador.nome,
      'Pot. Carregador (kW)': s.carregador.potencia,
      'Conector Nº':          s.conectorNum,
      'Início Carga':         fmtHora(s.inicio),
      'Fim Carga':            fmtHora(s.fim),
      'Duração':              duracaoTexto(s.tempoCargaMin),
      'Pot. Usada (kW)':      Math.round(s.potenciaUsada),
      'Aguardou Fila':        s.aguardou ? 'SIM' : 'NÃO'
    }));

    const horaMin = Math.min(...simulacaoResult.map(s => s.inicio));
    const horaMax = Math.max(...simulacaoResult.map(s => s.fim));
    const aba2 = [];
    for (let t = Math.floor(horaMin/30)*30; t <= horaMax; t += 30) {
      const ativos = simulacaoResult.filter(s => s.inicio <= t && s.fim > t);
      const carrAtivos = new Set(ativos.map(s => s.carregador.id));
      aba2.push({
        'Hora':                fmtHora(t),
        'Carregadores Usados': carrAtivos.size,
        'Total Disponível':    p.totalCarregadores,
        'Conectores Usados':   ativos.length,
        'Veículos Carregando': ativos.length,
        'Potência (kW)':       Math.round(ativos.reduce((s, x) => s + x.potenciaUsada, 0)),
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
     DEMO
  ═══════════════════════════════════════════ */
  $('btnUpload')?.addEventListener('click', () => $('fileInput')?.click());

  // Compatibilidade com IDs da recarga.html original
  $('fileInput')?.addEventListener('change', e => {
    const f = e.target.files[0]; if (f) processarArquivo(f);
  });

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
    ];
    veiculosBrutos = normalizarDados(demo);
    mostrarPreview(veiculosBrutos);
    setTxt('k_veiculos', veiculosBrutos.length);
    const nEl = $('fileNome'); if (nEl) nEl.textContent = 'dados_demo.xlsx';
    const z   = $('uploadZone');
    if (z) {
      z.classList.add('has-file');
      const lbl = z.querySelector('.lbl');
      if (lbl) lbl.textContent = `✅ Demo — ${veiculosBrutos.length} veículos de exemplo carregados`;
    }
  }

  /* ═══════════════════════════════════════════
     BOTÕES PRINCIPAIS
  ═══════════════════════════════════════════ */
  $('btnSimular')?.addEventListener('click', () => {
    const btn = $('btnSimular');
    if (btn) { btn.textContent = '⏳ Simulando...'; btn.disabled = true; }
    setTimeout(() => {
      try { simular(); }
      catch(err) { alert('Erro na simulação: ' + err.message); console.error(err); }
      finally { if (btn) { btn.textContent = '⚡ SIMULAR'; btn.disabled = false; } }
    }, 30);
  });

  function resetarResultado() {
    const secRes = $('resultadoSimulacao'); if (secRes) secRes.style.display = 'none';
    const secIni = $('estadoInicial');      if (secIni) secIni.style.display = '';
    const badge  = $('badgeStatus');
    if (badge) { badge.textContent = '⚡ PRONTO'; badge.style.borderColor = '#00e5a0'; badge.style.color = '#00e5a0'; }
  }

  // Recalcula automaticamente ao mudar parâmetros
  document.querySelectorAll('[data-cfg]').forEach(el => {
    el.addEventListener('change', () => {
      if (simulacaoResult.length > 0) setTimeout(simular, 50);
    });
  });

  /* ═══════════════════════════════════════════
     INICIALIZAÇÃO
  ═══════════════════════════════════════════ */
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color       = '#7a9cc8';
    Chart.defaults.font.family = "'Segoe UI', sans-serif";
    Chart.defaults.font.size   = 10;
  }

  atualizarResumo();
  carregarDemo();
});

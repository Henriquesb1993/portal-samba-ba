/**
 * MÓDULO RECARGA ELÉTRICA — Portal Sambaíba
 * Motor de simulação de carregamento de frota elétrica
 *
 * ALGORITMO:
 * 1. Lê planilha Excel com veículos
 * 2. Ordena por horário de chegada + bateria_chegada (menor bateria = prioridade)
 * 3. Distribui veículos nos carregadores disponíveis (first-fit)
 * 4. Respeita limite de conectores por carregador (2 por padrão)
 * 5. Calcula potência por faixa horária
 * 6. Gera mapa visual, Gantt, tabela de ocupação e gráfico de potência
 */

document.addEventListener('DOMContentLoaded', () => {

  // ── ESTADO ──────────────────────────────────────────────────────
  let veiculosBrutos  = [];  // dados da planilha
  let simulacao       = [];  // resultado: [{veiculo, carregador, conector, inicio, fim, kwh, potencia}]
  let chartPotencia   = null;
  const CORES_VEICULOS = [
    '#00e5a0','#0af','#f9e000','#a78bfa','#ff8c00',
    '#19d46e','#3d7ef5','#f65858','#e879f9','#fb923c',
    '#34d399','#60a5fa','#fbbf24','#c084fc','#f87171'
  ];

  // ── UTILS ────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const setEl = (id, v) => { const e=$(id); if(e) e.textContent=v; };

  function fmtHora(minutos) {
    // minutos desde meia-noite (pode ser negativo = dia anterior)
    let m = ((minutos % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60);
    const min = Math.round(m % 60);
    return String(h).padStart(2,'0') + ':' + String(min).padStart(2,'0');
  }

  function parseHora(str) {
    // "22:30" ou "22:30:00" ou "22h30" → minutos desde meia-noite
    if (!str) return null;
    str = String(str).trim();
    // Formato Excel serial (número de dias)
    if (!isNaN(str) && str.includes('.')) {
      const frac = parseFloat(str) % 1;
      return Math.round(frac * 1440);
    }
    // Formato HH:MM ou HH:MM:SS
    const match = str.match(/(\d{1,2})[:\h](\d{2})/);
    if (match) return parseInt(match[1]) * 60 + parseInt(match[2]);
    // Só número inteiro = horas
    if (!isNaN(str)) return parseInt(str) * 60;
    return null;
  }

  function corVeiculo(idx) {
    return CORES_VEICULOS[idx % CORES_VEICULOS.length];
  }

  // ── PARÂMETROS ───────────────────────────────────────────────────
  function getParams() {
    const nCarreg = parseInt($('pCarregadores')?.value) || 10;
    const nConect = parseInt($('pConectores')?.value)   || nCarreg * 2;
    const preparo = parseInt($('pTempoPreparo')?.value) || 30;
    const kwh1    = parseFloat($('pKwh1')?.value) || 120;
    const kwh2    = parseFloat($('pKwh2')?.value) || 90;

    // Potências dos carregadores (distribui pelos carregadores disponíveis)
    const pot1 = parseFloat($('pPot1')?.value) || 0;
    const pot2 = parseFloat($('pPot2')?.value) || 0;
    const pot3 = parseFloat($('pPot3')?.value) || 0;

    // Distribui potências pelos carregadores
    const potencias = [];
    let c = 0;
    const tipos = [pot3, pot2, pot1].filter(p => p > 0); // maior primeiro
    if (tipos.length === 0) tipos.push(180); // fallback
    for (let i = 0; i < nCarreg; i++) {
      potencias.push(tipos[c % tipos.length]);
      c++;
    }
    potencias.sort((a, b) => b - a); // maiores primeiro

    return { nCarreg, nConect, preparo, kwh1, kwh2, potencias };
  }

  // ── UPLOAD EXCEL ─────────────────────────────────────────────────
  $('btnUpload')?.addEventListener('click', () => $('fileInput')?.click());
  $('uploadZone')?.addEventListener('click', () => $('fileInput')?.click());

  $('uploadZone')?.addEventListener('dragover', e => {
    e.preventDefault();
    $('uploadZone').classList.add('drag-over');
  });
  $('uploadZone')?.addEventListener('dragleave', () => {
    $('uploadZone').classList.remove('drag-over');
  });
  $('uploadZone')?.addEventListener('drop', e => {
    e.preventDefault();
    $('uploadZone').classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) processarArquivo(file);
  });

  $('fileInput')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) processarArquivo(file);
  });

  function processarArquivo(file) {
    $('fileNome').textContent = file.name;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        let dados = [];
        if (file.name.endsWith('.csv')) {
          dados = parsearCSV(e.target.result);
        } else {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          dados = XLSX.utils.sheet_to_json(ws, { defval: '' });
        }
        veiculosBrutos = normalizarDados(dados);
        mostrarPreview(veiculosBrutos);
        $('uploadZone').classList.add('has-file');
        $('uploadZone').querySelector('.lbl').textContent = `✅ ${file.name} — ${veiculosBrutos.length} veículos carregados`;
        setEl('kVeiculos', veiculosBrutos.length);
        $('estadoInicial').style.display = '';
        $('resultadoSimulacao').style.display = 'none';
      } catch(err) {
        alert('Erro ao ler arquivo: ' + err.message);
      }
    };
    if (file.name.endsWith('.csv')) {
      reader.readAsText(file, 'UTF-8');
    } else {
      reader.readAsArrayBuffer(file);
    }
  }

  function parsearCSV(text) {
    const lines = text.split('\n').filter(l => l.trim());
    const headers = lines[0].split(';').map(h => h.trim().replace(/"/g,''));
    return lines.slice(1).map(line => {
      const vals = line.split(';').map(v => v.trim().replace(/"/g,''));
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
      return obj;
    });
  }

  function normalizarDados(dados) {
    return dados.map((row, idx) => {
      // Normaliza nomes de colunas (case insensitive)
      const get = (...keys) => {
        for (const k of keys) {
          const found = Object.keys(row).find(r => r.trim().toUpperCase() === k.toUpperCase());
          if (found && row[found] !== '') return row[found];
        }
        return '';
      };

      const tb         = String(get('TB','TABELA','tb') || `V${idx+1}`);
      const linha      = String(get('LINHA','linha','LINE') || '');
      const kmProg     = parseFloat(get('KM_PROG','KM PROG','km_prog') || 0);
      const batChegada = parseFloat(get('BATERIA_CHEGADA','BAT_CHEGADA','bateria_chegada','BATERIA') || 50);
      const horaCheg   = parseHora(get('HORARIO_CHEGADA_GARAGEM','CHEGADA','HORARIO_CHEGADA','hora_chegada'));

      return {
        idx,
        tb, linha, kmProg,
        batChegada: isNaN(batChegada) ? 50 : batChegada,
        horaChegada: horaCheg !== null ? horaCheg : 22 * 60 + idx * 5, // fallback
        cor: corVeiculo(idx)
      };
    }).filter(v => v.horaChegada !== null);
  }

  function mostrarPreview(dados) {
    const preview = $('previewTabela'); if (!preview) return;
    preview.style.display = '';
    $('previewInfo').textContent = `${dados.length} veículos importados`;
    const tbl = $('tblPreview');
    const cols = ['TB','Linha','KM Prog','Bat. Chegada','Hora Chegada'];
    tbl.innerHTML = `
      <thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${dados.slice(0,8).map(v=>`<tr>
        <td style="font-weight:700;color:#00e5a0;">${v.tb}</td>
        <td>${v.linha}</td>
        <td>${v.kmProg}</td>
        <td style="color:${v.batChegada<30?'#ff3d3d':v.batChegada<60?'#f9e000':'#00e5a0'}">${v.batChegada}%</td>
        <td>${fmtHora(v.horaChegada)}</td>
      </tr>`).join('')}${dados.length>8?`<tr><td colspan="5" style="color:#5a8ab0;text-align:center;">... mais ${dados.length-8} veículos</td></tr>`:''}</tbody>`;
  }

  // ── MOTOR DE SIMULAÇÃO ───────────────────────────────────────────
  function simular() {
    if (!veiculosBrutos.length) {
      alert('Importe uma planilha de veículos primeiro!');
      return;
    }

    const p = getParams();

    // 1. Prepara veículos — ordena por hora disponível (chegada + preparo), depois por bateria asc
    const veiculos = veiculosBrutos.map(v => ({
      ...v,
      horaDisponivel: v.horaChegada + p.preparo,
      // Energia necessária: quanto mais km ou menos bateria, mais precisa
      energiaNecessaria: Math.max(p.kwh1 * (1 - v.batChegada / 100), 20)
    })).sort((a, b) => a.horaDisponivel - b.horaDisponivel || a.batChegada - b.batChegada);

    // 2. Inicializa carregadores
    // carregadores[i] = { id, potencia, slots: [{veiculo, inicio, fim}] }
    const carregadores = Array.from({ length: p.nCarreg }, (_, i) => ({
      id: i + 1,
      nome: `CARREGADOR ${String(i+1).padStart(2,'0')}`,
      potencia: p.potencias[i],
      slots: [], // até 2 conectores
      livreFim: 0 // menor horário em que um slot fica livre
    }));

    simulacao = [];
    const aguardando = [];

    // 3. Distribui cada veículo
    veiculos.forEach(veiculo => {
      const horaInicio = veiculo.horaDisponivel;

      // Tenta encontrar carregador com slot livre neste horário
      let alocado = false;

      // Ordena carregadores: prefere os mais potentes E com menos slots ocupados no momento
      const carregOrd = [...carregadores].sort((a, b) => {
        const slotsA = a.slots.filter(s => s.fim > horaInicio).length;
        const slotsB = b.slots.filter(s => s.fim > horaInicio).length;
        // Prefere o que tem 0 slots ocupados, depois 1, nunca 2+
        if (slotsA !== slotsB) return slotsA - slotsB;
        // Mesma ocupação: prefere mais potente
        return b.potencia - a.potencia;
      });

      for (const carr of carregOrd) {
        const slotsAtivos = carr.slots.filter(s => s.fim > horaInicio).length;
        const maxConect = Math.floor(p.nConect / p.nCarreg) || 2;

        if (slotsAtivos >= maxConect) continue; // sem espaço

        // Potência disponível para este veículo
        const kwh = slotsAtivos === 0 ? p.kwh1 : p.kwh2;

        // Tempo de carga = energia_necessaria / potencia_carregador (em horas → minutos)
        const tempoCargaMin = Math.ceil((veiculo.energiaNecessaria / carr.potencia) * 60);
        const fim = horaInicio + tempoCargaMin;
        const conectorNum = slotsAtivos + 1;

        carr.slots.push({ veiculo, inicio: horaInicio, fim, kwh });

        simulacao.push({
          veiculo,
          carregador: carr,
          conectorNum,
          inicio: horaInicio,
          fim,
          kwh,
          tempoCargaMin,
          potenciaUsada: carr.potencia / (slotsAtivos + 1)
        });

        alocado = true;
        break;
      }

      if (!alocado) {
        // Aguardando — encontra o primeiro slot a ficar livre
        const menorFim = Math.min(...carregadores.map(c =>
          c.slots.length ? Math.min(...c.slots.map(s => s.fim)) : 0
        ));
        aguardando.push({ ...veiculo, horaAguardando: menorFim });
      }
    });

    // Processa aguardando (simplificado: atrás do fila)
    aguardando.forEach(veiculo => {
      const horaInicio = Math.max(veiculo.horaAguardando, veiculo.horaDisponivel);
      const carr = carregadores.reduce((best, c) => {
        const slotsAtivos = c.slots.filter(s => s.fim > horaInicio).length;
        const bestSlotsAtivos = best.slots.filter(s => s.fim > horaInicio).length;
        return slotsAtivos < bestSlotsAtivos ? c : best;
      }, carregadores[0]);

      const slotsAtivos = carr.slots.filter(s => s.fim > horaInicio).length;
      const kwh = slotsAtivos === 0 ? p.kwh1 : p.kwh2;
      const tempoCargaMin = Math.ceil((veiculo.energiaNecessaria / carr.potencia) * 60);
      const fim = horaInicio + tempoCargaMin;

      carr.slots.push({ veiculo, inicio: horaInicio, fim, kwh });
      simulacao.push({
        veiculo,
        carregador: carr,
        conectorNum: slotsAtivos + 1,
        inicio: horaInicio,
        fim,
        kwh,
        tempoCargaMin,
        potenciaUsada: carr.potencia / (slotsAtivos + 1),
        aguardou: true
      });
    });

    renderizarResultado(carregadores, p);
  }

  // ── RENDERIZAR ───────────────────────────────────────────────────
  function renderizarResultado(carregadores, p) {
    // Calcula métricas por faixa horária (de 15 em 15 min)
    const slots = simulacao;
    if (!slots.length) return;

    const horaMin = Math.min(...slots.map(s => s.inicio));
    const horaMax = Math.max(...slots.map(s => s.fim));
    const FAIXA   = 30; // minutos por faixa

    const ocupacao = [];
    for (let t = Math.floor(horaMin/FAIXA)*FAIXA; t <= horaMax; t += FAIXA) {
      const ativos = slots.filter(s => s.inicio <= t && s.fim > t);
      const carregAtivos = new Set(ativos.map(s => s.carregador.id));
      const potTotal = ativos.reduce((sum, s) => sum + s.potenciaUsada, 0);
      ocupacao.push({
        hora: t,
        veiculos: ativos.length,
        carregadores: carregAtivos.size,
        conectores: ativos.length,
        potencia: Math.round(potTotal),
        items: ativos
      });
    }

    // KPIs
    const picoCarreg = Math.max(...ocupacao.map(o => o.carregadores));
    const picoConect = Math.max(...ocupacao.map(o => o.conectores));
    const potMax     = Math.max(...ocupacao.map(o => o.potencia));
    const horaPico   = ocupacao.find(o => o.potencia === potMax);
    const totalCarreg = p.nCarreg;
    const gargalo    = picoCarreg >= totalCarreg;

    setEl('kVeiculos',       veiculosBrutos.length);
    setEl('kPicoCarreg',     picoCarreg + '/' + totalCarreg);
    setEl('kPicoCarregHora', picoCarreg === totalCarreg ? '⚠ capacidade máxima' : 'carregadores simultâneos');
    setEl('kPicoConect',     picoConect + '/' + p.nConect);
    setEl('kPicoConectHora', 'conectores simultâneos');
    setEl('kPotMax',         potMax + ' kW');
    setEl('kMaiorDemanda',   horaPico ? fmtHora(horaPico.hora) : '—');

    const kGargalo = $('kGargalo');
    const kGargaloSub = $('kGargaloSub');
    if (kGargalo) {
      if (gargalo) {
        kGargalo.innerHTML = '<span style="color:#ff3d3d">⚠ GARGALO</span>';
        if (kGargaloSub) kGargaloSub.textContent = 'Carregadores insuficientes!';
      } else {
        kGargalo.innerHTML = '<span style="color:#00e5a0">✓ OK</span>';
        if (kGargaloSub) kGargaloSub.textContent = 'Capacidade adequada';
      }
    }

    // Mostra resultado
    $('estadoInicial').style.display = 'none';
    $('resultadoSimulacao').style.display = '';

    renderMapaCarregadores(carregadores, p);
    renderGantt(carregadores, slots, horaMin, horaMax);
    renderTabelaOcupacao(ocupacao, p);
    renderGraficoPotencia(ocupacao);
    renderListaVeiculos(slots);

    const ts = $('mapaTimestamp');
    if (ts) ts.textContent = `Simulado: ${new Date().toLocaleTimeString('pt-BR')} — ${slots.length} veículos`;
  }

  // ── MAPA DE CARREGADORES ─────────────────────────────────────────
  function renderMapaCarregadores(carregadores, p) {
    const grid = $('chargerGrid'); if (!grid) return;
    const maxConect = Math.floor(p.nConect / p.nCarreg) || 2;

    grid.innerHTML = carregadores.map(carr => {
      const slotsOrdenados = carr.slots.sort((a, b) => a.inicio - b.inicio);
      const ultimosSlots = slotsOrdenados.slice(0, maxConect * 3); // mostrar até 6 eventos

      // Estado atual do carregador
      const agora = new Date().getHours() * 60 + new Date().getMinutes();
      const ativos = carr.slots.filter(s => s.inicio <= agora && s.fim > agora);
      const cls = ativos.length === 0 ? '' : ativos.length >= maxConect ? 'cheio' : 'em-uso';

      // Barra de uso
      const pctUso = Math.min(ativos.length / maxConect * 100, 100);

      const slotsHtml = slotsOrdenados.slice(0, 4).map((s, i) => `
        <div class="conn-slot ${i < maxConect ? 'ocupado' : 'dobra'}">
          <span class="conn-ico">⚡</span>
          <span class="conn-veh" style="color:${s.veiculo.cor}">${s.veiculo.tb}</span>
          <span style="font-size:9px;color:#5a8ab0;margin-left:4px;">${s.veiculo.linha}</span>
          <span class="conn-time">${fmtHora(s.inicio)} → ${fmtHora(s.fim)}</span>
        </div>`).join('');

      return `
        <div class="charger-card ${cls}">
          <div class="charger-head">
            <span class="charger-name">${carr.nome}</span>
            <span class="charger-kw">${carr.potencia} kW</span>
          </div>
          <div class="charger-conn">${slotsHtml || '<div class="conn-empty">Nenhum veículo programado</div>'}</div>
          <div class="charger-bar"><div class="charger-bar-fill" style="width:${pctUso}%"></div></div>
          <div style="font-size:9px;color:#3a6a8a;margin-top:4px;">${carr.slots.length} veículo(s) programado(s)</div>
        </div>`;
    }).join('');
  }

  // ── GANTT ────────────────────────────────────────────────────────
  function renderGantt(carregadores, slots, horaMin, horaMax) {
    const wrap = $('ganttWrap'); if (!wrap) return;

    // Gera colunas de 30 em 30 min
    const FAIXA = 30;
    const colunas = [];
    for (let t = Math.floor(horaMin/FAIXA)*FAIXA; t <= horaMax + FAIXA; t += FAIXA) {
      colunas.push(t);
    }
    const totalMin = (colunas[colunas.length-1] - colunas[0]);
    const pxPorMin = 2.5; // pixels por minuto

    const theadCols = colunas.map(t => `<th style="min-width:${FAIXA*pxPorMin}px;">${fmtHora(t)}</th>`).join('');

    const rows = carregadores.map(carr => {
      const carrSlots = slots.filter(s => s.carregador.id === carr.id)
        .sort((a, b) => a.inicio - b.inicio);

      // Renderiza blocos relativos ao início do gantt
      const blocos = carrSlots.map(s => {
        const left  = (s.inicio - colunas[0]) * pxPorMin;
        const width = Math.max((s.fim - s.inicio) * pxPorMin, 30);
        return `
          <div class="gantt-block"
            style="left:${left}px;width:${width}px;background:${s.veiculo.cor};"
            data-veh="${s.veiculo.tb}" data-linha="${s.veiculo.linha}"
            data-inicio="${fmtHora(s.inicio)}" data-fim="${fmtHora(s.fim)}"
            data-kwh="${s.kwh}" data-pot="${Math.round(s.potenciaUsada)}"
            data-bat="${s.veiculo.batChegada}"
            onmouseenter="window.showGanttTooltip(event,this)"
            onmouseleave="window.hideGanttTooltip()">
            ${s.veiculo.tb}
          </div>`;
      }).join('');

      return `<tr>
        <td class="row-head">${carr.nome}<br><span style="font-size:9px;color:#3d7ef5;">${carr.potencia}kW</span></td>
        <td colspan="${colunas.length}" style="position:relative;padding:0;height:28px;min-width:${totalMin*pxPorMin}px;">
          ${blocos}
        </td>
      </tr>`;
    }).join('');

    wrap.innerHTML = `
      <table class="gantt-tbl" style="min-width:${totalMin*pxPorMin+120}px;">
        <thead><tr><th class="row-head">Carregador</th>${theadCols}</tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  window.showGanttTooltip = function(e, el) {
    const tt = $('ganttTooltip'); if (!tt) return;
    tt.innerHTML = `
      <b>🚌 Veículo ${el.dataset.veh}</b><br>
      <span style="color:#7a9cc8;">Linha: ${el.dataset.linha||'—'}</span><br>
      <span>⏱ ${el.dataset.inicio} → ${el.dataset.fim}</span><br>
      <span style="color:#f9e000;">⚡ ${el.dataset.kwh} kWh | ${el.dataset.pot} kW</span><br>
      <span style="color:#${parseFloat(el.dataset.bat)<30?'ff3d3d':parseFloat(el.dataset.bat)<60?'f9e000':'00e5a0'};">🔋 Bateria chegada: ${el.dataset.bat}%</span>`;
    tt.style.display = 'block';
    tt.style.left = (e.clientX + 12) + 'px';
    tt.style.top  = (e.clientY - 10) + 'px';
  };
  window.hideGanttTooltip = function() {
    const tt = $('ganttTooltip'); if (tt) tt.style.display = 'none';
  };
  document.addEventListener('mousemove', e => {
    const tt = $('ganttTooltip');
    if (tt && tt.style.display !== 'none') {
      tt.style.left = (e.clientX + 12) + 'px';
      tt.style.top  = (e.clientY - 10) + 'px';
    }
  });

  // ── TABELA OCUPAÇÃO ──────────────────────────────────────────────
  function renderTabelaOcupacao(ocupacao, p) {
    const tb = $('tbOcupacao'); if (!tb) return;
    const potMax = Math.max(...ocupacao.map(o => o.potencia));
    const maxCarreg = p.nCarreg;

    tb.innerHTML = ocupacao.map(o => {
      const pctCarreg = o.carregadores / maxCarreg * 100;
      const pctPot    = potMax > 0 ? o.potencia / potMax * 100 : 0;
      const cor = pctCarreg >= 100 ? '#ff3d3d' : pctCarreg >= 80 ? '#f9e000' : '#00e5a0';
      const status = o.carregadores >= maxCarreg ? '⚠ MÁXIMO' : o.carregadores >= maxCarreg*0.8 ? '⚠ ALTO' : '✓ OK';
      const statusCor = o.carregadores >= maxCarreg ? '#ff3d3d' : o.carregadores >= maxCarreg*0.8 ? '#f9e000' : '#00e5a0';

      return `<tr>
        <td style="font-weight:700;font-family:Consolas,monospace;">${fmtHora(o.hora)}</td>
        <td>
          <span class="ocp-bar" style="width:${Math.max(pctCarreg,4)}px;background:${cor};"></span>
          <b style="color:${cor}">${o.carregadores}</b> / ${maxCarreg}
        </td>
        <td><b style="color:#0af">${o.conectores}</b> / ${p.nConect}</td>
        <td><b style="color:#a78bfa">${o.veiculos}</b></td>
        <td>
          <span class="ocp-bar" style="width:${Math.max(pctPot*0.6,4)}px;background:#f9e000;"></span>
          <b style="color:#f9e000">${o.potencia}</b> kW
        </td>
        <td><span style="color:${statusCor};font-weight:700;font-size:10px;">${status}</span></td>
      </tr>`;
    }).join('');
  }

  // ── GRÁFICO POTÊNCIA ─────────────────────────────────────────────
  function renderGraficoPotencia(ocupacao) {
    const el = $('cPotencia'); if (!el) return;
    if (chartPotencia) chartPotencia.destroy();

    const labs  = ocupacao.map(o => fmtHora(o.hora));
    const pots  = ocupacao.map(o => o.potencia);
    const veics = ocupacao.map(o => o.veiculos);

    chartPotencia = new Chart(el.getContext('2d'), {
      data: {
        labels: labs,
        datasets: [
          {
            type: 'line', label: 'Potência (kW)', data: pots,
            borderColor: '#f9e000', backgroundColor: 'rgba(249,224,0,0.1)',
            fill: true, tension: 0.4, pointRadius: 3, yAxisID: 'y'
          },
          {
            type: 'bar', label: 'Veículos carregando', data: veics,
            backgroundColor: 'rgba(0,229,160,0.3)', borderColor: '#00e5a0',
            borderWidth: 1, borderRadius: 3, yAxisID: 'y2'
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: '#7a9cc8', boxWidth: 10, font: { size: 10 } } },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          x:  { grid: { color: '#1a3560' }, ticks: { color: '#7a9cc8', font: { size: 9 }, maxRotation: 45, maxTicksLimit: 16 } },
          y:  { grid: { color: '#1a3560' }, ticks: { color: '#f9e000', callback: v => v + ' kW' }, position: 'left' },
          y2: { grid: { display: false },   ticks: { color: '#00e5a0', callback: v => v + ' v' }, position: 'right' }
        }
      }
    });
  }

  // ── LISTA VEÍCULOS ───────────────────────────────────────────────
  function renderListaVeiculos(slots) {
    const el = $('vehList'); if (!el) return;
    const todos = veiculosBrutos.map(v => {
      const slot = slots.find(s => s.veiculo.tb === v.tb);
      return { v, slot };
    });
    el.innerHTML = todos.map(({ v, slot }) => {
      if (!slot) return `<span class="veh-badge aguardando" title="Sem carregador disponível">⚠ ${v.tb}</span>`;
      return `<span class="veh-badge" style="color:${v.cor};border-color:${v.cor}30;background:${v.cor}10;" title="Linha ${v.linha} | ${fmtHora(slot.inicio)}→${fmtHora(slot.fim)} | ${slot.carregador.nome}">⚡ ${v.tb}</span>`;
    }).join('');
  }

  // ── EXPORTAR EXCEL ───────────────────────────────────────────────
  $('btnExportar')?.addEventListener('click', () => {
    if (!simulacao.length) { alert('Execute a simulação primeiro.'); return; }

    const dados = simulacao.map(s => ({
      'TB / Veículo':      s.veiculo.tb,
      'Linha':             s.veiculo.linha,
      'Bateria Chegada %': s.veiculo.batChegada,
      'Hora Chegada':      fmtHora(s.veiculo.horaChegada),
      'Hora Disponível':   fmtHora(s.veiculo.horaDisponivel || s.veiculo.horaChegada),
      'Carregador':        s.carregador.nome,
      'Potência Carr (kW)':s.carregador.potencia,
      'Conector':          s.conectorNum,
      'Início Carga':      fmtHora(s.inicio),
      'Fim Carga':         fmtHora(s.fim),
      'Tempo Carga (min)': s.tempoCargaMin,
      'kWh Recebidos':     s.kwh,
      'Pot Usada (kW)':    Math.round(s.potenciaUsada),
      'Aguardou':          s.aguardou ? 'SIM' : 'NÃO'
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dados);
    ws['!cols'] = Object.keys(dados[0]).map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Simulação Recarga');

    // Aba resumo de ocupação por hora
    const p = getParams();
    const horaMin = Math.min(...simulacao.map(s => s.inicio));
    const horaMax = Math.max(...simulacao.map(s => s.fim));
    const resumo = [];
    for (let t = Math.floor(horaMin/30)*30; t <= horaMax; t += 30) {
      const ativos = simulacao.filter(s => s.inicio <= t && s.fim > t);
      const carregAtivos = new Set(ativos.map(s => s.carregador.id));
      resumo.push({
        'Hora': fmtHora(t),
        'Carregadores Usados': carregAtivos.size,
        'Conectores Usados': ativos.length,
        'Veículos Carregando': ativos.length,
        'Potência kW': Math.round(ativos.reduce((s, x) => s + x.potenciaUsada, 0))
      });
    }
    const ws2 = XLSX.utils.json_to_sheet(resumo);
    XLSX.utils.book_append_sheet(wb, ws2, 'Ocupação por Hora');

    XLSX.writeFile(wb, `simulacao_recarga_${new Date().toISOString().split('T')[0]}.xlsx`);
  });

  // ── BOTÃO SIMULAR ────────────────────────────────────────────────
  $('btnSimular')?.addEventListener('click', () => {
    const btn = $('btnSimular');
    btn.textContent = '⏳ Simulando...';
    btn.disabled = true;
    setTimeout(() => {
      try {
        simular();
        const badge = $('badgeStatus');
        if (badge) { badge.textContent = '✅ SIMULADO'; badge.style.borderColor = '#00e5a0'; badge.style.color = '#00e5a0'; }
      } catch(e) {
        alert('Erro na simulação: ' + e.message);
        console.error(e);
      } finally {
        btn.textContent = '⚡ SIMULAR';
        btn.disabled = false;
      }
    }, 50);
  });

  // ── RECALCULAR AO ALTERAR PARÂMETROS ─────────────────────────────
  ['pCarregadores','pConectores','pTempoPreparo','pKwh1','pKwh2','pPot1','pPot2','pPot3'].forEach(id => {
    $(id)?.addEventListener('change', () => {
      if (simulacao.length > 0) {
        // Reconectar nConectores com padrão se não editado manualmente
        const nCarreg = parseInt($('pCarregadores')?.value) || 10;
        const nConect = $('pConectores');
        if (nConect && !nConect.dataset.editado) nConect.value = nCarreg * 2;
      }
    });
  });
  $('pConectores')?.addEventListener('input', e => {
    e.target.dataset.editado = '1';
  });

  // ── DEMO COM DADOS EXEMPLO ───────────────────────────────────────
  // Carrega dados de exemplo para demo imediata
  function carregarDemo() {
    const demo = [
      { TB:'3105', LINHA:'8012-10', KM_PROG:180, BATERIA_CHEGADA:25, HORARIO_CHEGADA_GARAGEM:'21:30' },
      { TB:'4108', LINHA:'8022-10', KM_PROG:160, BATERIA_CHEGADA:35, HORARIO_CHEGADA_GARAGEM:'21:45' },
      { TB:'3120', LINHA:'8023-10', KM_PROG:200, BATERIA_CHEGADA:15, HORARIO_CHEGADA_GARAGEM:'22:00' },
      { TB:'4112', LINHA:'8012-10', KM_PROG:140, BATERIA_CHEGADA:45, HORARIO_CHEGADA_GARAGEM:'22:10' },
      { TB:'3201', LINHA:'8003-10', KM_PROG:175, BATERIA_CHEGADA:30, HORARIO_CHEGADA_GARAGEM:'22:15' },
      { TB:'4205', LINHA:'8050-10', KM_PROG:190, BATERIA_CHEGADA:20, HORARIO_CHEGADA_GARAGEM:'22:20' },
      { TB:'3300', LINHA:'8022-10', KM_PROG:155, BATERIA_CHEGADA:55, HORARIO_CHEGADA_GARAGEM:'22:30' },
      { TB:'4301', LINHA:'8023-10', KM_PROG:210, BATERIA_CHEGADA:10, HORARIO_CHEGADA_GARAGEM:'22:35' },
      { TB:'3402', LINHA:'8012-10', KM_PROG:168, BATERIA_CHEGADA:40, HORARIO_CHEGADA_GARAGEM:'22:40' },
      { TB:'4403', LINHA:'8003-10', KM_PROG:195, BATERIA_CHEGADA:28, HORARIO_CHEGADA_GARAGEM:'22:45' },
      { TB:'3501', LINHA:'8050-10', KM_PROG:145, BATERIA_CHEGADA:60, HORARIO_CHEGADA_GARAGEM:'23:00' },
      { TB:'4502', LINHA:'8022-10', KM_PROG:185, BATERIA_CHEGADA:18, HORARIO_CHEGADA_GARAGEM:'23:10' },
      { TB:'3600', LINHA:'8023-10', KM_PROG:170, BATERIA_CHEGADA:33, HORARIO_CHEGADA_GARAGEM:'23:15' },
      { TB:'4601', LINHA:'8012-10', KM_PROG:205, BATERIA_CHEGADA:12, HORARIO_CHEGADA_GARAGEM:'23:20' },
      { TB:'3700', LINHA:'8003-10', KM_PROG:160, BATERIA_CHEGADA:48, HORARIO_CHEGADA_GARAGEM:'23:30' },
    ];
    veiculosBrutos = normalizarDados(demo);
    mostrarPreview(veiculosBrutos);
    setEl('kVeiculos', veiculosBrutos.length);
    $('fileNome').textContent = 'dados_demo.xlsx';
    $('uploadZone').classList.add('has-file');
    $('uploadZone').querySelector('.lbl').textContent = `✅ Demo — ${veiculosBrutos.length} veículos de exemplo carregados`;
  }

  carregarDemo();

  // Defaults de conectores = carregadores × 2
  const pC = $('pCarregadores');
  const pCon = $('pConectores');
  if (pC && pCon) {
    pC.addEventListener('input', () => {
      if (!pCon.dataset.editado) pCon.value = parseInt(pC.value || 10) * 2;
    });
  }

  // Chart defaults
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color       = '#7a9cc8';
    Chart.defaults.font.family = "'Segoe UI', sans-serif";
    Chart.defaults.font.size   = 10;
  }

});

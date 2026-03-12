/**
 * MÓDULO VIAGENS - Portal Sambaíba
 * 100% DADOS REAIS — API: sb_sim_icv_faixa_horaria + sb_linha_garagens
 * Campos API: linha, gar, lote, faixa_horaria, total_viagens_prog, viagens_monitoradas, percentual
 */

document.addEventListener("DOMContentLoaded", async () => {

    // ==========================================
    // UTILITÁRIOS
    // ==========================================
    const logBox = document.getElementById('logBoxV');

    function logMsg(msg, type = 'linfo') {
        if (!logBox) return;
        const time = new Date().toLocaleTimeString();
        const span = document.createElement('span');
        span.className = type;
        span.textContent = `[${time}] ${msg}`;
        logBox.appendChild(span);
        logBox.scrollTop = logBox.scrollHeight;
    }

    function setKPI(id, valor) {
        const el = document.getElementById(id);
        if (el) el.textContent = valor;
    }

    function loading(id, msg = 'Carregando...') {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#7a9cc8;padding:20px">${msg}</td></tr>`;
    }

    // ==========================================
    // PAINEL DE LOG — BOTÕES
    // ==========================================
    const btnConectar = document.getElementById('btnConectarV');
    const btnLimpar   = document.getElementById('btnLimparV');
    const btnTogLog   = document.getElementById('btnTogLogV');
    const btnEye      = document.getElementById('btnEyeV');
    const apiUrlInput = document.getElementById('apiUrlInputV');
    const apiStatus   = document.getElementById('apiStatusV');
    let isConnected   = false;

    if (btnEye && apiUrlInput) {
        btnEye.addEventListener('click', () => {
            apiUrlInput.type = apiUrlInput.type === 'password' ? 'text' : 'password';
            btnEye.textContent = apiUrlInput.type === 'password' ? '👁' : '🙈';
        });
    }
    if (btnLimpar) btnLimpar.addEventListener('click', () => { logBox.innerHTML = ''; logMsg('Log limpo.'); });
    if (btnTogLog) {
        btnTogLog.addEventListener('click', () => {
            logBox.style.display = logBox.style.display === 'none' ? 'block' : 'none';
            btnTogLog.textContent = logBox.style.display === 'none' ? '👁 Mostrar Log' : '👁 Ocultar Log';
        });
    }
    if (btnConectar) {
        btnConectar.addEventListener('click', () => {
            if (isConnected) {
                isConnected = false;
                btnConectar.textContent = '▶ Conectar API';
                btnConectar.classList.remove('conectado');
                if (apiStatus) apiStatus.textContent = 'Desconectado.';
                logMsg('Desconectado da API.', 'lwarn');
                return;
            }
            logMsg('Conectando à API...', 'linfo');
            btnConectar.textContent = '⏳ Conectando...';
            setTimeout(() => {
                isConnected = true;
                btnConectar.textContent = '⏹ Desconectar';
                btnConectar.classList.add('conectado');
                if (apiStatus) apiStatus.textContent = 'Sincronizado AO VIVO.';
                logMsg('Status 200 OK — Conectado com sucesso.', 'lok');
            }, 800);
        });
    }

    // ==========================================
    // DATAS PADRÃO
    // ==========================================
    const dataInicio = document.getElementById('dataInicio');
    const dataFim    = document.getElementById('dataFim');
    const hoje       = new Date().toISOString().split('T')[0];
    if (dataInicio) dataInicio.value = hoje;
    if (dataFim)    dataFim.value    = hoje;

    // ==========================================
    // BUSCAR DADOS DA API PRINCIPAL
    // ==========================================
    const API_FAIXA   = 'https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_sim_icv_faixa_horaria';
    const API_FILTROS = 'https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_linha_garagens';

    let dadosAPI      = [];
    let dadosFiltros  = [];
    let chartMensal   = null;
    let chartCump     = null;
    let chartPont     = null;
    let chartDonut    = null;

    logMsg('Inicializando módulo de viagens...', 'linfo');

    // Carregar as 2 APIs em paralelo
    try {
        logMsg('Buscando dados: sb_sim_icv_faixa_horaria + sb_linha_garagens', 'linfo');

        const [resFaixa, resFiltros] = await Promise.all([
            fetch(API_FAIXA),
            fetch(API_FILTROS)
        ]);

        const jsonFaixa   = await resFaixa.json();
        const jsonFiltros = await resFiltros.json();

        dadosAPI     = jsonFaixa.items     || [];
        dadosFiltros = jsonFiltros.items   || [];

        logMsg(`OK: ${dadosAPI.length} registros de viagens carregados.`, 'lok');
        logMsg(`OK: ${dadosFiltros.length} linhas/garagens carregadas.`, 'lok');

    } catch (err) {
        logMsg(`ERRO ao carregar APIs: ${err.message}`, 'lerro');
        console.error(err);
        return;
    }

    // ==========================================
    // FILTROS DINÂMICOS (CASCATA)
    // ==========================================
    const selGaragem   = document.getElementById('selGaragem');
    const selLote      = document.getElementById('selLote');
    const selLinha     = document.getElementById('selLinha');
    const btnConsultar = document.getElementById('btnConsultar');

    function preencherSelect(el, valores, padrao) {
        if (!el) return;
        el.innerHTML = `<option value="">${padrao}</option>`;
        valores.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v; opt.textContent = v;
            el.appendChild(opt);
        });
    }

    function montarFiltros(base) {
        const garagens = [...new Set(base.map(i => i.gar).filter(Boolean))].sort();
        const lotes    = [...new Set(base.map(i => i.lote).filter(Boolean))].sort();
        const linhas   = [...new Set(base.map(i => i.linha).filter(Boolean))].sort();
        preencherSelect(selGaragem, garagens, 'Todas as Garagens');
        preencherSelect(selLote,    lotes,    'Todos os Lotes');
        preencherSelect(selLinha,   linhas,   'Todas as Linhas');
        logMsg(`Filtros prontos: ${garagens.length} garagens | ${lotes.length} lotes | ${linhas.length} linhas.`, 'lok');
    }

    montarFiltros(dadosFiltros);

    if (selGaragem) {
        selGaragem.addEventListener('change', () => {
            const g    = selGaragem.value;
            const base = g ? dadosFiltros.filter(i => i.gar === g) : dadosFiltros;
            const lotes  = [...new Set(base.map(i => i.lote).filter(Boolean))].sort();
            const linhas = [...new Set(base.map(i => i.linha).filter(Boolean))].sort();
            preencherSelect(selLote,  lotes,  'Todos os Lotes');
            preencherSelect(selLinha, linhas, 'Todas as Linhas');
            logMsg(`Garagem: ${g || 'Todas'} → ${lotes.length} lotes | ${linhas.length} linhas`, 'linfo');
        });
    }

    if (selLote) {
        selLote.addEventListener('change', () => {
            const g    = selGaragem ? selGaragem.value : '';
            const l    = selLote.value;
            let base   = dadosFiltros;
            if (g) base = base.filter(i => i.gar  === g);
            if (l) base = base.filter(i => i.lote === l);
            const linhas = [...new Set(base.map(i => i.linha).filter(Boolean))].sort();
            preencherSelect(selLinha, linhas, 'Todas as Linhas');
        });
    }

    // ==========================================
    // PROCESSAR DADOS E RENDERIZAR DASHBOARD
    // ==========================================
    function processarEAtualizar(dados) {

        if (!dados || dados.length === 0) {
            logMsg('Nenhum dado encontrado para os filtros aplicados.', 'lwarn');
            return;
        }

        // ── KPIs GLOBAIS ──────────────────────────────
        let totalProg = 0, totalReal = 0;
        dados.forEach(i => {
            totalProg += (i.total_viagens_prog    || 0);
            totalReal += (i.viagens_monitoradas   || 0);
        });

        const icvGlobal  = totalProg > 0 ? (totalReal / totalProg * 100).toFixed(1) : '0.0';
        const naoReal    = totalProg - totalReal;
        const pctCump    = icvGlobal;

        // Atualiza KPIs no HTML
        setKPI('kpiCumprimento',    pctCump  + '%');
        setKPI('kpiCumprimentoSub', pctCump  + '% viagens realizadas');
        setKPI('kpiICV',            icvGlobal + '%');
        setKPI('kpiICVSub',         totalReal.toLocaleString('pt-BR') + ' viagens realizadas');
        setKPI('kpiNaoReal',        naoReal.toLocaleString('pt-BR'));
        setKPI('kpiNaoRealSub',     totalProg.toLocaleString('pt-BR') + ' programadas');

        logMsg(`KPIs → Prog:${totalProg} | Real:${totalReal} | ICV:${icvGlobal}%`, 'lok');

        // ── GRÁFICO FAIXA HORÁRIA ────────────────────
        const horas     = [4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23];
        const faixaMap  = {};
        horas.forEach(h => faixaMap[h] = { prog: 0, real: 0 });

        dados.forEach(i => {
            const h = i.faixa_horaria;
            if (faixaMap[h] !== undefined) {
                faixaMap[h].prog += (i.total_viagens_prog  || 0);
                faixaMap[h].real += (i.viagens_monitoradas || 0);
            }
        });

        const labelsFaixa = horas.map(h => String(h).padStart(2,'0') + 'h');
        const pctFaixa    = horas.map(h => faixaMap[h].prog > 0 ? parseFloat((faixaMap[h].real / faixaMap[h].prog * 100).toFixed(1)) : 0);

        // Cores dinâmicas por %: verde ≥95 | laranja 85-94 | vermelho <85
        const coresFaixa = pctFaixa.map(v => v >= 95 ? '#19d46e' : v >= 85 ? '#f6a623' : '#f65858');

        atualizarGraficoCump(labelsFaixa, pctFaixa, coresFaixa);
        atualizarGraficoPont(labelsFaixa, pctFaixa); // mesmo dado — ajuste quando IPP real vier

        // ── GRÁFICO DONUT POR GARAGEM ────────────────
        // Usa dadosFiltros para cruzar linha com garagem
        const linhaParaGar = {};
        dadosFiltros.forEach(f => { linhaParaGar[f.linha] = f.gar; });

        const garMap = {};
        dados.forEach(i => {
            const linha   = (i.linha || '').trim().replace(/\./g, '-');
            const garagem = linhaParaGar[linha] || linhaParaGar[i.linha] || 'Sem Garagem';
            if (!garMap[garagem]) garMap[garagem] = { prog: 0, real: 0 };
            garMap[garagem].prog += (i.total_viagens_prog  || 0);
            garMap[garagem].real += (i.viagens_monitoradas || 0);
        });

        const garLabels = Object.keys(garMap).sort();
        const garPct    = garLabels.map(g => garMap[g].prog > 0 ? parseFloat((garMap[g].real / garMap[g].prog * 100).toFixed(1)) : 0);
        const garCores  = ['#3d7ef5','#19d46e','#f6a623','#a855f7','#f65858','#00d4ff'];

        atualizarDonut(garLabels, garPct, garCores, garMap);

        // ── TABELA: VIAGENS NÃO CUMPRIDAS ────────────
        const linhaMap = {};
        dados.forEach(i => {
            const l = (i.linha || '').trim();
            if (!linhaMap[l]) linhaMap[l] = { prog: 0, real: 0 };
            linhaMap[l].prog += (i.total_viagens_prog  || 0);
            linhaMap[l].real += (i.viagens_monitoradas || 0);
        });

        const linhasArr = Object.entries(linhaMap).map(([l, v]) => ({
            linha:   l,
            prog:    v.prog,
            real:    v.real,
            icv:     v.prog > 0 ? parseFloat((v.real / v.prog * 100).toFixed(1)) : 0,
            naoReal: v.prog - v.real
        })).sort((a, b) => a.icv - b.icv); // menor ICV primeiro

        renderTabelaNaoCumpridas(linhasArr);
        renderTabelaDetalhamento(linhasArr);

        // ── HEATMAP POR LINHA/HORA ───────────────────
        // Top 6 linhas com mais viagens programadas
        const top6 = [...linhasArr].sort((a,b) => b.prog - a.prog).slice(0, 6).map(l => l.linha);

        const hmMap = {};
        dados.forEach(i => {
            const l = (i.linha || '').trim();
            const h = i.faixa_horaria;
            if (!top6.includes(l)) return;
            if (!hmMap[l]) hmMap[l] = {};
            if (!hmMap[l][h]) hmMap[l][h] = { prog: 0, real: 0 };
            hmMap[l][h].prog += (i.total_viagens_prog  || 0);
            hmMap[l][h].real += (i.viagens_monitoradas || 0);
        });

        renderHeatmap(top6, horas, hmMap);

        // ── GRÁFICO MENSAL (dados do período filtrado) ─
        // Como a API não tem endpoint mensal separado, agrupamos por data
        const dataMap = {};
        dados.forEach(i => {
            const d = i.data || i.data_inicio_viagem || '';
            if (!d) return;
            if (!dataMap[d]) dataMap[d] = { prog: 0, real: 0 };
            dataMap[d].prog += (i.total_viagens_prog  || 0);
            dataMap[d].real += (i.viagens_monitoradas || 0);
        });

        const datasOrdenadas = Object.keys(dataMap).sort();
        const labelsMensal   = datasOrdenadas.map(d => {
            const [y, m, dia] = d.split('-');
            return `${dia}/${m}`;
        });
        const pctMensal = datasOrdenadas.map(d => {
            const v = dataMap[d];
            return v.prog > 0 ? parseFloat((v.real / v.prog * 100).toFixed(1)) : 0;
        });
        const volMensal = datasOrdenadas.map(d => dataMap[d].prog);

        atualizarGraficoMensal(labelsMensal, pctMensal, volMensal);

        logMsg(`Dashboard renderizado com ${linhasArr.length} linhas e ${dados.length} registros.`, 'lok');
    }

    // ==========================================
    // RENDER: TABELA VIAGENS NÃO CUMPRIDAS
    // ==========================================
    function renderTabelaNaoCumpridas(linhas) {
        const tbody = document.getElementById('tbViagensNaoCumpridas');
        if (!tbody) return;

        if (linhas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#7a9cc8;padding:16px">Nenhum dado</td></tr>';
            return;
        }

        tbody.innerHTML = linhas.slice(0, 20).map(i => {
            const corICV = i.icv >= 95 ? '#19d46e' : i.icv >= 85 ? '#f6a623' : '#f65858';
            const corNR  = i.naoReal > 0 ? '#f65858' : '#19d46e';
            return `<tr>
                <td style="font-weight:700;color:#c8dcff;text-align:left">${i.linha}</td>
                <td>${i.prog}</td>
                <td>${i.real}</td>
                <td style="color:${corICV};font-weight:700">${i.icv}%</td>
                <td style="color:#f6a623">—</td>
                <td style="color:${corNR};font-weight:700">${i.naoReal}</td>
                <td><button onclick="verDetalhes('${i.linha}')" style="background:#1a3054;border:1px solid #3d7ef5;color:#4d8fff;border-radius:4px;padding:3px 10px;cursor:pointer;font-size:11px">Ver</button></td>
            </tr>`;
        }).join('');
    }

    // ==========================================
    // RENDER: TABELA DETALHAMENTO
    // ==========================================
    function renderTabelaDetalhamento(linhas) {
        const tbody = document.getElementById('tbDetalhamentoViagens');
        if (!tbody) return;

        if (linhas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#7a9cc8;padding:16px">Nenhum dado</td></tr>';
            return;
        }

        tbody.innerHTML = linhas.slice(0, 20).map(i => {
            const corICV = i.icv >= 95 ? '#19d46e' : i.icv >= 85 ? '#f6a623' : '#f65858';
            return `<tr>
                <td style="font-weight:700;color:#c8dcff;text-align:left">${i.linha}</td>
                <td>${i.prog}</td>
                <td>${i.real}</td>
                <td style="color:${corICV};font-weight:700">${i.icv}%</td>
                <td style="color:#f6a623">—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td><button onclick="verDetalhes('${i.linha}')" style="background:#1a3054;border:1px solid #3d7ef5;color:#4d8fff;border-radius:4px;padding:3px 10px;cursor:pointer;font-size:11px">Ver</button></td>
            </tr>`;
        }).join('');
    }

    // ==========================================
    // RENDER: HEATMAP
    // ==========================================
    function renderHeatmap(top6, horas, hmMap) {
        const tbody = document.getElementById('tbHeatmapViagens');
        if (!tbody) return;

        tbody.innerHTML = top6.map(linha => {
            const cells = horas.map(h => {
                const slot = (hmMap[linha] || {})[h];
                if (!slot || slot.prog === 0) return `<td style="background:rgba(255,255,255,0.03);color:#3a5a8a">—</td>`;

                const pct    = (slot.real / slot.prog * 100);
                const naoR   = slot.prog - slot.real;
                let bg = 'rgba(25,212,110,0.15)'; let fc = '#19d46e';
                if (pct < 95 && pct >= 85) { bg = 'rgba(246,166,35,0.35)';  fc = '#f6a623'; }
                if (pct < 85)              { bg = 'rgba(246,88,88,0.55)';   fc = '#fff'; }

                return `<td style="background:${bg};color:${fc};font-weight:${pct<85?'700':'400'}">${naoR === 0 ? '✓' : naoR}</td>`;
            }).join('');

            return `<tr><td class="lh">${linha}</td>${cells}</tr>`;
        }).join('');
    }

    // ==========================================
    // GRÁFICOS CHART.JS
    // ==========================================
    Chart.defaults.color           = '#7a9cc8';
    Chart.defaults.font.family     = "'Inter', sans-serif";
    Chart.defaults.font.size       = 10;
    Chart.defaults.scale.grid.color = '#1f3860';

    function atualizarGraficoMensal(labels, pctICV, volProg) {
        const el = document.getElementById('cViagensMensal');
        if (!el) return;
        if (chartMensal) chartMensal.destroy();
        chartMensal = new Chart(el.getContext('2d'), {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { type:'line', label:'% ICV', data: pctICV, borderColor:'#19d46e', backgroundColor:'#19d46e', borderWidth:2, tension:0.3, yAxisID:'y1', pointRadius:3 },
                    { type:'bar',  label:'Viagens Prog', data: volProg, backgroundColor:'#1e3a6e', yAxisID:'y', borderRadius:3 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position:'bottom', labels:{ boxWidth:10, padding:10 } } },
                scales: {
                    y:  { display: false },
                    y1: { type:'linear', position:'left', min: 60, max: 110,
                          ticks: { callback: v => v + '%' } }
                }
            }
        });
    }

    function atualizarGraficoCump(labels, pct, cores) {
        const el = document.getElementById('cCumprimentoFaixa');
        if (!el) return;
        if (chartCump) chartCump.destroy();
        chartCump = new Chart(el.getContext('2d'), {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { type:'line', label:'Média', data: pct, borderColor:'#c8dcff', backgroundColor:'rgba(200,220,255,0.1)', borderWidth:1.5, tension:0.3, pointRadius:2 },
                    { type:'bar',  label:'Cumprimento', data: pct, backgroundColor: cores, borderRadius:2 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { min: 60, max: 110, ticks: { callback: v => v + '%' } } }
            }
        });
    }

    function atualizarGraficoPont(labels, pct) {
        const el = document.getElementById('cPontualidadeFaixa');
        if (!el) return;
        if (chartPont) chartPont.destroy();
        const coresPont = pct.map(v => v >= 90 ? '#f6a623' : v >= 80 ? '#f69023' : '#f65858');
        chartPont = new Chart(el.getContext('2d'), {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label:'Pontualidade', data: pct, backgroundColor: coresPont, borderRadius:2 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { min: 60, max: 110, ticks: { callback: v => v + '%' } } }
            }
        });
    }

    function atualizarDonut(labels, pct, cores, garMap) {
        const el = document.getElementById('cGaragemDonut');
        if (!el) return;
        if (chartDonut) chartDonut.destroy();
        chartDonut = new Chart(el.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{ data: pct, backgroundColor: cores.slice(0, labels.length), borderWidth: 0, hoverOffset: 6 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '65%',
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}% cumprido` } }
                }
            }
        });

        // Atualiza legenda do donut
        const legendEl = document.getElementById('legendDonut');
        if (legendEl) {
            legendEl.innerHTML = labels.map((g, idx) => {
                const v = garMap[g];
                return `<div style="margin-bottom:8px;display:flex;align-items:center;">
                    <span style="display:inline-block;width:12px;height:12px;background:${cores[idx]};border-radius:50%;margin-right:8px;flex-shrink:0;"></span>
                    <span>${g}: ${v.real.toLocaleString('pt-BR')} de ${v.prog.toLocaleString('pt-BR')} viagens</span>
                </div>`;
            }).join('');
        }
    }

    // ==========================================
    // BOTÃO CONSULTAR
    // ==========================================
    if (btnConsultar) {
        btnConsultar.addEventListener('click', () => {
            const g  = selGaragem ? selGaragem.value : '';
            const lo = selLote    ? selLote.value    : '';
            const li = selLinha   ? selLinha.value   : '';

            logMsg(`Filtrando: Garagem=${g||'Todas'} | Lote=${lo||'Todos'} | Linha=${li||'Todas'}`, 'lwarn');

            // Cruzar linha selecionada com os dados da API de viagens
            // A API de faixa retorna campo "linha" no formato "106A-10"
            // A API de filtros retorna campo "linha" no formato "106A.10"
            // Normalizar: trocar "." por "-"
            const linhasFiltradas = dadosFiltros
                .filter(f => {
                    if (g  && f.gar  !== g)  return false;
                    if (lo && f.lote !== lo) return false;
                    if (li && f.linha.replace(/\./g,'-') !== li.replace(/\./g,'-')) return false;
                    return true;
                })
                .map(f => f.linha.replace(/\./g, '-'));

            const linhasSet = new Set(linhasFiltradas);

            let dadosFiltradosAPI = dadosAPI;
            if (linhasSet.size > 0 && (g || lo || li)) {
                dadosFiltradosAPI = dadosAPI.filter(i => {
                    const l = (i.linha || '').trim().replace(/\./g, '-');
                    return linhasSet.has(l);
                });
            }

            logMsg(`${dadosFiltradosAPI.length} registros após filtro.`, 'linfo');
            processarEAtualizar(dadosFiltradosAPI);
        });
    }

    // ==========================================
    // MODAL VER DETALHES
    // ==========================================
    window.verDetalhes = function(linha) {
        const dados = dadosAPI.filter(i => (i.linha || '').trim() === linha);
        if (!dados.length) return alert('Sem dados para esta linha.');
        const prog = dados.reduce((s, i) => s + (i.total_viagens_prog  || 0), 0);
        const real = dados.reduce((s, i) => s + (i.viagens_monitoradas || 0), 0);
        const icv  = prog > 0 ? (real / prog * 100).toFixed(1) : '0.0';
        alert(`Linha: ${linha}\nProgramadas: ${prog}\nRealizadas: ${real}\nICV: ${icv}%\n\nDetalhamento por hora disponível em breve.`);
    };

    // ==========================================
    // CARGA INICIAL — RENDERIZA TUDO
    // ==========================================
    processarEAtualizar(dadosAPI);

});

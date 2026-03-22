/**
 * MÓDULO VIAGENS — Portal Sambaíba
 * Versão: 3.0 — DIAGNÓSTICO REAL APLICADO
 *
 * FATOS DA API (investigados em 2026-03-12):
 * ─ total de registros: 100.165
 * ─ API aceita SOMENTE: ?data=YYYY-MM-DD, ?linha=XXX, ?limit=N, ?offset=N
 * ─ NÃO existe data_inicio / data_fim
 * ─ Datas com dados: 2024-06-01, 2024-07-10, 2024-07-17, 2024-10-10
 * ─ Por data: ~3.500 registros, 115 linhas únicas, 4 garagens (G1-G4)
 * ─ Garagem vem NULL na API de viagens → cruzar com sb_linha_garagens
 * ─ Linha formato: "106A-10" (viagens) vs "106A.10" (filtros) → normalizar
 */

document.addEventListener("DOMContentLoaded", async () => {

    // ─────────────────────────────────────────────────────
    // CONSTANTES
    // ─────────────────────────────────────────────────────
    const API_VIAGENS = 'https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_sim_icv_faixa_horaria';
    const API_FILTROS = 'https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_linha_garagens';
    const API_HEADERS = { 'Authorization': 'Bearer ' + CONFIG.API_TOKEN };

    // Datas reais disponíveis na base (descobertas por investigação)
    const DATAS_DISPONIVEIS = ['2024-06-01', '2024-07-10', '2024-07-17', '2024-10-10'];
    const DATA_PADRAO       = '2024-10-10'; // data mais recente

    // ─────────────────────────────────────────────────────
    // ESTADO GLOBAL
    // ─────────────────────────────────────────────────────
    let dadosAPI     = [];   // todos os registros da data selecionada
    let dadosFiltros = [];   // linhas + garagens + lotes
    let mapaGar      = {};   // { "106A-10": "G4" }
    let mapaLote     = {};   // { "106A-10": "E2" }

    let chartMensal = null, chartCump = null, chartPont = null, chartDonut = null;

    // ─────────────────────────────────────────────────────
    // UTILITÁRIOS
    // ─────────────────────────────────────────────────────
    function norm(l) {
        return (l || '').trim().replace(/\./g, '-').toUpperCase();
    }

    function setEl(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    function setHTML(id, html) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    }

    function fmtNum(n) {
        return Number(n).toLocaleString('pt-BR');
    }

    function corICV(v) {
        return v >= 95 ? '#19d46e' : v >= 85 ? '#f6a623' : '#f65858';
    }

    // ─────────────────────────────────────────────────────
    // BUSCAR TODOS OS REGISTROS COM PAGINAÇÃO
    // (API retorna limit=200 por padrão — precisa paginar)
    // ─────────────────────────────────────────────────────
    async function buscarTodos(data) {
        const todos  = [];
        const LIMIT  = 1000;
        let offset   = 0;
        let total    = null;

        setEstadoCarregando(true);

        while (true) {
            const url = `${API_VIAGENS}?data=${data}&limit=${LIMIT}&offset=${offset}`;
            const r   = await fetch(url, { headers: API_HEADERS });
            const d   = await r.json();
            const items = d.items || [];
            total = d.total || 0;
            todos.push(...items);

            console.log(`[VIAGENS] Paginando: offset=${offset} | recebidos=${items.length} | total=${total} | acumulado=${todos.length}`);

            if (todos.length >= total || items.length === 0) break;
            offset += LIMIT;
        }

        setEstadoCarregando(false);
        console.log(`[VIAGENS] ✅ Total carregado: ${todos.length} registros | ${new Set(todos.map(i => norm(i.linha))).size} linhas`);
        return todos;
    }

    function setEstadoCarregando(sim) {
        const btn = document.getElementById('btnConsultar');
        if (btn) {
            btn.textContent = sim ? '⏳ Carregando...' : '🔍 Consultar';
            btn.disabled = sim;
        }
        const badge = document.getElementById('badgeLive');
        if (badge) {
            badge.textContent = sim ? '⏳ CARREGANDO' : '● AO VIVO';
            badge.style.color = sim ? '#f6a623' : '';
        }
        if (sim) {
            ['kpiProg','kpiReal','kpiPerdas','kpiAderencia','kpiPerdaPct'].forEach(id => setEl(id, '...'));
        }
    }

    // ─────────────────────────────────────────────────────
    // CONFIGURAR FILTRO DE DATA → DROPDOWN COM DATAS REAIS
    // ─────────────────────────────────────────────────────
    function configurarFiltroData() {
        const elInicio = document.getElementById('dataInicio');
        const elFim    = document.getElementById('dataFim');

        if (elInicio) {
            elInicio.value = DATA_PADRAO;
            elInicio.title = `Datas disponíveis: ${DATAS_DISPONIVEIS.join(', ')}`;
        }
        if (elFim) {
            elFim.value = DATA_PADRAO;
            elFim.title = `A API filtra por data exata. Datas disponíveis: ${DATAS_DISPONIVEIS.join(', ')}`;
        }

        const badge = document.getElementById('badgeDatasReais');
        if (badge) {
            badge.style.display = 'block';
            badge.textContent = `⚠ Datas com dados: ${DATAS_DISPONIVEIS.map(d => {
                const [y,m,dia] = d.split('-');
                return `${dia}/${m}/${y}`;
            }).join(' | ')}`;
        }
    }

    // ─────────────────────────────────────────────────────
    // CARREGAR API DE FILTROS (GARAGENS/LOTES/LINHAS)
    // ─────────────────────────────────────────────────────
    async function carregarFiltros() {
        const r = await fetch(`${API_FILTROS}?limit=2000`, { headers: API_HEADERS });
        const d = await r.json();
        dadosFiltros = d.items || [];

        // Montar mapas de cruzamento
        dadosFiltros.forEach(f => {
            const l = norm(f.linha);
            mapaGar[l]  = f.gar  || 'Sem Garagem';
            mapaLote[l] = f.lote || 'Sem Lote';
        });

        console.log(`[FILTROS] ${dadosFiltros.length} linhas | garagens: ${[...new Set(Object.values(mapaGar))].sort().join(', ')}`);
    }

    // ─────────────────────────────────────────────────────
    // PREENCHER SELECTS (GARAGEM / LOTE / LINHA)
    // ─────────────────────────────────────────────────────
    function montarSelects(base) {
        const gars   = [...new Set(base.map(i => i.gar).filter(Boolean))].sort();
        const lotes  = [...new Set(base.map(i => i.lote).filter(Boolean))].sort();
        const linhas = [...new Set(base.map(i => norm(i.linha)).filter(Boolean))].sort();

        preencheSelect('selGaragem', gars,   'Todas as Garagens');
        preencheSelect('selLote',    lotes,  'Todos os Lotes');
        preencheSelect('selLinha',   linhas, 'Todas as Linhas');
    }

    function preencheSelect(id, valores, label) {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = `<option value="">${label}</option>`;
        valores.forEach(v => {
            const o = document.createElement('option');
            o.value = v; o.textContent = v;
            el.appendChild(o);
        });
    }

    // ─────────────────────────────────────────────────────
    // PROCESSAR E RENDERIZAR DASHBOARD
    // ─────────────────────────────────────────────────────
    function renderDashboard(dados) {
        if (!dados || dados.length === 0) {
            console.warn('[VIAGENS] Sem dados para renderizar.');
            setEl('kpiProg', '0'); setEl('kpiReal', '0');
            setEl('kpiPerdas', '0'); setEl('kpiAderencia', '0%'); setEl('kpiPerdaPct', '0%');
            return;
        }

        // ── KPIs ──────────────────────────────────────────
        let prog = 0, real = 0;
        dados.forEach(i => {
            prog += (i.total_viagens_prog   || 0);
            real += (i.viagens_monitoradas  || 0);
        });
        const icv      = prog > 0 ? (real / prog * 100).toFixed(1) : '0.0';
        const naoR     = prog - real;
        const perdaPct = prog > 0 ? (naoR / prog * 100).toFixed(1) : '0.0';

        setEl('kpiProg',       fmtNum(prog));
        setEl('kpiProgSub',    `${new Set(dados.map(i => norm(i.linha))).size} linhas monitoradas`);
        setEl('kpiReal',       fmtNum(real));
        setEl('kpiRealSub',    `${icv}% do total programado`);
        setEl('kpiPerdas',     fmtNum(naoR));
        setEl('kpiPerdasSub',  `${perdaPct}% das viagens programadas`);
        setEl('kpiAderencia',  icv + '%');
        setEl('kpiAderSub',    `${fmtNum(real)} realizadas de ${fmtNum(prog)}`);
        setEl('kpiPerdaPct',   perdaPct + '%');
        setEl('kpiPerdaPctSub', `${fmtNum(naoR)} partidas não cumpridas`);

        // ── FAIXA HORÁRIA ─────────────────────────────────
        const horas  = [4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23];
        const fM     = {};
        horas.forEach(h => fM[h] = { prog:0, real:0 });
        dados.forEach(i => {
            const h = i.faixa_horaria;
            if (fM[h] !== undefined) {
                fM[h].prog += (i.total_viagens_prog  || 0);
                fM[h].real += (i.viagens_monitoradas || 0);
            }
        });
        const lblH    = horas.map(h => String(h).padStart(2,'0') + 'h');
        const pctH    = horas.map(h => fM[h].prog > 0 ? parseFloat((fM[h].real/fM[h].prog*100).toFixed(1)) : 0);
        const coresH  = pctH.map(v => corICV(v));
        const coresPt = pctH.map(v => v >= 90 ? '#f6a623' : v >= 80 ? '#e08030' : '#f65858');
        renderGraficoCump(lblH, pctH, coresH);
        renderGraficoPont(lblH, pctH, coresPt);

        // ── DONUT GARAGEM ─────────────────────────────────
        const garM = {};
        dados.forEach(i => {
            const g = mapaGar[norm(i.linha)] || 'Sem Garagem';
            if (!garM[g]) garM[g] = { prog:0, real:0 };
            garM[g].prog += (i.total_viagens_prog  || 0);
            garM[g].real += (i.viagens_monitoradas || 0);
        });
        const garLabels = Object.keys(garM).sort();
        const garPct    = garLabels.map(g => garM[g].prog > 0 ? parseFloat((garM[g].real/garM[g].prog*100).toFixed(1)) : 0);
        const garCores  = ['#3d7ef5','#19d46e','#f6a623','#a855f7','#f65858','#00d4ff'];
        renderDonut(garLabels, garPct, garCores, garM);

        // ── AGRUPAMENTO POR LINHA ─────────────────────────
        const lM = {};
        dados.forEach(i => {
            const l = norm(i.linha);
            if (!lM[l]) lM[l] = { prog:0, real:0 };
            lM[l].prog += (i.total_viagens_prog  || 0);
            lM[l].real += (i.viagens_monitoradas || 0);
        });
        const linhasArr = Object.entries(lM)
            .map(([l,v]) => ({
                l, prog:v.prog, real:v.real,
                icv:  v.prog > 0 ? parseFloat((v.real/v.prog*100).toFixed(1)) : 0,
                naoR: v.prog - v.real
            }))
            .sort((a,b) => a.icv - b.icv);

        renderTabelaNaoCumpridas(linhasArr);
        renderTabelaDetalhamento(linhasArr);

        // ── HEATMAP ───────────────────────────────────────
        const top8 = [...linhasArr].sort((a,b) => b.prog - a.prog).slice(0,8).map(x => x.l);
        const hmM  = {};
        dados.forEach(i => {
            const l = norm(i.linha);
            const h = i.faixa_horaria;
            if (!top8.includes(l)) return;
            if (!hmM[l]) hmM[l] = {};
            if (!hmM[l][h]) hmM[l][h] = { prog:0, real:0 };
            hmM[l][h].prog += (i.total_viagens_prog  || 0);
            hmM[l][h].real += (i.viagens_monitoradas || 0);
        });
        renderHeatmap(top8, horas, hmM);

        // ── GRÁFICO MENSAL (agrupa por data) ──────────────
        // Como a API não tem range de datas, mostrar KPI por data disponível
        const dM = {};
        dados.forEach(i => {
            const d = i.data || i.data_inicio_viagem || '';
            if (!d) return;
            if (!dM[d]) dM[d] = { prog:0, real:0 };
            dM[d].prog += (i.total_viagens_prog  || 0);
            dM[d].real += (i.viagens_monitoradas || 0);
        });
        // Sempre mostra todas as 4 datas disponíveis para ter contexto histórico
        const datasOrd  = DATAS_DISPONIVEIS;
        const lblMensal = datasOrd.map(d => {
            const [y,m,dia] = d.split('-');
            const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
            return `${dia}/${meses[parseInt(m)-1]}`;
        });
        const pctMensal = datasOrd.map(d => dM[d] ? (dM[d].prog > 0 ? parseFloat((dM[d].real/dM[d].prog*100).toFixed(1)) : 0) : null);
        const volMensal = datasOrd.map(d => dM[d] ? dM[d].prog : 0);
        renderGraficoMensal(lblMensal, pctMensal, volMensal);

        renderTabelaRanking(linhasArr);

        console.log(`[RENDER] ✅ ${linhasArr.length} linhas | ${dados.length} registros`);
    }

    // ─────────────────────────────────────────────────────
    // RENDERS
    // ─────────────────────────────────────────────────────
    function renderTabelaNaoCumpridas(linhas) {
        const tbody = document.getElementById('tbViagensNaoCumpridas');
        if (!tbody) return;
        tbody.innerHTML = linhas.slice(0, 20).map(i => {
            const c  = corICV(i.icv);
            const cN = i.naoR > 0 ? '#f65858' : '#19d46e';
            return `<tr>
              <td>${i.l}</td>
              <td>${fmtNum(i.prog)}</td>
              <td>${fmtNum(i.real)}</td>
              <td style="color:${c};font-weight:700">${i.icv}%</td>
              <td style="color:#5a7ca8">—</td>
              <td style="color:${cN};font-weight:700">${fmtNum(i.naoR)}</td>
              <td><button onclick="verDetalhes('${i.l}')" class="btn-ver">Ver</button></td>
            </tr>`;
        }).join('');
    }

    function renderTabelaDetalhamento(linhas) {
        const tbody = document.getElementById('tbDetalhamentoViagens');
        if (!tbody) return;
        tbody.innerHTML = linhas.slice(0, 20).map(i => {
            const c   = corICV(i.icv);
            const g   = mapaGar[i.l]  || '—';
            const lo  = mapaLote[i.l] || '—';
            const tag = i.icv >= 95
                ? `<span class="tag tag-ok">OK</span>`
                : i.icv >= 85
                    ? `<span class="tag tag-warn">Atenção</span>`
                    : `<span class="tag tag-err">Crítico</span>`;
            return `<tr>
              <td>${i.l}</td>
              <td>${fmtNum(i.prog)}</td>
              <td>${fmtNum(i.real)}</td>
              <td style="color:${c};font-weight:700">${i.icv}%</td>
              <td style="color:${i.naoR>0?'#f65858':'#19d46e'}">${fmtNum(i.naoR)}</td>
              <td style="color:#5a7ca8">${g}</td>
              <td style="color:#5a7ca8">${lo}</td>
              <td>${tag}</td>
              <td><button onclick="verDetalhes('${i.l}')" class="btn-ver">Ver</button></td>
            </tr>`;
        }).join('');
    }

    function renderTabelaRanking(linhas) {
        const tbody = document.getElementById('tbRankingBody');
        if (!tbody) return;
        const sorted = [...linhas].sort((a, b) => b.naoR - a.naoR).slice(0, 15);
        if (!sorted.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="color:#3a5a88;text-align:center;padding:20px;">Sem dados.</td></tr>`;
            return;
        }
        tbody.innerHTML = sorted.map((i, idx) => {
            const rank  = idx + 1;
            const rc    = rank <= 3 ? '#f65858' : rank <= 7 ? '#f6a623' : '#5a7ca8';
            const icvC  = corICV(i.icv);
            return `<tr>
              <td style="font-weight:800;color:${rc};text-align:center">${rank}</td>
              <td>${i.l}</td>
              <td>${fmtNum(i.prog)}</td>
              <td>${fmtNum(i.real)}</td>
              <td style="color:#f65858;font-weight:700">${fmtNum(i.naoR)}</td>
              <td style="color:${icvC};font-weight:700">${i.icv}%</td>
            </tr>`;
        }).join('');
    }

    function renderHeatmap(top8, horas, hmM) {
        const tbody = document.getElementById('tbHeatmapViagens');
        if (!tbody) return;
        tbody.innerHTML = top8.map(linha => {
            const cells = horas.map(h => {
                const s = (hmM[linha] || {})[h];
                if (!s || s.prog === 0)
                    return `<td style="background:rgba(255,255,255,0.02);color:#2a4a7a">—</td>`;
                const pct  = s.real / s.prog * 100;
                const naoR = s.prog - s.real;
                let bg = 'rgba(25,212,110,0.12)', fc = '#19d46e';
                if (pct < 95 && pct >= 85) { bg='rgba(246,166,35,0.35)'; fc='#f6a623'; }
                if (pct < 85)              { bg='rgba(246,88,88,0.60)';  fc='#fff';    }
                return `<td style="background:${bg};color:${fc};font-weight:${pct<85?700:400}">${naoR===0?'✓':naoR}</td>`;
            }).join('');
            return `<tr><td class="lh">${linha}</td>${cells}</tr>`;
        }).join('');
    }

    // ─────────────────────────────────────────────────────
    // GRÁFICOS CHART.JS
    // ─────────────────────────────────────────────────────
    Chart.defaults.color            = '#7a9cc8';
    Chart.defaults.font.family      = "'Inter','Segoe UI',sans-serif";
    Chart.defaults.font.size        = 10;
    Chart.defaults.scale.grid.color = '#1a3560';

    function renderGraficoMensal(labels, pct, vol) {
        const el = document.getElementById('cViagensMensal');
        if (!el) return;
        if (chartMensal) chartMensal.destroy();
        chartMensal = new Chart(el.getContext('2d'), {
            data: {
                labels,
                datasets: [
                    { type:'line', label:'% ICV', data:pct,
                      borderColor:'#19d46e', backgroundColor:'rgba(25,212,110,0.08)',
                      borderWidth:2, tension:0.3, pointRadius:4,
                      spanGaps:false, yAxisID:'y1' },
                    { type:'bar', label:'Viagens Prog', data:vol,
                      backgroundColor:'#1e3a6e', borderRadius:3, yAxisID:'y' }
                ]
            },
            options:{
                responsive:true, maintainAspectRatio:false,
                plugins:{
                    legend:{ position:'bottom', labels:{ boxWidth:10, padding:10 } },
                    tooltip:{ callbacks:{ label: ctx => ctx.dataset.label + ': ' + ctx.raw + (ctx.dataset.yAxisID==='y1'?'%':'') } }
                },
                scales:{
                    y:  { display:false },
                    y1: { position:'left', min:60, max:110, ticks:{ callback: v => v+'%' } }
                }
            }
        });
    }

    function renderGraficoCump(labels, pct, cores) {
        const el = document.getElementById('cCumprimentoFaixa');
        if (!el) return;
        if (chartCump) chartCump.destroy();
        chartCump = new Chart(el.getContext('2d'), {
            data:{
                labels,
                datasets:[
                    { type:'line', label:'Média', data:pct,
                      borderColor:'rgba(200,220,255,0.4)', borderWidth:1.5,
                      tension:0.3, pointRadius:2, fill:false },
                    { type:'bar', label:'% Cumprimento', data:pct,
                      backgroundColor:cores, borderRadius:2 }
                ]
            },
            options:{
                responsive:true, maintainAspectRatio:false,
                plugins:{ legend:{ display:false } },
                scales:{ y:{ min:60, max:110, ticks:{ callback: v => v+'%' } } }
            }
        });
    }

    function renderGraficoPont(labels, pct, cores) {
        const el = document.getElementById('cPontualidadeFaixa');
        if (!el) return;
        if (chartPont) chartPont.destroy();
        chartPont = new Chart(el.getContext('2d'), {
            data:{
                labels,
                datasets:[{
                    type:'bar', label:'% Pontualidade', data:pct,
                    backgroundColor:cores, borderRadius:2
                }]
            },
            options:{
                responsive:true, maintainAspectRatio:false,
                plugins:{ legend:{ display:false } },
                scales:{ y:{ min:60, max:110, ticks:{ callback: v => v+'%' } } }
            }
        });
    }

    function renderDonut(labels, pct, cores, garM) {
        const el = document.getElementById('cGaragemDonut');
        if (!el) return;
        if (chartDonut) chartDonut.destroy();
        chartDonut = new Chart(el.getContext('2d'), {
            type:'doughnut',
            data:{
                labels,
                datasets:[{
                    data:pct,
                    backgroundColor:cores.slice(0,labels.length),
                    borderWidth:0, hoverOffset:6
                }]
            },
            options:{
                responsive:true, maintainAspectRatio:false, cutout:'65%',
                plugins:{
                    legend:{ display:false },
                    tooltip:{ callbacks:{ label: ctx => ` ${ctx.label}: ${ctx.raw}%` } }
                }
            }
        });

        const legEl = document.getElementById('legendDonut');
        if (legEl) {
            legEl.innerHTML = labels.map((g,i) => {
                const v = garM[g];
                return `<div style="margin-bottom:8px;display:flex;align-items:center;">
                  <span style="display:inline-block;width:12px;height:12px;
                    background:${cores[i]};border-radius:50%;margin-right:8px;flex-shrink:0;"></span>
                  ${g}: ${fmtNum(v.real)} de ${fmtNum(v.prog)} viagens
                </div>`;
            }).join('');
        }
    }

    // ─────────────────────────────────────────────────────
    // BOTÃO CONSULTAR — lê data e filtros
    // ─────────────────────────────────────────────────────
    const btnConsultar = document.getElementById('btnConsultar');
    const selGaragem   = document.getElementById('selGaragem');
    const selLote      = document.getElementById('selLote');
    const selLinha     = document.getElementById('selLinha');

    if (btnConsultar) {
        btnConsultar.addEventListener('click', async () => {
            const elInicio = document.getElementById('dataInicio');
            const dataSel  = elInicio ? elInicio.value : DATA_PADRAO;

            // Verificar se a data existe na base
            if (!DATAS_DISPONIVEIS.includes(dataSel)) {
                const elFim = document.getElementById('dataFim');
                if (elInicio) elInicio.value = DATA_PADRAO;
                if (elFim)    elFim.value    = DATA_PADRAO;

                const badge = document.getElementById('badgeDatasReais');
                if (badge) {
                    badge.style.display = 'block';
                    badge.style.background = 'rgba(246,88,88,0.12)';
                    badge.style.borderColor = 'rgba(246,88,88,0.4)';
                    badge.style.color = '#f65858';
                    badge.textContent = `⚠ Data selecionada sem dados. Exibindo: ${DATA_PADRAO}. Disponíveis: ${DATAS_DISPONIVEIS.map(d => { const [y,m,dia]=d.split('-'); return `${dia}/${m}/${y}`; }).join(' | ')}`;
                }
            }

            const dataQuery = DATAS_DISPONIVEIS.includes(dataSel) ? dataSel : DATA_PADRAO;
            const g  = selGaragem ? selGaragem.value : '';
            const lo = selLote    ? selLote.value    : '';
            const li = selLinha   ? selLinha.value   : '';

            console.log(`[CONSULTA] data=${dataQuery} | G=${g||'Todas'} | L=${lo||'Todos'} | Linha=${li||'Todas'}`);

            // Re-buscar dados se a data mudou
            if (dataQuery !== (dadosAPI[0]?.data || '')) {
                dadosAPI = await buscarTodos(dataQuery);
            }

            // Aplicar filtros de garagem/lote/linha
            const linhasFiltradas = new Set(
                dadosFiltros
                    .filter(f => {
                        if (g  && f.gar  !== g)  return false;
                        if (lo && f.lote !== lo) return false;
                        if (li && norm(f.linha) !== li) return false;
                        return true;
                    })
                    .map(f => norm(f.linha))
            );

            let filtrado = dadosAPI;
            if (g || lo || li) {
                filtrado = dadosAPI.filter(i => linhasFiltradas.has(norm(i.linha)));
                console.log(`[FILTRO] ${filtrado.length} registros após filtro`);
            }

            renderDashboard(filtrado);
        });
    }

    // Cascata garagem → lote → linha
    if (selGaragem) {
        selGaragem.addEventListener('change', () => {
            const gv   = selGaragem.value;
            const base = gv ? dadosFiltros.filter(f => f.gar === gv) : dadosFiltros;
            const lotes  = [...new Set(base.map(f => f.lote).filter(Boolean))].sort();
            const linhas = [...new Set(base.map(f => norm(f.linha)).filter(Boolean))].sort();
            preencheSelect('selLote',  lotes,  'Todos');
            preencheSelect('selLinha', linhas, 'Todas as Linhas');
        });
    }
    if (selLote) {
        selLote.addEventListener('change', () => {
            const gv  = selGaragem ? selGaragem.value : '';
            const lv  = selLote.value;
            let base  = dadosFiltros;
            if (gv) base = base.filter(f => f.gar  === gv);
            if (lv) base = base.filter(f => f.lote === lv);
            const linhas = [...new Set(base.map(f => norm(f.linha)).filter(Boolean))].sort();
            preencheSelect('selLinha', linhas, 'Todas as Linhas');
        });
    }

    // ─────────────────────────────────────────────────────
    // BOTÃO RESET
    // ─────────────────────────────────────────────────────
    const btnReset = document.getElementById('btnReset');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            if (selGaragem) selGaragem.value = '';
            if (selLote)    selLote.value    = '';
            if (selLinha)   selLinha.value   = '';
            const tdTodos = document.getElementById('tdTodos');
            if (tdTodos) tdTodos.checked = true;
            const elInicio = document.getElementById('dataInicio');
            const elFim    = document.getElementById('dataFim');
            if (elInicio) elInicio.value = DATA_PADRAO;
            if (elFim)    elFim.value    = DATA_PADRAO;
            montarSelects(dadosFiltros);
            renderDashboard(dadosAPI);
        });
    }

    // ─────────────────────────────────────────────────────
    // EXPORTAR EXCEL (CSV)
    // ─────────────────────────────────────────────────────
    function exportarCSV(dados, nomeArquivo) {
        const lM = {};
        dados.forEach(i => {
            const l = norm(i.linha);
            if (!lM[l]) lM[l] = { prog: 0, real: 0 };
            lM[l].prog += (i.total_viagens_prog  || 0);
            lM[l].real += (i.viagens_monitoradas || 0);
        });
        const headers = ['Linha', 'Programadas', 'Realizadas', '% ICV', 'Perdas', 'Garagem', 'Lote'];
        const rows = Object.entries(lM).map(([l, v]) => {
            const icv  = v.prog > 0 ? (v.real / v.prog * 100).toFixed(1) : '0.0';
            return [l, v.prog, v.real, icv + '%', v.prog - v.real, mapaGar[l] || '', mapaLote[l] || ''];
        }).sort((a, b) => a[0].localeCompare(b[0]));
        const csv  = [headers, ...rows].map(r => r.join(';')).join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = nomeArquivo + '.csv'; a.click();
        URL.revokeObjectURL(url);
    }

    const btnExcel = document.getElementById('btnExcel');
    if (btnExcel) btnExcel.addEventListener('click', () => exportarCSV(dadosAPI, `viagens_${DATA_PADRAO}`));

    const btnExcelRanking = document.getElementById('btnExcelRanking');
    if (btnExcelRanking) btnExcelRanking.addEventListener('click', () => exportarCSV(dadosAPI, `ranking_perdas_${DATA_PADRAO}`));

    const btnExcelDetalhe = document.getElementById('btnExcelDetalhe');
    if (btnExcelDetalhe) btnExcelDetalhe.addEventListener('click', () => exportarCSV(dadosAPI, `detalhamento_${DATA_PADRAO}`));

    const btnExcelPiores = document.getElementById('btnExcelPiores');
    if (btnExcelPiores) btnExcelPiores.addEventListener('click', () => exportarCSV(dadosAPI, `piores_icv_${DATA_PADRAO}`));

    // ─────────────────────────────────────────────────────
    // MODAL DETALHES
    // ─────────────────────────────────────────────────────
    window.verDetalhes = function(linha) {
        const d = dadosAPI.filter(i => norm(i.linha) === linha);
        if (!d.length) { alert('Sem dados.'); return; }
        const p   = d.reduce((s, i) => s + (i.total_viagens_prog  || 0), 0);
        const r   = d.reduce((s, i) => s + (i.viagens_monitoradas || 0), 0);
        const icv = p > 0 ? (r / p * 100).toFixed(1) : '0.0';
        const pct = p > 0 ? ((p - r) / p * 100).toFixed(1) : '0.0';
        alert(
            `Linha: ${linha}\n` +
            `Garagem: ${mapaGar[linha] || 'N/A'}  |  Lote: ${mapaLote[linha] || 'N/A'}\n\n` +
            `Programadas: ${fmtNum(p)}\n` +
            `Realizadas:  ${fmtNum(r)}\n` +
            `Perdidas:    ${fmtNum(p - r)} (${pct}%)\n` +
            `ICV:         ${icv}%`
        );
    };

    // ─────────────────────────────────────────────────────
    // INICIALIZAÇÃO
    // ─────────────────────────────────────────────────────
    try {
        await carregarFiltros();
        montarSelects(dadosFiltros);
        configurarFiltroData();
        dadosAPI = await buscarTodos(DATA_PADRAO);
        renderDashboard(dadosAPI);
    } catch (err) {
        console.error('[VIAGENS] Erro crítico:', err);
    }

});

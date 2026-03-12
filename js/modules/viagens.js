/**
 * Módulo de Viagens - Portal Sambaíba
 * Controlador de dados, API Real e Chart.js
 * API: sb_linha_garagens → { items: [ { linha, gar, lote } ] }
 */

document.addEventListener("DOMContentLoaded", () => {

    // ==========================================
    // 1. PAINEL DE API — LOG E CONEXÃO
    // ==========================================
    const btnConectar  = document.getElementById('btnConectarV');
    const btnLimpar    = document.getElementById('btnLimparV');
    const btnTogLog    = document.getElementById('btnTogLogV');
    const btnEye       = document.getElementById('btnEyeV');
    const apiUrlInput  = document.getElementById('apiUrlInputV');
    const logBox       = document.getElementById('logBoxV');
    const apiStatus    = document.getElementById('apiStatusV');

    let isConnected = false;

    function logMsg(msg, type = 'linfo') {
        const time = new Date().toLocaleTimeString();
        const span = document.createElement('span');
        span.className = type;
        span.textContent = `[${time}] ${msg}`;
        logBox.appendChild(span);
        logBox.scrollTop = logBox.scrollHeight;
    }

    if (btnEye) {
        btnEye.addEventListener('click', () => {
            if (apiUrlInput.type === 'password') {
                apiUrlInput.type = 'text';
                btnEye.textContent = '🙈';
            } else {
                apiUrlInput.type = 'password';
                btnEye.textContent = '👁';
            }
        });
    }

    if (btnLimpar) {
        btnLimpar.addEventListener('click', () => {
            logBox.innerHTML = '';
            logMsg('Log limpo pelo usuário.', 'linfo');
        });
    }

    if (btnTogLog) {
        btnTogLog.addEventListener('click', () => {
            if (logBox.style.display === 'none') {
                logBox.style.display = 'block';
                btnTogLog.textContent = '👁 Ocultar Log';
            } else {
                logBox.style.display = 'none';
                btnTogLog.textContent = '👁 Mostrar Log';
            }
        });
    }

    if (btnConectar) {
        btnConectar.addEventListener('click', () => {
            if (!apiUrlInput.value) {
                logMsg('Erro: URL da API não informada.', 'lerro');
                return;
            }
            if (isConnected) {
                isConnected = false;
                btnConectar.textContent = '▶ Conectar API';
                btnConectar.classList.remove('conectado');
                if (apiStatus) apiStatus.textContent = 'Conexão encerrada.';
                logMsg('Desconectado da API.', 'lwarn');
                return;
            }
            logMsg('Iniciando handshake com: ' + apiUrlInput.value, 'linfo');
            btnConectar.textContent = '⏳ Conectando...';
            setTimeout(() => {
                isConnected = true;
                btnConectar.textContent = '⏹ Desconectar';
                btnConectar.classList.add('conectado');
                if (apiStatus) apiStatus.textContent = 'Sincronizado AO VIVO.';
                logMsg('Status 200 OK — Autenticado com sucesso.', 'lok');
                document.querySelectorAll('.kpi-val').forEach(el => {
                    el.style.opacity = '0.5';
                    setTimeout(() => el.style.opacity = '1', 500);
                });
                setInterval(() => {
                    if (isConnected && Math.random() > 0.7) {
                        const linhas = ['8110', '8223-20', '8046-10', '8521'];
                        logMsg(`Ping — IOV: Linha ${linhas[Math.floor(Math.random()*linhas.length)]} atualizada.`, 'linfo');
                    }
                }, 4000);
            }, 1200);
        });
    }

    // ==========================================
    // 2. FILTROS DINÂMICOS — API REAL CORRIGIDA
    // campos da API: { items: [ { linha, gar, lote } ] }
    // ==========================================
    const selGaragem   = document.getElementById('selGaragem');
    const selLote      = document.getElementById('selLote');
    const selLinha     = document.getElementById('selLinha');
    const dataInicio   = document.getElementById('dataInicio');
    const dataFim      = document.getElementById('dataFim');
    const btnConsultar = document.getElementById('btnConsultar');

    // Data padrão: hoje
    const hoje = new Date().toISOString().split('T')[0];
    if (dataInicio) dataInicio.value = hoje;
    if (dataFim)    dataFim.value    = hoje;

    let dbEstrutura = [];

    function preencherSelect(el, valores, padrao) {
        if (!el) return;
        el.innerHTML = `<option value="">${padrao}</option>`;
        valores.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            el.appendChild(opt);
        });
    }

    function montarDropdowns(base) {
        // ✅ Campos corretos da API: gar, lote, linha
        const garagens = [...new Set(base.map(i => i.gar).filter(Boolean))].sort();
        const lotes    = [...new Set(base.map(i => i.lote).filter(Boolean))].sort();
        const linhas   = [...new Set(base.map(i => i.linha).filter(Boolean))].sort();

        preencherSelect(selGaragem, garagens, 'Todas as Garagens');
        preencherSelect(selLote,    lotes,    'Todos os Lotes');
        preencherSelect(selLinha,   linhas,   'Todas as Linhas');

        logMsg(`Filtros carregados: ${garagens.length} garagens | ${lotes.length} lotes | ${linhas.length} linhas.`, 'lok');
    }

    async function carregarFiltrosDaAPI() {
        try {
            const url = 'https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_linha_garagens';
            logMsg(`Carregando estrutura de filtros...`, 'linfo');

            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const json = await res.json();

            // ✅ A API retorna { success, total, items: [...] }
            dbEstrutura = json.items || [];

            if (dbEstrutura.length === 0) {
                logMsg('Aviso: API retornou lista vazia.', 'lwarn');
                return;
            }

            logMsg(`API OK — ${dbEstrutura.length} linhas carregadas.`, 'lok');
            montarDropdowns(dbEstrutura);

        } catch (err) {
            logMsg(`Erro ao carregar filtros: ${err.message}`, 'lerro');
            console.error(err);
        }
    }

    // Cascata: ao mudar Garagem → filtra Lote e Linha
    if (selGaragem) {
        selGaragem.addEventListener('change', () => {
            const g = selGaragem.value;
            const base = g ? dbEstrutura.filter(i => i.gar === g) : dbEstrutura;

            const lotes  = [...new Set(base.map(i => i.lote).filter(Boolean))].sort();
            const linhas = [...new Set(base.map(i => i.linha).filter(Boolean))].sort();

            preencherSelect(selLote,  lotes,  'Todos os Lotes');
            preencherSelect(selLinha, linhas, 'Todas as Linhas');

            logMsg(`Filtro Garagem: ${g || 'Todas'} → ${lotes.length} lotes | ${linhas.length} linhas.`, 'linfo');
        });
    }

    // Cascata: ao mudar Lote → filtra Linha
    if (selLote) {
        selLote.addEventListener('change', () => {
            const g = selGaragem ? selGaragem.value : '';
            const l = selLote.value;
            let base = dbEstrutura;
            if (g) base = base.filter(i => i.gar   === g);
            if (l) base = base.filter(i => i.lote  === l);

            const linhas = [...new Set(base.map(i => i.linha).filter(Boolean))].sort();
            preencherSelect(selLinha, linhas, 'Todas as Linhas');
            logMsg(`Filtro Lote: ${l || 'Todos'} → ${linhas.length} linhas disponíveis.`, 'linfo');
        });
    }

    // Botão Consultar
    if (btnConsultar) {
        btnConsultar.addEventListener('click', () => {
            const g  = selGaragem ? selGaragem.value || 'Todas' : 'Todas';
            const lo = selLote    ? selLote.value    || 'Todos' : 'Todos';
            const li = selLinha   ? selLinha.value   || 'Todas' : 'Todas';
            const di = dataInicio ? dataInicio.value : '-';
            const df = dataFim    ? dataFim.value    : '-';
            logMsg(`Consultando: ${di} → ${df} | Garagem: ${g} | Lote: ${lo} | Linha: ${li}`, 'lwarn');
        });
    }

    // Dispara ao carregar
    carregarFiltrosDaAPI();

    // ==========================================
    // 3. TABELAS (dados de demonstração)
    // ==========================================
    const tbodyNC = document.getElementById('tbViagensNaoCumpridas');
    if (tbodyNC) {
        const linhasNC = [
            { l:"8110",    p:110, r:104, icv:"94.5%", ipp:"88.2%", nr:6  },
            { l:"8521",    p:832, r:802, icv:"96.4%", ipp:"91.0%", nr:30 },
            { l:"8040-10", p:922, r:891, icv:"96.7%", ipp:"85.9%", nr:31 },
            { l:"8025-10", p:622, r:602, icv:"96.7%", ipp:"89.8%", nr:20 },
            { l:"8046-10", p:786, r:760, icv:"96.7%", ipp:"92.0%", nr:26 }
        ];
        tbodyNC.innerHTML = linhasNC.map(i => `
            <tr>
                <td style="font-weight:700;color:#c8dcff">${i.l}</td>
                <td>${i.p}</td><td>${i.r}</td>
                <td style="color:#19d46e">${i.icv}</td>
                <td style="color:#f6a623">${i.ipp}</td>
                <td style="color:#f65858">${i.nr}</td>
                <td><button style="background:#1a3054;border:none;color:#4d8fff;border-radius:4px;padding:3px 8px;cursor:pointer">Ver</button></td>
            </tr>`).join('');
    }

    const tbDet = document.getElementById('tbDetalhamentoViagens');
    if (tbDet) {
        const linhasDet = [
            { l:"8110",    p:956, r:920, icv:"96.2%", ipp:"90.7%", pont:834, ad:12, at:30, pns:5  },
            { l:"8223-20", p:323, r:303, icv:"93.8%", ipp:"85.6%", pont:259, ad:5,  at:20, pns:12 },
            { l:"8046-10", p:788, r:776, icv:"98.5%", ipp:"95.6%", pont:741, ad:8,  at:15, pns:2  },
            { l:"8246-10", p:860, r:830, icv:"96.5%", ipp:"91.5%", pont:759, ad:14, at:42, pns:10 },
            { l:"8026-10", p:384, r:354, icv:"92.2%", ipp:"82.3%", pont:291, ad:20, at:35, pns:15 }
        ];
        tbDet.innerHTML = linhasDet.map(i => `
            <tr>
                <td style="font-weight:700;color:#c8dcff">${i.l}</td>
                <td>${i.p}</td><td>${i.r}</td>
                <td style="color:#19d46e">${i.icv}</td>
                <td style="color:#f6a623">${i.ipp}</td>
                <td>${i.pont}</td>
                <td style="color:#f65858">${i.at}</td>
                <td style="color:#f6a623">${i.ad}</td>
                <td>${i.pns}</td>
                <td><button style="background:#1a3054;border:none;color:#4d8fff;border-radius:4px;padding:3px 8px;cursor:pointer">Ver</button></td>
            </tr>`).join('');
    }

    // Heatmap
    const tbHm = document.getElementById('tbHeatmapViagens');
    if (tbHm) {
        const hours   = ["04","05","06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","22","23"];
        const hmLinhas = ["8110","8521","8040-10","8025-10","8046-10","8223-20"];
        tbHm.innerHTML = hmLinhas.map(linha => {
            const cells = hours.map(hr => {
                const pico  = (parseInt(hr)>=6&&parseInt(hr)<=8)||(parseInt(hr)>=17&&parseInt(hr)<=19);
                const perda = Math.floor(Math.random() * (pico ? 5 : 2));
                let bg = "rgba(25,212,110,0.2)", fc = "";
                if (perda>=1&&perda<=2) { bg="rgba(246,166,35,0.4)";  fc="color:#fff"; }
                if (perda>2)            { bg="rgba(246,88,88,0.7)";   fc="color:#fff;font-weight:bold"; }
                return `<td style="background:${bg};${fc}">${perda===0?'-':perda}</td>`;
            }).join('');
            return `<tr><td class="lh">${linha}</td>${cells}</tr>`;
        }).join('');
    }

    // ==========================================
    // 4. GRÁFICOS CHART.JS
    // ==========================================
    Chart.defaults.color          = "#7a9cc8";
    Chart.defaults.font.family    = "'Inter', sans-serif";
    Chart.defaults.font.size      = 10;
    Chart.defaults.scale.grid.color = "#1f3860";

    const commonOpts = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position:'bottom', labels:{ boxWidth:10, padding:10 } } }
    };

    // Gráfico Mensal
    const elMensal = document.getElementById('cViagensMensal');
    if (elMensal) {
        new Chart(elMensal.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez','Jan','Fev'],
                datasets: [
                    { type:'line', label:'% ICV', data:[93,94,95,96,96,95,95,94,96,96,95,94.8], borderColor:'#19d46e', backgroundColor:'#19d46e', borderWidth:2, tension:0.3, yAxisID:'y1' },
                    { type:'line', label:'% IPP', data:[85,86,88,87,85,89,88,87,88,86,89,87.2], borderColor:'#f6a623', backgroundColor:'#f6a623', borderWidth:2, tension:0.3, yAxisID:'y1' },
                    { type:'bar',  label:'Viagens PROG', data:[8100,8200,8000,8300,8500,8400,8200,8100,8500,8600,8300,8450], backgroundColor:'#243d68', yAxisID:'y' }
                ]
            },
            options: { ...commonOpts, scales: { y:{ display:false }, y1:{ type:'linear', position:'left', min:70, max:100 } } }
        });
    }

    // Cumprimento por Faixa
    const hours = ["04","05","06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","22","23"];
    const elCump = document.getElementById('cCumprimentoFaixa');
    if (elCump) {
        new Chart(elCump.getContext('2d'), {
            type: 'bar',
            data: {
                labels: hours,
                datasets: [
                    { type:'line', label:'Média', data:[98,98,99,93,90,88,89,92,94,96,97,95,91,89,88,90,93,95,98,99], borderColor:'#c8dcff', backgroundColor:'#c8dcff', borderWidth:1.5, tension:0.3 },
                    { type:'bar',  label:'Cumprimento', data:[98,98,99,93,90,88,89,92,94,96,97,95,91,89,88,90,93,95,98,99], backgroundColor:'#19d46e', borderRadius:2 }
                ]
            },
            options: { ...commonOpts, plugins:{ legend:{ display:false } }, scales:{ y:{ min:75, max:100 } } }
        });
    }

    // Pontualidade por Faixa
    const elPont = document.getElementById('cPontualidadeFaixa');
    if (elPont) {
        new Chart(elPont.getContext('2d'), {
            type: 'bar',
            data: {
                labels: hours,
                datasets: [{ label:'Pontualidade (%)', data:[95,94,95,85,82,78,80,85,89,90,87,85,76,73,75,80,85,88,90,93], backgroundColor:'#f6a623', borderRadius:2 }]
            },
            options: { ...commonOpts, plugins:{ legend:{ display:false } }, scales:{ y:{ min:60, max:100 } } }
        });
    }

    // Donut Garagens
    const elDonut = document.getElementById('cGaragemDonut');
    if (elDonut) {
        new Chart(elDonut.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['G1','G2','G3','G4'],
                datasets: [{ data:[93.6, 96.7, 92.2, 95.1], backgroundColor:['#3d7ef5','#19d46e','#f6a623','#a855f7'], borderWidth:0, hoverOffset:4 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout:'65%',
                plugins: {
                    legend: { display:false },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}% cumprido` } }
                }
            }
        });
    }

});

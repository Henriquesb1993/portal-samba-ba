/**
 * Módulo de Viagens - Portal Sambaíba
 * Controlador de dados, API Mock e Chart.js
 */

document.addEventListener("DOMContentLoaded", () => {
    
    // ==========================================
    // 1. PAINEL DE API - LÓGICA DE LOG E CONEXÃO
    // ==========================================
    const btnConectar = document.getElementById('btnConectarV');
    const btnLimpar = document.getElementById('btnLimparV');
    const btnTogLog = document.getElementById('btnTogLogV');
    const btnEye = document.getElementById('btnEyeV');
    const apiUrlInput = document.getElementById('apiUrlInputV');
    const logBox = document.getElementById('logBoxV');
    const apiStatus = document.getElementById('apiStatusV');
    
    let isConnected = false;
    
    function logMsg(msg, type='linfo') {
        const time = new Date().toLocaleTimeString();
        const div = document.createElement('span');
        div.className = type;
        div.textContent = `[${time}] ${msg}`;
        logBox.appendChild(div);
        logBox.scrollTop = logBox.scrollHeight;
    }

    btnEye.addEventListener('click', () => {
        if (apiUrlInput.type === 'password') {
            apiUrlInput.type = 'text';
            btnEye.textContent = '🙈';
        } else {
            apiUrlInput.type = 'password';
            btnEye.textContent = '👁';
        }
    });

    btnLimpar.addEventListener('click', () => {
        logBox.innerHTML = '';
        logMsg('Log limpo pelo usuário', 'linfo');
    });

    btnTogLog.addEventListener('click', () => {
        if (logBox.style.display === 'none') {
            logBox.style.display = 'block';
            btnTogLog.textContent = '👁 Ocultar Log';
        } else {
            logBox.style.display = 'none';
            btnTogLog.textContent = '👁 Mostrar Log';
        }
    });

    btnConectar.addEventListener('click', () => {
        if (!apiUrlInput.value) {
            logMsg('Erro: URL da API não informada.', 'lerro');
            return;
        }

        if (isConnected) {
            isConnected = false;
            btnConectar.textContent = '▶ Conectar API';
            btnConectar.classList.remove('conectado');
            apiStatus.textContent = 'Conexão encerrada.';
            logMsg('Desconectado da API.', 'lwarn');
            return;
        }

        logMsg('Iniciando handshake com: ' + apiUrlInput.value, 'linfo');
        btnConectar.textContent = '⏳ Conectando...';

        setTimeout(() => {
            isConnected = true;
            btnConectar.textContent = '⏹ Desconectar';
            btnConectar.classList.add('conectado');
            apiStatus.textContent = 'Sincronizado AO VIVO (WebSocket Emulado).';
            logMsg('Status 200 OK: Autenticado com sucesso.', 'lok');
            logMsg('Carregando pacotes de dados de Viagens. Lotes: 1, 2 e 3.', 'linfo');
            
            // Simular recarregamento com animação
            document.querySelectorAll('.kpi-val').forEach(el => {
                el.style.opacity = '0.5';
                setTimeout(() => el.style.opacity = '1', 500);
            });

            setInterval(() => {
                if (isConnected && Math.random() > 0.7) {
                    logMsg(`Ping recebido - Atualização IOV: Linha ${(Math.random() > 0.5 ? '8110' : '8223-20')} registrada.`, 'linfo');
                }
            }, 4000);

        }, 1200);
    });

        // ==========================================
    // INTEGRAÇÃO REAL COM A API DE FILTROS (Linhas e Garagens)
    // ==========================================
    const selGaragem = document.getElementById('selGaragem');
    const selLote = document.getElementById('selLote');
    const selLinha = document.getElementById('selLinha');
    const dataInicio = document.getElementById('dataInicio');
    const dataFim = document.getElementById('dataFim');
    const btnConsultar = document.getElementById('btnConsultar');

    // Seta data de hoje nos inputs por padrão
    const hoje = new Date().toISOString().split('T')[0];
    if(dataInicio) dataInicio.value = hoje;
    if(dataFim) dataFim.value = hoje;

    // Memória da API para controlar os filtros em cascata
    let dbEstrutura = []; 

    async function carregarFiltrosDaAPI() {
        try {
            const urlApi = 'https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_linha_garagens';
            logMsg(`Solicitando dados de estrutura em: ${urlApi}`, 'linfo');
            
            const req = await fetch(urlApi);
            if (!req.ok) throw new Error(`HTTP Error: ${req.status}`);
            
            const responseData = await req.json();
            
            // Garantir que é um array (ajuste caso sua api retorne { data: [...] })
            dbEstrutura = Array.isArray(responseData) ? responseData : (responseData.data || responseData.items || []);
            
            logMsg(`Sucesso: ${dbEstrutura.length} registros de garagem/linha carregados.`, 'lok');
            montarDropdowns();

        } catch (error) {
            console.error("Erro ao carregar estrutura:", error);
            logMsg(`Erro ao carregar filtros: ${error.message}`, 'lerro');
            selGaragem.innerHTML = '<option value="">Falha ao carregar</option>';
        }
    }

    function montarDropdowns() {
        // Extrai valores únicos usando Set (Boa Prática de Engenharia de Dados)
        // OBS: Substitua "garagem", "lote" e "codigo_linha" caso as chaves da sua API tenham nomes diferentes 
        // ex: dbEstrutura.map(i => i.nomeGaragem)
        
        const garagens = [...new Set(dbEstrutura.map(i => i.garagem).filter(Boolean))].sort();
        const lotes = [...new Set(dbEstrutura.map(i => i.lote).filter(Boolean))].sort();
        const linhas = [...new Set(dbEstrutura.map(i => i.codigo_linha || i.linha).filter(Boolean))].sort();

        preencherSelect(selGaragem, garagens, "Todas as Garagens");
        preencherSelect(selLote, lotes, "Todos os Lotes");
        preencherSelect(selLinha, linhas, "Todas as Linhas");
    }

    function preencherSelect(elemento, arrayValores, textoPadrao) {
        if(!elemento) return;
        elemento.innerHTML = `<option value="">${textoPadrao}</option>`;
        arrayValores.forEach(val => {
            elemento.innerHTML += `<option value="${val}">${val}</option>`;
        });
    }

    // Regra de Filtro em Cascata (Quando muda a garagem, filtra o Lote e a Linha)
    if(selGaragem) {
        selGaragem.addEventListener('change', (e) => {
            const garagemSelecionada = e.target.value;
            if (!garagemSelecionada) {
                montarDropdowns(); // Reseta tudo se escolher "Todas"
                return;
            }
            
            // Filtra o banco na memória
            const filtrados = dbEstrutura.filter(i => i.garagem === garagemSelecionada);
            
            // Atualiza os outros dropdowns baseados na garagem escolhida
            const lotesFiltrados = [...new Set(filtrados.map(i => i.lote).filter(Boolean))].sort();
            const linhasFiltradas = [...new Set(filtrados.map(i => i.codigo_linha || i.linha).filter(Boolean))].sort();
            
            preencherSelect(selLote, lotesFiltrados, "Todos os Lotes");
            preencherSelect(selLinha, linhasFiltradas, "Todas as Linhas");
            logMsg(`Filtro aplicado: Garagem ${garagemSelecionada}`, 'linfo');
        });
    }

    // Ação do Botão Consultar
    if(btnConsultar) {
        btnConsultar.addEventListener('click', () => {
            logMsg(`Realizando consulta: Início ${dataInicio.value} | Fim ${dataFim.value} | G: ${selGaragem.value || 'Todas'} | Lote: ${selLote.value || 'Todos'} | Linha: ${selLinha.value || 'Todas'}`, 'lwarn');
            // Futuramente aqui chamaremos a rota final que trará os dados de ICV/IPP para preencher os gráficos!
        });
    }

    // Executa a chamada assim que carregar a página
    carregarFiltrosDaAPI();


    
    // ==========================================
    // 2. RENDERIZAR TABELAS (Mockup Image Data)
    // ==========================================
    
    // Tabela Viagens Não Cumpridas Lateral
    const tbodyNaoCumpridas = document.getElementById('tbViagensNaoCumpridas');
    const linhasNC = [
        { l: "8110", p: 110, r: 104, icv: "94.5%", ipp: "88.2%", nr: 6 },
        { l: "8521", p: 832, r: 802, icv: "96.4%", ipp: "91.0%", nr: 30 },
        { l: "8040-10", p: 922, r: 891, icv: "96.7%", ipp: "85.9%", nr: 31 },
        { l: "8025-10", p: 622, r: 602, icv: "96.7%", ipp: "89.8%", nr: 20 },
        { l: "8046-10", p: 786, r: 760, icv: "96.7%", ipp: "92.0%", nr: 26 }
    ];
    let htmlNC = '';
    linhasNC.forEach(i => {
        htmlNC += `<tr>
            <td style="font-weight:700; color:#c8dcff">${i.l}</td>
            <td>${i.p}</td>
            <td>${i.r}</td>
            <td style="color:#19d46e">${i.icv}</td>
            <td style="color:#f6a623">${i.ipp}</td>
            <td style="color:#f65858">${i.nr}</td>
            <td><button style="background:#1a3054;border:none;color:#4d8fff;border-radius:4px;padding:3px 8px;cursor:pointer">Ver</button></td>
        </tr>`;
    });
    tbodyNaoCumpridas.innerHTML = htmlNC;

    // Tabela Detalhamento Completo (Inferior Direita)
    const tbDetalhes = document.getElementById('tbDetalhamentoViagens');
    const linhasDet = [
        { l: "8110", p: 956, r: 920, icv: "96.2%", ipp: "90.7%", pont: 834, ad: 12, at: 30, pns: 5 },
        { l: "8223-20", p: 323, r: 303, icv: "93.8%", ipp: "85.6%", pont: 259, ad: 5, at: 20, pns: 12 },
        { l: "8046-10", p: 788, r: 776, icv: "98.5%", ipp: "95.6%", pont: 741, ad: 8, at: 15, pns: 2 },
        { l: "8246-10", p: 860, r: 830, icv: "96.5%", ipp: "91.5%", pont: 759, ad: 14, at: 42, pns: 10 },
        { l: "8026-10", p: 384, r: 354, icv: "92.2%", ipp: "82.3%", pont: 291, ad: 20, at: 35, pns: 15 }
    ];
    let htmlDet = '';
    linhasDet.forEach(i => {
        htmlDet += `<tr>
            <td style="font-weight:700; color:#c8dcff">${i.l}</td>
            <td>${i.p}</td>
            <td>${i.r}</td>
            <td style="color:#19d46e">${i.icv}</td>
            <td style="color:#f6a623">${i.ipp}</td>
            <td>${i.pont}</td>
            <td style="color:#f65858">${i.at}</td>
            <td style="color:#f6a623">${i.ad}</td>
            <td>${i.pns}</td>
            <td><button style="background:#1a3054;border:none;color:#4d8fff;border-radius:4px;padding:3px 8px;cursor:pointer">Ver</button></td>
        </tr>`;
    });
    tbDetalhes.innerHTML = htmlDet;

    // Heatmap (Simulando perda de viagens ao longo do dia)
    const tbHeatmap = document.getElementById('tbHeatmapViagens');
    const hours = ["04","05","06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","22","23"];
    const hmLinhas = ["8110","8521","8040-10","8025-10","8046-10","8223-20"];
    let htmlHm = '';
    
    hmLinhas.forEach(linha => {
        htmlHm += `<tr><td class="lh">${linha}</td>`;
        hours.forEach(hr => {
            // Gerar números randômicos com focos de pico (ex: 06h-08h e 17h-19h)
            let isPico = (parseInt(hr) >= 6 && parseInt(hr) <= 8) || (parseInt(hr) >= 17 && parseInt(hr) <= 19);
            let perda = Math.floor(Math.random() * (isPico ? 5 : 2)); 
            
            let color = "rgba(25,212,110,0.2)"; // OK - verde fundo transparente
            let fontClass = "";
            if (perda >= 1 && perda <= 2) { color = "rgba(246,166,35,0.4)"; fontClass="color:#fff"; }
            if (perda > 2) { color = "rgba(246,88,88,0.7)"; fontClass="color:#fff; font-weight:bold"; }
            
            htmlHm += `<td style="background:${color}; ${fontClass}">${perda === 0 ? '-' : perda}</td>`;
        });
        htmlHm += `</tr>`;
    });
    tbHeatmap.innerHTML = htmlHm;

    // ==========================================
    // 3. CHART.JS CONFIGURAÇÕES (Padronizado Dark)
    // ==========================================
    Chart.defaults.color = "#7a9cc8";
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 10;
    Chart.defaults.scale.grid.color = "#1f3860";
    
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { 
            legend: { 
                position: 'bottom', 
                labels: { boxWidth: 10, padding: 10 }
            } 
        }
    };

    // a) Gráfico Mensal (Barras Totais + Linha Curva de % ICV e IPP)
    new Chart(document.getElementById('cViagensMensal').getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez','Jan','Fev'],
            datasets: [
                {
                    type: 'line',
                    label: '% ICV',
                    data: [93,94,95,96,96,95,95,94,96,96,95,94.8],
                    borderColor: '#19d46e',
                    backgroundColor: '#19d46e',
                    borderWidth: 2,
                    tension: 0.3,
                    yAxisID: 'y1'
                },
                {
                    type: 'line',
                    label: '% IPP',
                    data: [85,86,88,87,85,89,88,87,88,86,89,87.2],
                    borderColor: '#f6a623',
                    backgroundColor: '#f6a623',
                    borderWidth: 2,
                    tension: 0.3,
                    yAxisID: 'y1'
                },
                {
                    type: 'bar',
                    label: 'Vol. Viagens PROG',
                    data: [8100,8200,8000,8300,8500,8400,8200,8100,8500,8600,8300,8450],
                    backgroundColor: '#243d68',
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            ...commonOptions,
            scales: {
                y: { display: false }, // Esconde eixo absoluto das barras
                y1: { type: 'linear', position: 'left', min: 70, max: 100 } // Eixo percentual
            }
        }
    });

    // b) Gráfico de % Cumprimento por Faixa Horária
    new Chart(document.getElementById('cCumprimentoFaixa').getContext('2d'), {
        type: 'bar',
        data: {
            labels: hours,
            datasets: [{
                type: 'line',
                label: 'Média (%)',
                data: [98,98,99,93,90,88,89,92,94,96,97,95,91,89,88,90,93,95,98,99],
                borderColor: '#c8dcff',
                backgroundColor: '#c8dcff',
                borderWidth: 1.5,
                tension: 0.3
            },
            {
                type: 'bar',
                label: 'Cump. Horário',
                data: [98,98,99,93,90,88,89,92,94,96,97,95,91,89,88,90,93,95,98,99],
                backgroundColor: '#19d46e',
                borderRadius: 2
            }]
        },
        options: {
            ...commonOptions,
            plugins: { legend: { display: false } }, // esconde legenda para economizar espaço
            scales: { y: { min: 75, max: 100 } }
        }
    });

    // c) Gráfico de % Pontualidade por Faixa Horária
    new Chart(document.getElementById('cPontualidadeFaixa').getContext('2d'), {
        type: 'bar',
        data: {
            labels: hours,
            datasets: [{
                label: 'Pontualidade (%)',
                data: [95,94,95,85,82,78,80,85,89,90,87,85,76,73,75,80,85,88,90,93],
                backgroundColor: '#f6a623', // Laranja do dashboard original
                borderRadius: 2
            }]
        },
        options: {
            ...commonOptions,
            plugins: { legend: { display: false } },
            scales: { y: { min: 60, max: 100 } }
        }
    });

    // d) Gráfico Donut de Garagens
    new Chart(document.getElementById('cGaragemDonut').getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Garagem A', 'Garagem B', 'Garagem C'],
            datasets: [{
                data: [93.6, 96.7, 92.2], // Médias inventadas pra ilustrar a imagem
                backgroundColor: ['#3d7ef5', '#19d46e', '#f6a623'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) { return " " + context.label + ": " + context.raw + "% cumprido"; }
                    }
                }
            }
        }
    });
});

/**
 * viagens_nimer.js — Portal Sambaíba
 * Análise de partidas programadas vs realizadas · Nimer
 * Lógica de fiscais por turno (TP/TS Manhã/Tarde)
 * API: sb_nimer_prog_realizado | filtro: data_inicio + data_fim
 */
document.addEventListener('DOMContentLoaded', async () => {

  const API_BASE  = 'https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_nimer_prog_realizado';
  const API_HEADS = { 'Authorization': 'Bearer ' + CONFIG.API_TOKEN };
  const LIMIT     = 1000;

  let dadosRaw = [], dadosFiltrado = [];
  let tipoDiaAtivo = 'todos', periodoAtivo = 'dia';
  let DATA_PADRAO = '';
  let chartCump = null, chartTurno = null, chartEvolucao = null, chartMotivos = null;

  AUTH.renderSidebar('viagens_nimer');

  const $  = id => document.getElementById(id);
  const tx = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  const fmt = n => Number(n).toLocaleString('pt-BR');

  function hora(str) {
    if (!str) return -1;
    try { const d = new Date(str); return isNaN(d) ? -1 : d.getHours(); } catch { return -1; }
  }

  function fmtRE(cod) {
    if (!cod) return '—';
    const s = String(cod).toLowerCase().trim();
    return s.startsWith('f') ? s : 'f' + s;
  }

  function tipoDiaDaData(str) {
    if (!str) return 'util';
    const dow = new Date(str).getDay();
    return dow === 0 ? 'dom' : dow === 6 ? 'sab' : 'util';
  }

  function corICV(v) { return v >= 95 ? '#19d46e' : v >= 85 ? '#f6a623' : '#f65858'; }

  function badgeTurno(turno) {
    const m = { 'tp-manha': ['ft-tp-m','TP Manhã'], 'tp-tarde': ['ft-tp-t','TP Tarde'], 'ts-manha': ['ft-ts-m','TS Manhã'], 'ts-tarde': ['ft-ts-t','TS Tarde'] };
    const [cls, label] = m[turno] || ['ft-nd', turno || 'N/I'];
    return `<span class="fiscal-turno-badge ${cls}">${label}</span>`;
  }

  function ehPerdida(i) { return i.perda_partida === true || i.perda_partida === 'true' || i.perda_partida === 1; }

  function setLoading(on) {
    const btn = $('btnConsultar');
    if (btn) { btn.textContent = on ? '⏳ Carregando...' : '🔍 Consultar'; btn.disabled = on; }
    const badge = $('badgeLive');
    if (badge) { badge.textContent = on ? '⏳ CARREGANDO' : '● AO VIVO'; }
    if (on) ['kpiProg','kpiReal','kpiPerdas','kpiAderencia','kpiPerdaPct','kpiFiscais'].forEach(id => tx(id,'...'));
  }

  async function buscarTodos(params = {}) {
    const todos = [];
    let offset = 0;
    const qs = Object.entries(params).filter(([,v]) => v !== '' && v != null).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    while (true) {
      const url = `${API_BASE}?limit=${LIMIT}&offset=${offset}${qs ? '&'+qs : ''}`;
      const r = await fetch(url, { headers: API_HEADS });
      if (!r.ok) throw new Error('API ' + r.status);
      const d = await r.json();
      const items = d.items || d || [];
      const total = d.total || 0;
      todos.push(...items);
      console.log(`[NIMER] offset=${offset} acc=${todos.length}/${total}`);
      if (!items.length || (total > 0 && todos.length >= total)) break;
      offset += LIMIT;
    }
    return todos;
  }

  function inicializarDatas() {
    const hoje = DATA_PADRAO || new Date().toISOString().substring(0,10);
    const ini = $('dataInicio'); if (ini) ini.value = hoje;
    const fim = $('dataFim');   if (fim) fim.value = hoje;
    const badge = $('badgeDatasReais');
    if (badge && DATA_PADRAO) { badge.style.display = 'block'; badge.textContent = `⚠ Exibindo dados de: ${DATA_PADRAO}`; }
  }

  function popularLinhas(dados) {
    const linhas = [...new Set(dados.map(i => i.linha).filter(Boolean))].sort();
    const el = $('selLinha'); if (!el) return;
    el.innerHTML = '<option value="">Todas as Linhas</option>';
    linhas.forEach(l => { const o = document.createElement('option'); o.value = l; o.textContent = l; el.appendChild(o); });
  }

  function aplicarFiltros(dados) {
    const linha   = ($('selLinha')?.value   || '').toLowerCase();
    const veiculo = ($('selVeiculo')?.value || '').trim();
    const fiscal  = ($('selFiscal')?.value  || '').toLowerCase().replace('f','');
    const sentido = $('selSentido')?.value  || '';
    return dados.filter(i => {
      if (linha   && (i.linha||'').toLowerCase() !== linha) return false;
      if (veiculo && String(i.veiculo||'') !== veiculo)     return false;
      if (sentido !== '' && String(i.sentido) !== sentido)  return false;
      if (fiscal) {
        const fp = String(i.fiscal_partida||'').replace('f','');
        const fc = String(i.fiscal_chegada||'').replace('f','');
        if (fp !== fiscal && fc !== fiscal) return false;
      }
      if (tipoDiaAtivo !== 'todos') {
        const td = tipoDiaDaData(i.data || i.horario_programado_partida);
        if (td !== tipoDiaAtivo) return false;
      }
      return true;
    });
  }

  function analisarFiscais(dados) {
    const fiscalMap = {};
    dados.forEach(i => {
      [{ re: fmtRE(i.fiscal_partida), h: hora(i.horario_fiscal_partida || i.horario_gps_partida), tipo: 'tp' },
       { re: fmtRE(i.fiscal_chegada), h: hora(i.horario_fiscal_chegada || i.horario_gps_chegada), tipo: 'ts' }
      ].forEach(({ re, h, tipo }) => {
        if (re === '—' || h < 0) return;
        if (!fiscalMap[re]) fiscalMap[re] = { re, primeiraHora: h, tipo, marcadas: new Set(), responsavel: new Set(), naoMarcadas: new Set() };
        else if (h < fiscalMap[re].primeiraHora) fiscalMap[re].primeiraHora = h;
      });
    });
    dados.forEach(i => {
      const hProg = hora(i.horario_programado_partida);
      const perdida = ehPerdida(i);
      [fmtRE(i.fiscal_partida), fmtRE(i.fiscal_chegada)].forEach(re => {
        if (re === '—') return;
        const f = fiscalMap[re]; if (!f) return;
        const tIni = f.primeiraHora >= 3 && f.primeiraHora <= 14 ? 3 : 15;
        const tFim = tIni === 3 ? 14 : 23;
        if (hProg >= tIni && hProg <= tFim) {
          f.responsavel.add(i.id);
          if (!perdida) f.marcadas.add(i.id);
          else f.naoMarcadas.add(i.id);
        }
      });
    });
    return Object.values(fiscalMap).map(f => {
      const turno = f.primeiraHora >= 3 && f.primeiraHora <= 14 ? 'manha' : 'tarde';
      const turnoKey = `${f.tipo}-${turno}`;
      const resp = f.responsavel.size, marc = f.marcadas.size, naoM = f.naoMarcadas.size;
      return { re: f.re, turno: turnoKey, primeiraHora: f.primeiraHora, responsavel: resp, marcadas: marc, naoMarcadas: naoM, cobertura: resp > 0 ? Math.round(marc / resp * 100) : 100 };
    }).sort((a, b) => a.cobertura - b.cobertura);
  }

  function renderDashboard(dados) {
    if (!dados || !dados.length) { ['kpiProg','kpiReal','kpiPerdas','kpiAderencia','kpiPerdaPct','kpiFiscais'].forEach(id => tx(id, '0')); return; }
    const prog = dados.length;
    const real = dados.filter(i => !ehPerdida(i)).length;
    const perdas = prog - real;
    const icv = prog > 0 ? (real / prog * 100).toFixed(1) : '0.0';
    const perdaPct = prog > 0 ? (perdas / prog * 100).toFixed(1) : '0.0';
    tx('kpiProg',     fmt(prog));  tx('kpiProgSub', `${new Set(dados.map(i=>i.linha).filter(Boolean)).size} linhas monitoradas`);
    tx('kpiReal',     fmt(real));  tx('kpiRealSub', `${icv}% do total programado`);
    tx('kpiPerdas',   fmt(perdas)); tx('kpiPerdasSub', `${perdaPct}% das viagens programadas`);
    tx('kpiAderencia', icv + '%'); tx('kpiAderSub', `${fmt(real)} realizadas de ${fmt(prog)}`);
    tx('kpiPerdaPct',  perdaPct + '%'); tx('kpiPerdaPctSub', `${fmt(perdas)} partidas não cumpridas`);
    const fiscaisSet = new Set([...dados.map(i=>fmtRE(i.fiscal_partida)),...dados.map(i=>fmtRE(i.fiscal_chegada))].filter(r=>r!=='—'));
    tx('kpiFiscais', String(fiscaisSet.size)); tx('kpiFiscaisSub', 'fiscais identificados');
    renderFaixaHoraria(dados); renderPerdasTurno(dados); renderEvolucao(dados);
    renderRanking(dados); renderMotivos(dados); renderHeatmap(dados);
    renderFiscais(dados); renderDetalhamento(dados);
  }

  function renderFaixaHoraria(dados) {
    const horas = [4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23];
    const map = {}; horas.forEach(h => map[h] = { prog:0, real:0 });
    dados.forEach(i => { const h = hora(i.horario_programado_partida); if (map[h] !== undefined) { map[h].prog++; if (!ehPerdida(i)) map[h].real++; } });
    const pcts = horas.map(h => map[h].prog > 0 ? parseFloat((map[h].real/map[h].prog*100).toFixed(1)) : 0);
    const el = $('cCumprimentoFaixa'); if (!el) return;
    if (chartCump) chartCump.destroy();
    chartCump = new Chart(el.getContext('2d'), {
      data: { labels: horas.map(h=>String(h).padStart(2,'0')+'h'), datasets: [
        { type:'line', data:pcts, borderColor:'rgba(200,220,255,0.4)', borderWidth:1.5, tension:0.3, pointRadius:2, fill:false },
        { type:'bar',  data:pcts, backgroundColor:pcts.map(v=>corICV(v)), borderRadius:2 }
      ]},
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ min:0, max:110, ticks:{ callback:v=>v+'%', color:'#7a9cc8', font:{size:9} }, grid:{ color:'#1a3560' } }, x:{ ticks:{ color:'#7a9cc8', font:{size:9} }, grid:{ display:false } } } }
    });
  }

  function renderPerdasTurno(dados) {
    let manha = 0, tarde = 0;
    dados.filter(ehPerdida).forEach(i => { const h = hora(i.horario_programado_partida); if (h >= 3 && h <= 14) manha++; else tarde++; });
    const el = $('cPerdasTurno'); if (!el) return;
    if (chartTurno) chartTurno.destroy();
    chartTurno = new Chart(el.getContext('2d'), {
      type: 'doughnut',
      data: { labels: ['Manhã (03–14h)', 'Tarde (15–23h)'], datasets: [{ data: [manha, tarde], backgroundColor: ['#3d7ef5','#f6a623'], borderWidth:0 }] },
      options: { responsive:true, maintainAspectRatio:false, cutout:'60%', plugins:{ legend:{ display:true, position:'bottom', labels:{ color:'#7a9cc8', font:{size:9}, boxWidth:10 } } } }
    });
  }

  function renderEvolucao(dados) {
    const map = {};
    dados.forEach(i => { const d = (i.data||i.horario_programado_partida||'').substring(0,10); if (!d) return; if (!map[d]) map[d]={prog:0,real:0}; map[d].prog++; if (!ehPerdida(i)) map[d].real++; });
    let datas = Object.keys(map).sort(), labels, progs, reals;
    if (periodoAtivo === 'semana') {
      const sm = {}; datas.forEach(d => { const dt=new Date(d); const dow=dt.getDay()||7; const seg=new Date(dt); seg.setDate(dt.getDate()-dow+1); const k=seg.toISOString().substring(0,10); if(!sm[k]) sm[k]={prog:0,real:0}; sm[k].prog+=map[d].prog; sm[k].real+=map[d].real; });
      const sd = Object.keys(sm).sort(); labels=sd.map(d=>{const[,m,dia]=d.split('-');return`Sem ${dia}/${m}`;}); progs=sd.map(d=>sm[d].prog); reals=sd.map(d=>sm[d].real);
    } else if (periodoAtivo === 'mes') {
      const mm = {}; datas.forEach(d=>{const k=d.substring(0,7);if(!mm[k]) mm[k]={prog:0,real:0};mm[k].prog+=map[d].prog;mm[k].real+=map[d].real;});
      const md = Object.keys(mm).sort(); const ms=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']; labels=md.map(d=>{const[y,m]=d.split('-');return`${ms[parseInt(m)-1]}/${y.slice(2)}`;}); progs=md.map(d=>mm[d].prog); reals=md.map(d=>mm[d].real);
    } else { labels=datas.map(d=>{const[,m,dia]=d.split('-');return`${dia}/${m}`;}); progs=datas.map(d=>map[d].prog); reals=datas.map(d=>map[d].real); }
    const perdidos = progs.map((p,i)=>p-reals[i]);
    const el = $('cEvolucao'); if (!el) return;
    if (chartEvolucao) chartEvolucao.destroy();
    chartEvolucao = new Chart(el.getContext('2d'), {
      data: { labels, datasets: [
        { type:'bar',  label:'Programadas', data:progs,    backgroundColor:'rgba(61,126,245,0.25)', borderRadius:2 },
        { type:'bar',  label:'Realizadas',  data:reals,    backgroundColor:'rgba(25,212,110,0.40)', borderRadius:2 },
        { type:'line', label:'Perdidas',    data:perdidos, borderColor:'#f65858', backgroundColor:'rgba(246,88,88,0.12)', borderWidth:2, tension:0.3, pointRadius:3, fill:true }
      ]},
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ color:'#7a9cc8', font:{size:9}, boxWidth:10, padding:8 } } }, scales:{ y:{ ticks:{ color:'#7a9cc8', font:{size:9} }, grid:{ color:'#1a3560' } }, x:{ ticks:{ color:'#7a9cc8', font:{size:9} }, grid:{ display:false } } } }
    });
  }

  function renderRanking(dados) {
    const map = {}; dados.forEach(i => { const l=i.linha||'—'; if(!map[l]) map[l]={prog:0,real:0}; map[l].prog++; if(!ehPerdida(i)) map[l].real++; });
    const arr = Object.entries(map).map(([l,v])=>({ l, prog:v.prog, real:v.real, perdas:v.prog-v.real, icv:v.prog>0?parseFloat((v.real/v.prog*100).toFixed(1)):0 })).sort((a,b)=>b.perdas-a.perdas).slice(0,15);
    const tbody = $('tbRankingBody'); if (!tbody) return;
    tbody.innerHTML = arr.length ? arr.map((i,idx) => {
      const r=idx+1, rc=r<=3?'#f65858':r<=7?'#f6a623':'#5a7ca8';
      return `<tr><td style="font-weight:800;color:${rc};text-align:center">${r}</td><td style="font-weight:700">${i.l}</td><td>${fmt(i.prog)}</td><td>${fmt(i.real)}</td><td style="color:#f65858;font-weight:700">${fmt(i.perdas)}</td><td style="color:${corICV(i.icv)};font-weight:700">${i.icv}%</td></tr>`;
    }).join('') : '<tr><td colspan="6" style="color:#3a5a88;text-align:center;padding:20px">Sem dados</td></tr>';
  }

  function renderMotivos(dados) {
    const map = {}; dados.filter(ehPerdida).forEach(i => { const cod = i.cod_perda != null ? String(i.cod_perda) : 'N/I'; map[cod]=(map[cod]||0)+1; });
    const motivos = Object.entries(map).map(([cod,cnt])=>({cod,cnt})).sort((a,b)=>b.cnt-a.cnt);
    const lista = $('motivoLista'), el = $('cMotivos');
    if (!motivos.length) { if (lista) lista.innerHTML = '<div style="font-size:10px;color:#3a5a88;padding:12px;text-align:center">Nenhuma perda com código registrado</div>'; return; }
    if (el) {
      if (chartMotivos) chartMotivos.destroy();
      const top5 = motivos.slice(0,5); const outros = motivos.slice(5).reduce((s,m)=>s+m.cnt,0);
      const lbls = top5.map(m=>m.cod==='N/I'?'Não Inf.':`Cód ${m.cod}`); const vals = top5.map(m=>m.cnt);
      if (outros) { lbls.push('Outros'); vals.push(outros); }
      chartMotivos = new Chart(el.getContext('2d'), { type:'doughnut', data:{ labels:lbls, datasets:[{ data:vals, backgroundColor:['#3d7ef5','#f6a623','#f65858','#19d46e','#a855f7','#00d4ff'], borderWidth:0 }] }, options:{ responsive:true, maintainAspectRatio:false, cutout:'55%', plugins:{ legend:{ display:false } } } });
    }
    if (lista) {
      const total = motivos.reduce((s,m)=>s+m.cnt,0);
      lista.innerHTML = motivos.map(m => `<div class="motivo-item"><span class="motivo-cod">${m.cod}</span><span style="color:#c8dcff;flex:1;margin-left:8px;font-size:10px">${m.cod==='N/I'?'Não Informado':'Código '+m.cod}</span><span class="motivo-cnt">${fmt(m.cnt)}</span><span style="color:#3a5a88;margin-left:6px;font-size:9px">${(m.cnt/total*100).toFixed(1)}%</span></div>`).join('');
    }
  }

  function renderHeatmap(dados) {
    const horas = [4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23];
    const lp = {}; dados.filter(ehPerdida).forEach(i => { const l=i.linha||'—'; lp[l]=(lp[l]||0)+1; });
    const top8 = Object.entries(lp).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([l])=>l);
    const map = {}; dados.filter(ehPerdida).forEach(i => { const l=i.linha||'—'; if(!top8.includes(l)) return; const h=hora(i.horario_programado_partida); if(!map[l]) map[l]={}; map[l][h]=(map[l][h]||0)+1; });
    const tbody = $('tbHeatmapBody'); if (!tbody) return;
    tbody.innerHTML = top8.length ? top8.map(linha => {
      const cells = horas.map(h => { const cnt=(map[linha]||{})[h]||0; let bg='rgba(25,212,110,0.10)',fc='#19d46e'; if(cnt===0){}else if(cnt<=2){bg='rgba(246,166,35,0.35)';fc='#f6a623';}else{bg='rgba(246,88,88,0.60)';fc='#fff';} return `<td style="background:${bg};color:${fc};font-weight:${cnt>0?700:400}">${cnt===0?'·':cnt}</td>`; }).join('');
      return `<tr><td class="rh">${linha}</td>${cells}</tr>`;
    }).join('') : '<tr><td colspan="21" style="text-align:center;color:#3a5a88;padding:20px">Sem perdas registradas</td></tr>';
  }

  function renderFiscais(dados) {
    const fiscais = analisarFiscais(dados);
    const tM = fiscais.reduce((s,f)=>s+f.marcadas,0), tN = fiscais.reduce((s,f)=>s+f.naoMarcadas,0);
    tx('kpiFiscaisAtivos',    String(fiscais.length));
    tx('kpiFiscaisMarcaram',  fmt(tM));
    tx('kpiFiscaisNaoMarcaram', fmt(tN));
    tx('kpiFiscaisCobertura', ((tM+tN)>0 ? Math.round(tM/(tM+tN)*100) : 100) + '%');
    const tbody = $('tbFiscais'); if (!tbody) return;
    tbody.innerHTML = fiscais.length ? fiscais.map((f,idx) => {
      const cobCor = f.cobertura>=90?'#19d46e':f.cobertura>=75?'#f6a623':'#f65858';
      const perf = f.cobertura>=90?'<span class="tag tag-ok">Bom</span>':f.cobertura>=75?'<span class="tag tag-warn">Regular</span>':'<span class="tag tag-err">Crítico</span>';
      return `<tr><td style="color:#5a7ca8;text-align:center">${idx+1}</td><td style="font-family:monospace;font-weight:700;color:#00d4ff">${f.re}</td><td>${badgeTurno(f.turno)}</td><td style="color:#19d46e;font-weight:700">${fmt(f.marcadas)}</td><td style="color:#7a9cc8">${fmt(f.responsavel)}</td><td style="color:${f.naoMarcadas>0?'#f65858':'#19d46e'};font-weight:700">${fmt(f.naoMarcadas)}</td><td><div style="display:flex;align-items:center;gap:8px"><div style="height:8px;border-radius:4px;min-width:4px;background:${cobCor};width:${Math.max(4,f.cobertura)}px"></div><span style="font-size:10px;font-weight:800;color:${cobCor}">${f.cobertura}%</span></div></td><td>${perf}</td></tr>`;
    }).join('') : '<tr><td colspan="8" style="text-align:center;color:#3a5a88;padding:20px">Nenhum fiscal identificado</td></tr>';
  }

  function renderDetalhamento(dados) {
    const map = {}, motMap = {};
    dados.forEach(i => { const l=i.linha||'—'; if(!map[l]) map[l]={prog:0,real:0}; map[l].prog++; if(!ehPerdida(i)) map[l].real++; else { const cod=i.cod_perda!=null?String(i.cod_perda):'N/I'; if(!motMap[l]) motMap[l]={}; motMap[l][cod]=(motMap[l][cod]||0)+1; } });
    const arr = Object.entries(map).map(([l,v])=>({ l, prog:v.prog, real:v.real, perdas:v.prog-v.real, icv:v.prog>0?parseFloat((v.real/v.prog*100).toFixed(1)):0, perdaPct:v.prog>0?parseFloat(((v.prog-v.real)/v.prog*100).toFixed(1)):0 })).sort((a,b)=>a.icv-b.icv);
    const tbody = $('tbDetalhamento'); if (!tbody) return;
    tbody.innerHTML = arr.map(i => {
      const c=corICV(i.icv); const tag=i.icv>=95?'<span class="tag tag-ok">OK</span>':i.icv>=85?'<span class="tag tag-warn">Atenção</span>':'<span class="tag tag-err">Crítico</span>';
      const mp = Object.entries(motMap[i.l]||{}).sort((a,b)=>b[1]-a[1])[0];
      return `<tr><td style="font-weight:700">${i.l}</td><td>${fmt(i.prog)}</td><td>${fmt(i.real)}</td><td style="color:${c};font-weight:700">${i.icv}%</td><td style="color:${i.perdas>0?'#f65858':'#19d46e'};font-weight:700">${fmt(i.perdas)}</td><td style="color:#f65858">${i.perdaPct}%</td><td style="color:#7a9cc8;font-size:10px">${mp?'Cód '+mp[0]+' ('+mp[1]+'x)':'—'}</td><td>${tag}</td><td><button class="btn-ver" onclick="verDetalhe('${i.l}')">Ver</button></td></tr>`;
    }).join('');
  }

  window.verDetalhe = function(linha) {
    const d = dadosFiltrado.filter(i => i.linha === linha); if (!d.length) return;
    const prog=d.length, perdas=d.filter(ehPerdida), real=prog-perdas.length, icv=prog>0?(real/prog*100).toFixed(1):0;
    const mots={};perdas.forEach(i=>{const cod=i.cod_perda!=null?String(i.cod_perda):'N/I';mots[cod]=(mots[cod]||0)+1;});
    const fiscais = new Set([...d.map(i=>fmtRE(i.fiscal_partida)),...d.map(i=>fmtRE(i.fiscal_chegada))].filter(r=>r!=='—'));
    $('modalTitulo').textContent = `Linha ${linha} — Detalhes`;
    $('modalConteudo').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px">
        ${[['Programadas','#3d7ef5',fmt(prog)],['Realizadas','#19d46e',fmt(real)],['Perdas','#f65858',fmt(perdas.length)],['% ICV','#f6a623',icv+'%']].map(([lb,cor,val])=>
          `<div style="background:#07111e;border:1px solid #1a3054;border-radius:8px;padding:10px;text-align:center"><div style="font-size:9px;color:#7a9cc8;text-transform:uppercase;margin-bottom:4px">${lb}</div><div style="font-size:20px;font-weight:900;color:${cor}">${val}</div></div>`).join('')}
      </div>
      <div style="margin-bottom:10px"><div style="font-size:10px;font-weight:800;color:#c8dcff;text-transform:uppercase;margin-bottom:6px">Fiscais Atuantes</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${[...fiscais].map(f=>`<span style="background:#0c1d36;border:1px solid #1a3054;border-radius:4px;padding:3px 10px;font-family:monospace;font-size:11px;color:#00d4ff">${f}</span>`).join('')}</div>
      </div>
      ${Object.entries(mots).sort((a,b)=>b[1]-a[1]).length ? `<div><div style="font-size:10px;font-weight:800;color:#c8dcff;text-transform:uppercase;margin-bottom:6px">Motivos de Perda</div>
        ${Object.entries(mots).sort((a,b)=>b[1]-a[1]).map(([cod,cnt])=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #1a3054;font-size:10px"><span style="font-family:monospace;background:#07111e;padding:2px 6px;border-radius:4px;color:#3d7ef5">Cód ${cod}</span><span style="color:#f65858;font-weight:700">${cnt} ocorrência${cnt>1?'s':''}</span></div>`).join('')}</div>` : ''}
    `;
    $('modalBg').classList.add('open');
  };

  window.fecharModal = () => $('modalBg').classList.remove('open');
  $('modalBg')?.addEventListener('click', e => { if (e.target === $('modalBg')) fecharModal(); });

  window.setTipoDia = function(tipo, btn) {
    tipoDiaAtivo = tipo;
    ['tdTodos','tdUtil','tdSab','tdDom'].forEach(id => $(id)?.classList.remove('on'));
    btn.classList.add('on');
  };

  window.setPeriodo = function(p, btn) {
    periodoAtivo = p;
    document.querySelectorAll('.period-tab').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    renderEvolucao(dadosFiltrado);
  };

  function exportarCSV(dados, nome) {
    const hdrs = ['Data','Linha','Veículo','Sentido','Horario_Prog_Partida','Horario_Real_Partida','Perda','Cod_Perda','Fiscal_Partida_RE','Fiscal_Chegada_RE'];
    const rows = dados.map(i => [
      (i.data||'').substring(0,10), i.linha||'', i.veiculo||'',
      i.sentido?'Ida':'Volta', i.horario_programado_partida||'',
      i.horario_fiscal_partida||i.horario_gps_partida||'',
      ehPerdida(i)?'SIM':'NÃO', i.cod_perda??'',
      fmtRE(i.fiscal_partida), fmtRE(i.fiscal_chegada)
    ]);
    const csv = [hdrs,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'})), download: nome+'.csv' });
    a.click(); URL.revokeObjectURL(a.href);
  }

  $('btnExcelTop')?.addEventListener('click',     () => exportarCSV(dadosFiltrado, 'viagens_nimer'));
  $('btnExcelRanking')?.addEventListener('click', () => exportarCSV(dadosFiltrado, 'nimer_ranking'));
  $('btnExcelDetalhe')?.addEventListener('click', () => exportarCSV(dadosFiltrado, 'nimer_detalhe'));
  $('btnExcelFiscais')?.addEventListener('click', () => {
    const f = analisarFiscais(dadosFiltrado);
    const csv = ['RE Fiscal;Turno;Primeira Hora;Marcadas;Responsável;Não Marcadas;% Cobertura', ...f.map(x=>`${x.re};${x.turno};${x.primeiraHora};${x.marcadas};${x.responsavel};${x.naoMarcadas};${x.cobertura}%`)].join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'})), download: 'nimer_fiscais.csv' });
    a.click();
  });

  async function consultar() {
    setLoading(true);
    try {
      const ini = $('dataInicio')?.value || DATA_PADRAO;
      const fim = $('dataFim')?.value   || DATA_PADRAO;
      dadosRaw = await buscarTodos(ini && fim ? { data_inicio: ini, data_fim: fim } : {});
      dadosFiltrado = aplicarFiltros(dadosRaw);
      popularLinhas(dadosRaw);
      renderDashboard(dadosFiltrado);
    } catch(e) { console.error('[NIMER]', e); }
    finally { setLoading(false); }
  }

  $('btnConsultar')?.addEventListener('click', consultar);
  $('btnReset')?.addEventListener('click', () => {
    ['selLinha','selVeiculo','selFiscal','selSentido'].forEach(id => { const e=$(id); if(e) e.value=''; });
    tipoDiaAtivo = 'todos';
    ['tdTodos','tdUtil','tdSab','tdDom'].forEach(id => $(id)?.classList.remove('on'));
    $('tdTodos')?.classList.add('on');
    inicializarDatas();
    dadosFiltrado = aplicarFiltros(dadosRaw);
    renderDashboard(dadosFiltrado);
  });

  // ── INIT ──
  try {
    setLoading(true);
    DATA_PADRAO = new Date().toISOString().substring(0,10);
    inicializarDatas();
    dadosRaw = await buscarTodos({ data_inicio: DATA_PADRAO, data_fim: DATA_PADRAO });
    if (!dadosRaw.length) {
      const ontem = new Date(Date.now()-86400000).toISOString().substring(0,10);
      DATA_PADRAO = ontem; inicializarDatas();
      dadosRaw = await buscarTodos({ data_inicio: ontem, data_fim: ontem });
    }
    dadosFiltrado = dadosRaw;
    popularLinhas(dadosRaw);
    renderDashboard(dadosFiltrado);
  } catch(e) { console.error('[NIMER] Erro init:', e); }
  finally { setLoading(false); }
});
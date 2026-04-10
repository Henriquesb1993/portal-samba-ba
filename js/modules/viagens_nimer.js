/**
 * viagens_nimer.js v3.1 — Portal Sambaíba
 * Log, motivos no topo, ranking completo + ordenação bidirecional
 * Modal de partidas sequenciais, modal de perdas por linha
 * Heatmap com coluna total ordenável, fiscais com ordenação em todas colunas
 */
document.addEventListener('DOMContentLoaded', async () => {
  if(typeof ChartDataLabels!=='undefined'){Chart.register(ChartDataLabels);Chart.defaults.plugins.datalabels={display:false};}
  const API_BASE  = 'https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_nimer_prog_realizado';
  const API_FILTROS = 'https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_linha_garagens';
  const API_HEADS = { 'Authorization': 'Bearer ' + CONFIG.API_TOKEN };
  const LIMIT = 5000;
  let dadosRaw=[], dadosFiltrado=[], tipoDiaAtivo='todos', periodoAtivo='dia', DATA_PADRAO='';
  const _cache={};
  let mapaGar={}, mapaLote={};
  function normLinha(l){return(l||'').trim().replace(/\./g,'-').toUpperCase();}

  async function carregarMapaGaragens(){
    try{
      const r=await fetch(`${API_FILTROS}?limit=2000`,{headers:API_HEADS});
      const d=await r.json();
      const items=d.items||[];
      items.forEach(f=>{
        const l=normLinha(f.linha);
        if(f.gar)mapaGar[l]=f.gar;
        if(f.lote)mapaLote[l]=f.lote;
      });
      log(`Garagens: ${[...new Set(Object.values(mapaGar))].sort().join(', ')}`,'ok');
    }catch(e){log('Erro ao carregar garagens: '+e.message,'erro');}
  }

  function getGaragem(linha){return mapaGar[normLinha(linha)]||'';}
  function getLote(linha){return mapaLote[normLinha(linha)]||'';}
  let chartCump=null, chartTurno=null, chartEvolucao=null, chartMotivos=null;
  AUTH.renderSidebar('viagens_nimer');
  const $=id=>document.getElementById(id);
  const tx=(id,v)=>{const e=$(id);if(e)e.textContent=v;};
  const fmt=n=>Number(n).toLocaleString('pt-BR');
  const fmtH=str=>{if(!str)return'—';try{return new Date(str).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}catch{return'—';}};
  function hora(str){if(!str)return -1;try{const d=new Date(str);return isNaN(d)?-1:d.getHours();}catch{return -1;}}
  function fmtRE(cod){if(!cod)return'—';const s=String(cod).toLowerCase().trim();return s.startsWith('f')?s:'f'+s;}
  function tipoDiaDaData(str){if(!str)return'util';const dow=new Date(str).getDay();return dow===0?'dom':dow===6?'sab':'util';}
  function corICV(v){return v>=95?'#19d46e':v>=85?'#f6a623':'#f65858';}
  function fmtLinha(l){return l?String(l).replace(/-/g,'.'):'—';}
  function ehP(i){return i.perda_partida===true||i.perda_partida==='true'||i.perda_partida===1;}
  function badgeTurno(t){const m={'tp-manha':['ft-tp-m','TP Manhã'],'tp-tarde':['ft-tp-t','TP Tarde'],'ts-manha':['ft-ts-m','TS Manhã'],'ts-tarde':['ft-ts-t','TS Tarde']};const[cls,lbl]=m[t]||['ft-nd',t||'N/I'];return `<span class="ftb ${cls}">${lbl}</span>`;}
  function sortArr(arr,key,asc){return[...arr].sort((a,b)=>{const va=a[key]??-Infinity,vb=b[key]??-Infinity;if(typeof va==='string')return asc?va.localeCompare(vb):vb.localeCompare(va);return asc?va-vb:vb-va;});}

  // LOG
  const logLines=[];
  function log(msg,tipo='info'){const h=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});logLines.unshift({msg,tipo,h});if(logLines.length>50)logLines.pop();renderLog();}
  function renderLog(){const box=$('logBox');if(!box)return;const cor={ok:'var(--success)',erro:'var(--danger)',warn:'var(--warning)',info:'var(--text-secondary)'};box.innerHTML=logLines.slice(0,3).map(l=>`<span style="color:${cor[l.tipo]||'#7a9cc8'}">[${l.h}] ${l.msg}</span>`).join('\n');}
  window._limparLog=()=>{logLines.length=0;renderLog();};
  window._toggleLog=()=>{const w=$('logWrap');if(!w)return;const h=w.style.display==='none';w.style.display=h?'block':'none';const b=$('btnToggleLog');if(b)b.textContent=h?'▲ Ocultar Log':'▼ Exibir Log';};

  function setLoading(on){const btn=$('btnConsultar');if(btn){btn.textContent=on?'⏳ Carregando...':'🔍 Consultar';btn.disabled=on;}const badge=$('badgeLive');if(badge)badge.textContent=on?'⏳ CARREGANDO':'● AO VIVO';if(on)['kpiProg','kpiReal','kpiPerdas','kpiAderencia','kpiPerdaPct','kpiFiscais'].forEach(id=>tx(id,'...'));}

  async function buscarTodos(params={}){
    const qs=Object.entries(params).filter(([,v])=>v!==''&&v!=null).map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join('&');
    const cacheKey=qs||'__all__';
    if(_cache[cacheKey]){log(`Cache: ${_cache[cacheKey].length} registros`,'ok');return _cache[cacheKey];}
    log('Conectando à API...','info');
    const url0=`${API_BASE}?limit=${LIMIT}&offset=0${qs?'&'+qs:''}`;
    const r0=await fetch(url0,{headers:API_HEADS});
    if(!r0.ok){log(`Erro HTTP ${r0.status}`,'erro');throw new Error('API '+r0.status);}
    const d0=await r0.json();
    const total=d0.total||0;
    const items0=d0.items||d0||[];
    log(`Carregando... ${items0.length}${total?' / '+total:''} registros`,'info');
    if(!total||items0.length>=total){log(`✓ ${items0.length} registros carregados`,'ok');_cache[cacheKey]=items0;return items0;}
    const offsets=[];
    for(let off=LIMIT;off<total;off+=LIMIT) offsets.push(off);
    const BATCH=10;
    const todos=[...items0];
    for(let i=0;i<offsets.length;i+=BATCH){
      const lote=offsets.slice(i,i+BATCH);
      const resultados=await Promise.all(lote.map(async off=>{
        const url=`${API_BASE}?limit=${LIMIT}&offset=${off}${qs?'&'+qs:''}`;
        const r=await fetch(url,{headers:API_HEADS});
        if(!r.ok) throw new Error('API '+r.status);
        const d=await r.json();return d.items||d||[];
      }));
      resultados.forEach(items=>todos.push(...items));
      log(`Carregando... ${todos.length} / ${total} registros`,'info');
    }
    log(`✓ ${todos.length} registros carregados`,'ok');
    _cache[cacheKey]=todos;
    return todos;
  }

  function inicializarDatas(){
    const d=DATA_PADRAO||new Date().toISOString().substring(0,10);
    const ini=$('dataInicio');if(ini)ini.value=d;
    const fim=$('dataFim');if(fim)fim.value=d;
    const badge=$('badgeDatasReais');
    if(badge&&DATA_PADRAO){badge.style.display='block';const[y,m,dia]=DATA_PADRAO.split('-');badge.textContent=`Exibindo dados de: ${dia}/${m}/${y}`;}
  }

  let _dadosParaFiltro=[];
  function popularLinhas(dados){
    _dadosParaFiltro=dados;
    const selGar=$('selGaragem');
    const garagens=[...new Set(dados.map(i=>getGaragem(i.linha)).filter(Boolean))].sort();
    if(selGar){
      const valorAtual=selGar.value; // preservar seleção atual
      selGar.innerHTML='<option value="">Todas</option>'+garagens.map(g=>`<option value="${g}">${g}</option>`).join('');
      if(valorAtual&&garagens.includes(valorAtual))selGar.value=valorAtual; // restaurar
      selGar.removeEventListener('change',_onGaragemChange);
      selGar.addEventListener('change',_onGaragemChange);
    }
    _atualizarLinhas();
  }

  function _onGaragemChange(){
    const hidden=$('selLinha');const input=$('selLinhaInput');
    if(hidden)hidden.value='';if(input)input.value='';
    _atualizarLinhas();
  }

  function _atualizarLinhas(){
    const gar=($('selGaragem')?.value||'');
    const dadosFilt=gar?_dadosParaFiltro.filter(i=>getGaragem(i.linha)===gar):_dadosParaFiltro;
    const linhas=[...new Set(dadosFilt.map(i=>i.linha).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    const hidden=$('selLinha');
    const input=$('selLinhaInput');
    const drop=$('selLinhaDropdown');
    if(!input||!drop||!hidden)return;
    const todasLinhas=linhas.map(l=>({value:l,label:l.replace(/-/g,'.')}));

    function renderDrop(filtro){
      const f=filtro?todasLinhas.filter(i=>i.label.toLowerCase().includes(filtro.toLowerCase())):todasLinhas;
      drop.innerHTML=`<div class="sl-item" data-value="" style="padding:8px 12px;cursor:pointer;font-size:13px;color:var(--text-secondary);border-bottom:1px solid var(--border-light)">Todas as Linhas (${todasLinhas.length})</div>`+
        f.map(i=>`<div class="sl-item" data-value="${i.value}" style="padding:8px 12px;cursor:pointer;font-size:13px;color:var(--text)">${i.label}</div>`).join('');
      drop.style.display=f.length||!filtro?'block':'none';
      drop.querySelectorAll('.sl-item').forEach(el=>{
        el.addEventListener('mousedown',function(e){
          e.preventDefault();
          hidden.value=this.dataset.value;
          input.value=this.dataset.value?todasLinhas.find(x=>x.value===this.dataset.value)?.label||'':'';
          drop.style.display='none';
        });
        el.addEventListener('mouseenter',function(){this.style.background='var(--primary-soft)';});
        el.addEventListener('mouseleave',function(){this.style.background='';});
      });
    }

    input._renderDrop=renderDrop;
    if(!input._eventsSet){
      input.addEventListener('focus',function(){this._renderDrop(this.value);});
      input.addEventListener('input',function(){hidden.value='';this._renderDrop(this.value);});
      input.addEventListener('blur',function(){setTimeout(()=>{drop.style.display='none';},150);});
      input.addEventListener('keydown',function(e){if(e.key==='Escape'){drop.style.display='none';this.blur();}});
      input._eventsSet=true;
    }
  }

  function aplicarFiltros(dados){
    const garagem=($('selGaragem')?.value||'');
    const linha=($('selLinha')?.value||'').toLowerCase();
    const veiculo=($('selVeiculo')?.value||'').trim();
    const fiscal=($('selFiscal')?.value||'').toLowerCase().replace('f','');
    const sentido=$('selSentido')?.value||'';
    return dados.filter(i=>{
      if(garagem&&getGaragem(i.linha)!==garagem)return false;
      if(linha&&(i.linha||'').toLowerCase()!==linha)return false;
      if(veiculo&&String(i.veiculo||'')!==veiculo)return false;
      if(sentido!==''&&String(i.sentido)!==sentido)return false;
      if(fiscal){const fp=String(i.fiscal_partida||'').replace('f','');const fc=String(i.fiscal_chegada||'').replace('f','');if(fp!==fiscal&&fc!==fiscal)return false;}
      if(tipoDiaAtivo!=='todos'){const td=tipoDiaDaData(i.data||i.horario_programado_partida);if(td!==tipoDiaAtivo)return false;}
      return true;
    });
  }

  const NM={'0':'Sem Código','1':'Refeição','2':'Rendição','3':'Recolhe Normal','4':'Parada Operacional','5':'Retorno a Operação','6':'Atendimento','8':'Reservado','10':'Fora de Programação','11':'Término de Jornada','12':'Manutenção','13':'Atraso da Garagem','14':'Trânsito','15':'Recolhe Anormal','16':'Recolhe para a Lavagem','17':'Falta de Operador','18':'Realocação','19':'Ocorrência','20':'S.O.S','21':'Acidente','22':'Pane Elétrica','N/I':'Não Informado'};
  function nomeM(cod){return NM[String(cod)]||('Cód. '+cod);}
  const CORES=['#3d7ef5','#f6a623','#f65858','#19d46e','#a855f7','#00d4ff','#64748b','#e879f9'];

  function renderDashboard(dados){
    if(!dados||!dados.length){['kpiProg','kpiReal','kpiPerdas','kpiAderencia','kpiPerdaPct','kpiFiscais'].forEach(id=>tx(id,'0'));return;}
    const prog=dados.length,real=dados.filter(i=>!ehP(i)).length,perdas=prog-real;
    const icv=prog>0?(real/prog*100).toFixed(1):'0.0',perdaPct=prog>0?(perdas/prog*100).toFixed(1):'0.0';
    tx('kpiProg',fmt(prog));tx('kpiProgSub',`${new Set(dados.map(i=>i.linha).filter(Boolean)).size} linhas monitoradas`);
    tx('kpiReal',fmt(real));tx('kpiRealSub',`${icv}% do total programado`);
    tx('kpiPerdas',fmt(perdas));tx('kpiPerdasSub',`${perdaPct}% das viagens programadas`);
    tx('kpiAderencia',icv+'%');tx('kpiAderSub',`${fmt(real)} realizadas de ${fmt(prog)}`);
    tx('kpiPerdaPct',perdaPct+'%');tx('kpiPerdaPctSub',`${fmt(perdas)} partidas não cumpridas`);
    const fs=new Set([...dados.map(i=>fmtRE(i.fiscal_partida)),...dados.map(i=>fmtRE(i.fiscal_chegada))].filter(r=>r!=='—'));
    tx('kpiFiscais',String(fs.size));tx('kpiFiscaisSub','fiscais identificados');
    renderFaixaHoraria(dados);renderMotivos(dados);renderPerdasTurno(dados);renderEvolucao(dados);
    renderRanking(dados);renderHeatmap(dados);renderFiscais(dados);renderDetalhamento(dados);popularFiltrosCump(dados);renderCumprimento(dados);
  }

  function renderFaixaHoraria(dados){
    const horas=[4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23];
    const map={};horas.forEach(h=>map[h]={prog:0,real:0});
    dados.forEach(i=>{const h=hora(i.horario_programado_partida);if(map[h]!==undefined){map[h].prog++;if(!ehP(i))map[h].real++;}});
    const pcts=horas.map(h=>map[h].prog>0?parseFloat((map[h].real/map[h].prog*100).toFixed(1)):0);
    const el=$('cCumprimentoFaixa');if(!el)return;
    if(chartCump)chartCump.destroy();
    const txtColor=getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim()||'#64748b';
    chartCump=new Chart(el.getContext('2d'),{type:'bar',data:{labels:horas.map(h=>String(h).padStart(2,'0')+'h'),datasets:[{data:pcts,backgroundColor:pcts.map(v=>corICV(v)),borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:22}},plugins:{legend:{display:false},datalabels:{display:true,anchor:'end',align:'top',offset:2,color:function(ctx){return corICV(ctx.dataset.data[ctx.dataIndex]);},font:{size:10,weight:'800'},formatter:function(v){return v>0?v+'%':'';}}},scales:{y:{min:0,max:110,ticks:{callback:v=>v+'%',color:txtColor,font:{size:9}},grid:{color:'rgba(56,78,130,0.08)'}},x:{ticks:{color:txtColor,font:{size:9,weight:'600'}},grid:{display:false}}}}});
  }

  function renderMotivos(dados){
    const map={};dados.filter(ehP).forEach(i=>{const raw=i.cod_perda!=null?String(i.cod_perda).trim():'N/I';const cod=raw!=='N/I'&&!isNaN(raw)?String(parseInt(raw,10)):raw;map[cod]=(map[cod]||0)+1;});
    const motivos=Object.entries(map).map(([cod,cnt])=>({cod,cnt})).sort((a,b)=>b.cnt-a.cnt);
    const lista=$('motivoLista'),el=$('cMotivos');
    if(!motivos.length){if(lista)lista.innerHTML='<div style="font-size:12px;color:var(--muted);padding:10px;text-align:center">Nenhuma perda com codigo registrado</div>';return;}
    if(el){if(chartMotivos)chartMotivos.destroy();const top6=motivos.slice(0,6);const outros=motivos.slice(6).reduce((s,m)=>s+m.cnt,0);const codLbls=top6.map(m=>nomeM(m.cod));const vals=top6.map(m=>m.cnt);if(outros){codLbls.push('Outros');vals.push(outros);}const ttl=vals.reduce((a,b)=>a+b,0);chartMotivos=new Chart(el.getContext('2d'),{type:'doughnut',data:{labels:codLbls,datasets:[{data:vals,backgroundColor:CORES.slice(0,codLbls.length),borderWidth:0,hoverOffset:4}]},options:{responsive:true,maintainAspectRatio:false,cutout:'50%',plugins:{legend:{display:false},datalabels:{display:true,color:'#fff',font:{size:10,weight:'800'},formatter:function(v){return ttl>0?(v/ttl*100).toFixed(0)+'%':'';},anchor:'center',align:'center'},tooltip:{displayColors:false,callbacks:{title:function(){return '';},label:function(ctx){return ctx.label+': '+ctx.parsed+' ('+(ttl>0?(ctx.parsed/ttl*100).toFixed(1):0)+'%)';}}}}}}); }
    if(lista){const total=motivos.reduce((s,m)=>s+m.cnt,0);lista.innerHTML=motivos.map((m,i)=>{const cor=CORES[Math.min(i,CORES.length-1)];const pct=total>0?(m.cnt/total*100).toFixed(1):0;return`<div class="motivo-item"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${cor};flex-shrink:0"></span><span style="color:var(--text);flex:1;margin:0 8px;font-size:12px">${nomeM(m.cod)}</span><span style="color:var(--warning);font-weight:700;min-width:36px;text-align:right">${fmt(m.cnt)}</span><span style="color:var(--muted);margin-left:8px;font-size:11px;min-width:40px;text-align:right">${pct}%</span></div>`;}).join('');}
  }

  function renderPerdasTurno(dados){let manha=0,tarde=0;dados.filter(ehP).forEach(i=>{const h=hora(i.horario_programado_partida);if(h>=3&&h<=14)manha++;else tarde++;});const el=$('cPerdasTurno');if(!el)return;if(chartTurno)chartTurno.destroy();chartTurno=new Chart(el.getContext('2d'),{type:'doughnut',data:{labels:['Manhã (03–14h)','Tarde (15–23h)'],datasets:[{data:[manha,tarde],backgroundColor:['#3d7ef5','#d97706'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:'60%',plugins:{legend:{display:true,position:'bottom',labels:{color:getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim()||'#64748b',font:{size:10},boxWidth:10}},tooltip:{displayColors:false,callbacks:{title:()=>''}}}}});}

  function renderEvolucao(dados){
    const map={};dados.forEach(i=>{const d=(i.data||i.horario_programado_partida||'').substring(0,10);if(!d)return;if(!map[d])map[d]={prog:0,real:0};map[d].prog++;if(!ehP(i))map[d].real++;});
    let datas=Object.keys(map).sort(),labels,progs,reals;
    if(periodoAtivo==='semana'){const sm={};datas.forEach(d=>{const dt=new Date(d);const dow=dt.getDay()||7;const seg=new Date(dt);seg.setDate(dt.getDate()-dow+1);const k=seg.toISOString().substring(0,10);if(!sm[k])sm[k]={prog:0,real:0};sm[k].prog+=map[d].prog;sm[k].real+=map[d].real;});const sd=Object.keys(sm).sort();labels=sd.map(d=>{const[,m,dia]=d.split('-');return`Sem ${dia}/${m}`;});progs=sd.map(d=>sm[d].prog);reals=sd.map(d=>sm[d].real);}
    else if(periodoAtivo==='mes'){const mm={};datas.forEach(d=>{const k=d.substring(0,7);if(!mm[k])mm[k]={prog:0,real:0};mm[k].prog+=map[d].prog;mm[k].real+=map[d].real;});const md=Object.keys(mm).sort();const ms=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];labels=md.map(d=>{const[y,m]=d.split('-');return`${ms[parseInt(m)-1]}/${y.slice(2)}`;});progs=md.map(d=>mm[d].prog);reals=md.map(d=>mm[d].real);}
    else{labels=datas.map(d=>{const[,m,dia]=d.split('-');return`${dia}/${m}`;});progs=datas.map(d=>map[d].prog);reals=datas.map(d=>map[d].real);}
    const perdidos=progs.map((p,i)=>p-reals[i]);
    const el=$('cEvolucao');if(!el)return;if(chartEvolucao)chartEvolucao.destroy();
    chartEvolucao=new Chart(el.getContext('2d'),{data:{labels,datasets:[{type:'bar',label:'Programadas',data:progs,backgroundColor:'rgba(61,126,245,0.25)',borderRadius:2},{type:'bar',label:'Realizadas',data:reals,backgroundColor:'rgba(25,212,110,0.40)',borderRadius:2},{type:'line',label:'Perdidas',data:perdidos,borderColor:'#f65858',backgroundColor:'rgba(246,88,88,0.12)',borderWidth:2,tension:0.3,pointRadius:3,fill:true}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#7a9cc8',font:{size:9},boxWidth:10,padding:8}}},scales:{y:{ticks:{color:'#7a9cc8',font:{size:9}},grid:{color:'#1a3560'}},x:{ticks:{color:'#7a9cc8',font:{size:9}},grid:{display:false}}}}});
  }

  // RANKING — TODAS AS LINHAS com ordenação
  let _rankData=[]; window._rankData=_rankData;
  function buildRank(dados){const map={},motMap={};dados.forEach(i=>{const l=i.linha||'—';if(!map[l])map[l]={prog:0,real:0};map[l].prog++;if(!ehP(i))map[l].real++;else{const cod=i.cod_perda!=null?String(i.cod_perda):'N/I';if(!motMap[l])motMap[l]={};motMap[l][cod]=(motMap[l][cod]||0)+1;}});return Object.entries(map).map(([l,v])=>({l,prog:v.prog,real:v.real,perdas:v.prog-v.real,icv:v.prog>0?parseFloat((v.real/v.prog*100).toFixed(1)):0,perdaPct:v.prog>0?parseFloat(((v.prog-v.real)/v.prog*100).toFixed(1)):0,motivos:motMap[l]||{}}));}
  function renderRanking(dados){_rankData=buildRank(dados);window._rankData=_rankData;_dadosRankBase=dados;popularFiltroMotivo(dados);renderRankTable(_rankData,'perdas',false);renderTopCards(_rankData);}

  function renderTopCards(data){
    const topPerdas=[...data].sort((a,b)=>b.perdas-a.perdas).slice(0,5);
    const topIcv=[...data].filter(r=>r.prog>=5).sort((a,b)=>b.icv-a.icv).slice(0,5);
    const elP=$('topPerdasList'),elI=$('topIcvList');
    if(elP)elP.innerHTML=topPerdas.map((r,i)=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--border-light);cursor:pointer" onclick="verPartidasLinha('${r.l}')"><span style="font-size:14px;font-weight:900;color:var(--muted);min-width:20px">${i+1}</span><span style="flex:1;font-weight:700;font-size:12px;color:var(--text)">${fmtLinha(r.l)}</span><span style="font-size:13px;font-weight:900;color:#f65858">${fmt(r.perdas)}</span><span style="font-size:10px;color:var(--muted);min-width:45px;text-align:right">${r.perdaPct}%</span></div>`).join('')||'<div style="color:var(--muted);text-align:center;padding:12px;font-size:12px">Sem dados</div>';
    if(elI)elI.innerHTML=topIcv.map((r,i)=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--border-light);cursor:pointer" onclick="verPartidasLinha('${r.l}')"><span style="font-size:14px;font-weight:900;color:var(--muted);min-width:20px">${i+1}</span><span style="flex:1;font-weight:700;font-size:12px;color:var(--text)">${fmtLinha(r.l)}</span><span style="font-size:13px;font-weight:900;color:#19d46e">${r.icv}%</span><span style="font-size:10px;color:var(--muted);min-width:45px;text-align:right">${fmt(r.prog)} prog</span></div>`).join('')||'<div style="color:var(--muted);text-align:center;padding:12px;font-size:12px">Sem dados</div>';
  }

  // Popula select de motivos do ranking com os códigos presentes nos dados
  function popularFiltroMotivo(dados){
    const sel=document.getElementById('selMotivoRanking');if(!sel)return;
    const map={};dados.filter(ehP).forEach(i=>{const cod=i.cod_perda!=null?String(i.cod_perda):'N/I';map[cod]=(map[cod]||0)+1;});
    const opts=Object.entries(map).sort((a,b)=>b[1]-a[1]);
    sel.innerHTML='<option value="">Todos os Motivos</option>'+opts.map(([cod,cnt])=>`<option value="${cod}">${cod} — ${nomeM(cod)} (${fmt(cnt)})</option>`).join('');
  }

  // Chamado quando o select muda — filtra o ranking pelo motivo selecionado
  window.filtrarRankingPorMotivo = function(){
    const sel=document.getElementById('selMotivoRanking');
    const cod=sel?sel.value:'';
    if(!cod){renderRankTable(_rankData,'perdas',false);document.getElementById('rankMotivoLabel')&&(document.getElementById('rankMotivoLabel').textContent='');return;}
    // Recalcula o ranking contando apenas perdas com aquele código
    const rankFiltrado=(window._rankData||[]).map(r=>{
      const qtd=(r.motivos&&r.motivos[cod])||0;
      return{...r,_motivoQtd:qtd};
    }).filter(r=>r._motivoQtd>0).sort((a,b)=>b._motivoQtd-a._motivoQtd);
    // Renderiza tabela especial mostrando coluna "Qtd Motivo"
    const tbody=document.getElementById('tbRankingBody');if(!tbody)return;
    tbody.innerHTML=rankFiltrado.length?rankFiltrado.map((r,idx)=>{
      const c=corICV(r.icv);
      return`<tr style="cursor:pointer" onclick="verPartidasLinha('${r.l}')">
        <td style="color:var(--muted);text-align:center">${idx+1}</td>
        <td style="font-weight:700;color:var(--text)">${r.l}</td>
        <td>${fmt(r.prog)}</td>
        <td style="color:#f65858;font-weight:700;font-size:13px">${fmt(r._motivoQtd)}</td>
        <td style="color:${c};font-weight:700">${r.icv}%</td>
        <td><button class="btn-ver" onclick="event.stopPropagation();verPerdasLinha('${r.l}')">Perdas</button></td>
      </tr>`;
    }).join(''):'<tr><td colspan="6" style="color:var(--muted);text-align:center;padding:16px">Nenhuma linha com este motivo</td></tr>';
    const lbl=document.getElementById('rankMotivoLabel');
    if(lbl) lbl.textContent=`Mostrando linhas com motivo: ${cod} — ${nomeM(cod)}`;
  };
  let _dadosRankBase=[];
  function renderRankTable(arr,col,asc){const sorted=sortArr(arr,col,asc);const tbody=$('tbRankingBody');if(!tbody)return;tbody.innerHTML=sorted.length?sorted.map(i=>{const c=corICV(i.icv);return`<tr style="cursor:pointer" onclick="verPartidasLinha('${i.l}')"><td style="font-weight:700;color:var(--text)">${fmtLinha(i.l)}</td><td>${fmt(i.prog)}</td><td>${fmt(i.real)}</td><td style="color:${i.perdas>0?'#f65858':'#19d46e'};font-weight:700">${fmt(i.perdas)}</td><td style="color:${c};font-weight:700">${i.icv}%</td><td><button class="btn-ver" onclick="event.stopPropagation();verPerdasLinha('${i.l}')">Perdas</button></td></tr>`;}).join(''):'<tr><td colspan="6" style="color:var(--muted);text-align:center;padding:20px">Sem dados</td></tr>';}
  window._rs={col:'perdas',asc:false};
  window.sortRanking=function(col){if(window._rs.col===col)window._rs.asc=!window._rs.asc;else{window._rs.col=col;window._rs.asc=false;}renderRankTable(_rankData,window._rs.col,window._rs.asc);document.querySelectorAll('#tblRanking thead th[data-col]').forEach(th=>{const ic=th.querySelector('.sort-ic');if(ic)ic.textContent=th.dataset.col===col?(window._rs.asc?' ↑':' ↓'):' ↕';});};

  // MODAL PERDAS DA LINHA
  window.verPerdasLinha=function(linha){const d=dadosFiltrado.filter(i=>i.linha===linha&&ehP(i));const map={};d.forEach(i=>{const cod=i.cod_perda!=null?String(i.cod_perda):'N/I';map[cod]=(map[cod]||0)+1;});const motivos=Object.entries(map).map(([cod,cnt])=>({cod,cnt})).sort((a,b)=>b.cnt-a.cnt);const total=motivos.reduce((s,m)=>s+m.cnt,0);$('modalTitulo').textContent=`Perdas — Linha ${fmtLinha(linha)}`;$('modalConteudo').innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px"><div style="background:var(--card);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);border-left:3px solid var(--primary);padding:10px;text-align:center"><div style="font-size:9px;color:var(--text-secondary);text-transform:uppercase;margin-bottom:4px">Total de Perdas</div><div style="font-size:22px;font-weight:900;color:#f65858">${fmt(total)}</div></div><div style="background:var(--card);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);border-left:3px solid var(--primary);padding:10px;text-align:center"><div style="font-size:9px;color:var(--text-secondary);text-transform:uppercase;margin-bottom:4px">Códigos Distintos</div><div style="font-size:22px;font-weight:900;color:#f6a623">${motivos.length}</div></div></div><table class="ntbl" style="margin-bottom:10px"><thead><tr><th>Código</th><th>Nome</th><th>Qtd</th><th>%</th></tr></thead><tbody>${motivos.map(m=>`<tr><td><span class="motivo-cod" style="background:var(--bg);color:#3d7ef5">${m.cod}</span></td><td style="color:var(--text)">${nomeM(m.cod)}</td><td style="color:#f65858;font-weight:700">${fmt(m.cnt)}</td><td style="color:var(--text-secondary)">${total>0?(m.cnt/total*100).toFixed(1):0}%</td></tr>`).join('')}</tbody></table><button class="btn-excel" style="width:100%" onclick="exportPerdasLinha('${linha}')">↓ Exportar Excel detalhado</button>`;$('modalBg').classList.add('open');};
  window.exportPerdasLinha=function(linha){const d=dadosFiltrado.filter(i=>i.linha===linha&&ehP(i));const hdrs=['Data','Linha','Veículo','Sentido','Horário Prog','Horário Fiscal','Cód Perda','Nome Motivo','Fiscal Partida','Fiscal Chegada','TB'];const rows=d.map(i=>[(i.data||'').substring(0,10),i.linha||'',i.veiculo||'',i.sentido?'Ida':'Volta',fmtH(i.horario_programado_partida),fmtH(i.horario_fiscal_partida||i.horario_gps_partida),i.cod_perda??'N/I',nomeM(i.cod_perda!=null?String(i.cod_perda):'N/I'),fmtRE(i.fiscal_partida),fmtRE(i.fiscal_chegada),i.tabela||'']);csvDL([hdrs,...rows],`perdas_linha_${linha}`);};

  // MODAL PARTIDAS DA LINHA (com abas Ida/Volta)
  function _buildPartidasTab(dados,linha){
    const prog=dados.length,perdas=dados.filter(ehP).length,real=prog-perdas;
    const cards=`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px">${[['Total Programadas','#3d7ef5',fmt(prog)],['Total Realizadas','#19d46e',fmt(real)],['Total Perdas','#f65858',fmt(perdas)]].map(([lb,cor,val])=>`<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);border-left:3px solid ${cor};padding:8px;text-align:center"><div style="font-size:9px;color:var(--text-secondary);text-transform:uppercase;margin-bottom:3px">${lb}</div><div style="font-size:18px;font-weight:900;color:${cor}">${val}</div></div>`).join('')}</div>`;
    const tabela=`<div style="overflow-x:auto;max-height:380px;overflow-y:auto"><table class="ntbl"><thead style="position:sticky;top:0;background:var(--bg);z-index:1"><tr><th>Seq</th><th>TB</th><th>Prefixo</th><th>Prog</th><th>Fiscal</th><th>GPS</th><th>RE Part.</th><th>RE Cheg.</th><th>Status</th><th>Cód</th></tr></thead><tbody>${dados.length?dados.map((i,idx)=>{const p=ehP(i);const cor=p?'#f65858':'#19d46e';return`<tr style="background:${p?'rgba(246,88,88,0.04)':''}"><td style="color:var(--muted)">${idx+1}</td><td style="font-family:monospace;color:var(--text-secondary)">${i.tabela||'—'}</td><td style="font-weight:700">${i.veiculo||'—'}</td><td style="font-family:monospace">${fmtH(i.horario_programado_partida)}</td><td style="font-family:monospace;color:#f6a623">${fmtH(i.horario_fiscal_partida)}</td><td style="font-family:monospace;color:var(--text-secondary)">${fmtH(i.horario_gps_partida)}</td><td style="font-family:monospace;color:#00d4ff">${fmtRE(i.fiscal_partida)}</td><td style="font-family:monospace;color:#a855f7">${fmtRE(i.fiscal_chegada)}</td><td><span style="background:${p?'rgba(246,88,88,0.15)':'rgba(25,212,110,0.15)'};color:${cor};padding:2px 8px;border-radius:4px;font-size:9px;font-weight:800">${p?'PERDIDA':'OK'}</span></td><td style="color:#f6a623">${i.cod_perda!=null?i.cod_perda:'—'}</td></tr>`;}).join(''):'<tr><td colspan="10" style="color:var(--muted);text-align:center;padding:20px">Sem partidas neste sentido</td></tr>'}</tbody></table></div>`;
    return cards+tabela;
  }

  window.verPartidasLinha=function(linha){
    const all=[...dadosFiltrado.filter(i=>i.linha===linha)].sort((a,b)=>new Date(a.horario_programado_partida)-new Date(b.horario_programado_partida));
    const ida=all.filter(i=>i.sentido===true||i.sentido==='true');
    const volta=all.filter(i=>i.sentido===false||i.sentido==='false'||i.sentido===0);
    window._partidasAbas={linha,all,ida,volta};
    $('modalTitulo').textContent=`Partidas — Linha ${fmtLinha(linha)}`;
    const tabStyle='height:34px;padding:0 20px;border-radius:20px 20px 0 0;border:1px solid var(--border);border-bottom:none;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:.15s;';
    $('modalConteudo').innerHTML=`
      <div style="display:flex;gap:4px;margin-bottom:0">
        <button id="tabTodos" style="${tabStyle}background:var(--primary);color:#fff" onclick="window._switchPartTab('todos')">Todos (${fmt(all.length)})</button>
        <button id="tabIda" style="${tabStyle}background:var(--bg);color:var(--text-secondary)" onclick="window._switchPartTab('ida')">Ida (${fmt(ida.length)})</button>
        <button id="tabVolta" style="${tabStyle}background:var(--bg);color:var(--text-secondary)" onclick="window._switchPartTab('volta')">Volta (${fmt(volta.length)})</button>
      </div>
      <div style="border:1px solid var(--border);border-radius:0 8px 8px 8px;padding:12px" id="partTabContent">
        ${_buildPartidasTab(all,linha)}
      </div>
      <button class="btn-excel" style="width:100%;margin-top:10px" onclick="exportPartidasLinha('${linha}')">↓ Exportar Excel</button>`;
    $('modalBg').classList.add('open');
  };

  window._switchPartTab=function(tab){
    const d=window._partidasAbas;if(!d)return;
    const dados=tab==='ida'?d.ida:tab==='volta'?d.volta:d.all;
    $('partTabContent').innerHTML=_buildPartidasTab(dados,d.linha);
    ['tabTodos','tabIda','tabVolta'].forEach(id=>{const b=$(id);if(b){b.style.background='var(--bg)';b.style.color='var(--text-secondary)';}});
    const active=$(tab==='ida'?'tabIda':tab==='volta'?'tabVolta':'tabTodos');
    if(active){active.style.background='var(--primary)';active.style.color='#fff';}
  };
  window.exportPartidasLinha=function(linha){const d=[...dadosFiltrado.filter(i=>i.linha===linha)].sort((a,b)=>new Date(a.horario_programado_partida)-new Date(b.horario_programado_partida));const hdrs=['Seq','TB','Prefixo','Sentido','Horário Prog','Horário Fiscal','Horário GPS','RE Partida','RE Chegada','Status','Cód Perda','Nome Motivo'];const rows=d.map((i,idx)=>[idx+1,i.tabela||'',i.veiculo||'',i.sentido?'Ida':'Volta',fmtH(i.horario_programado_partida),fmtH(i.horario_fiscal_partida),fmtH(i.horario_gps_partida),fmtRE(i.fiscal_partida),fmtRE(i.fiscal_chegada),ehP(i)?'PERDIDA':'REALIZADA',i.cod_perda??'',i.cod_perda!=null?nomeM(String(i.cod_perda)):'']);csvDL([hdrs,...rows],`partidas_linha_${linha}`);};

  // HEATMAP com coluna TOTAL e ordenação
  let _hmData=[];
  function renderHeatmap(dados){const horas=[4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23];const lp={},map={};dados.filter(ehP).forEach(i=>{const l=i.linha||'—';lp[l]=(lp[l]||0)+1;const h=hora(i.horario_programado_partida);if(!map[l])map[l]={};map[l][h]=(map[l][h]||0)+1;});const todas=[...new Set(dados.map(i=>i.linha||'—'))];_hmData=todas.map(l=>({l,total:lp[l]||0,horas:horas.map(h=>(map[l]||{})[h]||0)}));renderHmTable(_hmData,'total',false);}
  window._hs={col:'total',asc:false};
  function renderHmTable(arr,col,asc){const horas=[4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23];const sorted=col==='l'?[...arr].sort((a,b)=>asc?a.l.localeCompare(b.l):b.l.localeCompare(a.l)):[...arr].sort((a,b)=>asc?a.total-b.total:b.total-a.total);const tbody=$('tbHeatmapBody');if(!tbody)return;tbody.innerHTML=sorted.filter(r=>r.total>0).map(row=>{const cells=row.horas.map(cnt=>{let bg='rgba(25,212,110,0.10)',fc='#19d46e';if(cnt===0){}else if(cnt<=2){bg='rgba(246,166,35,0.35)';fc='#f6a623';}else{bg='rgba(246,88,88,0.60)';fc='#fff';}return`<td style="background:${bg};color:${fc};font-weight:${cnt>0?700:400}">${cnt===0?'·':cnt}</td>`;}).join('');return`<tr><td class="rh" style="cursor:pointer" onclick="verPartidasLinha('${row.l}')">${fmtLinha(row.l)}</td>${cells}<td style="color:#f65858;font-weight:800;text-align:center;background:var(--bg)">${row.total||'·'}</td></tr>`;}).join('')||'<tr><td colspan="22" style="text-align:center;color:var(--muted);padding:20px">Sem perdas registradas</td></tr>';}
  window.sortHeatmap=function(col){if(window._hs.col===col)window._hs.asc=!window._hs.asc;else{window._hs.col=col;window._hs.asc=false;}renderHmTable(_hmData,window._hs.col,window._hs.asc);document.querySelectorAll('.hm-th-sort').forEach(th=>{const ic=th.querySelector('.sort-ic');if(ic)ic.textContent=th.dataset.col===col?(window._hs.asc?' ↑':' ↓'):' ↕';});};

  // FISCAIS — Regra oficial Sambaíba
  // Campo base: fiscal_partida ("Início registrado por")
  // Sentido: Ida (sentido=true) → TP | Volta (sentido=false) → TS
  // Manhã: 03:00–13:59 | Tarde: 14:00–02:59
  // Agrupamento: linha + sentido + período
  // Fiscal predominante por grupo recebe TODAS as viagens programadas do grupo
  // Marcou = tem horário fiscal OU tem código de evento
  function periodoViagem(h){return(h>=3&&h<=13)?'manha':'tarde';}

  function analisarFiscais(dados){
    // 1) Determinar período de cada fiscal POR LINHA+SENTIDO (não global)
    // Chave: "re|linha|pos" → primeira hora nessa combinação
    const fiscalPorLinhaPos={};
    dados.forEach(i=>{
      const re=fmtRE(i.fiscal_partida);if(re==='—')return;
      const hProg=hora(i.horario_programado_partida);if(hProg<0)return;
      const linha=i.linha||'—';
      const pos=(i.sentido===true||i.sentido==='true')?'tp':'ts';
      const k=re+'|'+linha+'|'+pos;
      if(!fiscalPorLinhaPos[k]||hProg<fiscalPorLinhaPos[k]){
        fiscalPorLinhaPos[k]=hProg;
      }
    });

    // 2) Agrupar viagens por LINHA + SENTIDO + PERÍODO
    const grupos={}; // chave: "2023-42|tp|manha"
    dados.forEach(i=>{
      const hProg=hora(i.horario_programado_partida);if(hProg<0)return;
      const linha=i.linha||'—';
      const per=periodoViagem(hProg);
      const pos=(i.sentido===true||i.sentido==='true')?'tp':'ts';
      const k=linha+'|'+pos+'|'+per;
      if(!grupos[k])grupos[k]={linha,pos,per,viagens:[],fiscais:{}};
      grupos[k].viagens.push(i);
      const re=fmtRE(i.fiscal_partida);
      if(re!=='—'){
        // Período do fiscal NESTA linha+sentido
        const kFisc=re+'|'+linha+'|'+pos;
        const pegadaHora=fiscalPorLinhaPos[kFisc]??hProg;
        const fiscPer=periodoViagem(pegadaHora);

        if(fiscPer===per){
          // Fiscal pertence a este período nesta linha → conta como responsável
          if(!grupos[k].fiscais[re])grupos[k].fiscais[re]={count:0,marcou:0,primeiraHora:hProg};
          grupos[k].fiscais[re].count++;
          if(hProg<grupos[k].fiscais[re].primeiraHora)grupos[k].fiscais[re].primeiraHora=hProg;
        }
        // Marcação real: sempre conta independente do período
        const temHorario=!!i.horario_fiscal_partida;
        const temCodEvento=i.cod_perda!=null&&String(i.cod_perda).trim()!=='';
        if(temHorario||temCodEvento){
          if(!grupos[k].fiscais[re])grupos[k].fiscais[re]={count:0,marcou:0,primeiraHora:hProg};
          grupos[k].fiscais[re].marcou++;
        }
      }
    });

    // 3) Para cada grupo: predominante recebe todas programadas
    // Se não tem fiscal no grupo → "RE Não Identificado"
    const resultado=[];
    Object.values(grupos).forEach(grupo=>{
      const prog=grupo.viagens.length;
      // Filtrar apenas fiscais que pertencem a este período (count > 0)
      const fiscaisDoPeriodo=Object.entries(grupo.fiscais).filter(([,info])=>info.count>0);
      const sorted=fiscaisDoPeriodo.sort((a,b)=>b[1].count-a[1].count);

      const sentido=grupo.pos==='tp'?'TP → TS':'TS → TP';

      if(!sorted.length)return; // Sem fiscal identificado → não exibe

      // Fiscal predominante recebe todas as programadas
      const [rePred,infoPred]=sorted[0];
      let marcTotal=infoPred.marcou;
      // Somar marcações de todos os fiscais do grupo (incluindo avulsos de outro período)
      Object.entries(grupo.fiscais).forEach(([re,info])=>{
        if(re!==rePred)marcTotal+=info.marcou;
      });
      const naoM=Math.max(0,prog-marcTotal);
      resultado.push({
        re:rePred,
        linha:grupo.linha,
        pos:grupo.pos,
        sentidoLabel:sentido,
        periodo:grupo.per,
        primeiraHora:infoPred.primeiraHora,
        responsavel:prog,
        marcadas:marcTotal,
        naoMarcadas:naoM,
        cobertura:prog>0?Math.round(marcTotal/prog*100):100,
        predominante:true
      });
    });

    return resultado;
  }
  let _fiscaisData=[];
  function renderFiscais(dados){_fiscaisData=analisarFiscais(dados);const tM=_fiscaisData.reduce((s,f)=>s+f.marcadas,0),tN=_fiscaisData.reduce((s,f)=>s+f.naoMarcadas,0);tx('kpiFiscaisAtivos',String(_fiscaisData.length));tx('kpiFiscaisMarcaram',fmt(tM));tx('kpiFiscaisNaoMarcaram',fmt(tN));tx('kpiFiscaisCobertura',((tM+tN)>0?Math.round(tM/(tM+tN)*100):100)+'%');renderFiscaisTable(_fiscaisData,'cobertura',true);renderFiscaisGaragem(_fiscaisData);}

  function renderFiscaisGaragem(data){
    const tbody=$('tbFiscaisGaragem');if(!tbody)return;
    // Agrupar por garagem da linha
    const garMap={};
    data.forEach(f=>{
      const gar=getGaragem(f.linha)||'Sem Garagem';
      if(!garMap[gar])garMap[gar]={critico:0,regular:0,bom:0,total:0};
      garMap[gar].total++;
      if(f.cobertura>=90)garMap[gar].bom++;
      else if(f.cobertura>=75)garMap[gar].regular++;
      else garMap[gar].critico++;
    });
    const rows=Object.entries(garMap).sort((a,b)=>b[1].critico-a[1].critico);
    tbody.innerHTML=rows.length?rows.map(([gar,v])=>`<tr>
      <td style="font-weight:700;color:var(--text)">${gar}</td>
      <td style="color:#f65858;font-weight:800;text-align:center">${v.critico||'—'}</td>
      <td style="color:#f6a623;font-weight:800;text-align:center">${v.regular||'—'}</td>
      <td style="color:#19d46e;font-weight:800;text-align:center">${v.bom||'—'}</td>
      <td style="font-weight:700;text-align:center;color:var(--text)">${v.total}</td>
    </tr>`).join(''):'<tr><td colspan="5" style="color:var(--muted);text-align:center;padding:16px">Sem dados</td></tr>';
  }
  function _periodoLabel(per){return per==='manha'?'Manhã':'Tarde';}

  function renderFiscaisTable(arr,col,asc){const sorted=sortArr(arr,col,asc);const tbody=$('tbFiscais');if(!tbody)return;tbody.innerHTML=sorted.length?sorted.map(f=>{const cobCor=f.cobertura>=90?'#19d46e':f.cobertura>=75?'#f6a623':'#f65858';const perf=f.cobertura>=90?'<span class="tag tag-ok">Bom</span>':f.cobertura>=75?'<span class="tag tag-warn">Regular</span>':'<span class="tag tag-err">Crítico</span>';const pred=f.predominante?'<span style="background:var(--primary);color:#fff;padding:1px 6px;border-radius:4px;font-size:8px;font-weight:800;margin-left:4px">RESP</span>':'';return`<tr><td style="font-family:monospace;font-weight:700;color:#00d4ff;position:sticky;left:0;background:var(--card-solid);z-index:1;min-width:75px;padding-right:8px">${f.re}</td><td style="font-weight:700;color:var(--text);position:sticky;left:75px;background:var(--card-solid);z-index:1;min-width:80px;padding-right:8px">${fmtLinha(f.linha)}</td><td style="color:var(--text)">${f.sentidoLabel}</td><td>${_periodoLabel(f.periodo)}</td><td style="color:var(--text-secondary)">${f.primeiraHora}h</td><td style="color:var(--text);font-weight:700">${fmt(f.responsavel)}</td><td style="color:#19d46e;font-weight:700">${fmt(f.marcadas)}</td><td style="color:${f.naoMarcadas>0?'#f65858':'#19d46e'};font-weight:700">${fmt(f.naoMarcadas)}</td><td><div style="display:flex;align-items:center;gap:6px"><div style="height:7px;border-radius:3px;background:${cobCor};width:${Math.max(4,f.cobertura)}px"></div><span style="font-size:10px;font-weight:800;color:${cobCor}">${f.cobertura}%</span></div></td><td>${perf}</td><td><button class="btn-ver btn-fiscal-ver" data-re="${f.re}" data-linha="${f.linha}" data-pos="${f.pos}" data-per="${f.periodo}">Ver</button></td></tr>`;}).join(''):'<tr><td colspan="11" style="text-align:center;color:var(--muted);padding:20px">Nenhum fiscal identificado</td></tr>';}
  document.addEventListener('click',function(e){
    const btn=e.target.closest('.btn-fiscal-ver');
    if(!btn)return;
    const re=btn.dataset.re;
    const linha=btn.dataset.linha;
    const pos=btn.dataset.pos;
    const per=btn.dataset.per;
    window.verDetalhesFiscal(re,linha,pos,per);
  });
  window._fs={col:'cobertura',asc:true};
  window.sortFiscais=function(col){if(window._fs.col===col)window._fs.asc=!window._fs.asc;else{window._fs.col=col;window._fs.asc=false;}renderFiscaisTable(_fiscaisData,window._fs.col,window._fs.asc);document.querySelectorAll('.fiscal-th-sort').forEach(th=>{const ic=th.querySelector('.sort-ic');if(ic)ic.textContent=th.dataset.col===col?(window._fs.asc?' ↑':' ↓'):' ↕';});};

  // DETALHAMENTO
  function renderDetalhamento(dados){const map={},motMap={};dados.forEach(i=>{const l=i.linha||'—';if(!map[l])map[l]={prog:0,real:0};map[l].prog++;if(!ehP(i))map[l].real++;else{const cod=i.cod_perda!=null?String(i.cod_perda):'N/I';if(!motMap[l])motMap[l]={};motMap[l][cod]=(motMap[l][cod]||0)+1;}});const arr=Object.entries(map).map(([l,v])=>({l,prog:v.prog,real:v.real,perdas:v.prog-v.real,icv:v.prog>0?parseFloat((v.real/v.prog*100).toFixed(1)):0,perdaPct:v.prog>0?parseFloat(((v.prog-v.real)/v.prog*100).toFixed(1)):0})).sort((a,b)=>a.icv-b.icv);const tbody=$('tbDetalhamento');if(!tbody)return;tbody.innerHTML=arr.map(i=>{const c=corICV(i.icv);const tag=i.icv>=95?'<span class="tag tag-ok">OK</span>':i.icv>=85?'<span class="tag tag-warn">Atenção</span>':'<span class="tag tag-err">Crítico</span>';const mp=Object.entries(motMap[i.l]||{}).sort((a,b)=>b[1]-a[1])[0];return`<tr style="cursor:pointer" onclick="verPartidasLinha('${i.l}')"><td style="font-weight:700;color:var(--text)">${fmtLinha(i.l)}</td><td>${fmt(i.prog)}</td><td>${fmt(i.real)}</td><td style="color:${c};font-weight:700">${i.icv}%</td><td style="color:${i.perdas>0?'#f65858':'#19d46e'};font-weight:700">${fmt(i.perdas)}</td><td style="color:#f65858">${i.perdaPct}%</td><td style="color:var(--text-secondary);font-size:10px">${mp?nomeM(mp[0])+' ('+mp[1]+'x)':'—'}</td><td>${tag}</td><td><button class="btn-ver" onclick="event.stopPropagation();verPerdasLinha('${i.l}')">Ver</button></td></tr>`;}).join('');}

  // MODAL DETALHES DO FISCAL — todas as viagens do grupo (linha+sentido+período)
  window.verDetalhesFiscal=function(re,linha,pos,per){
    // Filtrar todas as viagens programadas do grupo (linha + sentido + período)
    const sentidoBool=pos==='tp';
    const d=[...dadosFiltrado.filter(i=>{
      if(i.linha!==linha)return false;
      const s=(i.sentido===true||i.sentido==='true');
      if(s!==sentidoBool)return false;
      const h=hora(i.horario_programado_partida);
      if(h<0)return false;
      return periodoViagem(h)===per;
    })].sort((a,b)=>new Date(a.horario_programado_partida)-new Date(b.horario_programado_partida));

    const prog=d.length;
    // "Marcou" = fiscal_partida é ESTE fiscal E (tem horário OU tem código evento)
    function _fiscalMarcou(i){
      const reFisc=fmtRE(i.fiscal_partida);
      if(reFisc!==re)return false;
      const temH=!!i.horario_fiscal_partida;
      const temCod=i.cod_perda!=null&&String(i.cod_perda).trim()!=='';
      return temH||temCod;
    }
    const marcou=d.filter(_fiscalMarcou).length;
    const naoMarcou=prog-marcou;
    const cob=prog>0?Math.round(marcou/prog*100):100;
    const sentidoTxt=pos==='tp'?'TP → TS':'TS → TP';
    const perTxt=per==='manha'?'Manhã':'Tarde';

    $('modalTitulo').textContent=`Fiscal ${re} — Linha ${fmtLinha(linha)} — ${sentidoTxt} — ${perTxt}`;
    $('modalConteudo').innerHTML=`
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">
        ${[['Programadas','#3d7ef5',fmt(prog)],['Marcou','#19d46e',fmt(marcou)],['Não Marcou','#f65858',fmt(naoMarcou)],['Cobertura',cob>=90?'#19d46e':cob>=75?'#f6a623':'#f65858',cob+'%']].map(([lb,cor,val])=>`<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);border-left:3px solid ${cor};padding:8px;text-align:center"><div style="font-size:9px;color:var(--text-secondary);text-transform:uppercase;margin-bottom:3px">${lb}</div><div style="font-size:18px;font-weight:900;color:${cor}">${val}</div></div>`).join('')}
      </div>
      <div style="overflow-x:auto;max-height:400px;overflow-y:auto">
        <table class="ntbl">
          <thead style="position:sticky;top:0;background:var(--bg);z-index:1"><tr>
            <th>Seq</th><th>TB</th><th>Prefixo</th><th>H. Programado</th><th>Início Registrado</th><th>Início Reg. Por</th><th>GPS</th><th>Cód Evento</th><th>Motivo</th><th>Status</th>
          </tr></thead>
          <tbody>${d.map((i,idx)=>{
            const reFisc=fmtRE(i.fiscal_partida);
            const temH=!!i.horario_fiscal_partida;
            const marcouItem=_fiscalMarcou(i);
            const cor=marcouItem?'#19d46e':'#f65858';
            const statusTxt=marcouItem?'MARCOU':'NÃO MARCOU';
            const bgRow=marcouItem?'':'rgba(246,88,88,0.04)';
            const reColor=reFisc===re?'#00d4ff':'var(--muted)';
            return`<tr style="background:${bgRow}">
              <td style="color:var(--muted)">${idx+1}</td>
              <td style="font-family:monospace;color:var(--text-secondary)">${i.tabela||'—'}</td>
              <td style="font-weight:700">${i.veiculo||'—'}</td>
              <td style="font-family:monospace">${fmtH(i.horario_programado_partida)}</td>
              <td style="font-family:monospace;color:${temH?'#f6a623':'var(--muted)'}">${temH?fmtH(i.horario_fiscal_partida):'—'}</td>
              <td style="font-family:monospace;font-weight:700;color:${reColor}">${reFisc!=='—'?reFisc:'—'}</td>
              <td style="font-family:monospace;color:var(--text-secondary)">${fmtH(i.horario_gps_partida)}</td>
              <td style="color:#f6a623;font-weight:700">${i.cod_perda!=null?i.cod_perda:'—'}</td>
              <td style="color:var(--text-secondary);font-size:10px">${i.cod_perda!=null?nomeM(String(i.cod_perda)):'—'}</td>
              <td><span style="background:${marcouItem?'rgba(25,212,110,0.15)':'rgba(246,88,88,0.15)'};color:${cor};padding:2px 8px;border-radius:4px;font-size:9px;font-weight:800">${statusTxt}</span></td>
            </tr>`;}).join('')}</tbody>
        </table>
      </div>
      <button class="btn-excel" style="width:100%;margin-top:10px" onclick="window._exportFiscalDetalhe('${re}','${linha}','${pos}','${per}')">↓ Exportar Excel</button>`;
    $('modalBg').classList.add('open');
  };

  window._exportFiscalDetalhe=function(re,linha,pos,per){
    const sentidoBool=pos==='tp';
    const d=[...dadosFiltrado.filter(i=>{
      if(i.linha!==linha)return false;
      const s=(i.sentido===true||i.sentido==='true');
      if(s!==sentidoBool)return false;
      const h=hora(i.horario_programado_partida);
      return h>=0&&periodoViagem(h)===per;
    })].sort((a,b)=>new Date(a.horario_programado_partida)-new Date(b.horario_programado_partida));
    const hdrs=['Seq','TB','Prefixo','H. Programado','Início Registrado','Início Reg. Por','GPS','Cód Evento','Motivo','Status'];
    const rows=d.map((i,idx)=>{
      const temH=!!i.horario_fiscal_partida;
      const temCod=i.cod_perda!=null&&String(i.cod_perda).trim()!=='';
      return[idx+1,i.tabela||'',i.veiculo||'',fmtH(i.horario_programado_partida),temH?fmtH(i.horario_fiscal_partida):'—',fmtRE(i.fiscal_partida),fmtH(i.horario_gps_partida),i.cod_perda??'',i.cod_perda!=null?nomeM(String(i.cod_perda)):'',temH||temCod?'MARCOU':'NÃO MARCOU'];
    });
    csvDL([hdrs,...rows],`fiscal_${re}_${fmtLinha(linha)}_${pos}_${per}`);
  };

  window.fecharModal=()=>$('modalBg').classList.remove('open');
  $('modalBg')?.addEventListener('click',e=>{if(e.target===$('modalBg'))fecharModal();});
  window.setTipoDia=function(tipo,btn){tipoDiaAtivo=tipo;['tdTodos','tdUtil','tdSab','tdDom'].forEach(id=>$(id)?.classList.remove('on'));btn.classList.add('on');};
  window.setPeriodo=function(p,btn){periodoAtivo=p;document.querySelectorAll('.period-tab').forEach(b=>b.classList.remove('on'));btn.classList.add('on');renderEvolucao(dadosFiltrado);};

  function csvDL(rows,nome){const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\n');const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'})),download:nome+'.csv'});a.click();URL.revokeObjectURL(a.href);}
  function expCompleto(dados,nome){const hdrs=['Data','Linha','Veículo','Sentido','Horário Prog','Horário Fiscal','Horário GPS','Perda','Cód Perda','Nome Motivo','Fiscal Partida','Fiscal Chegada','TB'];const rows=dados.map(i=>[(i.data||'').substring(0,10),i.linha||'',i.veiculo||'',i.sentido?'Ida':'Volta',fmtH(i.horario_programado_partida),fmtH(i.horario_fiscal_partida||i.horario_gps_partida),fmtH(i.horario_gps_partida),ehP(i)?'SIM':'NÃO',i.cod_perda??'',i.cod_perda!=null?nomeM(String(i.cod_perda)):'',fmtRE(i.fiscal_partida),fmtRE(i.fiscal_chegada),i.tabela||'']);csvDL([hdrs,...rows],nome);}

  $('btnExcelTop')?.addEventListener('click',()=>expCompleto(dadosFiltrado,'viagens_nimer'));
  $('btnExcelRanking')?.addEventListener('click',()=>{const hdrs=['Linha','Prog','Real','Perdas','% ICV','% Perda'];csvDL([hdrs,...sortArr(_rankData,'perdas',false).map(r=>[r.l,r.prog,r.real,r.perdas,r.icv+'%',r.perdaPct+'%'])],'nimer_ranking');});
  $('btnExcelDetalhe')?.addEventListener('click',()=>expCompleto(dadosFiltrado,'nimer_detalhe'));
  $('btnExcelFiscais')?.addEventListener('click',()=>{const hdrs=['RE Fiscal','Linha','Sentido','Período','Hora Pegada','Qtd Viagem Responsável','Qtd Viagem Marcada','Qtd Viagem Não Marcada','% Cobertura','Performance'];csvDL([hdrs,..._fiscaisData.map(f=>[f.re,fmtLinha(f.linha),f.sentidoLabel,_periodoLabel(f.periodo),f.primeiraHora+'h',f.responsavel,f.marcadas,f.naoMarcadas,f.cobertura+'%',f.cobertura>=90?'Bom':f.cobertura>=75?'Regular':'Crítico'])],'nimer_fiscais');});

  async function consultar(){setLoading(true);try{const ini=$('dataInicio')?.value;const fim=$('dataFim')?.value;const params={};if(ini)params.data_inicio=ini;if(fim)params.data_fim=fim;dadosRaw=await buscarTodos(params);dadosFiltrado=aplicarFiltros(dadosRaw);popularLinhas(dadosRaw);const badge=$('badgeDatasReais');if(badge&&ini){const[y,m,d]=ini.split('-');badge.style.display='block';badge.textContent=`Exibindo dados de: ${d}/${m}/${y}${ini!==fim&&fim?' até '+fim.split('-').reverse().join('/'):''}`;}renderDashboard(dadosFiltrado);}catch(e){log('Erro: '+e.message,'erro');}finally{setLoading(false);}}
  $('btnConsultar')?.addEventListener('click',consultar);
  $('btnReset')?.addEventListener('click',()=>{['selGaragem','selLinha','selVeiculo','selFiscal','selSentido'].forEach(id=>{const e=$(id);if(e)e.value='';});const li=$('selLinhaInput');if(li)li.value='';_atualizarLinhas();tipoDiaAtivo='todos';['tdTodos','tdUtil','tdSab','tdDom'].forEach(id=>$(id)?.classList.remove('on'));$('tdTodos')?.classList.add('on');inicializarDatas();dadosFiltrado=aplicarFiltros(dadosRaw);renderDashboard(dadosFiltrado);});

  // ═══════════════════════════════════════════════════
  // CUMPRIMENTO DE VIAGENS — Tabela interativa
  // ═══════════════════════════════════════════════════
  let _cumpDiaAtivo = 'todos', _cumpPeriodo = 'diario';
  let _cumpSort = { col: 'media', asc: true };
  let chartCumpResumo = null;

  // Botões de controle
  document.querySelectorAll('[data-cump-dia]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-cump-dia]').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      _cumpDiaAtivo = btn.dataset.cumpDia;
      renderCumprimento(dadosFiltrado);
    });
  });
  document.querySelectorAll('[data-cump-periodo]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-cump-periodo]').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      _cumpPeriodo = btn.dataset.cumpPeriodo;
      renderCumprimento(dadosFiltrado);
    });
  });
  // Local filters auto-update
  ['cumpGaragem','cumpLinha','cumpLote'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('change', () => renderCumprimento(dadosFiltrado));
  });

  function corCump(v) {
    if (v >= 102) return 'cump-purple';
    if (v >= 97) return 'cump-green';
    if (v < 70) return 'cump-black';
    return 'cump-red';
  }

  function popularFiltrosCump(dados) {
    const garagens = [...new Set(dados.map(i => getGaragem(i.linha)).filter(Boolean))].sort();
    const linhas = [...new Set(dados.map(i => i.linha).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    const lotes = [...new Set(dados.map(i => getLote(i.linha)).filter(Boolean))].sort();
    const selG = $('cumpGaragem'), selL = $('cumpLinha'), selLo = $('cumpLote');
    if (selG) { selG.innerHTML = '<option value="">Todas</option>' + garagens.map(g => `<option value="${g}">${g}</option>`).join(''); }
    if (selL) { selL.innerHTML = '<option value="">Todas</option>' + linhas.map(l => `<option value="${l}">${fmtLinha(l)}</option>`).join(''); }
    if (selLo) { selLo.innerHTML = '<option value="">Todos</option>' + lotes.map(l => `<option value="${l}">${l}</option>`).join(''); }
  }

  function filtrarCump(dados) {
    const gar = ($('cumpGaragem')?.value || '');
    const lin = ($('cumpLinha')?.value || '').toLowerCase();
    const lot = ($('cumpLote')?.value || '');
    let f = dados;
    if (gar) f = f.filter(i => getGaragem(i.linha) === gar);
    if (lin) f = f.filter(i => (i.linha || '').toLowerCase() === lin);
    if (lot) f = f.filter(i => getLote(i.linha) === lot);
    if (_cumpDiaAtivo !== 'todos') {
      f = f.filter(i => tipoDiaDaData(i.data || i.horario_programado_partida) === _cumpDiaAtivo);
    }
    return f;
  }

  function buildCumpData(dados) {
    // Group by line x period key
    const lineMap = {};
    dados.forEach(i => {
      const l = i.linha || '—';
      const rawDate = (i.data || i.horario_programado_partida || '').substring(0, 10);
      if (!rawDate) return;
      let key;
      if (_cumpPeriodo === 'semanal') {
        const dt = new Date(rawDate);
        const dow = dt.getDay() || 7;
        const seg = new Date(dt);
        seg.setDate(dt.getDate() - dow + 1);
        key = seg.toISOString().substring(0, 10);
      } else if (_cumpPeriodo === 'mensal') {
        key = rawDate.substring(0, 7);
      } else if (_cumpPeriodo === 'anual') {
        key = rawDate.substring(0, 4);
      } else {
        key = rawDate;
      }
      if (!lineMap[l]) lineMap[l] = {};
      if (!lineMap[l][key]) lineMap[l][key] = { prog: 0, real: 0, perdas: 0, motivos: {} };
      lineMap[l][key].prog++;
      if (!ehP(i)) lineMap[l][key].real++;
      else {
        lineMap[l][key].perdas++;
        const cod = i.cod_perda != null ? String(i.cod_perda) : 'N/I';
        lineMap[l][key].motivos[cod] = (lineMap[l][key].motivos[cod] || 0) + 1;
      }
    });
    // Get all period keys sorted
    const allKeys = [...new Set(Object.values(lineMap).flatMap(m => Object.keys(m)))].sort();
    // Build rows
    const rows = Object.entries(lineMap).map(([linha, periods]) => {
      let totalProg = 0, totalReal = 0;
      const cells = {};
      allKeys.forEach(k => {
        const d = periods[k] || { prog: 0, real: 0, perdas: 0, motivos: {} };
        totalProg += d.prog;
        totalReal += d.real;
        const pct = d.prog > 0 ? parseFloat((d.real / d.prog * 100).toFixed(1)) : null;
        cells[k] = { pct, prog: d.prog, real: d.real, perdas: d.perdas, motivos: d.motivos };
      });
      const media = allKeys.length > 0 ? parseFloat((allKeys.reduce((s, k) => s + (cells[k].pct ?? 0), 0) / allKeys.filter(k => cells[k].pct !== null).length).toFixed(1)) : 0;
      const total = totalProg > 0 ? parseFloat((totalReal / totalProg * 100).toFixed(1)) : 0;
      return { linha, cells, allKeys, media, total, totalProg, totalReal, totalPerdas: totalProg - totalReal };
    });
    return { rows, allKeys };
  }

  function formatPeriodLabel(key) {
    if (_cumpPeriodo === 'anual') return key;
    if (_cumpPeriodo === 'mensal') {
      const [y, m] = key.split('-');
      const ms = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
      return ms[parseInt(m) - 1] + '/' + y.slice(2);
    }
    if (_cumpPeriodo === 'semanal') {
      const [, m, d] = key.split('-');
      return 'Sem ' + d + '/' + m;
    }
    const [, m, d] = key.split('-');
    return d + '/' + m;
  }

  function renderCumprimento(dados) {
    const filtered = filtrarCump(dados);
    popularFiltrosCump(dados);
    const { rows, allKeys } = buildCumpData(filtered);

    // Sort rows
    const sorted = [...rows].sort((a, b) => {
      const va = a[_cumpSort.col] ?? 0, vb = b[_cumpSort.col] ?? 0;
      if(_cumpSort.col==='linha'){
        return _cumpSort.asc?String(va).localeCompare(String(vb),undefined,{numeric:true}):String(vb).localeCompare(String(va),undefined,{numeric:true});
      }
      return _cumpSort.asc ? va - vb : vb - va;
    });

    // Render header
    const thead = $('cumpHead');
    if (thead) {
      const sortIcon = col => _cumpSort.col === col ? (_cumpSort.asc ? ' ↑' : ' ↓') : ' ↕';
      thead.innerHTML = '<tr>' +
        '<th onclick="window.sortCump(\'linha\')">Linha' + sortIcon('linha') + '</th>' +
        allKeys.map(k => '<th>' + formatPeriodLabel(k) + '</th>').join('') +
        '<th onclick="window.sortCump(\'media\')" style="background:rgba(99,102,241,0.08);color:var(--primary)">Média' + sortIcon('media') + '</th>' +
        '<th onclick="window.sortCump(\'total\')" style="background:rgba(99,102,241,0.08);color:var(--primary)">Total' + sortIcon('total') + '</th>' +
        '</tr>';
    }

    // Render body
    const tbody = $('cumpBody');
    if (tbody) {
      tbody.innerHTML = sorted.length ? sorted.map(row => {
        const dateCells = allKeys.map(k => {
          const c = row.cells[k];
          if (!c || c.pct === null) return '<td style="color:var(--muted)">—</td>';
          const cls = corCump(c.pct);
          return `<td class="${cls}" data-cump-info="${encodeURIComponent(JSON.stringify({ linha: row.linha, key: k, label: formatPeriodLabel(k), prog: c.prog, real: c.real, perdas: c.perdas, motivos: c.motivos }))}" onclick="window.drillCump(this)">${c.pct}%</td>`;
        }).join('');
        const mediaCls = corCump(row.media);
        const totalCls = corCump(row.total);
        return `<tr>` +
          `<td>${fmtLinha(row.linha)}</td>` +
          dateCells +
          `<td class="${mediaCls}" style="font-weight:900;background:rgba(99,102,241,0.03)" data-cump-info="${encodeURIComponent(JSON.stringify({ linha: row.linha, key: 'media', label: 'Média', prog: row.totalProg, real: row.totalReal, perdas: row.totalPerdas, motivos: {} }))}" onclick="window.drillCump(this)">${row.media}%</td>` +
          `<td class="${totalCls}" style="font-weight:900;background:rgba(99,102,241,0.03)" data-cump-info="${encodeURIComponent(JSON.stringify({ linha: row.linha, key: 'total', label: 'Total', prog: row.totalProg, real: row.totalReal, perdas: row.totalPerdas, motivos: {} }))}" onclick="window.drillCump(this)">${row.total}%</td>` +
          `</tr>`;
      }).join('') : '<tr><td colspan="' + (allKeys.length + 3) + '" style="color:var(--muted);text-align:center;padding:20px">Sem dados para o período selecionado</td></tr>';
    }

    // Render summary chart
    renderCumpChart(sorted, allKeys);
  }

  function renderCumpChart(rows, allKeys) {
    const el = $('cCumprimento');
    if (!el) return;
    if (chartCumpResumo) chartCumpResumo.destroy();
    const worst20 = [...rows].sort((a, b) => a.total - b.total).slice(0, 20);
    const labels = worst20.map(r => fmtLinha(r.linha));
    const values = worst20.map(r => r.total);
    const colors = values.map(v => {
      if (v >= 102) return '#a855f7';
      if (v >= 97) return '#22c55e';
      if (v < 70) return '#64748b';
      return '#ef4444';
    });
    chartCumpResumo = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: [{ label: '% Cumprimento', data: values, backgroundColor: colors, borderRadius: 4 }] },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ctx.raw + '%' } }
        },
        scales: {
          x: { min: 0, max: 110, ticks: { callback: v => v + '%', font: { size: 9 } }, grid: { color: 'rgba(56,78,130,0.12)' } },
          y: { ticks: { font: { size: 10 } }, grid: { display: false } }
        }
      }
    });
  }

  // Tooltip on hover
  const tooltip = $('cumpTooltip');
  document.addEventListener('mouseover', e => {
    const td = e.target.closest('[data-cump-info]');
    if (!td || !tooltip) return;
    try {
      const info = JSON.parse(decodeURIComponent(td.dataset.cumpInfo));
      const motArr = Object.entries(info.motivos).sort((a, b) => b[1] - a[1]).slice(0, 3);
      tooltip.innerHTML = `
        <div class="cump-tooltip-title">${fmtLinha(info.linha)} — ${info.label}</div>
        <div class="cump-tooltip-row"><span class="cump-tooltip-label">Programado:</span><span class="cump-tooltip-val" style="color:var(--primary)">${fmt(info.prog)}</span></div>
        <div class="cump-tooltip-row"><span class="cump-tooltip-label">Realizado:</span><span class="cump-tooltip-val" style="color:var(--success)">${fmt(info.real)}</span></div>
        <div class="cump-tooltip-row"><span class="cump-tooltip-label">Perda:</span><span class="cump-tooltip-val" style="color:var(--danger)">${fmt(info.perdas)}</span></div>
        ${motArr.length ? '<div class="cump-tooltip-motivos"><div class="cump-tooltip-motivos-title">Top motivos de perda:</div>' + motArr.map(([cod, cnt]) => '<div style="color:var(--text-secondary)">' + nomeM(cod) + ' <b style="color:var(--danger)">' + cnt + 'x</b></div>').join('') + '</div>' : ''}
      `;
      tooltip.style.display = 'block';
    } catch (e) {}
  });
  document.addEventListener('mousemove', e => {
    if (!tooltip || tooltip.style.display === 'none') return;
    const x = Math.min(e.clientX + 12, window.innerWidth - 260);
    const y = Math.min(e.clientY + 12, window.innerHeight - 200);
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  });
  document.addEventListener('mouseout', e => {
    if (!e.target.closest('[data-cump-info]') && tooltip) tooltip.style.display = 'none';
  });

  // Sort cumprimento
  window.sortCump = function(col) {
    if (_cumpSort.col === col) _cumpSort.asc = !_cumpSort.asc;
    else { _cumpSort.col = col; _cumpSort.asc = col === 'linha'; }
    renderCumprimento(dadosFiltrado);
  };

  // Drill-down on click
  window.drillCump = function(td) {
    try {
      const info = JSON.parse(decodeURIComponent(td.dataset.cumpInfo));
      // Filter data for this line and period
      let d = dadosFiltrado.filter(i => i.linha === info.linha);
      if (info.key !== 'media' && info.key !== 'total') {
        d = d.filter(i => {
          const rawDate = (i.data || i.horario_programado_partida || '').substring(0, 10);
          if (_cumpPeriodo === 'diario') return rawDate === info.key;
          if (_cumpPeriodo === 'semanal') {
            const dt = new Date(rawDate);
            const dow = dt.getDay() || 7;
            const seg = new Date(dt);
            seg.setDate(dt.getDate() - dow + 1);
            return seg.toISOString().substring(0, 10) === info.key;
          }
          if (_cumpPeriodo === 'mensal') return rawDate.substring(0, 7) === info.key;
          if (_cumpPeriodo === 'anual') return rawDate.substring(0, 4) === info.key;
          return true;
        });
      }
      d.sort((a, b) => new Date(a.horario_programado_partida) - new Date(b.horario_programado_partida));
      const prog = d.length, perdas = d.filter(ehP).length, real = prog - perdas;
      const pct = prog > 0 ? (real / prog * 100).toFixed(1) : '0.0';
      $('modalTitulo').textContent = `Detalhes — ${fmtLinha(info.linha)} · ${info.label}`;
      $('modalConteudo').innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">
          ${[['Programadas', 'var(--primary)', fmt(prog)], ['Realizadas', 'var(--success)', fmt(real)], ['Perdidas', 'var(--danger)', fmt(perdas)], ['% Cumprimento', corCump(parseFloat(pct)).replace('cump-','') === 'purple' ? '#a855f7' : corCump(parseFloat(pct)).replace('cump-','') === 'green' ? 'var(--success)' : corCump(parseFloat(pct)).replace('cump-','') === 'black' ? '#64748b' : 'var(--danger)', pct + '%']].map(([lb, cor, val]) => `<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center"><div style="font-size:9px;color:var(--text-secondary);text-transform:uppercase;margin-bottom:3px">${lb}</div><div style="font-size:18px;font-weight:900;color:${cor}">${val}</div></div>`).join('')}
        </div>
        <div style="overflow-x:auto;max-height:420px;overflow-y:auto">
          <table class="ntbl">
            <thead style="position:sticky;top:0;background:var(--card-solid);z-index:1">
              <tr><th>Seq</th><th>Data</th><th>TB</th><th>Veículo</th><th>Sentido</th><th>H.Prog</th><th>H.Fiscal</th><th>H.GPS</th><th>Status</th><th>Cód</th><th>Motivo</th></tr>
            </thead>
            <tbody>
              ${d.map((i, idx) => {
                const p = ehP(i);
                return '<tr style="background:' + (p ? 'rgba(239,68,68,0.03)' : '') + '">' +
                  '<td style="color:var(--muted)">' + (idx + 1) + '</td>' +
                  '<td>' + ((i.data || '').substring(0, 10).split('-').reverse().join('/')) + '</td>' +
                  '<td style="font-family:monospace;color:var(--text-secondary)">' + (i.tabela || '—') + '</td>' +
                  '<td style="font-weight:700">' + (i.veiculo || '—') + '</td>' +
                  '<td>' + (i.sentido ? 'Ida' : 'Volta') + '</td>' +
                  '<td style="font-family:monospace">' + fmtH(i.horario_programado_partida) + '</td>' +
                  '<td style="font-family:monospace;color:var(--warning)">' + fmtH(i.horario_fiscal_partida) + '</td>' +
                  '<td style="font-family:monospace;color:var(--text-secondary)">' + fmtH(i.horario_gps_partida) + '</td>' +
                  '<td><span style="background:' + (p ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)') + ';color:' + (p ? 'var(--danger)' : 'var(--success)') + ';padding:2px 8px;border-radius:4px;font-size:9px;font-weight:800">' + (p ? 'PERDIDA' : 'OK') + '</span></td>' +
                  '<td style="color:var(--warning)">' + (i.cod_perda != null ? i.cod_perda : '—') + '</td>' +
                  '<td style="color:var(--text-secondary);font-size:10px">' + (i.cod_perda != null ? nomeM(String(i.cod_perda)) : '—') + '</td>' +
                '</tr>';
              }).join('')}
            </tbody>
          </table>
        </div>
        <button class="btn-excel" style="width:100%;margin-top:10px" onclick="window._exportCumpDrill()">↓ Exportar Excel</button>
      `;
      window._cumpDrillData = d;
      $('modalBg').classList.add('open');
    } catch (e) { console.error(e); }
  };

  window._exportCumpDrill = function() {
    const d = window._cumpDrillData || [];
    const hdrs = ['Seq','Data','TB','Veículo','Sentido','H.Programado','H.Fiscal','H.GPS','Status','Cód Perda','Motivo'];
    const rows = d.map((i, idx) => [idx+1, (i.data||'').substring(0,10), i.tabela||'', i.veiculo||'', i.sentido?'Ida':'Volta', fmtH(i.horario_programado_partida), fmtH(i.horario_fiscal_partida), fmtH(i.horario_gps_partida), ehP(i)?'PERDIDA':'OK', i.cod_perda??'', i.cod_perda!=null?nomeM(String(i.cod_perda)):'']);
    csvDL([hdrs, ...rows], 'cumprimento_detalhe');
  };

  // Excel export for cumprimento table
  $('btnExcelCump')?.addEventListener('click', () => {
    const filtered = filtrarCump(dadosFiltrado);
    const { rows, allKeys } = buildCumpData(filtered);
    const hdrs = ['Linha', ...allKeys.map(formatPeriodLabel), 'Média (%)', 'Total (%)'];
    const csvRows = rows.map(r => [fmtLinha(r.linha), ...allKeys.map(k => r.cells[k]?.pct ?? ''), r.media, r.total]);
    csvDL([hdrs, ...csvRows], 'cumprimento_viagens');
  });

  try{setLoading(true);log('Iniciando portal...','info');await carregarMapaGaragens();const ontem=new Date(Date.now()-86400000).toISOString().substring(0,10);DATA_PADRAO=ontem;inicializarDatas();dadosRaw=await buscarTodos({data_inicio:ontem,data_fim:ontem});if(!dadosRaw.length){log('D-1 sem dados, tentando D-2...','warn');const d2=new Date(Date.now()-2*86400000).toISOString().substring(0,10);DATA_PADRAO=d2;inicializarDatas();dadosRaw=await buscarTodos({data_inicio:d2,data_fim:d2});}dadosFiltrado=dadosRaw;popularLinhas(dadosRaw);renderDashboard(dadosFiltrado);}catch(e){log('Erro init: '+e.message,'erro');}finally{setLoading(false);}
});
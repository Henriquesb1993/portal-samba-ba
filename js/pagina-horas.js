const PaginaHoras = {

dados:{

kpis:{
prog:"9.865h",
real:"10.360h",
pct:"105%",
desvio:"950h",
he:"+495h",
hnr:"89h"
},

linhas:[
{
id:"8012-10",
gar:"Garagem A",
lote:"Lote 1",
ttp:"950m",
ttr:"19h50m",
pct:"108.3%"
},
{
id:"8021-10",
gar:"Garagem B",
lote:"Lote 2",
ttp:"773m",
ttr:"14h55m",
pct:"97.3%"
},
{
id:"8022-10",
gar:"Garagem C",
lote:"Lote 3",
ttp:"773m",
ttr:"14h55m",
pct:"98.0%"
},
{
id:"8050-10",
gar:"Garagem B",
lote:"Lote 4",
ttp:"820m",
ttr:"16h00m",
pct:"110%"
}
]

},

render(){

document.getElementById("app").innerHTML = this.template()

this.injetarKPIs()
this.injetarTabela()

},

template(){

return `

<div class="page-content">

<div class="kpis">

<div class="kpi bl">
<div class="kpi-lbl">TT Horas Prog.</div>
<div class="kpi-val" id="kpi-prog">—</div>
</div>

<div class="kpi gr">
<div class="kpi-lbl">TT Horas Real.</div>
<div class="kpi-val" id="kpi-real">—</div>
</div>

<div class="kpi gr">
<div class="kpi-lbl">% Realização</div>
<div class="kpi-val" id="kpi-pct">—</div>
</div>

<div class="kpi rd">
<div class="kpi-lbl">Desvio Extra</div>
<div class="kpi-val" id="kpi-desvio">—</div>
</div>

<div class="kpi or">
<div class="kpi-lbl">Hora Extra</div>
<div class="kpi-val" id="kpi-he">—</div>
</div>

<div class="kpi bl">
<div class="kpi-lbl">HNR</div>
<div class="kpi-val" id="kpi-hnr">—</div>
</div>

</div>


<div class="card">

<div class="card-title">
Detalhamento por Linha
</div>

<table class="tbl">

<thead>
<tr>
<th>Linha</th>
<th>Garagem</th>
<th>Lote</th>
<th>TT Prog</th>
<th>TT Real</th>
<th>%</th>
</tr>
</thead>

<tbody id="tbl-linhas"></tbody>

</table>

</div>

</div>

`

},

injetarKPIs(){

const k = this.dados.kpis

document.getElementById("kpi-prog").innerText = k.prog
document.getElementById("kpi-real").innerText = k.real
document.getElementById("kpi-pct").innerText = k.pct
document.getElementById("kpi-desvio").innerText = k.desvio
document.getElementById("kpi-he").innerText = k.he
document.getElementById("kpi-hnr").innerText = k.hnr

},

injetarTabela(){

let html=""

this.dados.linhas.forEach(l=>{

html += `

<tr>
<td>${l.id}</td>
<td>${l.gar}</td>
<td>${l.lote}</td>
<td>${l.ttp}</td>
<td>${l.ttr}</td>
<td>${l.pct}</td>
</tr>

`

})

document.getElementById("tbl-linhas").innerHTML = html

}

}

const PaginaHoras = {

render(){

document.getElementById("app").innerHTML = `

<div class="card">
<h2>Cumprimento de Horas - Operação</h2>
<p>Horas Programadas vs Realizadas</p>
</div>

<div class="card">
<h3>KPIs</h3>
<div class="kpi">TT Horas Prog: 9.865h</div>
<div class="kpi">TT Horas Real: 10.360h</div>
<div class="kpi">% Realização: 105%</div>
<div class="kpi">Desvio Extra: 950h</div>
<div class="kpi">Hora Extra: +495h</div>
<div class="kpi">HNR: 89h</div>
</div>

<div class="card">
<h3>Integração API</h3>
<p>${CONFIG.API_URL}</p>
<button onclick="alert('Simulação de conexão com API')">Conectar API</button>
</div>

<div class="card">
<h3>Tabela de Horas</h3>
<table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;color:white;">
<tr>
<th>Linha</th>
<th>Garagem</th>
<th>Lote</th>
<th>TT Prog</th>
<th>TT Real</th>
<th>%</th>
</tr>
<tr>
<td>8012-10</td>
<td>Garagem A</td>
<td>Lote 1</td>
<td>950m</td>
<td>19h50m</td>
<td>108.3%</td>
</tr>
<tr>
<td>8021-10</td>
<td>Garagem B</td>
<td>Lote 2</td>
<td>773m</td>
<td>14h55m</td>
<td>97.3%</td>
</tr>
</table>
</div>

`

}

}

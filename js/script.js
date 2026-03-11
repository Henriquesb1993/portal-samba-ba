const Router = {

paginaAtual:null,

init(){

this.abrirPagina("horas")

},

abrirPagina(nome){

if(nome==="horas"){
PaginaHoras.render()
}

if(nome==="viagens"){
PaginaViagens.render()
}

}

}

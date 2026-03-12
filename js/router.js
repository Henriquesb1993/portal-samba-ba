const Router = {

paginaAtual:null,

init(){
this.abrirPagina("horas")
},

abrirPagina(nome){

this.paginaAtual = nome

if(nome === "horas"){
PaginaHoras.render()
}

if(nome === "viagens"){
PaginaViagens.render()
}

if(nome === "recarga"){
PaginaRecarga.render()
}

}

}

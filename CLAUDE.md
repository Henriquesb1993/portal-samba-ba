# CLAUDE.md â€” Portal Samba-iba

## Visao Geral

Portal operacional web da empresa **Samba-iba** (Viagens Nimer), desenvolvido em HTML/CSS/JavaScript puro (sem framework, sem backend). Serve como painel de controle para monitoramento de operacoes de transporte.

- **Versao:** 1.0
- **Linguagem:** JavaScript (Vanilla), HTML5, CSS3
- **Tipo:** SPA estatico (Single Page Application)
- **Hospedagem:** GitHub Pages -> https://henriquesb1993.github.io/portal-samba-ba/
- **Autenticacao:** localStorage/sessionStorage (sem servidor)

---

## Estrutura de Arquivos

```
portal-samba-ba/
+-- index.html                    # Entry point -- redireciona para login.html ou pages/horas.html
+-- login.html                    # Pagina de login com validacao de credenciais
+-- README.md
+-- assets/
|   +-- logo.png                  # Logo da empresa (34 KB)
+-- css/
|   +-- base.css                  # Reset e variaveis globais
|   +-- horas.css                 # Estilos da pagina de horas
|   +-- layout.css                # Layout sidebar + main (8.7 KB)
|   +-- simulador_recarga.css     # Estilos do simulador de recarga eletrica (16 KB)
|   +-- style.css                 # Estilos globais (6.8 KB)
+-- data/
|   +-- dados.json                # Dados gerais
|   +-- horas.json                # Cache de horas trabalhadas (5.8 KB)
|   +-- viagens.json              # Cache de viagens (13 KB)
|   +-- vr.json                   # Dados de Vale Refeicao
+-- js/
|   +-- auth.js                   # Sistema de autenticacao completo (v3)
|   +-- auth-guard.js             # Protecao de rotas (2.5 KB)
|   +-- config.js                 # Configuracao global (API_URL, TOKEN, EMPRESA)
|   +-- router.js                 # Roteador simples entre horas/viagens/recarga
|   +-- pagina-horas.js           # Controller da pagina de horas (21 KB)
|   +-- pagina-viagens.js         # Controller da pagina de viagens (219 bytes)
|   +-- simulador_recarga.js      # Logica do simulador de recarga (64 KB)
|   +-- core/
|   |   +-- navigation.js         # Logica de navegacao e sidebar
|   +-- modules/
|       +-- horas.js              # Modulo de horas (46 KB) -- busca paralela 8 dias
|       +-- recarga.js            # Modulo de recarga (37 KB)
|       +-- simulador_recarga.js  # Modulo simulador de recarga (64 KB)
|       +-- viagens.js            # Modulo de viagens (33 KB) -- filtragem por linha/dia
|       +-- viagens_nimer.js      # Modulo de viagens Nimer (33 KB)
|       +-- vr.js                 # Modulo de Vale Refeicao (866 bytes)
+-- pages/
    +-- horas.html                # Dashboard de horas realizadas (20 KB)
    +-- viagens.html              # Dashboard de viagens realizadas Nimer (20 KB)
    +-- viagens_sim.html          # Viagens realizadas SIM (48 KB)
    +-- pontualidade_sim.html     # Pontualidade de partidas SIM (39 KB)
    +-- simulador_recarga.html    # Simulador de recarga eletrica (14 KB)
    +-- permissoes.html           # Gestao de permissoes de menu (10 KB)
    +-- usuarios.html             # Gestao de usuarios (18 KB)
    +-- vr.html                   # Gestao de Vale Refeicao (2 KB)
    +-- em_desenvolvimento.html   # Pagina placeholder (em dev)
```

---

## Configuracao (js/config.js)

```javascript
const CONFIG = {
  API_URL: 'https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_horas_nimer',
  API_TOKEN: '<token>',
  EMPRESA: "Samba'iba",
  VERSAO: '1.0'
}
```

---

## Sistema de Autenticacao (js/auth.js v3)

Autenticacao 100% client-side usando **localStorage** e **sessionStorage**.

### Credenciais Padrao

| Login | Senha | Perfil |
|-------|-------|--------|
| admin | admin123 | ADMIN (5) |
| gerente | ger123 | GERENTE (4) |
| supervisor | sup123 | SUPERVISOR (3) |
| operador | op123 | OPERADOR (2) |
| viewer | view123 | VISUALIZADOR (1) |

### Regras
- Sessao expira apos **30 minutos** de inatividade
- Bloqueio automatico apos **5 tentativas** de login erradas
- Apenas ADMIN acessa Gestao de Usuarios e Permissoes
- Log de acesso armazenado (ultimos 200 registros) em sb_access_log

### Chaves localStorage/sessionStorage
- sb_users -- lista de usuarios
- sb_perms -- permissoes de menu por perfil
- sb_session -- sessao atual (sessionStorage)
- sb_access_log -- historico de logins

---

## Modulos Funcionais

### Horas Realizadas (pages/horas.html)
- Busca paralela de 8 dias via API externa
- Tabela por colaborador: H.Normal / H.Extra / Refeicao / Func / Pegada / Largada
- Limite de 5000 registros por request (maximo da API)

### Viagens Realizadas Nimer (pages/viagens.html)
- Consulta por dia com filtro por linha (dropdown)
- Campos: total_viagens_prog / viagens_monitoradas

### Viagens Realizadas SIM (pages/viagens_sim.html)
- Dashboard de viagens do sistema SIM (48 KB)

### Pontualidade de Partidas SIM (pages/pontualidade_sim.html)
- Analise de pontualidade das partidas (39 KB)

### Simulador de Recarga (pages/simulador_recarga.html)
- Simulacao de recarga eletrica de frota (modulo mais pesado: 64 KB)

### Gestao de VR (pages/vr.html)
- Controle de Vale Refeicao

### Gestao de Usuarios (pages/usuarios.html)
- CRUD de usuarios (apenas ADMIN)

### Permissoes de Menu (pages/permissoes.html)
- Configuracao de acesso por perfil (apenas ADMIN)

---

## Menu de Navegacao

| ID | Label | Secao | Rota |
|----|-------|-------|------|
| horas | Horas Realizadas | Operacao | pages/horas.html |
| viagens_nimer | Viagens Realizadas Nimer | Operacao | pages/viagens.html |
| viagens_sim | Viagens Realizadas SIM | Operacao | pages/viagens_sim.html |
| pontualidade | Pontualidade de Partidas SIM | Operacao | pages/pontualidade_sim.html |
| icf | ICF | Operacao | em_desenvolvimento.html |
| multas | Multas RESAM e DSV | Operacao | em_desenvolvimento.html |
| jornada | Jornada Incompleta | Operacao | em_desenvolvimento.html |
| operadores | Operadores | Operacao | em_desenvolvimento.html |
| financeiro | Financeiro | Gestao | em_desenvolvimento.html |
| manutencao | Manutencao | Gestao | em_desenvolvimento.html |
| rh | RH | Gestao | em_desenvolvimento.html |
| vr | Gestao de VR | Gestao | pages/vr.html |
| recarga | Simulacao Recarga | Eletrico | pages/simulador_recarga.html |
| indicadores | Indicadores | Estrategico | (em dev) |
| config | Configuracoes | Estrategico | (em dev) |
| usuarios | Gestao de Usuarios | Admin | pages/usuarios.html |
| permissoes | Permissoes de Menu | Admin | pages/permissoes.html |

---

## Como Rodar Localmente

```bash
# Opcao 1 -- npx serve (recomendado)
npx serve . -p 3000
# Acesse: http://localhost:3000

# Opcao 2 -- http-server
npx http-server . -p 3000 --cors

# Opcao 3 -- Live Server (VS Code)
# Instale a extensao Live Server e clique em "Go Live"
```

> ATENCAO: Nao abra os arquivos HTML diretamente (file://) pois o fetch de JSON falha por CORS.

---

## Hospedagem (GitHub Pages)

O portal esta hospedado em:
https://henriquesb1993.github.io/portal-samba-ba/

Para publicar atualizacoes, basta fazer push para a branch main. O GitHub Pages reflete automaticamente.

---

## Fluxo de Navegacao

```
index.html
  +-- sessao ativa --> pages/horas.html (pagina inicial)
  +-- sem sessao --> login.html
        +-- login OK --> pages/horas.html
```

---

## Commits Recentes

- fix: buscarAPI usa data= por dia (paralelo 8 dias) (23/03/2026)
- fix: limit 10000 -> 5000 (API max is 5000) (23/03/2026)
- feat(horas) v9: nova regra refeicao correta, busca paralela 10k (23/03/2026)
- fix: mapItem com total_viagens_prog/viagens_monitoradas (23/03/2026)
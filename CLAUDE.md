# CLAUDE.md — Portal Sambaiba

## Visao Geral

Portal operacional web da empresa **Sambaiba** (Viagens Nimer), desenvolvido em HTML/CSS/JavaScript puro (sem framework, sem backend). Serve como painel de controle para monitoramento de operacoes de transporte.

- **Versao:** 2.0 (Clean)
- **Linguagem:** JavaScript (Vanilla), HTML5, CSS3
- **Tipo:** SPA estatico (Single Page Application)
- **Hospedagem:** GitHub Pages -> https://henriquesb1993.github.io/portal-samba-ba/
- **Autenticacao:** localStorage/sessionStorage (sem servidor)
- **Repo local:** C:\Users\Henrique\portal-samba-ba

---

## Design System (v2.0 Clean)

Redesign completo em 29/03/2026, inspirado no ConduApp.

### Tema
- **Padrao:** Tema claro (#F5F7FA fundo, cards brancos)
- **Alternativo:** Tema escuro (toggle disponivel)
- **Fonte:** DM Sans (principal) + Inter (fallback)
- **Base:** 14px

### CSS Variables (base.css)
Todas as cores DEVEM usar variaveis CSS — nunca hardcoded:
- `--bg: #F5F7FA` — fundo da pagina
- `--bg-soft: #EEF1F6` — fundo secundario
- `--card: #FFFFFF` — fundo de cards
- `--card-solid: #FFFFFF` — cards opacos
- `--border: rgba(37, 99, 235, 0.1)` — bordas
- `--border-light: rgba(37, 99, 235, 0.06)` — bordas sutis
- `--primary: #2563EB` — cor principal (azul)
- `--primary-deep: #1e40af` — azul escuro
- `--primary-soft: rgba(37, 99, 235, 0.08)` — fundo azul sutil
- `--success: #16a34a` / `--warning: #d97706` / `--danger: #dc2626`
- `--text: #1a1a2e` — texto principal
- `--text-secondary: #64748b` — texto secundario
- `--muted: #94a3b8` — texto apagado
- `--sidebar-bg: #0f1d3d` — fundo da sidebar

### REGRA IMPORTANTE
**Nunca usar cores hex escuras hardcoded** em estilos inline (HTML) ou templates JS (innerHTML). Sempre usar `var(--bg)`, `var(--text)`, `var(--border)`, etc. Isso garante que o tema claro/escuro funcione corretamente em todos os elementos.

### Componentes
- **KPIs:** `border-left: 3px solid` (cor do KPI), fundo branco, sombra sutil
- **Botoes:** `border-radius: 20px` para acao, `6px` para formularios
- **Sidebar:** Fundo escuro (#0f1d3d), transicao 0.15s ease, sem will-change
- **Tabelas:** font-size 13px, th com uppercase e letter-spacing 0.8px
- **Cards:** border-radius 12px, box-shadow var(--shadow)

---

## Estrutura de Arquivos

```
portal-samba-ba/
+-- index.html                    # Entry point — redireciona para login ou horas
+-- login.html                    # Pagina de login
+-- README.md
+-- CLAUDE.md                     # Este arquivo
+-- SKILL.md                      # Skill para automacao com Claude AI
+-- assets/
|   +-- logo.png                  # Logo da empresa
+-- css/
|   +-- base.css                  # Reset, variaveis CSS, tema claro/escuro, toggle
|   +-- layout.css                # Sidebar, topbar, cards, KPIs, tabelas, modais
|   +-- style.css                 # Estilos compartilhados (duplica parte do layout)
|   +-- horas.css                 # Estilos especificos de horas (heatmap, garagem)
|   +-- simulador_recarga.css     # Estilos do simulador de recarga eletrica
+-- data/
|   +-- dados.json                # Dados gerais
|   +-- horas.json                # Cache de horas trabalhadas
|   +-- viagens.json              # Cache de viagens
|   +-- vr.json                   # Dados de Vale Refeicao
+-- js/
|   +-- auth.js                   # Sistema de autenticacao completo (v3)
|   +-- auth-guard.js             # Protecao de rotas
|   +-- config.js                 # Configuracao global (API_URL, TOKEN, EMPRESA)
|   +-- theme.js                  # Toggle tema claro/escuro (claro = padrao)
|   +-- router.js                 # Roteador simples
|   +-- pagina-horas.js           # Controller da pagina de horas
|   +-- pagina-viagens.js         # Controller da pagina de viagens
|   +-- simulador_recarga.js      # Logica do simulador de recarga
|   +-- core/
|   |   +-- navigation.js         # Logica de navegacao e sidebar
|   +-- modules/
|       +-- horas.js              # Modulo de horas — busca paralela 8 dias, max 5000/req
|       +-- recarga.js            # Modulo de recarga
|       +-- simulador_recarga.js  # Modulo simulador de recarga
|       +-- viagens.js            # Modulo de viagens — filtragem por linha/dia
|       +-- viagens_nimer.js      # Modulo viagens Nimer — ranking, heatmap, fiscais, motivos
|       +-- vr.js                 # Modulo de Vale Refeicao
+-- pages/
    +-- horas.html                # Dashboard de horas realizadas
    +-- viagens.html              # Dashboard de viagens Nimer (partidas, perdas, fiscais)
    +-- viagens_sim.html          # Viagens realizadas SIM
    +-- pontualidade_sim.html     # Pontualidade de partidas SIM
    +-- simulador_recarga.html    # Simulador de recarga eletrica
    +-- permissoes.html           # Gestao de permissoes de menu (ADMIN)
    +-- usuarios.html             # Gestao de usuarios (ADMIN)
    +-- vr.html                   # Gestao de Vale Refeicao
    +-- em_desenvolvimento.html   # Pagina placeholder
```

---

## Configuracao (js/config.js)

```javascript
const CONFIG = {
  API_URL: 'https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_horas_nimer',
  API_TOKEN: '<token>',
  EMPRESA: "Samba'iba",
  VERSAO: '2.0'
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
- sb_users — lista de usuarios
- sb_perms — permissoes de menu por perfil
- sb_session — sessao atual (sessionStorage)
- sb_access_log — historico de logins
- sb_theme — tema salvo ('light' ou 'dark', padrao light)

---

## Modulos Funcionais

### Horas Realizadas (pages/horas.html)
- Busca paralela de 8 dias via API externa
- Tabela por colaborador: H.Normal / H.Extra / Refeicao / Func / Pegada / Largada
- Limite de 5000 registros por request (maximo da API)
- Graficos: barras por linha, donut por garagem, evolucao, ranking HE
- Heatmap: hora extra por linha x dia

### Viagens Realizadas Nimer (pages/viagens.html)
- Consulta por periodo com filtros: linha, veiculo, fiscal, sentido, tipo de dia
- KPIs: programadas, realizadas, perdidas, % aderencia, % perda, fiscais
- Ranking de linhas com ordenacao
- Heatmap de perdas por faixa horaria
- Motivos de perda com donut chart e lista (mapa NM com codigos 0-22)
- Analise de fiscais por turno (TP/TS manha/tarde)
- Tabela de cumprimento por linha com tooltip detalhado
- Evolucao temporal (diario/semanal/mensal)

### Viagens Realizadas SIM (pages/viagens_sim.html)
- Dashboard de viagens do sistema SIM

### Pontualidade de Partidas SIM (pages/pontualidade_sim.html)
- Analise de pontualidade das partidas

### Simulador de Recarga (pages/simulador_recarga.html)
- Simulacao de recarga eletrica de frota (modulo mais pesado)
- Gantt, mapa de carregadores, matriz de utilizacao

### Gestao de VR (pages/vr.html)
- Controle de Vale Refeicao

### Gestao de Usuarios (pages/usuarios.html)
- CRUD de usuarios (apenas ADMIN)

### Permissoes de Menu (pages/permissoes.html)
- Configuracao de acesso por perfil (apenas ADMIN)

---

## Codigos de Perda (viagens_nimer.js)

| Cod | Nome |
|-----|------|
| 0 | Sem Codigo |
| 1 | Refeicao |
| 2 | Rendicao |
| 3 | Recolhe Normal |
| 4 | Parada Operacional |
| 5 | Retorno a Operacao |
| 6 | Atendimento |
| 8 | Reservado |
| 10 | Fora de Programacao |
| 11 | Termino de Jornada |
| 12 | Manutencao |
| 13 | Atraso da Garagem |
| 14 | Transito |
| 15 | Recolhe Anormal |
| 16 | Recolhe para a Lavagem |
| 17 | Falta de Operador |
| 18 | Realocacao |
| 19 | Ocorrencia |
| 20 | S.O.S |
| 21 | Acidente |
| 22 | Pane Eletrica |

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
# Opcao 1 — npx serve (recomendado)
npx serve . -p 3000
# Acesse: http://localhost:3000

# Opcao 2 — http-server
npx http-server . -p 3000 --cors

# Opcao 3 — Live Server (VS Code)
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

## Historico de Versoes

### v2.0 — Redesign Clean (29/03/2026)
- Tema claro como padrao (inspirado no ConduApp)
- Fonte DM Sans, base 14px
- KPIs com borda esquerda colorida
- Sidebar escura profissional, transicao rapida
- 22 arquivos modificados, ~200 cores hardcoded substituidas por CSS variables
- Mapa de codigos de perda (NM) completo (codigos 0-22)
- Correcao: tooltip donut duplicado, sidebar travando, titulo cortado

### v1.0 — Versao Original (03/2026)
- Tema escuro azul como padrao
- Busca paralela de horas (8 dias, max 5000/req)
- Dashboard de viagens Nimer com ranking, heatmap, fiscais
- Simulador de recarga eletrica
- Sistema de autenticacao client-side com 5 perfis

# Portal Sambaíba - Sistema de Gestão Operacional

Portal web da **Sambaíba (Viagens Nimer)** para gestão operacional de transportes.

🌐 **[Acesse o Portal Online](https://henriquesb1993.github.io/portal-samba-ba/)**

## 📋 Sobre o Sistema

Sistema web desenvolvido em HTML/CSS/JavaScript puro (sem frameworks) para monitoramento e gestão de operações de transporte. Hospedado no GitHub Pages como SPA estático.

### Principais Funcionalidades

- ✅ **Horas Realizadas** - Controle de horas trabalhadas por colaborador
- ✅ **Viagens Realizadas** - Monitoramento de viagens programadas vs realizadas
- ✅ **Pontualidade** - Análise de pontualidade de partidas
- ✅ **Simulador de Recarga** - Simulação de custos de recarga elétrica
- ✅ **Gestão de VR** - Controle de Vale Refeição
- ✅ **Gestão de Usuários** - CRUD de usuários e permissões

## 🤖 Skill para Claude (Automação com IA)

Este repositório inclui uma **skill completa** para automação do portal usando Claude AI!

### O que é uma Skill?

Uma skill é um conjunto de instruções especializadas que ensina o Claude a automatizar tarefas específicas. Com a skill do Portal Sambaíba, você pode pedir ao Claude para:

- 🔐 Fazer login automaticamente
- 📊 Extrair dados de horas trabalhadas
- 🚌 Gerar relatórios de viagens
- ⚡ Simular custos de recarga elétrica
- 👥 Gerenciar usuários e permissões
- 📈 Criar análises comparativas

### Como Instalar a Skill

#### Opção 1: Instalar via Claude.ai (Recomendado)

1. Acesse [claude.ai](https://claude.ai)
2. Clique no ícone de **ferramentas** (🔧) no canto superior direito
3. Vá em **Skills** > **Add Skill**
4. Cole a URL deste repositório ou faça upload do arquivo `SKILL.md`
5. Pronto! A skill está instalada

#### Opção 2: Download Manual

1. [Baixe o SKILL.md](https://raw.githubusercontent.com/Henriquesb1993/portal-samba-ba/main/SKILL.md)
2. No Claude.ai, vá em Skills > Add Skill
3. Faça upload do arquivo `SKILL.md`

### Como Usar a Skill

Após instalar, basta conversar naturalmente com o Claude mencionando o portal:

```
"Acesse o portal sambaíba e extraia as horas dos últimos 8 dias"
"Faça login como admin e mostre a lista de usuários"
"Gere um relatório de viagens da linha 501"
"Simule o custo de recarga para 10 veículos elétricos"
```

O Claude vai automaticamente usar a skill para executar essas tarefas!

### Funcionalidades da Skill

- ✅ Login automático com 5 perfis de acesso
- ✅ Navegação completa por todas as páginas
- ✅ Extração de dados de 6 módulos principais
- ✅ Geração de relatórios em JSON/CSV/Excel
- ✅ Gestão de usuários e permissões (perfil ADMIN)
- ✅ Simulação de custos de recarga elétrica
- ✅ Tratamento automático de erros e sessões

## 🚀 Executar Localmente

```bash
# Opção 1 - npx serve (recomendado)
npx serve . -p 3000

# Opção 2 - http-server
npx http-server . -p 3000 --cors

# Opção 3 - Live Server (VS Code)
# Instale a extensão Live Server e clique em "Go Live"
```

Acesse: `http://localhost:3000`

⚠️ **Importante**: Não abra os arquivos HTML diretamente (`file://`) pois o fetch de JSON falha por CORS.

## 🔐 Credenciais de Acesso

| Login | Senha | Perfil | Nível de Acesso |
|-------|-------|--------|-----------------|
| admin | admin123 | ADMIN | Total (usuários, permissões) |
| gerente | ger123 | GERENTE | Gestão operacional |
| supervisor | sup123 | SUPERVISOR | Supervisão |
| operador | op123 | OPERADOR | Operações básicas |
| viewer | view123 | VISUALIZADOR | Apenas visualização |

## 📁 Estrutura do Projeto

```
portal-samba-ba/
├── SKILL.md                 # Skill para automação com Claude AI ⭐
├── CLAUDE.md                # Documentação técnica do sistema
├── README.md                # Este arquivo
├── index.html               # Entry point
├── login.html               # Página de login
├── assets/                  # Imagens e recursos
├── css/                     # Estilos
├── data/                    # Dados em cache (JSON)
├── js/                      # Lógica JavaScript
│   ├── auth.js             # Sistema de autenticação
│   ├── modules/            # Módulos funcionais
│   └── core/               # Navegação e utilitários
└── pages/                   # Páginas do sistema
    ├── horas.html          # Horas realizadas
    ├── viagens.html        # Viagens Nimer
    ├── viagens_sim.html    # Viagens SIM
    ├── pontualidade_sim.html # Pontualidade
    ├── simulador_recarga.html # Simulador de recarga
    ├── vr.html             # Vale Refeição
    ├── usuarios.html       # Gestão de usuários
    └── permissoes.html     # Permissões de menu
```

## 🛠️ Tecnologias

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Hospedagem**: GitHub Pages
- **Autenticação**: Client-side (localStorage/sessionStorage)
- **API Externa**: Dashboard IPP (horas trabalhadas)

## 📊 Módulos do Sistema

### Operação
- **Horas Realizadas**: Busca paralela de 8 dias, até 5000 registros
- **Viagens Nimer**: Consulta por dia com filtro por linha
- **Viagens SIM**: Dashboard completo do sistema SIM
- **Pontualidade SIM**: Análise de pontualidade de partidas

### Gestão
- **Gestão de VR**: Controle de Vale Refeição
- **Usuários**: CRUD completo (apenas ADMIN)
- **Permissões**: Configuração de acesso por perfil

### Elétrico
- **Simulador de Recarga**: Simulação de custos e tempo de recarga

## 🔄 Atualizar o Portal

O portal está hospedado no GitHub Pages. Para publicar atualizações:

```bash
git add .
git commit -m "Descrição da atualização"
git push origin main
```

As mudanças serão refletidas automaticamente em poucos minutos.

## 📌 Changelog — Histórico de Versões

### v2.1 — Viagens Nimer: Filtros, Fiscais e Melhorias (09/04/2026)
- Filtro de garagem (API sb_linha_garagens) com autocomplete de linhas
- Filtro de linha com busca digitável e ordenação menor→maior
- Troca de `-` por `.` na exibição de linhas em todo o sistema
- Remoção do gráfico "Resumo de Cumprimento por Linha"
- Modal de partidas com abas Ida/Volta e cards dinâmicos
- Rótulos com % nos gráficos (Cumprimento por Faixa Horária e Motivos de Perda)
- Ranking compacto com Top 5 Perdas e Top 5 Melhor ICV ao lado
- Análise de Fiscais reescrita com regra oficial Sambaíba:
  - Período: Manhã 03h–13h59 / Tarde 14h+
  - Identificação por `fiscal_partida` + sentido da viagem (TP/TS)
  - Fiscal predominante por linha+sentido+período
  - Marcação = horário registrado OU código de evento
  - Tabela por garagem (Crítico/Regular/Bom) ao lado
  - Modal detalhado por fiscal com status de cada viagem
- Filtros do Cumprimento de Viagens compactados em linha única
- Correção de ordenação por linha no Cumprimento
- Scroll suave: overscroll-behavior contain em todas as tabelas
- Changelog adicionado ao README

### v2.0 — Redesign Clean (29/03/2026)
- Tema claro como padrão (inspirado no ConduApp)
- Fonte DM Sans, base 14px
- KPIs com borda esquerda colorida
- Sidebar escura profissional, transição rápida
- ~200 cores hardcoded substituídas por CSS variables
- Mapa de códigos de perda (NM) completo (códigos 0-22)
- Correções: tooltip donut duplicado, sidebar travando, título cortado

### v1.0 — Versão Original (03/2026)
- Tema escuro azul como padrão
- Busca paralela de horas (8 dias, max 5000/req)
- Dashboard de viagens Nimer com ranking, heatmap, fiscais
- Simulador de recarga elétrica
- Sistema de autenticação client-side com 5 perfis

---

## 📝 Licença

© 2024 Sambaíba - Viagens Nimer. Todos os direitos reservados.

---

## 🤝 Contribuições

Desenvolvido para uso interno da **Sambaíba (Viagens Nimer)**.

**Dúvidas ou sugestões?** Entre em contato com a equipe de TI.
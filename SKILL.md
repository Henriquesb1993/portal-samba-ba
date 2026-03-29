---
name: portal-sambaiba
description: Automação completa do Portal Sambaíba (https://henriquesb1993.github.io/portal-samba-ba/). Use esta skill sempre que o usuário mencionar 'portal sambaíba', 'sambaiba', 'samba-iba', 'viagens nimer', 'horas realizadas', 'simulador de recarga', 'viagens realizadas', 'pontualidade', ou quando precisar fazer login, extrair dados operacionais, gerar relatórios, ou automatizar qualquer tarefa relacionada ao portal de operações da empresa Sambaíba. Também use quando o usuário pedir para acessar informações sobre motoristas, viagens, horas trabalhadas, vale refeição, ou qualquer funcionalidade do sistema de gestão de transportes.
---

# Portal Sambaíba - Skill de Automação Completa

Esta skill fornece instruções detalhadas para automação do **Portal Sambaíba** (Viagens Nimer), um sistema web de gestão operacional de transportes desenvolvido como SPA estático em HTML/CSS/JavaScript puro.

## Informações do Sistema

**URL do Portal**: https://henriquesb1993.github.io/portal-samba-ba/  
**Tipo**: Single Page Application (SPA) estático  
**Tecnologia**: HTML5, CSS3, JavaScript Vanilla (sem frameworks)  
**Autenticação**: Client-side (localStorage/sessionStorage)  
**Versão**: 1.0  
**Empresa**: Sambaíba (Viagens Nimer)

## Quando Usar Esta Skill

Use esta skill sempre que o usuário:
- Mencionar "portal sambaíba", "samba-iba", "sambaiba", "viagens nimer"
- Pedir para acessar, fazer login ou navegar no portal
- Solicitar dados de horas trabalhadas, viagens realizadas, pontualidade
- Quiser extrair informações de motoristas, operadores ou veículos
- Precisar usar o simulador de recarga elétrica
- Solicitar relatórios ou análises de dados operacionais
- Mencionar funcionalidades específicas: VR, ICF, multas, jornada
- Pedir para gerenciar usuários ou permissões (apenas perfil ADMIN)

## Estrutura do Portal

### Principais Módulos

1. **Horas Realizadas** (`pages/horas.html`)
   - Busca paralela de 8 dias via API externa
   - Dados por colaborador: H.Normal, H.Extra, Refeição, Func, Pegada, Largada
   - Limite de 5000 registros por request

2. **Viagens Realizadas Nimer** (`pages/viagens.html`)
   - Consulta por dia com filtro por linha
   - Campos: total_viagens_prog, viagens_monitoradas

3. **Viagens Realizadas SIM** (`pages/viagens_sim.html`)
   - Dashboard completo de viagens do sistema SIM

4. **Pontualidade de Partidas SIM** (`pages/pontualidade_sim.html`)
   - Análise de pontualidade das partidas

5. **Simulador de Recarga** (`pages/simulador_recarga.html`)
   - Simulação de recarga elétrica de frota

6. **Gestão de VR** (`pages/vr.html`)
   - Controle de Vale Refeição

7. **Gestão de Usuários** (`pages/usuarios.html`)
   - CRUD de usuários (apenas perfil ADMIN)

8. **Permissões de Menu** (`pages/permissoes.html`)
   - Configuração de acesso por perfil (apenas ADMIN)

### Menu de Navegação Completo

| Seção | Item | Página | Status |
|-------|------|--------|--------|
| **Operação** | Horas Realizadas | horas.html | ✅ Ativo |
| | Viagens Realizadas Nimer | viagens.html | ✅ Ativo |
| | Viagens Realizadas SIM | viagens_sim.html | ✅ Ativo |
| | Pontualidade de Partidas SIM | pontualidade_sim.html | ✅ Ativo |
| | ICF | em_desenvolvimento.html | 🚧 Em Desenvolvimento |
| | Multas RESAM e DSV | em_desenvolvimento.html | 🚧 Em Desenvolvimento |
| | Jornada Incompleta | em_desenvolvimento.html | 🚧 Em Desenvolvimento |
| | Operadores | em_desenvolvimento.html | 🚧 Em Desenvolvimento |
| **Gestão** | Financeiro | em_desenvolvimento.html | 🚧 Em Desenvolvimento |
| | Manutenção | em_desenvolvimento.html | 🚧 Em Desenvolvimento |
| | RH | em_desenvolvimento.html | 🚧 Em Desenvolvimento |
| | Gestão de VR | vr.html | ✅ Ativo |
| **Elétrico** | Simulação Recarga | simulador_recarga.html | ✅ Ativo |
| **Estratégico** | Indicadores | - | 🚧 Em Desenvolvimento |
| | Configurações | - | 🚧 Em Desenvolvimento |
| **Admin** | Gestão de Usuários | usuarios.html | ✅ Ativo |
| | Permissões de Menu | permissoes.html | ✅ Ativo |

## Workflow de Automação

### 1. Preparação e Contexto Inicial

Sempre comece obtendo o contexto das abas do navegador:

```javascript
// 1. Obter contexto do Chrome
const context = await Claude_in_Chrome.tabs_context_mcp({ 
  createIfEmpty: true 
});
const tabId = context.tabIds[0];

// 2. Navegar para o portal
await Claude_in_Chrome.navigate({
  tabId: tabId,
  url: "https://henriquesb1993.github.io/portal-samba-ba/"
});

// 3. Aguardar carregamento completo
await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "wait",
  duration: 2000
});
```

### 2. Sistema de Autenticação

O portal usa autenticação client-side com **credenciais pré-definidas**:

#### Credenciais Disponíveis

| Login | Senha | Perfil | Nível | Descrição |
|-------|-------|--------|-------|-----------|
| admin | admin123 | ADMIN | 5 | Acesso total (usuários, permissões) |
| gerente | ger123 | GERENTE | 4 | Gestão operacional |
| supervisor | sup123 | SUPERVISOR | 3 | Supervisão de operações |
| operador | op123 | OPERADOR | 2 | Operações básicas |
| viewer | view123 | VISUALIZADOR | 1 | Apenas visualização |

#### Regras de Segurança

- ⏱️ Sessão expira após **30 minutos** de inatividade
- 🔒 Bloqueio automático após **5 tentativas** de login erradas
- 👤 Apenas **ADMIN** acessa Gestão de Usuários e Permissões
- 📝 Log de acesso armazenado (últimos 200 registros) em `sb_access_log`

#### Chaves de Armazenamento

- `sb_users` → lista de usuários (localStorage)
- `sb_perms` → permissões de menu por perfil (localStorage)
- `sb_session` → sessão atual (sessionStorage)
- `sb_access_log` → histórico de logins (localStorage)

#### Processo de Login

**IMPORTANTE**: Sempre peça as credenciais ao usuário antes de fazer login. Se o usuário não especificar, pergunte qual perfil deseja usar.

```javascript
// 1. Verificar se já está na página de login
const pageContent = await Claude_in_Chrome.read_page({ tabId: tabId });

// 2. Se não estiver em login.html, aguardar redirecionamento automático
// O index.html redireciona para login.html se não houver sessão

// 3. Encontrar elementos de login
const loginElements = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "campo de usuário, campo de senha e botão de login"
});

// 4. Preencher credenciais (após obter do usuário)
await Claude_in_Chrome.form_input({
  tabId: tabId,
  ref_id: loginElements.campo_usuario.ref_id,
  value: "admin" // ou credencial fornecida pelo usuário
});

await Claude_in_Chrome.form_input({
  tabId: tabId,
  ref_id: loginElements.campo_senha.ref_id,
  value: "admin123" // ou senha fornecida pelo usuário
});

// 5. Clicar no botão "Entrar"
await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "left_click",
  coordinate: loginElements.botao_entrar.coordinate
});

// 6. Aguardar redirecionamento para pages/horas.html
await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "wait",
  duration: 3000
});

// 7. Confirmar login bem-sucedido
const loggedInPage = await Claude_in_Chrome.read_page({ tabId: tabId });
// Deve estar em pages/horas.html após login bem-sucedido
```

### 3. Navegação no Portal

Após login bem-sucedido, o portal exibe uma **sidebar** à esquerda com menu de navegação organizado por seções.

#### Estrutura da Sidebar

```
┌─ OPERAÇÃO
│  ├─ Horas Realizadas
│  ├─ Viagens Realizadas Nimer
│  ├─ Viagens Realizadas SIM
│  ├─ Pontualidade de Partidas SIM
│  ├─ ICF
│  ├─ Multas RESAM e DSV
│  ├─ Jornada Incompleta
│  └─ Operadores
│
├─ GESTÃO
│  ├─ Financeiro
│  ├─ Manutenção
│  ├─ RH
│  └─ Gestão de VR
│
├─ ELÉTRICO
│  └─ Simulação Recarga
│
├─ ESTRATÉGICO
│  ├─ Indicadores
│  └─ Configurações
│
└─ ADMIN (apenas perfil ADMIN)
   ├─ Gestão de Usuários
   └─ Permissões de Menu
```

#### Como Navegar Entre Páginas

```javascript
// Método 1: Navegação via sidebar (recomendado)
const sidebar = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "menu lateral com item [NOME_DA_PÁGINA]"
});

await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "left_click",
  coordinate: sidebar.item_desejado.coordinate
});

await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "wait",
  duration: 2000
});

// Método 2: Navegação direta via URL (mais rápido)
const targetPage = "horas"; // ou "viagens", "simulador_recarga", etc.
await Claude_in_Chrome.navigate({
  tabId: tabId,
  url: `https://henriquesb1993.github.io/portal-samba-ba/pages/${targetPage}.html`
});
```

### 4. Extração de Dados Operacionais

#### A. Horas Realizadas (pages/horas.html)

Esta página exibe uma tabela com horas trabalhadas por colaborador nos últimos 8 dias.

**Estrutura dos Dados:**
- **Colaborador**: Nome do motorista/operador
- **H. Normal**: Horas normais trabalhadas
- **H. Extra**: Horas extras
- **Refeição**: Tempo de refeição
- **Func**: Função
- **Pegada**: Horário de início
- **Largada**: Horário de término

**Como Extrair:**

```javascript
// 1. Navegar para a página de horas
await Claude_in_Chrome.navigate({
  tabId: tabId,
  url: "https://henriquesb1993.github.io/portal-samba-ba/pages/horas.html"
});

await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "wait",
  duration: 3000 // Aguardar carregamento e busca paralela de 8 dias
});

// 2. Ler a página completa
const pageContent = await Claude_in_Chrome.read_page({ tabId: tabId });

// 3. Extrair dados da tabela
// A página usa busca paralela de API, então aguardar carregamento completo

// 4. Se houver filtros ou seleção de data, usar:
const filters = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "filtros de data, seletor de período"
});

// 5. Aplicar filtros se necessário
if (filters && filters.length > 0) {
  await Claude_in_Chrome.form_input({
    tabId: tabId,
    ref_id: filters.data_inicio.ref_id,
    value: "2024-03-01"
  });
  
  // Clicar em "Buscar" ou similar
  await Claude_in_Chrome.computer({
    tabId: tabId,
    action: "left_click",
    coordinate: filters.botao_buscar.coordinate
  });
  
  await Claude_in_Chrome.computer({
    tabId: tabId,
    action: "wait",
    duration: 2000
  });
}

// 6. Extrair dados da tabela renderizada
const tabelaHoras = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "tabela com colunas: colaborador, h.normal, h.extra, refeição"
});

// 7. Processar dados em estrutura JSON
const dadosHoras = [];
// Iterar sobre linhas da tabela e extrair informações
```

**Notas Importantes:**
- A API tem limite de **5000 registros** por request
- A busca é **paralela para 8 dias** consecutivos
- Os dados vêm de: `https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_horas_nimer`

#### B. Viagens Realizadas Nimer (pages/viagens.html)

Exibe viagens programadas vs realizadas por linha e dia.

**Estrutura dos Dados:**
- **Data**: Dia da viagem
- **Linha**: Linha de ônibus
- **Total Viagens Prog**: Viagens programadas
- **Viagens Monitoradas**: Viagens efetivamente realizadas

**Como Extrair:**

```javascript
// 1. Navegar para viagens Nimer
await Claude_in_Chrome.navigate({
  tabId: tabId,
  url: "https://henriquesb1993.github.io/portal-samba-ba/pages/viagens.html"
});

await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "wait",
  duration: 2000
});

// 2. Selecionar data (se houver filtro de data)
const filtroData = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "seletor de data ou calendário"
});

if (filtroData && filtroData.length > 0) {
  await Claude_in_Chrome.form_input({
    tabId: tabId,
    ref_id: filtroData.campo_data.ref_id,
    value: "2024-03-28" // Data desejada
  });
}

// 3. Selecionar linha específica (dropdown)
const filtroLinha = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "dropdown ou select com linhas de ônibus"
});

if (filtroLinha && filtroLinha.length > 0) {
  await Claude_in_Chrome.computer({
    tabId: tabId,
    action: "left_click",
    coordinate: filtroLinha.dropdown_linha.coordinate
  });
  
  // Selecionar linha específica
  const opcaoLinha = await Claude_in_Chrome.find({
    tabId: tabId,
    search: "opção linha 501, 502, etc."
  });
  
  await Claude_in_Chrome.computer({
    tabId: tabId,
    action: "left_click",
    coordinate: opcaoLinha.linha_desejada.coordinate
  });
}

// 4. Buscar dados
const botaoBuscar = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "botão buscar ou consultar"
});

await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "left_click",
  coordinate: botaoBuscar.botao.coordinate
});

await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "wait",
  duration: 2000
});

// 5. Extrair tabela de resultados
const tabelaViagens = await Claude_in_Chrome.read_page({ tabId: tabId });

// Processar dados conforme estrutura:
// { linha, data, total_viagens_prog, viagens_monitoradas }
```

#### C. Viagens Realizadas SIM (pages/viagens_sim.html)

Dashboard completo do sistema SIM com múltiplos indicadores.

```javascript
// 1. Navegar para viagens SIM
await Claude_in_Chrome.navigate({
  tabId: tabId,
  url: "https://henriquesb1993.github.io/portal-samba-ba/pages/viagens_sim.html"
});

await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "wait",
  duration: 3000
});

// 2. Ler dashboard completo
const dashboardSIM = await Claude_in_Chrome.read_page({ tabId: tabId });

// 3. Extrair cards de métricas (geralmente no topo)
const cards = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "cards ou painéis com totais e métricas"
});

// 4. Extrair gráficos e tabelas
const graficos = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "gráficos, charts ou visualizações"
});
```

#### D. Pontualidade de Partidas SIM (pages/pontualidade_sim.html)

Análise de pontualidade das partidas programadas.

```javascript
// 1. Navegar para pontualidade
await Claude_in_Chrome.navigate({
  tabId: tabId,
  url: "https://henriquesb1993.github.io/portal-samba-ba/pages/pontualidade_sim.html"
});

await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "wait",
  duration: 2000
});

// 2. Aplicar filtros de período
const filtros = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "filtros de data início e fim"
});

// 3. Extrair indicadores de pontualidade
const indicadores = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "percentuais de pontualidade, atrasos, adiantamentos"
});

// Estrutura típica:
// - % Pontual (dentro da janela)
// - % Atrasado
// - % Adiantado
// - Tempo médio de atraso
```

#### E. Simulador de Recarga (pages/simulador_recarga.html)

Simulação de recarga elétrica da frota de veículos elétricos.

```javascript
// 1. Navegar para simulador
await Claude_in_Chrome.navigate({
  tabId: tabId,
  url: "https://henriquesb1993.github.io/portal-samba-ba/pages/simulador_recarga.html"
});

await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "wait",
  duration: 2000
});

// 2. Preencher parâmetros de simulação
const parametros = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "campos de entrada: veículos, potência, tempo, tarifa"
});

// Exemplo de parâmetros comuns:
// - Número de veículos
// - Capacidade da bateria (kWh)
// - Potência do carregador (kW)
// - Tarifa de energia (R$/kWh)
// - Horário de recarga (pico/fora pico)

await Claude_in_Chrome.form_input({
  tabId: tabId,
  ref_id: parametros.num_veiculos.ref_id,
  value: "10"
});

await Claude_in_Chrome.form_input({
  tabId: tabId,
  ref_id: parametros.capacidade_bateria.ref_id,
  value: "150" // kWh
});

// 3. Executar simulação
const botaoSimular = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "botão simular ou calcular"
});

await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "left_click",
  coordinate: botaoSimular.botao.coordinate
});

await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "wait",
  duration: 1500
});

// 4. Extrair resultados da simulação
const resultados = await Claude_in_Chrome.read_page({ tabId: tabId });

// Resultados típicos:
// - Tempo total de recarga
// - Custo estimado (R$)
// - Energia consumida (kWh)
// - Gráfico de recarga ao longo do tempo
```

#### F. Gestão de VR (pages/vr.html)

Controle de Vale Refeição dos colaboradores.

```javascript
// 1. Navegar para VR
await Claude_in_Chrome.navigate({
  tabId: tabId,
  url: "https://henriquesb1993.github.io/portal-samba-ba/pages/vr.html"
});

await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "wait",
  duration: 2000
});

// 2. Extrair dados de VR
const dadosVR = await Claude_in_Chrome.read_page({ tabId: tabId });

// Informações típicas:
// - Colaborador
// - Valor mensal VR
// - Dias trabalhados
// - Total a receber
```

### 5. Geração de Relatórios

Após extrair dados, sempre estruture em formato JSON e ofereça múltiplos formatos de saída:

```javascript
// Exemplo de estrutura de relatório
const relatorio = {
  titulo: "Relatório de Horas Realizadas - Março 2024",
  periodo: {
    inicio: "2024-03-01",
    fim: "2024-03-08"
  },
  dados: [
    {
      colaborador: "João Silva",
      funcao: "Motorista",
      horas_normais: 176.5,
      horas_extras: 12.3,
      refeicao: 8.0,
      pegada: "05:30",
      largada: "14:45"
    },
    // ... mais colaboradores
  ],
  totais: {
    horas_normais_total: 1234.5,
    horas_extras_total: 89.2,
    total_colaboradores: 15
  },
  metadados: {
    gerado_em: "2024-03-28 15:30:00",
    usuario: "admin",
    versao_portal: "1.0"
  }
};

// Oferecer ao usuário:
// 1. JSON (para processamento)
// 2. CSV (para Excel)
// 3. Tabela formatada (para visualização)
// 4. PDF (se necessário)
```

#### Formato CSV para Export

```javascript
function gerarCSV(dados) {
  const cabecalho = "Colaborador,Função,H.Normal,H.Extra,Refeição,Pegada,Largada\n";
  const linhas = dados.map(d => 
    `${d.colaborador},${d.funcao},${d.horas_normais},${d.horas_extras},${d.refeicao},${d.pegada},${d.largada}`
  ).join("\n");
  
  return cabecalho + linhas;
}

// Salvar como arquivo ou exibir
```

### 6. Gestão de Usuários (Apenas ADMIN)

**IMPORTANTE**: Esta funcionalidade só está disponível para usuários com perfil **ADMIN**.

```javascript
// 1. Verificar se está logado como ADMIN
// (Se não estiver, o menu "Gestão de Usuários" não aparecerá)

// 2. Navegar para gestão de usuários
await Claude_in_Chrome.navigate({
  tabId: tabId,
  url: "https://henriquesb1993.github.io/portal-samba-ba/pages/usuarios.html"
});

await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "wait",
  duration: 2000
});

// 3. Visualizar lista de usuários
const listaUsuarios = await Claude_in_Chrome.read_page({ tabId: tabId });

// 4. Adicionar novo usuário
const botaoNovo = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "botão adicionar ou novo usuário"
});

await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "left_click",
  coordinate: botaoNovo.botao.coordinate
});

// 5. Preencher formulário
const formulario = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "campos: login, senha, nome, perfil"
});

await Claude_in_Chrome.form_input({
  tabId: tabId,
  ref_id: formulario.campo_login.ref_id,
  value: "novo_usuario"
});

await Claude_in_Chrome.form_input({
  tabId: tabId,
  ref_id: formulario.campo_senha.ref_id,
  value: "senha123"
});

await Claude_in_Chrome.form_input({
  tabId: tabId,
  ref_id: formulario.campo_nome.ref_id,
  value: "Novo Usuário"
});

// 6. Selecionar perfil
const selectPerfil = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "dropdown de perfil: ADMIN, GERENTE, SUPERVISOR, OPERADOR, VISUALIZADOR"
});

await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "left_click",
  coordinate: selectPerfil.dropdown.coordinate
});

const opcaoPerfil = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "opção OPERADOR" // ou outro perfil
});

await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "left_click",
  coordinate: opcaoPerfil.opcao.coordinate
});

// 7. Salvar usuário
const botaoSalvar = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "botão salvar ou confirmar"
});

await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "left_click",
  coordinate: botaoSalvar.botao.coordinate
});

// 8. Aguardar confirmação
await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "wait",
  duration: 1000
});
```

#### Editar ou Excluir Usuário

```javascript
// 1. Encontrar usuário na lista
const tabelaUsuarios = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "tabela com usuários, botões editar e excluir"
});

// 2. Clicar em "Editar"
const botaoEditar = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "botão editar do usuário [NOME]"
});

await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "left_click",
  coordinate: botaoEditar.botao.coordinate
});

// 3. Modificar campos necessários
// (mesmo processo de preenchimento de formulário)

// 4. Para excluir:
const botaoExcluir = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "botão excluir ou deletar do usuário [NOME]"
});

await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "left_click",
  coordinate: botaoExcluir.botao.coordinate
});

// 5. Confirmar exclusão (se houver modal de confirmação)
const confirmarExclusao = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "botão confirmar ou sim na modal"
});

await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "left_click",
  coordinate: confirmarExclusao.botao.coordinate
});
```

### 7. Gestão de Permissões (Apenas ADMIN)

Configurar quais itens de menu cada perfil pode acessar.

```javascript
// 1. Navegar para permissões
await Claude_in_Chrome.navigate({
  tabId: tabId,
  url: "https://henriquesb1993.github.io/portal-samba-ba/pages/permissoes.html"
});

await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "wait",
  duration: 2000
});

// 2. Visualizar matriz de permissões
const matrizPermissoes = await Claude_in_Chrome.read_page({ tabId: tabId });

// Estrutura típica:
// Tabela com:
// - Linhas: Itens de menu (Horas, Viagens, VR, etc.)
// - Colunas: Perfis (ADMIN, GERENTE, SUPERVISOR, OPERADOR, VISUALIZADOR)
// - Células: Checkboxes habilitando/desabilitando acesso

// 3. Modificar permissão específica
const checkbox = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "checkbox do item 'Horas Realizadas' para perfil 'OPERADOR'"
});

await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "left_click",
  coordinate: checkbox.elemento.coordinate
});

// 4. Salvar alterações
const botaoSalvar = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "botão salvar permissões"
});

await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "left_click",
  coordinate: botaoSalvar.botao.coordinate
});
```

### 8. Tratamento de Erros e Edge Cases

#### A. Sessão Expirada

```javascript
// Detectar se a sessão expirou (redirecionamento para login)
const currentUrl = await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "screenshot" // Capturar estado atual
});

// Se detectar que está em login.html novamente:
if (/* URL contém login.html */) {
  // Informar usuário que sessão expirou
  // Fazer login novamente
  console.log("Sessão expirada. Fazendo login novamente...");
  // Executar processo de login
}
```

#### B. Bloqueio por Tentativas

```javascript
// Se houver mensagem de bloqueio após 5 tentativas:
const mensagemErro = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "mensagem de erro, conta bloqueada, muitas tentativas"
});

if (mensagemErro && mensagemErro.length > 0) {
  throw new Error("Conta bloqueada por excesso de tentativas. Aguardar ou contatar administrador.");
}
```

#### C. Dados Não Carregados

```javascript
// Verificar se a API retornou dados
const tabelaVazia = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "mensagem sem dados, tabela vazia, nenhum registro"
});

if (tabelaVazia && tabelaVazia.length > 0) {
  console.log("Nenhum dado encontrado para o período selecionado.");
  // Sugerir ao usuário ajustar filtros ou período
}
```

#### D. Permissão Negada

```javascript
// Se tentar acessar página sem permissão:
const acessoNegado = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "acesso negado, sem permissão, não autorizado"
});

if (acessoNegado && acessoNegado.length > 0) {
  throw new Error("Acesso negado. O perfil atual não tem permissão para acessar esta funcionalidade.");
}
```

### 9. Boas Práticas de Automação

#### Sempre Aguardar Carregamento

```javascript
// Após qualquer navegação ou ação que altera a página:
await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "wait",
  duration: 2000 // Ajustar conforme necessidade
});

// Para operações que fazem requisições API (como horas realizadas):
await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "wait",
  duration: 3000 // Tempo maior para busca paralela
});
```

#### Capturar Screenshots para Debug

```javascript
// Ao encontrar problemas, capturar estado atual:
await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "screenshot",
  description: "Capturar estado da página para análise"
});
```

#### Validar Elementos Antes de Interagir

```javascript
// Sempre verificar se elementos existem antes de clicar:
const elemento = await Claude_in_Chrome.find({
  tabId: tabId,
  search: "botão ou elemento desejado"
});

if (!elemento || elemento.length === 0) {
  throw new Error("Elemento não encontrado na página");
}

// Proceder com a interação
await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "left_click",
  coordinate: elemento.item.coordinate
});
```

#### Scroll Quando Necessário

```javascript
// Se elementos estiverem fora da viewport:
await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "scroll",
  coordinate: [500, 800], // Ajustar conforme necessidade
  scroll_amount: 5 // Quantidade de scroll
});

await Claude_in_Chrome.computer({
  tabId: tabId,
  action: "wait",
  duration: 500
});
```

### 10. Casos de Uso Completos

#### Caso de Uso 1: Relatório Semanal de Horas

```javascript
async function gerarRelatorioSemanalHoras(tabId, dataInicio, dataFim) {
  // 1. Navegar para horas
  await Claude_in_Chrome.navigate({
    tabId: tabId,
    url: "https://henriquesb1993.github.io/portal-samba-ba/pages/horas.html"
  });
  
  await Claude_in_Chrome.computer({
    tabId: tabId,
    action: "wait",
    duration: 3000
  });
  
  // 2. Aplicar filtros de período
  const filtros = await Claude_in_Chrome.find({
    tabId: tabId,
    search: "campos de data início e fim"
  });
  
  await Claude_in_Chrome.form_input({
    tabId: tabId,
    ref_id: filtros.data_inicio.ref_id,
    value: dataInicio
  });
  
  await Claude_in_Chrome.form_input({
    tabId: tabId,
    ref_id: filtros.data_fim.ref_id,
    value: dataFim
  });
  
  // 3. Buscar dados
  const botaoBuscar = await Claude_in_Chrome.find({
    tabId: tabId,
    search: "botão buscar"
  });
  
  await Claude_in_Chrome.computer({
    tabId: tabId,
    action: "left_click",
    coordinate: botaoBuscar.botao.coordinate
  });
  
  await Claude_in_Chrome.computer({
    tabId: tabId,
    action: "wait",
    duration: 3000
  });
  
  // 4. Extrair dados
  const dadosTabela = await Claude_in_Chrome.read_page({ tabId: tabId });
  
  // 5. Processar e estruturar
  const relatorio = {
    titulo: `Relatório de Horas - ${dataInicio} a ${dataFim}`,
    periodo: { inicio: dataInicio, fim: dataFim },
    dados: [], // Processar dadosTabela
    totais: {}
  };
  
  return relatorio;
}
```

#### Caso de Uso 2: Comparativo de Viagens Programadas vs Realizadas

```javascript
async function compararViagens(tabId, data, linha) {
  // 1. Navegar para viagens Nimer
  await Claude_in_Chrome.navigate({
    tabId: tabId,
    url: "https://henriquesb1993.github.io/portal-samba-ba/pages/viagens.html"
  });
  
  await Claude_in_Chrome.computer({
    tabId: tabId,
    action: "wait",
    duration: 2000
  });
  
  // 2. Selecionar data
  const filtroData = await Claude_in_Chrome.find({
    tabId: tabId,
    search: "campo de data"
  });
  
  await Claude_in_Chrome.form_input({
    tabId: tabId,
    ref_id: filtroData.campo.ref_id,
    value: data
  });
  
  // 3. Selecionar linha
  const filtroLinha = await Claude_in_Chrome.find({
    tabId: tabId,
    search: `dropdown com linha ${linha}`
  });
  
  await Claude_in_Chrome.computer({
    tabId: tabId,
    action: "left_click",
    coordinate: filtroLinha.dropdown.coordinate
  });
  
  const opcaoLinha = await Claude_in_Chrome.find({
    tabId: tabId,
    search: `opção ${linha}`
  });
  
  await Claude_in_Chrome.computer({
    tabId: tabId,
    action: "left_click",
    coordinate: opcaoLinha.opcao.coordinate
  });
  
  // 4. Buscar
  const botaoBuscar = await Claude_in_Chrome.find({
    tabId: tabId,
    search: "botão buscar"
  });
  
  await Claude_in_Chrome.computer({
    tabId: tabId,
    action: "left_click",
    coordinate: botaoBuscar.botao.coordinate
  });
  
  await Claude_in_Chrome.computer({
    tabId: tabId,
    action: "wait",
    duration: 2000
  });
  
  // 5. Extrair resultados
  const resultados = await Claude_in_Chrome.read_page({ tabId: tabId });
  
  // 6. Calcular taxa de realização
  const analise = {
    data: data,
    linha: linha,
    programadas: 0, // Extrair de resultados
    realizadas: 0, // Extrair de resultados
    taxa_realizacao: 0, // (realizadas / programadas) * 100
    diferenca: 0 // programadas - realizadas
  };
  
  return analise;
}
```

#### Caso de Uso 3: Simulação de Custo de Recarga

```javascript
async function simularCustoRecarga(tabId, parametros) {
  // parametros = { veiculos, capacidade_bateria, potencia_carregador, tarifa }
  
  // 1. Navegar para simulador
  await Claude_in_Chrome.navigate({
    tabId: tabId,
    url: "https://henriquesb1993.github.io/portal-samba-ba/pages/simulador_recarga.html"
  });
  
  await Claude_in_Chrome.computer({
    tabId: tabId,
    action: "wait",
    duration: 2000
  });
  
  // 2. Preencher parâmetros
  const campos = await Claude_in_Chrome.find({
    tabId: tabId,
    search: "campos de entrada do simulador"
  });
  
  await Claude_in_Chrome.form_input({
    tabId: tabId,
    ref_id: campos.num_veiculos.ref_id,
    value: parametros.veiculos.toString()
  });
  
  await Claude_in_Chrome.form_input({
    tabId: tabId,
    ref_id: campos.capacidade.ref_id,
    value: parametros.capacidade_bateria.toString()
  });
  
  await Claude_in_Chrome.form_input({
    tabId: tabId,
    ref_id: campos.potencia.ref_id,
    value: parametros.potencia_carregador.toString()
  });
  
  await Claude_in_Chrome.form_input({
    tabId: tabId,
    ref_id: campos.tarifa.ref_id,
    value: parametros.tarifa.toString()
  });
  
  // 3. Executar simulação
  const botaoSimular = await Claude_in_Chrome.find({
    tabId: tabId,
    search: "botão simular"
  });
  
  await Claude_in_Chrome.computer({
    tabId: tabId,
    action: "left_click",
    coordinate: botaoSimular.botao.coordinate
  });
  
  await Claude_in_Chrome.computer({
    tabId: tabId,
    action: "wait",
    duration: 1500
  });
  
  // 4. Extrair resultados
  const resultados = await Claude_in_Chrome.read_page({ tabId: tabId });
  
  // 5. Estruturar resposta
  const simulacao = {
    parametros: parametros,
    resultados: {
      tempo_recarga_horas: 0, // Extrair de resultados
      energia_total_kwh: 0,
      custo_total_reais: 0,
      custo_por_veiculo: 0
    }
  };
  
  return simulacao;
}
```

### 11. Configuração da API Externa

O portal consome dados de uma API externa para algumas funcionalidades:

**URL da API**: `https://dashboardipp.sambaibasp.cloud/api/importacoes/sb_horas_nimer`  
**Token**: (armazenado em `js/config.js`)  
**Limite**: 5000 registros por request  
**Método**: Busca paralela para 8 dias consecutivos

**Nota**: As requisições são feitas via JavaScript client-side. O Claude não precisa chamar a API diretamente - ela é chamada pelo próprio código do portal quando a página carrega.

### 12. Estrutura de Armazenamento Local

O portal usa **localStorage** e **sessionStorage** para:

#### localStorage (persistente)
- `sb_users`: Lista de usuários cadastrados
- `sb_perms`: Matriz de permissões por perfil
- `sb_access_log`: Log de acessos (últimos 200)

#### sessionStorage (temporário)
- `sb_session`: Dados da sessão atual (usuário logado, timestamp, perfil)

**Exemplo de Estrutura**:

```json
// sb_session
{
  "usuario": "admin",
  "perfil": "ADMIN",
  "nivel": 5,
  "login_timestamp": 1711650000000,
  "last_activity": 1711651800000
}

// sb_users
[
  {
    "login": "admin",
    "senha": "admin123", // Em produção seria hash
    "nome": "Administrador",
    "perfil": "ADMIN",
    "nivel": 5,
    "ativo": true
  },
  // ... outros usuários
]

// sb_perms
{
  "ADMIN": ["horas", "viagens_nimer", "viagens_sim", "pontualidade", "vr", "recarga", "usuarios", "permissoes"],
  "GERENTE": ["horas", "viagens_nimer", "viagens_sim", "pontualidade", "vr", "recarga"],
  "SUPERVISOR": ["horas", "viagens_nimer", "viagens_sim", "pontualidade"],
  "OPERADOR": ["horas", "viagens_nimer"],
  "VISUALIZADOR": ["horas"]
}
```

### 13. Checklist de Automação

Antes de executar qualquer tarefa no portal, seguir este checklist:

- [ ] **Obter contexto da aba** (`tabs_context_mcp`)
- [ ] **Navegar para o portal** (URL base)
- [ ] **Verificar se está logado** (checar se está em `pages/` ou `login.html`)
- [ ] **Fazer login se necessário** (credenciais do usuário)
- [ ] **Aguardar carregamento completo** (wait 2-3 segundos)
- [ ] **Navegar para página específica** (se necessário)
- [ ] **Aplicar filtros** (data, linha, período)
- [ ] **Aguardar processamento** (especialmente para busca paralela)
- [ ] **Extrair dados** (`read_page`, `find`)
- [ ] **Estruturar resposta** (JSON, CSV, tabela)
- [ ] **Validar dados** (checar se não está vazio)
- [ ] **Apresentar ao usuário** (formato solicitado)

### 14. Mensagens de Erro Comuns

| Erro | Causa Provável | Solução |
|------|----------------|---------|
| "Sessão expirada" | Inatividade > 30min | Fazer login novamente |
| "Credenciais inválidas" | Login/senha incorretos | Verificar credenciais |
| "Conta bloqueada" | 5+ tentativas erradas | Aguardar ou contatar admin |
| "Acesso negado" | Perfil sem permissão | Usar perfil adequado (ex: ADMIN) |
| "Sem dados" | Período sem registros | Ajustar filtros de data |
| "API não respondeu" | API externa offline | Verificar conectividade |
| "Limite excedido" | Mais de 5000 registros | Reduzir período de busca |

### 15. Dicas de Performance

1. **Busca Paralela**: A página de horas usa busca paralela de 8 dias - aguardar pelo menos 3 segundos para carregamento completo
2. **Cache de Dados**: O portal cacheia alguns dados em `data/horas.json` e `data/viagens.json`
3. **Paginação**: Se houver muitos registros, pode haver paginação - verificar e iterar
4. **Timeout Adequado**: Usar `wait` de 1.5-3 segundos dependendo da complexidade da operação

### 16. Roadmap de Funcionalidades

Funcionalidades atualmente **em desenvolvimento** (páginas placeholder):

- ICF (Índice de Cumprimento de Frota)
- Multas RESAM e DSV
- Jornada Incompleta
- Operadores
- Financeiro
- Manutenção
- RH
- Indicadores
- Configurações

Quando o usuário solicitar estas funcionalidades, informar que estão em desenvolvimento.

---

## Resumo Executivo

Esta skill capacita o Claude a:

✅ **Fazer login** no portal com diferentes perfis  
✅ **Navegar** por todas as seções ativas  
✅ **Extrair dados** de horas, viagens, pontualidade, VR  
✅ **Gerar relatórios** estruturados em múltiplos formatos  
✅ **Simular** custos de recarga elétrica  
✅ **Gerenciar** usuários e permissões (perfil ADMIN)  
✅ **Tratar erros** e sessões expiradas  
✅ **Automatizar** workflows completos end-to-end  

**Use esta skill proativamente** sempre que detectar menções a:
- Portal Sambaíba / Samba-iba
- Viagens Nimer
- Operações de transporte
- Horas trabalhadas
- Gestão de frota elétrica
- Qualquer funcionalidade específica do portal

**Lembre-se**: O portal é 100% client-side. Todos os dados são carregados via JavaScript e armazenados em localStorage/sessionStorage. Não há backend - tudo acontece no navegador.

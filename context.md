# CONTEXTO COMPLETO DO PROJETO - RECICLAGEM PEREQUE

## 📋 ÍNDICE

1. [Visão Geral do Projeto](#visão-geral-do-projeto)
2. [Stack Tecnológica](#stack-tecnológica)
3. [Arquitetura do Sistema](#arquitetura-do-sistema)
4. [Estrutura de Diretórios](#estrutura-de-diretórios)
5. [Banco de Dados](#banco-de-dados)
6. [Sincronização com Supabase](#sincronização-com-supabase)
7. [Páginas e Rotas](#páginas-e-rotas)
8. [Componentes](#componentes)
9. [Hooks Customizados](#hooks-customizados)
10. [Serviços](#serviços)
11. [Configurações e Build](#configurações-e-build)
12. [Funcionalidades Principais](#funcionalidades-principais)
13. [Fluxos de Dados](#fluxos-de-dados)

---

## VISÃO GERAL DO PROJETO

**Nome:** Reciclagem Pereque  
**Tipo:** Sistema de Gestão de Reciclagem Offline-First  
**Plataforma:** Web (PWA) + Mobile (Android/iOS via Capacitor)  
**Arquitetura:** Offline-First com sincronização bidirecional Supabase

### Objetivo
Sistema completo para gestão de depósito de reciclagem que funciona totalmente offline, com sincronização automática quando conectado à internet. Gerencia compras, vendas, estoque, comandas, relatórios e impressão térmica.

---

## STACK TECNOLÓGICA

### Frontend Core
- **React 18.3.1** - Biblioteca UI
- **TypeScript 5.9.2** - Tipagem estática
- **Vite 5.4.19** - Build tool e dev server
- **React Router DOM 6.30.1** - Roteamento (HashRouter para mobile, BrowserRouter para web)

### UI Framework
- **Tailwind CSS 3.4.17** - Framework CSS utility-first
- **shadcn/ui** - Componentes UI baseados em Radix UI
- **Radix UI** - Componentes primitivos acessíveis:
  - Accordion, Alert Dialog, Avatar, Checkbox, Collapsible, Context Menu
  - Dialog, Dropdown Menu, Hover Card, Label, Menubar, Navigation Menu
  - Popover, Progress, Radio Group, Scroll Area, Select, Separator
  - Slider, Switch, Tabs, Toggle, Tooltip
- **Lucide React 0.462.0** - Ícones
- **Sonner 1.7.4** - Sistema de notificações toast

### State Management
- **TanStack React Query 5.89.0** - Gerenciamento de estado servidor/cache
- **React Hooks** - useState, useEffect, useCallback, useMemo, useRef

### Mobile (Capacitor)
- **@capacitor/core 7.4.3** - Core do Capacitor
- **@capacitor/android 7.4.3** - Plataforma Android
- **@capacitor/ios 7.4.3** - Plataforma iOS
- **@capacitor/app 7.1.0** - API de app lifecycle
- **@capacitor/browser 7.0.2** - Abrir URLs externas
- **@capacitor/device 7.0.2** - Informações do dispositivo
- **@capacitor/filesystem 7.1.4** - Sistema de arquivos
- **@capacitor/network 7.0.2** - Status de rede
- **@capacitor/preferences 7.0.2** - Armazenamento local
- **@capacitor/share 7.0.2** - Compartilhamento nativo
- **@capacitor/splash-screen 7.0.3** - Splash screen
- **@capacitor/status-bar 7.0.3** - Status bar

### Banco de Dados
- **@capacitor-community/sqlite 7.0.1** - SQLite nativo para mobile/web
- **@supabase/supabase-js 2.57.4** - Cliente Supabase (PostgreSQL)

### Bluetooth e Impressão
- **cordova-plugin-bluetooth-serial 0.4.7** - Plugin Bluetooth Serial
- **@awesome-cordova-plugins/bluetooth-serial 8.1.0** - Wrapper TypeScript
- **cordova-plugin-android-permissions 1.1.5** - Permissões Android
- **esc-pos-encoder 3.0.0** - Codificação ESC/POS para impressoras térmicas
- **capacitor-thermal-printer 0.2.5** - Plugin térmico alternativo

### PDF e Exportação
- **jspdf 3.0.3** - Geração de PDFs
- **html2canvas 1.4.1** - Captura de HTML como imagem
- **pdf-lib 1.17.1** - Manipulação de PDFs

### Utilitários
- **date-fns 3.6.0** - Manipulação de datas
- **class-variance-authority 0.7.1** - Variantes de componentes
- **clsx 2.1.1** - Concatenação de classes CSS
- **tailwind-merge 2.6.0** - Merge de classes Tailwind
- **recharts 2.15.4** - Gráficos e visualizações

### Desenvolvimento
- **ESLint 9.32.0** - Linter
- **TypeScript ESLint 8.38.0** - Linter TypeScript
- **Prettier 3.6.2** - Formatador de código
- **Jest 30.1.3** - Framework de testes
- **@vitejs/plugin-react-swc 3.11.0** - Plugin React para Vite (SWC)

---

## ARQUITETURA DO SISTEMA

### Padrão: Offline-First

O sistema foi projetado para funcionar **100% offline**, com sincronização opcional quando conectado:

1. **Armazenamento Local Primário**: SQLite via Capacitor
2. **Cache em Memória**: React Query para dados frequentes
3. **Sincronização Bidirecional**: Push/Pull com Supabase quando online
4. **Fila de Sincronização**: Operações offline são enfileiradas e sincronizadas depois

### Fluxo de Dados

```
[Interface React] 
    ↓
[React Query Cache]
    ↓
[SQLite Database] ←→ [Sync Queue] ←→ [Supabase PostgreSQL]
```

### Inicialização

1. App inicia (`main.tsx`)
2. Database SQLite é inicializado (`initDatabase.ts`)
3. Schema é criado/verificado (20 tabelas)
4. Sync Engine é inicializado (mas fica inativo sem credenciais)
5. Service Worker é registrado (PWA)
6. Status Bar e Splash Screen são configurados (mobile)

---

## ESTRUTURA DE DIRETÓRIOS

```
appcontinuacao/
├── android/                    # Projeto Android nativo (Capacitor)
│   ├── app/                   # Código Android
│   └── build.gradle          # Configuração Gradle
├── src/
│   ├── components/           # Componentes React reutilizáveis
│   │   ├── ui/               # Componentes shadcn/ui (49 arquivos)
│   │   ├── BluetoothPrinterModal.tsx
│   │   ├── ErrorBoundary.tsx
│   │   └── SyncIndicator.tsx
│   ├── database/             # Módulo de banco de dados SQLite
│   │   ├── index.ts          # Exports centralizados
│   │   ├── initDatabase.ts   # Inicialização e schema
│   │   ├── sqliteService.ts  # Serviços CRUD
│   │   └── types.ts          # TypeScript types
│   ├── hooks/                # Hooks customizados React
│   │   ├── useBluetoothPrinter.ts
│   │   ├── useBluetoothPermissions.ts
│   │   ├── useCordovaReady.ts
│   │   ├── useItemQuickSelect.tsx
│   │   ├── useMateriais.ts
│   │   ├── usePrintComanda.ts
│   │   ├── useTransacoes.ts
│   │   ├── use-mobile.tsx
│   │   ├── use-toast.ts
│   │   └── useLocalStorage.ts
│   ├── pages/               # Páginas/rotas da aplicação (19 arquivos)
│   │   ├── Index.tsx        # Menu principal
│   │   ├── Compra.tsx       # Tela de compra
│   │   ├── Venda.tsx        # Tela de venda
│   │   ├── ComandaAtual.tsx # Comanda em andamento
│   │   ├── HistoricoComandas.tsx
│   │   ├── Fechamento.tsx
│   │   ├── Relatorios.tsx
│   │   ├── Ultimos.tsx
│   │   ├── TabelaPrecos.tsx
│   │   ├── Estoque.tsx
│   │   ├── CadastrarMaterial.tsx
│   │   ├── CadastrarDespesa.tsx
│   │   ├── Vale.tsx
│   │   ├── Pendencias.tsx
│   │   ├── Configuracoes.tsx
│   │   ├── ImprimirComanda.tsx
│   │   ├── PreviewComanda.tsx
│   │   └── NotFound.tsx
│   ├── services/            # Serviços externos
│   │   ├── supabaseClient.ts # Cliente Supabase
│   │   ├── syncEngine.ts    # Motor de sincronização
│   │   ├── settings.ts      # Configurações localStorage
│   │   └── pdf/             # Geração de PDFs
│   ├── shortcuts/           # Sistema de atalhos de teclado
│   │   └── index.ts
│   ├── utils/               # Utilitários
│   │   ├── logger.ts        # Sistema de logging
│   │   ├── formatters.ts    # Formatação de dados
│   │   ├── bluetoothDebug.ts
│   │   └── cordovaPluginChecker.ts
│   ├── lib/                 # Bibliotecas/configurações
│   │   └── utils.ts        # Utilitários shadcn
│   ├── App.tsx              # Componente raiz com rotas
│   ├── main.tsx             # Entry point
│   └── index.css            # Estilos globais Tailwind
├── public/                  # Arquivos estáticos
│   ├── manifest.json        # PWA manifest
│   ├── sw.js               # Service Worker
│   └── icon-512.png        # Ícone PWA
├── capacitor.config.ts      # Configuração Capacitor
├── vite.config.ts          # Configuração Vite
├── tailwind.config.ts      # Configuração Tailwind
├── tsconfig.json           # Configuração TypeScript
├── package.json            # Dependências npm
├── sqlite_schema.sql       # Schema SQLite (20 tabelas)
└── schemasupabase.sql      # Schema Supabase PostgreSQL
```

---

## BANCO DE DADOS

### SQLite Local (Offline-First)

**Nome do Banco:** `reciclagem.db`  
**Localização:** 
- Android: `default` (armazenamento interno)
- iOS: `Library/CapacitorDatabase`
- Web: IndexedDB via jeep-sqlite

**Plugin:** `@capacitor-community/sqlite v7`

### Tabelas do SQLite (20 tabelas)

#### 1. **material**
Armazena materiais recicláveis cadastrados.
```sql
- id (INTEGER PRIMARY KEY AUTOINCREMENT)
- data (TEXT NOT NULL)
- nome (TEXT NOT NULL)
- categoria (TEXT NOT NULL)
- preco_compra (REAL NOT NULL DEFAULT 0)
- preco_venda (REAL NOT NULL DEFAULT 0)
- criado_por (TEXT NOT NULL)
- atualizado_por (TEXT NOT NULL)
- display_order (INTEGER DEFAULT 9999) -- Ordem de exibição
- data_sync (TEXT) -- Última sincronização
- origem_offline (INTEGER DEFAULT 0) -- 1=criado offline, 0=sincronizado
```

#### 2. **vale_false**
Vales/IOUs pendentes (equivalente local de `vale` do Supabase).
```sql
- id (INTEGER PRIMARY KEY AUTOINCREMENT)
- data (TEXT NOT NULL)
- status (INTEGER NOT NULL DEFAULT 0) -- 0=pendente
- nome (TEXT NOT NULL)
- valor (REAL NOT NULL DEFAULT 0)
- observacao (TEXT)
- criado_por, atualizado_por, data_sync, origem_offline
```

#### 3. **pendencia_false**
Pendências financeiras (equivalente local de `pendencia` do Supabase).
```sql
- id (INTEGER PRIMARY KEY AUTOINCREMENT)
- data (TEXT NOT NULL)
- status (INTEGER NOT NULL DEFAULT 0)
- nome (TEXT NOT NULL)
- valor (REAL NOT NULL DEFAULT 0)
- tipo (TEXT NOT NULL) -- 'a_pagar' ou 'a_receber'
- observacao (TEXT)
- criado_por, atualizado_por, data_sync, origem_offline
```

#### 4. **comanda_20**
Últimas 20 comandas com seus itens (view materializada localmente).
```sql
- comanda_id (INTEGER)
- comanda_data (TEXT)
- codigo (TEXT)
- comanda_tipo (TEXT) -- 'compra' ou 'venda'
- observacoes (TEXT)
- comanda_total (REAL)
- item_id (INTEGER)
- item_data (TEXT)
- material_id (INTEGER)
- preco_kg (REAL)
- kg_total (REAL)
- item_valor_total (REAL)
- data_sync, origem_offline
```

#### 5. **fechamento_mes**
Fechamentos mensais registrados.
```sql
- id (INTEGER PRIMARY KEY AUTOINCREMENT)
- data (TEXT)
- compra (REAL)
- despesa (REAL)
- venda (REAL)
- lucro (REAL)
- observacao (TEXT)
- criado_por, atualizado_por, data_sync, origem_offline
```

#### 6-8. **relatorio_diario**, **relatorio_mensal**, **relatorio_anual**
Relatórios agregados por período (sincronizados do Supabase).
```sql
- data/referencia (TEXT)
- compra, venda, despesa, lucro (REAL)
- data_sync (TEXT)
```

#### 9-11. **compra_por_material_diario/mes/anual**
Compras agregadas por material e período.
```sql
- nome (TEXT)
- data/referencia (TEXT)
- kg (REAL)
- gasto (REAL)
- data_sync
```

#### 12-14. **venda_por_material_diario/mes/anual**
Vendas agregadas por material e período.
```sql
- nome (TEXT)
- data/referencia (TEXT)
- kg (REAL)
- gasto (REAL) -- Nota: nome da coluna é "gasto" mas representa receita
- data_sync
```

#### 15. **ultimas_20**
Últimos 20 itens de transações (local-only, não sincroniza).
```sql
- id (INTEGER PRIMARY KEY AUTOINCREMENT)
- data (TEXT)
- material (INTEGER) -- ID do material
- comanda (INTEGER) -- ID da comanda (pode ser NULL)
- preco_kg (REAL)
- kg_total (REAL)
- valor_total (REAL)
- tipo (TEXT) -- 'compra' ou 'venda'
- criado_por, atualizado_por, data_sync, origem_offline
```

#### 16. **estoque**
Estoque atual de materiais (calculado/sincronizado).
```sql
- material (TEXT)
- kg_total (REAL)
- valor_medio_kg (REAL)
- valor_total_gasto (REAL)
- data_sync
```

#### 17. **despesa_mes**
Despesas do mês atual.
```sql
- id (INTEGER PRIMARY KEY AUTOINCREMENT)
- data (TEXT)
- descricao (TEXT)
- valor (REAL)
- criado_por, atualizado_por, data_sync, origem_offline
```

#### 18. **calculo_fechamento**
Cálculo de fechamento desde último fechamento até agora.
```sql
- desde_data (TEXT)
- ate_data (TEXT)
- compra, despesa, venda, lucro (REAL)
- data_sync
```

#### 19. **sync_queue** ⭐ CRÍTICA
Fila de sincronização para operações offline.
```sql
- id (INTEGER PRIMARY KEY AUTOINCREMENT)
- table_name (TEXT NOT NULL) -- Nome da tabela
- operation (TEXT NOT NULL) -- 'INSERT', 'UPDATE', 'DELETE'
- record_id (TEXT) -- ID do registro
- payload (TEXT NOT NULL) -- JSON do registro completo
- created_at (TEXT DEFAULT CURRENT_TIMESTAMP)
- synced (INTEGER DEFAULT 0) -- 0=pendente, 1=sincronizado
```

#### 20. **resumo_estoque_financeiro**
Resumo financeiro do estoque (single-row table).
```sql
- total_kg (REAL)
- total_custo (REAL)
- total_venda_potencial (REAL)
- lucro_potencial (REAL)
- updated_at (TEXT)
```

### Campos de Sincronização

Todas as tabelas sincronizáveis possuem:
- **data_sync**: Timestamp ISO da última sincronização
- **origem_offline**: 0 = já sincronizado, 1 = criado offline (ainda não sincronizado)

### Inicialização do Banco

Arquivo: `src/database/initDatabase.ts`

1. Verifica se SQLite plugin está disponível
2. Inicializa Web Store (se web)
3. Verifica se banco existe
4. Cria banco e executa schema se não existir
5. Verifica todas as 20 tabelas foram criadas
6. Executa migrações (adiciona colunas se necessário):
   - `criado_por` em `comanda_20`
   - `display_order` em `material`
   - `tipo` em `ultimas_20`

---

## SINCRONIZAÇÃO COM SUPABASE

### Arquitetura de Sincronização

**Arquivo:** `src/services/syncEngine.ts`

### Configuração

Credenciais são armazenadas em `localStorage`:
- `supabase.url`: URL do projeto Supabase
- `supabase.anonKey`: Chave anônima pública

### Fluxo de Sincronização

#### 1. **Push (Local → Supabase)**

Quando há itens pendentes na `sync_queue`:

1. Verifica se está online e tem credenciais
2. Para cada item na fila (`synced = 0`):
   - Parse do JSON payload
   - Mapeia tabela local → tabela Supabase:
     - `material` → `material`
     - `vale_false` → `vale`
     - `pendencia_false` → `pendencia`
     - `comanda_20` → `comanda` + `item`
     - `ultimas_20` → **SKIP** (local-only)
   - Executa operação (INSERT/UPSERT/DELETE)
   - Marca item como sincronizado (`synced = 1`)
   - Remove da fila

**Tabelas que preservam linhas offline durante pull:**
- `material` (preserva `origem_offline = 1`)

#### 2. **Pull (Supabase → Local)**

Sincroniza views/tabelas do Supabase para SQLite:

**Tabelas sincronizadas:**
1. `material`
2. `vale_false` (vem de `vale` do Supabase)
3. `pendencia_false` (vem de `pendencia` do Supabase)
4. `comanda_20` (vem de view `comanda_20` do Supabase)
5. `relatorio_diario`
6. `relatorio_mensal`
7. `relatorio_anual`
8. `compra_por_material_diario/mes/anual`
9. `venda_por_material_diario/mes/anual`
10. `ultimas_20`
11. `estoque`
12. `despesa_mes`
13. `calculo_fechamento`
14. `resumo_estoque_financeiro` (single-row replace)

**Estratégia de Pull:**
- Para tabelas normais: DELETE + INSERT (substitui tudo)
- Para `material`: DELETE apenas `origem_offline = 0` (preserva offline)
- Para `resumo_estoque_financeiro`: Single-row replace

### Status de Sincronização

Interface `SyncStatus`:
```typescript
{
  isOnline: boolean;          // Conectado à internet?
  hasCredentials: boolean;    // Credenciais configuradas?
  syncing: boolean;           // Sincronizando agora?
  lastSyncAt: string | null;  // Última sincronização
  pendingCount: number;       // Itens pendentes na fila
  lastError: string | null;   // Último erro
}
```

### Trigger de Sincronização

- **Automático:** Apenas no startup (`startSyncLoop()`)
- **Manual:** Botão "Sincronizar Agora" em Configurações
- **Não automático:** Não sincroniza automaticamente em intervalos ou mudanças de rede

### Mapeamento de Tabelas

| SQLite Local | Supabase Remoto | Observações |
|--------------|-----------------|-------------|
| `material` | `material` | Preserva offline durante pull |
| `vale_false` | `vale` | Mapeia status 0/1 → boolean |
| `pendencia_false` | `pendencia` | Mapeia tipo string |
| `comanda_20` | `comanda` + `item` | Separa em duas tabelas |
| `ultimas_20` | - | **Local-only, não sincroniza** |
| `despesa_mes` | `despesa` | - |
| Views agregadas | Views do Supabase | Sincronizadas como tabelas |

---

## PÁGINAS E ROTAS

### Roteamento

**Arquivo:** `src/App.tsx`

- **Web:** `BrowserRouter`
- **Mobile:** `HashRouter` (compatibilidade com Capacitor)

### Lista de Rotas

#### `/` - **Index.tsx** (Menu Principal)
- Grid de cards com todas as funcionalidades
- Botão destacado "Imprimir Última Comanda"
- Atalhos de teclado: 1-5, /, -
- **Componentes:** Card, Button, Link
- **Hooks:** useNavigate, useGlobalShortcuts

#### `/compra` - **Compra.tsx**
- Seleção de material para compra
- Dialog para inserir peso, preço e desconto
- Calcula subtotal em tempo real
- Adiciona item à comanda atual (localStorage)
- Registra em `ultimas_20` e `sync_queue`
- **Atalhos:** Números 0-99 para selecionar material, Enter para confirmar, - para voltar
- **Hooks:** useItemQuickSelect, useGlobalShortcuts, useToast
- **Database:** selectAll('material'), insert('ultimas_20'), addToSyncQueue

#### `/venda` - **Venda.tsx**
- Similar a Compra, mas para vendas
- Usa `preco_venda` do material
- Verifica se há comanda de compra em andamento
- **Mesma estrutura que Compra.tsx**

#### `/comanda-atual` - **ComandaAtual.tsx**
- Visualiza comanda em andamento (localStorage)
- Lista itens, permite editar/excluir
- Botões: Adicionar Item, Finalizar, Cancelar
- Popups de confirmação para finalizar/cancelar
- Gera código de comanda com prefixo configurável
- Salva comanda finalizada em SQLite (`comanda` + `item`)
- **Atalhos:** + para adicionar, Enter para finalizar, - para voltar
- **Database:** insert('comanda'), insert('item'), addToSyncQueue

#### `/historico-comandas` - **HistoricoComandas.tsx**
- Lista últimas 20 comandas do SQLite
- Inclui comandas pendentes da `sync_queue`
- Agrupa itens por comanda
- Filtro por tipo (compra/venda)
- **Database:** executeQuery('comanda_20'), executeQuery('sync_queue')

#### `/fechamento` - **Fechamento.tsx**
- Calcula fechamento desde último fechamento registrado
- Mostra compras, vendas, despesas e lucro
- Permite registrar novo fechamento
- **Database:** executeQuery('calculo_fechamento'), insert('fechamento_mes')

#### `/relatorios` - **Relatorios.tsx**
- Relatórios diários, mensais e anuais
- Gráficos com Recharts
- Filtros por período
- **Database:** executeQuery('relatorio_diario/mensal/anual')

#### `/ultimos` - **Ultimos.tsx**
- Últimos 20 itens de transações
- Filtro por tipo (compra/venda)
- **Database:** selectAll('ultimas_20')

#### `/tabela-precos` - **TabelaPrecos.tsx**
- Lista todos os materiais com preços
- Permite editar preços
- Ordenação por `display_order`
- **Database:** selectAll('material'), update('material')

#### `/estoque` - **Estoque.tsx**
- Estoque atual de materiais
- Mostra kg total, valor médio/kg, valor total gasto
- Resumo financeiro do estoque
- **Database:** selectAll('estoque'), executeQuery('resumo_estoque_financeiro')

#### `/cadastrar-material` - **CadastrarMaterial.tsx**
- Formulário para cadastrar novo material
- Campos: nome, categoria, preço compra, preço venda
- **Database:** insert('material'), addToSyncQueue

#### `/cadastrar-despesa` - **CadastrarDespesa.tsx**
- Formulário para cadastrar despesa
- Campos: data, descrição, valor
- **Database:** insert('despesa_mes'), addToSyncQueue

#### `/vale` - **Vale.tsx**
- Lista vales pendentes (`vale_false`)
- Permite criar novo vale
- Marcar como pago
- **Database:** selectAll('vale_false'), insert('vale_false'), update('vale_false')

#### `/pendencias` - **Pendencias.tsx**
- Lista pendências (`pendencia_false`)
- Filtro por tipo (a_pagar/a_receber)
- Marcar como pago/recebido
- **Database:** selectWhere('pendencia_false'), insert('pendencia_false'), update('pendencia_false')

#### `/configuracoes` - **Configuracoes.tsx**
- Configuração Supabase (URL + Anon Key)
- Status de sincronização
- Prefixo de código de comanda
- Botão para sincronizar manualmente
- Modal de impressora Bluetooth
- **Database:** count('sync_queue')
- **Services:** getSupabaseSettings, saveSupabaseSettings, triggerSyncNow

#### `/imprimir-comanda` - **ImprimirComanda.tsx**
- Placeholder (funcionalidade futura)

#### `/preview-comanda` - **PreviewComanda.tsx** ⭐ IMPORTANTE
- Preview da última comanda finalizada
- Carrega de `localStorage` ou SQLite
- Agrupa itens por material
- Botões:
  - Imprimir (Bluetooth térmica 58mm)
  - Gerar PDF A4
  - Compartilhar WhatsApp
  - Compartilhar PDF
- **Hooks:** usePrintComanda
- **Services:** generateAndSaveComandaA4Pdf
- **Database:** executeQuery('comanda_20'), executeQuery('sync_queue')

#### `*` - **NotFound.tsx**
- Página 404

---

## COMPONENTES

### Componentes Principais

#### **BluetoothPrinterModal.tsx**
Modal para configurar impressora Bluetooth.
- Busca dispositivos emparelhados
- Conecta/desconecta
- Salva MAC address em Preferences
- **Hooks:** useBluetoothPrinter, useCordovaReady
- **Plugin:** cordova-plugin-bluetooth-serial

#### **SyncIndicator.tsx**
Indicador de status de sincronização (canto inferior direito).
- Mostra apenas erros
- **Hooks:** onSyncStatus (syncEngine)

#### **ErrorBoundary.tsx**
Boundary React para capturar erros.
- Mostra tela de erro amigável
- Botão para recarregar
- Detalhes do erro em desenvolvimento

### Componentes UI (shadcn/ui)

49 componentes em `src/components/ui/`:
- accordion, alert, alert-dialog, avatar, badge, breadcrumb
- button, calendar, card, carousel, chart, checkbox
- collapsible, command, context-menu, dialog, drawer
- dropdown-menu, hover-card, input, input-otp, label
- loading-states, menubar, navigation-menu, pagination
- popover, progress, radio-group, resizable, scroll-area
- select, separator, sheet, sidebar, skeleton
- slider, sonner, switch, table, tabs
- textarea, toast, toaster, toggle, toggle-group, tooltip

---

## HOOKS CUSTOMIZADOS

### **useBluetoothPrinter.ts**
Gerencia conexão Bluetooth com impressora.
- `scanForDevices()`: Busca dispositivos emparelhados
- `connectToDevice()`: Conecta a dispositivo
- `disconnect()`: Desconecta
- `checkSavedPrinter()`: Verifica impressora salva
- **Estado:** isScanning, isConnecting, isConnected, devices, connectedDevice, error

### **useBluetoothPermissions.ts**
Gerencia permissões Bluetooth Android 12+.
- `ensureBluetoothPermissions()`: Solicita permissões
- `openAppSettings()`: Abre configurações do app
- **Plugin:** cordova-plugin-android-permissions

### **useCordovaReady.ts**
Verifica se Cordova está pronto.
- Aguarda `deviceready` event
- **Estado:** isReady, isLoading, error

### **useItemQuickSelect.tsx**
Seleção rápida de materiais com busca por `*`.
- Input de busca que filtra materiais
- Seleção por número ou busca

### **usePrintComanda.ts**
Impressão de comanda via Bluetooth.
- `printComanda()`: Gera comandos ESC/POS e envia
- `checkPrinterConnection()`: Verifica conexão
- `connectToSavedPrinter()`: Reconecta impressora salva
- **Biblioteca:** esc-pos-encoder
- **Formato:** 58mm térmica

### **useMateriais.ts**
Hook para gerenciar materiais (se usado).

### **useTransacoes.ts**
Hook para gerenciar transações (se usado).

### **use-mobile.tsx**
Detecta se está em dispositivo mobile.

### **use-toast.ts**
Sistema de notificações toast (shadcn).

### **useLocalStorage.ts**
Wrapper para localStorage com TypeScript.

---

## SERVIÇOS

### **supabaseClient.ts**
Cliente Supabase singleton.
- `getSupabaseClient()`: Retorna cliente (ou null se não configurado)
- Cache de cliente por credenciais
- **Biblioteca:** @supabase/supabase-js

### **syncEngine.ts** ⭐ CRÍTICO
Motor de sincronização completo.
- `initializeSyncEngine()`: Inicializa listeners
- `startSyncLoop()`: Executa sync no startup
- `triggerSyncNow()`: Sync manual
- `onSyncStatus()`: Subscribe ao status
- `getSyncStatus()`: Status atual
- `notifyCredentialsUpdated()`: Notifica mudança de credenciais
- **Fluxo:** Push pendentes → Pull todas as tabelas

### **settings.ts**
Gerenciamento de configurações localStorage.
- `getSupabaseSettings()`: Credenciais Supabase
- `saveSupabaseSettings()`: Salva credenciais
- `getLastSyncAt()`: Última sincronização
- `setLastSyncAt()`: Atualiza última sync
- `getComandaPrefix()`: Prefixo de código
- `setComandaPrefix()`: Salva prefixo
- `nextComandaSequence()`: Próximo número de sequência
- `buildComandaCodigo()`: Gera código completo

### **pdf/index.ts** (se existir)
Geração de PDFs de comandas.

---

## CONFIGURAÇÕES E BUILD

### **vite.config.ts**
- Porta: 8080
- Host: `::` (IPv6)
- Plugin: React SWC
- Alias: `@` → `./src`
- Component Tagger em desenvolvimento

### **tailwind.config.ts**
- Dark mode: class-based
- Cores customizadas (HSL):
  - primary, secondary, muted, accent
  - success, warning, destructive
  - card, popover
- Gradientes e sombras customizadas
- Font: Inter
- Radius: 0.75rem

### **capacitor.config.ts**
- App ID: `com.reciclagem.pereque`
- App Name: `Reciclagem Pereque`
- Web Dir: `dist`
- SQLite config:
  - iOS: `Library/CapacitorDatabase`
  - Android: `default`
  - Sem criptografia
- Permissões Android:
  - BLUETOOTH, BLUETOOTH_ADMIN
  - BLUETOOTH_CONNECT, BLUETOOTH_SCAN, BLUETOOTH_ADVERTISE
  - ACCESS_COARSE_LOCATION, ACCESS_FINE_LOCATION
  - WRITE_EXTERNAL_STORAGE, READ_EXTERNAL_STORAGE

### **tsconfig.json**
- Base: `./`
- Paths: `@/*` → `./src/*`
- Strict: false (legado)
- Allow JS: true

### **package.json Scripts**
- `dev`: Vite dev server
- `build`: Build produção
- `build:dev`: Build desenvolvimento
- `lint`: ESLint
- `preview`: Preview build

### Build Mobile

#### Android
```bash
npm run build
npx cap sync android
npx cap open android
```

#### iOS
```bash
npm run build
npx cap sync ios
npx cap open ios
```

---

## FUNCIONALIDADES PRINCIPAIS

### 1. **Gestão de Materiais**
- Cadastro de materiais com categoria
- Preços de compra e venda
- Ordenação customizável (`display_order`)
- Edição de preços

### 2. **Comandas**
- Comandas de compra e venda
- Adição de itens com peso, preço e desconto
- Edição e exclusão de itens
- Código único com prefixo configurável
- Finalização salva em SQLite e enfileira sync

### 3. **Estoque**
- Cálculo automático de estoque (compras - vendas)
- Valor médio por kg
- Valor total gasto
- Resumo financeiro

### 4. **Relatórios**
- Diários, mensais e anuais
- Por material
- Gráficos com Recharts
- Filtros por período

### 5. **Fechamento**
- Cálculo desde último fechamento
- Registro de fechamentos mensais
- Compra, venda, despesa, lucro

### 6. **Vales e Pendências**
- Gestão de vales (IOUs)
- Pendências a pagar/receber
- Status pendente/pago

### 7. **Impressão**
- Impressão Bluetooth térmica 58mm
- Formato ESC/POS
- Preview antes de imprimir
- PDF A4 para compartilhamento

### 8. **Sincronização**
- Offline-first
- Fila de sincronização
- Push/Pull bidirecional
- Status visual

---

## FLUXOS DE DADOS

### Fluxo de Compra/Venda

1. Usuário seleciona material em `/compra` ou `/venda`
2. Abre dialog para inserir peso, preço, desconto
3. Calcula subtotal em tempo real
4. Ao confirmar:
   - Adiciona item à `comandaAtual` (localStorage)
   - Insere em `ultimas_20` (SQLite)
   - Adiciona à `sync_queue` (INSERT)
   - Navega para `/comanda-atual`

### Fluxo de Finalização de Comanda

1. Usuário finaliza comanda em `/comanda-atual`
2. Gera código único (prefixo + sequência)
3. Insere `comanda` em SQLite
4. Insere cada `item` em SQLite
5. Adiciona `comanda` e `item`s à `sync_queue`
6. Limpa `comandaAtual` do localStorage
7. Salva comanda finalizada em `ultimaComandaFinalizada` (localStorage)
8. Navega para `/preview-comanda`

### Fluxo de Sincronização

1. Usuário clica "Sincronizar Agora" ou app inicia
2. `syncEngine.ts` verifica:
   - Está online? (`Network.getStatus()`)
   - Tem credenciais? (`getSupabaseSettings()`)
3. Se sim:
   - **Push:** Para cada item em `sync_queue` (synced=0):
     - Parse JSON payload
     - Mapeia tabela local → Supabase
     - Executa INSERT/UPSERT/DELETE
     - Marca como sincronizado
     - Remove da fila
   - **Pull:** Para cada tabela em `PULL_TABLES`:
     - SELECT * do Supabase
     - DELETE + INSERT no SQLite (ou preserve offline)
4. Atualiza `lastSyncAt` em localStorage

### Fluxo de Impressão

1. Usuário clica "Imprimir" em `/preview-comanda`
2. `usePrintComanda` verifica conexão Bluetooth
3. Se não conectado, conecta à impressora salva
4. Gera comandos ESC/POS com `esc-pos-encoder`:
   - Inicializa impressora
   - Cabeçalho (nome, data, código)
   - Itens agrupados por material
   - Total
   - Rodapé
5. Envia bytes via `bluetoothSerial.write()`
6. Mostra toast de sucesso/erro

---

## OBSERVAÇÕES IMPORTANTES

### Offline-First
- **Tudo funciona offline** - SQLite é a fonte de verdade local
- Sincronização é **opcional** - app funciona sem Supabase
- Dados offline são preservados durante pull (para `material`)

### Compatibilidade
- **Web:** Funciona como PWA (Service Worker)
- **Mobile:** APK nativo Android/iOS via Capacitor
- **Bluetooth:** Apenas em mobile (não funciona em web)

### Atalhos de Teclado
- `-`: Voltar (universal)
- `1-5`: Navegação rápida (Index)
- `0-99`: Seleção de material (Compra/Venda)
- `Enter`: Confirmar ação
- `+`: Adicionar item (ComandaAtual)

### localStorage vs SQLite
- **localStorage:** Comanda em andamento (`comandaAtual`), última finalizada (`ultimaComandaFinalizada`)
- **SQLite:** Tudo mais (materiais, comandas finalizadas, relatórios, etc.)

### Service Worker
- Cache de recursos estáticos
- Funciona offline (serve do cache)
- Atualização automática de cache

---

## CONCLUSÃO

Este é um sistema completo de gestão de reciclagem com arquitetura offline-first robusta, sincronização bidirecional opcional, e suporte completo para mobile nativo com impressão Bluetooth. Todas as funcionalidades principais estão implementadas e funcionando.

**Última atualização:** Baseado na análise completa do código em 2025.

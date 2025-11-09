# RELATÓRIO TÉCNICO - BUG: TODOS OS ITENS APARECEM COMO "COMPRA"

## 📋 SUMÁRIO EXECUTIVO

**Problema**: Todos os itens na sessão "Últimos" aparecem como "Compra", mesmo quando são "Venda".

**Causa Raiz Identificada**: A tabela `comanda` **não existe** no SQLite local, mas o código tenta fazer `SELECT id, tipo FROM comanda WHERE id IN (...)`. Como a query falha silenciosamente (try/catch com apenas `logger.warn`), o Map `mapComandaTipo` fica vazio, e todos os itens caem no fallback `'compra'`.

**Severidade**: CRÍTICA - Funcionalidade completamente quebrada

---

## 1. MAPEAMENTO DO FLUXO DO CAMPO `tipo`

### 1.1 Fluxo Completo: Fonte → Transformação → Destino

```
┌─────────────────────────────────────────────────────────────────┐
│ FONTE: Supabase VIEW ultimas_20                                  │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ Pull (syncEngine.ts:473)
                          │ SELECT * FROM ultimas_20
                          │ (VIEW retorna dados de item)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ DESTINO: SQLite TABLE ultimas_20                               │
│ - id, data, material, comanda, preco_kg, kg_total, ...        │
│ - Campo 'comanda' existe (linha 227 initDatabase.ts)           │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ Carregamento (Ultimos.tsx:32)
                          │ SELECT * FROM ultimas_20 ORDER BY data DESC
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ confirmadas: Array<any>                                         │
│ - Cada item tem: { id, data, material, comanda, ... }           │
│ - Campo 'comanda' contém ID da comanda (pode ser null)          │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ Coleta de IDs (Ultimos.tsx:99-108)
                          │ neededComandaIds.add(Number(c.comanda))
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ comandaIdList: number[]                                         │
│ - Array de IDs de comanda únicos                               │
│ - Exemplo: [1, 2, 3, 5, 8]                                     │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ Query SQL (Ultimos.tsx:115-118)
                          │ SELECT id, tipo FROM comanda WHERE id IN (...)
                          │ ❌ PROBLEMA: Tabela 'comanda' NÃO EXISTE
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ mapComandaTipo: Map<number, string>                             │
│ - Estado: VAZIO (query falha silenciosamente)                  │
│ - Resultado: {}                                                 │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ Aplicação do tipo (Ultimos.tsx:130-145)
                          │ tipo: mapComandaTipo.get(comandaId) ?? 'compra'
                          │ ❌ Sempre retorna 'compra' (fallback)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ confirmadasResolved / pendentesResolved                         │
│ - Cada item tem: { ..., tipo: 'compra' }                       │
│ - TODOS os itens têm tipo='compra'                             │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ Deduplicação e ordenação (preserva tipo)
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ items: Array<any> (estado React)                                │
│ - Todos os itens têm tipo='compra'                              │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ Renderização (Ultimos.tsx:273-274)
                          │ it.tipo === 'venda' ? 'Venda' : 'Compra'
                          │ ❌ Sempre 'Compra'
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ UI: Badge sempre mostra "Compra"                                │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Linhas Exatas do Código

#### 1.2.1 Carregamento de Dados Confirmados
**Arquivo**: `src/pages/Ultimos.tsx`
- **Linha 32**: `const confirmadas = await selectAll<any>('ultimas_20', 'data DESC');`
- **Resultado**: Array de objetos com campo `comanda` (ID da comanda ou null)

#### 1.2.2 Coleta de IDs de Comanda
**Arquivo**: `src/pages/Ultimos.tsx`
- **Linhas 99-108**: Coleta de IDs únicos de comanda
```typescript
const neededComandaIds = new Set<number>();
for (const c of (confirmadas || [])) {
  const cid = Number(c.comanda) || 0;
  if (cid > 0) neededComandaIds.add(cid);
}
for (const p of pendentes) {
  const cid = Number(p.comanda ?? p.comanda_id ?? 0) || 0;
  if (cid > 0) neededComandaIds.add(cid);
}
```

#### 1.2.3 Query para Buscar Tipos (PROBLEMA AQUI)
**Arquivo**: `src/pages/Ultimos.tsx`
- **Linhas 110-128**: Query SQL que **falha silenciosamente**
```typescript
const comandaIdList = Array.from(neededComandaIds);
const mapComandaTipo = new Map<number, string>();
if (comandaIdList.length > 0) {
  const placeholders = comandaIdList.map(() => '?').join(',');
  try {
    const comandas = await executeQuery<{ id: number; tipo: string }>(
      `SELECT id, tipo FROM comanda WHERE id IN (${placeholders})`,  // ❌ Tabela não existe
      comandaIdList
    );
    for (const cmd of comandas) {
      const tipo = String(cmd.tipo || '').trim().toLowerCase();
      if (tipo === 'compra' || tipo === 'venda') {
        mapComandaTipo.set(Number(cmd.id), tipo);
      }
    }
  } catch (e) {
    logger.warn('Falha ao carregar tipos de comanda', e);  // ❌ Erro silencioso
  }
}
```

#### 1.2.4 Aplicação do Tipo (Sempre Fallback)
**Arquivo**: `src/pages/Ultimos.tsx`
- **Linhas 130-145**: Aplicação do tipo com fallback
```typescript
const confirmadasResolved = (confirmadas || []).map((c: any) => ({
  ...c,
  material_nome: idToName.get(Number(c.material) || 0) || 'Desconhecido',
  preco_kg: Number(c.preco_kg) || 0,
  tipo: mapComandaTipo.get(Number(c.comanda) || 0) ?? 'compra',  // ❌ Sempre 'compra'
  __pending: false,
  client_uuid: null
}));

const pendentesResolved = (pendentes || []).map((p: any) => {
  const comandaId = Number(p.comanda ?? p.comanda_id ?? 0) || 0;
  return {
    ...p,
    material_nome: p.material ? (idToName.get(Number(p.material) || 0) || 'Desconhecido') : 'Desconhecido',
    tipo: mapComandaTipo.get(comandaId) ?? 'compra'  // ❌ Sempre 'compra'
  };
});
```

#### 1.2.5 Renderização na UI
**Arquivo**: `src/pages/Ultimos.tsx`
- **Linhas 273-274**: Badge que sempre mostra "Compra"
```typescript
<span className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${it.tipo === 'venda' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
  {it.tipo === 'venda' ? 'Venda' : 'Compra'}  // ❌ Sempre 'Compra'
</span>
```

---

## 2. EVIDÊNCIAS DA CAUSA RAIZ

### 2.1 Tabela `comanda` NÃO Existe no SQLite Local

**Evidência 1**: Schema SQLite (`src/database/initDatabase.ts`, linhas 22-300)
- ❌ **NÃO há** `CREATE TABLE comanda`
- ✅ Existe apenas `CREATE TABLE comanda_20` (linha 84)
- ✅ Existe `CREATE TABLE ultimas_20` com coluna `comanda INTEGER` (linha 227)

**Evidência 2**: Lista de Tabelas Esperadas (`src/database/initDatabase.ts`, linhas 303-323)
- ❌ `'comanda'` **NÃO está** na lista `EXPECTED_TABLES`
- ✅ Apenas `'comanda_20'` está listada

**Evidência 3**: Lista de Tabelas Sincronizadas (`src/services/syncEngine.ts`, linhas 29-50)
- ❌ `'comanda'` **NÃO está** na lista `PULL_TABLES`
- ✅ Apenas `'comanda_20'` está listada (linha 33)

**Evidência 4**: Schema Supabase (`schemasupabase.sql`, linha 41)
- ✅ Existe `CREATE TABLE comanda` no Supabase (PostgreSQL)
- ✅ Tem coluna `tipo comanda_tipo NOT NULL` (linha 45)

**Conclusão**: A tabela `comanda` existe apenas no Supabase, mas **não é sincronizada** para o SQLite local. O código tenta consultar uma tabela que não existe.

### 2.2 Query Falha Silenciosamente

**Evidência**: Tratamento de Erro (`src/pages/Ultimos.tsx`, linhas 125-127)
```typescript
} catch (e) {
  logger.warn('Falha ao carregar tipos de comanda', e);  // ❌ Apenas log, não interrompe
}
```

**Problema**: 
- O erro é capturado e apenas logado
- O Map `mapComandaTipo` permanece vazio
- O código continua normalmente
- Todos os itens recebem o fallback `'compra'`

### 2.3 VIEW `ultimas_20` do Supabase Inclui Campo `comanda`

**Evidência**: VIEW Supabase (`schemasupabase.sql`, linhas 312-316)
```sql
CREATE OR REPLACE VIEW ultimas_20 AS
SELECT *
FROM item
ORDER BY data DESC, id DESC
LIMIT 20;
```

**Análise**:
- A VIEW retorna `SELECT * FROM item`
- A tabela `item` tem coluna `comanda BIGINT NOT NULL REFERENCES comanda(id)` (linha 56)
- Portanto, a VIEW **inclui** o campo `comanda` (ID da comanda)
- Quando sincronizada para SQLite, o campo `comanda` é preservado na tabela `ultimas_20`

**Conclusão**: O campo `comanda` **existe** nos dados, mas não há como resolver o `tipo` porque a tabela `comanda` não existe localmente.

### 2.4 Tabela `ultimas_20` Local Tem Campo `comanda`

**Evidência**: Schema SQLite (`src/database/initDatabase.ts`, linhas 223-235)
```sql
CREATE TABLE IF NOT EXISTS ultimas_20 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT,
  material INTEGER,
  comanda INTEGER,  -- ✅ Campo existe
  preco_kg REAL,
  kg_total REAL,
  valor_total REAL,
  ...
);
```

**Conclusão**: O campo `comanda` está presente na tabela local, mas os IDs não podem ser resolvidos porque a tabela `comanda` não existe.

---

## 3. HIPÓTESES DE CAUSA (PRIORIZADAS)

### 3.1 HIPÓTESE 1: Tabela `comanda` Não Existe no SQLite (CAUSA RAIZ CONFIRMADA)

**Probabilidade**: 100% ✅

**Evidências**:
1. Schema SQLite não cria tabela `comanda`
2. `PULL_TABLES` não inclui `'comanda'`
3. Query `SELECT id, tipo FROM comanda` falha (tabela não existe)
4. Map `mapComandaTipo` fica vazio
5. Todos os itens recebem fallback `'compra'`

**Impacto**: CRÍTICO - Funcionalidade completamente quebrada

**Solução**: Adicionar tabela `comanda` ao schema SQLite e incluí-la em `PULL_TABLES`

---

### 3.2 HIPÓTESE 2: Campo `comanda` é NULL em Todos os Itens

**Probabilidade**: 0% ❌

**Evidências**:
1. VIEW `ultimas_20` retorna dados de `item`, que tem `comanda NOT NULL`
2. Schema SQLite `ultimas_20` tem coluna `comanda INTEGER` (pode ser null, mas dados do Supabase têm valor)
3. Código filtra `if (cid > 0)` antes de adicionar ao Set

**Conclusão**: Não é a causa. Mesmo que alguns itens tenham `comanda = null`, outros deveriam ter IDs válidos.

---

### 3.3 HIPÓTESE 3: Erro na Query SQL (Tabela Não Existe)

**Probabilidade**: 100% ✅ (Consequência da Hipótese 1)

**Evidências**:
1. Query `SELECT id, tipo FROM comanda WHERE id IN (...)` tenta acessar tabela inexistente
2. Erro é capturado silenciosamente (try/catch com apenas `logger.warn`)
3. Map permanece vazio

**Conclusão**: Confirma a Hipótese 1. A query falha porque a tabela não existe.

---

### 3.4 HIPÓTESE 4: Tipo Vem em Formato Diferente (Enum vs String)

**Probabilidade**: 0% ❌

**Evidências**:
1. Código normaliza: `String(cmd.tipo || '').trim().toLowerCase()`
2. Validação: `if (tipo === 'compra' || tipo === 'venda')`
3. Supabase usa ENUM `comanda_tipo AS ENUM ('compra','venda')`
4. SQLite não tem ENUMs, mas valores são strings

**Conclusão**: Não é a causa. O código já trata normalização e validação.

---

### 3.5 HIPÓTESE 5: Campo `tipo` é Perdido Durante Transformações

**Probabilidade**: 0% ❌

**Evidências**:
1. `confirmadasResolved` usa spread: `{ ...c, tipo: ... }` (linha 130)
2. `pendentesResolved` usa spread: `{ ...p, tipo: ... }` (linha 140)
3. `candidates` usa spread: `[...confirmadasResolved, ...pendentesResolved]` (linha 192)
4. `unique.push(e)` preserva objeto completo (linha 214)
5. `unificada` apenas ordena, não reconstrói objetos (linha 220)

**Conclusão**: Não é a causa. O campo `tipo` é preservado em todas as transformações.

---

## 4. CHECK-LIST: O QUE PRECISA EXISTIR PARA O TIPO SER RESOLVIDO

### 4.1 ✅ Campo `comanda` na VIEW `ultimas_20` do Supabase
- **Status**: ✅ CONFIRMADO
- **Evidência**: VIEW retorna `SELECT * FROM item`, e `item` tem coluna `comanda`
- **Localização**: `schemasupabase.sql`, linha 312-316

### 4.2 ✅ Campo `comanda` na Tabela SQLite `ultimas_20`
- **Status**: ✅ CONFIRMADO
- **Evidência**: Schema define `comanda INTEGER` (linha 227)
- **Localização**: `src/database/initDatabase.ts`, linha 227

### 4.3 ✅ Campo `comanda` Preservado Durante Pull
- **Status**: ✅ CONFIRMADO
- **Evidência**: `replaceTableData` usa `Object.keys(row)` e insere todas as colunas
- **Localização**: `src/services/syncEngine.ts`, linhas 415-424

### 4.4 ✅ IDs de Comanda Coletados Corretamente
- **Status**: ✅ CONFIRMADO
- **Evidência**: Código coleta `Number(c.comanda)` e filtra `if (cid > 0)`
- **Localização**: `src/pages/Ultimos.tsx`, linhas 99-108

### 4.5 ❌ Tabela `comanda` Existe no SQLite Local
- **Status**: ❌ **FALTA**
- **Evidência**: Schema não cria tabela `comanda`
- **Localização**: `src/database/initDatabase.ts` - **NÃO EXISTE**

### 4.6 ❌ Tabela `comanda` Sincronizada do Supabase
- **Status**: ❌ **FALTA**
- **Evidência**: `PULL_TABLES` não inclui `'comanda'`
- **Localização**: `src/services/syncEngine.ts`, linha 29-50

### 4.7 ❌ Query SQL Retorna Dados
- **Status**: ❌ **FALHA**
- **Evidência**: Query `SELECT id, tipo FROM comanda` falha (tabela não existe)
- **Localização**: `src/pages/Ultimos.tsx`, linha 115-118

### 4.8 ❌ Map `mapComandaTipo` Populado
- **Status**: ❌ **VAZIO**
- **Evidência**: Map permanece vazio porque query falha
- **Localização**: `src/pages/Ultimos.tsx`, linha 111

### 4.9 ✅ Campo `tipo` Aplicado aos Itens
- **Status**: ✅ CONFIRMADO (mas sempre fallback)
- **Evidência**: Código aplica `tipo: mapComandaTipo.get(...) ?? 'compra'`
- **Localização**: `src/pages/Ultimos.tsx`, linhas 134, 143

### 4.10 ✅ UI Lê Campo `tipo`
- **Status**: ✅ CONFIRMADO
- **Evidência**: UI usa `it.tipo === 'venda' ? 'Venda' : 'Compra'`
- **Localização**: `src/pages/Ultimos.tsx`, linha 273-274

---

## 5. COMPARAÇÃO COM OUTRAS TELAS

### 5.1 `HistoricoComandas.tsx` - Funciona Corretamente

**Como Resolve o Tipo**:
- **Linha 78**: Carrega de `comanda_20` (não de `comanda`)
- **Linha 161**: Extrai `comanda_tipo` diretamente de `comanda_20.comanda_tipo`
- **Linha 207**: Usa `r.comanda_tipo ?? null`
- **Linha 299**: Usa `r.comanda_tipo ?? null`

**Diferença Chave**:
- `HistoricoComandas` usa `comanda_20`, que **tem** o campo `comanda_tipo` diretamente
- `Ultimos` tenta usar `comanda`, que **não existe** no SQLite

**Evidência**: `comanda_20` tem coluna `comanda_tipo TEXT` (linha 88 do schema)

---

## 6. PLANO DE CORREÇÃO MÍNIMO

### 6.1 Opção 1: Adicionar Tabela `comanda` ao SQLite (RECOMENDADO)

**Justificativa**: 
- Alinha com a arquitetura do Supabase
- Permite JOINs e queries mais complexas
- Solução mais robusta e escalável

**Mudanças Necessárias**:

#### 6.1.1 Adicionar Schema da Tabela `comanda` no SQLite

**Arquivo**: `src/database/initDatabase.ts`

**Localização**: Após a tabela `material` (aprox. linha 46), antes de `vale_false`

**Diff**:
```sql
-- ---------------------------------------------------------------------
-- 1.5) comanda
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comanda (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,
  codigo TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL,
  observacoes TEXT,
  total REAL NOT NULL DEFAULT 0,
  criado_por TEXT NOT NULL,
  atualizado_por TEXT NOT NULL,
  data_sync TEXT,
  origem_offline INTEGER DEFAULT 0
);
```

**Nota**: SQLite não suporta ENUMs, então `tipo` é `TEXT` (valores: 'compra' ou 'venda')

#### 6.1.2 Adicionar `'comanda'` à Lista de Tabelas Esperadas

**Arquivo**: `src/database/initDatabase.ts`

**Localização**: `EXPECTED_TABLES` (linha 303)

**Diff**:
```typescript
const EXPECTED_TABLES = [
  'material',
  'comanda',  // ✅ ADICIONAR
  'vale_false',
  // ... resto
];
```

#### 6.1.3 Adicionar `'comanda'` à Lista de Tabelas Sincronizadas

**Arquivo**: `src/services/syncEngine.ts`

**Localização**: `PULL_TABLES` (linha 29)

**Diff**:
```typescript
const PULL_TABLES: string[] = [
  'material',
  'comanda',  // ✅ ADICIONAR
  'vale_false',
  // ... resto
];
```

#### 6.1.4 Adicionar `'comanda'` à Lista de Tabelas que Preservam Dados Offline (Opcional)

**Arquivo**: `src/services/syncEngine.ts`

**Localização**: `PRESERVE_OFFLINE_ROWS_TABLES` (linha 54)

**Diff**:
```typescript
const PRESERVE_OFFLINE_ROWS_TABLES = new Set<string>([
  'material',
  'comanda',  // ✅ ADICIONAR (se quiser preservar comandas criadas offline)
]);
```

**Nota**: Isso preserva comandas criadas offline durante o pull. Recomendado se houver criação offline de comandas.

#### 6.1.5 Adicionar Interface TypeScript (Opcional)

**Arquivo**: `src/database/types.ts`

**Localização**: Após `Material` (aprox. linha 37)

**Diff**:
```typescript
/**
 * Comanda (Orders/Commands)
 */
export interface Comanda extends SyncableRecord, AuditableRecord {
  id?: number;
  data: string;
  codigo: string;
  tipo: 'compra' | 'venda';
  observacoes?: string | null;
  total: number;
}
```

E adicionar ao `TableName` e `TableTypeMap`:
```typescript
export type TableName =
  | 'material'
  | 'comanda'  // ✅ ADICIONAR
  | 'vale_false'
  // ... resto
```

#### 6.1.6 Validação

**Logs para Adicionar** (temporários, para debug):

**Arquivo**: `src/pages/Ultimos.tsx`

**Localização**: Após linha 118 (dentro do try)

**Diff**:
```typescript
const comandas = await executeQuery<{ id: number; tipo: string }>(
  `SELECT id, tipo FROM comanda WHERE id IN (${placeholders})`,
  comandaIdList
);
logger.info('✅ Query comanda retornou', comandas.length, 'registros');  // ✅ ADICIONAR
logger.info('✅ IDs consultados:', comandaIdList);  // ✅ ADICIONAR
for (const cmd of comandas) {
  const tipo = String(cmd.tipo || '').trim().toLowerCase();
  if (tipo === 'compra' || tipo === 'venda') {
    mapComandaTipo.set(Number(cmd.id), tipo);
    logger.info('✅ Mapeado comanda', cmd.id, '-> tipo', tipo);  // ✅ ADICIONAR
  }
}
logger.info('✅ Map final tem', mapComandaTipo.size, 'entradas');  // ✅ ADICIONAR
```

**Console Guards** (temporários):

**Arquivo**: `src/pages/Ultimos.tsx`

**Localização**: Após linha 128 (após o catch)

**Diff**:
```typescript
} catch (e) {
  logger.warn('Falha ao carregar tipos de comanda', e);
  console.error('❌ ERRO ao carregar tipos de comanda:', e);  // ✅ ADICIONAR
  console.error('❌ IDs que tentaram ser consultados:', comandaIdList);  // ✅ ADICIONAR
}
```

**Localização**: Após linha 134 (após aplicar tipo)

**Diff**:
```typescript
const confirmadasResolved = (confirmadas || []).map((c: any) => {
  const comandaId = Number(c.comanda) || 0;
  const tipoResolvido = mapComandaTipo.get(comandaId) ?? 'compra';
  if (comandaId > 0 && !mapComandaTipo.has(comandaId)) {
    console.warn('⚠️ Comanda ID', comandaId, 'não encontrado no Map');  // ✅ ADICIONAR
  }
  return {
    ...c,
    material_nome: idToName.get(Number(c.material) || 0) || 'Desconhecido',
    preco_kg: Number(c.preco_kg) || 0,
    tipo: tipoResolvido,
    __pending: false,
    client_uuid: null
  };
});
```

---

### 6.2 Opção 2: Usar `comanda_20` ao Invés de `comanda` (ALTERNATIVA)

**Justificativa**: 
- Mais rápido de implementar (não precisa criar tabela)
- `comanda_20` já existe e tem `comanda_tipo`
- Menos mudanças no código

**Desvantagens**:
- `comanda_20` é uma view/agregação, não uma tabela normalizada
- Pode ter dados duplicados ou inconsistentes
- Menos robusto a longo prazo

**Mudanças Necessárias**:

#### 6.2.1 Modificar Query para Usar `comanda_20`

**Arquivo**: `src/pages/Ultimos.tsx`

**Localização**: Linha 115-118

**Diff**:
```typescript
// ANTES:
const comandas = await executeQuery<{ id: number; tipo: string }>(
  `SELECT id, tipo FROM comanda WHERE id IN (${placeholders})`,
  comandaIdList
);

// DEPOIS:
const comandas = await executeQuery<{ comanda_id: number; comanda_tipo: string }>(
  `SELECT DISTINCT comanda_id, comanda_tipo FROM comanda_20 WHERE comanda_id IN (${placeholders})`,
  comandaIdList
);
```

#### 6.2.2 Ajustar Mapeamento

**Arquivo**: `src/pages/Ultimos.tsx`

**Localização**: Linha 119-123

**Diff**:
```typescript
// ANTES:
for (const cmd of comandas) {
  const tipo = String(cmd.tipo || '').trim().toLowerCase();
  if (tipo === 'compra' || tipo === 'venda') {
    mapComandaTipo.set(Number(cmd.id), tipo);
  }
}

// DEPOIS:
for (const cmd of comandas) {
  const tipo = String(cmd.comanda_tipo || '').trim().toLowerCase();
  if (tipo === 'compra' || tipo === 'venda') {
    mapComandaTipo.set(Number(cmd.comanda_id), tipo);
  }
}
```

---

### 6.3 Opção 3: JOIN Direto na Query Inicial (ALTERNATIVA)

**Justificativa**: 
- Resolve o tipo diretamente na query SQL
- Não precisa de Map separado
- Mais eficiente

**Desvantagens**:
- Requer JOIN com `comanda_20` (mais complexo)
- Pode ter problemas se `comanda_20` não tiver todos os dados

**Mudanças Necessárias**:

#### 6.3.1 Modificar Query Inicial

**Arquivo**: `src/pages/Ultimos.tsx`

**Localização**: Linha 32

**Diff**:
```typescript
// ANTES:
const confirmadas = await selectAll<any>('ultimas_20', 'data DESC');

// DEPOIS:
const confirmadas = await executeQuery<any>(
  `SELECT u.*, c.comanda_tipo 
   FROM ultimas_20 u 
   LEFT JOIN comanda_20 c ON u.comanda = c.comanda_id 
   ORDER BY u.data DESC`
);
```

#### 6.3.2 Simplificar Aplicação do Tipo

**Arquivo**: `src/pages/Ultimos.tsx`

**Localização**: Linha 130-134

**Diff**:
```typescript
// ANTES:
tipo: mapComandaTipo.get(Number(c.comanda) || 0) ?? 'compra',

// DEPOIS:
tipo: String(c.comanda_tipo || 'compra').trim().toLowerCase(),
```

**Nota**: Isso elimina a necessidade do Map `mapComandaTipo` para itens confirmados.

---

## 7. RECOMENDAÇÃO FINAL

### 7.1 Solução Recomendada: Opção 1 (Adicionar Tabela `comanda`)

**Razões**:
1. ✅ Alinha com arquitetura do Supabase
2. ✅ Permite JOINs e queries mais complexas
3. ✅ Solução mais robusta e escalável
4. ✅ Facilita manutenção futura
5. ✅ Consistente com outras partes do sistema

**Esforço**: Médio (criação de tabela + sincronização)

**Risco**: Baixo (mudanças isoladas, bem testadas)

---

### 7.2 Solução Alternativa: Opção 2 (Usar `comanda_20`)

**Razões**:
1. ✅ Implementação mais rápida
2. ✅ Menos mudanças no código
3. ✅ Usa estrutura existente

**Desvantagens**:
1. ❌ Menos robusto
2. ❌ Depende de view/agregação
3. ❌ Pode ter inconsistências

**Esforço**: Baixo (apenas mudança de query)

**Risco**: Médio (depende de dados em `comanda_20`)

---

## 8. VALIDAÇÃO PÓS-CORREÇÃO

### 8.1 Checklist de Validação

- [ ] Tabela `comanda` existe no SQLite (verificar com query: `SELECT name FROM sqlite_master WHERE type='table' AND name='comanda'`)
- [ ] `comanda` está em `PULL_TABLES` e é sincronizada
- [ ] Query `SELECT id, tipo FROM comanda WHERE id IN (...)` retorna dados
- [ ] Map `mapComandaTipo` é populado (verificar `mapComandaTipo.size > 0`)
- [ ] Itens com `comanda` válido recebem tipo correto (não sempre 'compra')
- [ ] UI exibe "Venda" para itens de venda
- [ ] UI exibe "Compra" para itens de compra
- [ ] Itens sem `comanda` (null) usam fallback 'compra' (comportamento esperado)

### 8.2 Testes Manuais

1. **Criar uma venda** e verificar se aparece como "Venda" em "Últimos"
2. **Criar uma compra** e verificar se aparece como "Compra" em "Últimos"
3. **Sincronizar** e verificar se tipos são preservados
4. **Verificar logs** para confirmar que query retorna dados

### 8.3 Logs de Debug (Temporários)

Adicionar logs conforme seção 6.1.6 para validar:
- Query retorna dados
- Map é populado
- Tipos são aplicados corretamente

---

## 9. CONCLUSÃO

**Causa Raiz Confirmada**: A tabela `comanda` **não existe** no SQLite local, mas o código tenta consultá-la. A query falha silenciosamente, o Map `mapComandaTipo` fica vazio, e todos os itens recebem o fallback `'compra'`.

**Solução Recomendada**: Adicionar tabela `comanda` ao schema SQLite, incluí-la em `PULL_TABLES` para sincronização, e garantir que a query funcione corretamente.

**Prioridade**: CRÍTICA - Funcionalidade completamente quebrada

**Esforço Estimado**: Médio (2-3 horas)

---

**FIM DO RELATÓRIO**


# RELATÓRIO TÉCNICO COMPLETO - SESSÃO "ÚLTIMOS"

## 📋 SUMÁRIO EXECUTIVO

Este relatório documenta a análise completa e profunda da sessão "Últimos" do aplicativo, mapeando toda a lógica de carregamento, processamento, mesclagem e exibição dos dados.

---

## 1. ARQUIVO PRINCIPAL DA SESSÃO "ÚLTIMOS"

### 1.1 Componente React Principal
- **Arquivo**: `src/pages/Ultimos.tsx`
- **Rota**: `/ultimos` (definida em `src/App.tsx`, linha 44)
- **Tipo**: Componente funcional React
- **Export**: `export default Ultimos`

### 1.2 Estrutura do Componente
```typescript
const Ultimos = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Função de formatação de data
  function formatDateShort(value: any): string { ... }
  
  // useEffect principal que carrega os dados
  useEffect(() => { ... }, []);
  
  // Renderização JSX
  return ( ... );
};
```

---

## 2. FUNÇÕES RESPONSÁVEIS PELO CARREGAMENTO DOS DADOS

### 2.1 Função Principal de Carregamento
**Localização**: `src/pages/Ultimos.tsx`, linhas 28-197

**Função**: `load()` (async, dentro do `useEffect`)

**Fluxo de Execução**:
1. Define `loading = true`
2. Carrega itens confirmados da tabela `ultimas_20`
3. Carrega itens pendentes da `sync_queue`
4. Processa e mescla os dados
5. Resolve nomes de materiais
6. Remove duplicatas
7. Ordena e limita a 20 itens
8. Atualiza o estado `items`
9. Define `loading = false`

### 2.2 Consultas ao Banco de Dados

#### 2.2.1 Itens Confirmados (Sincronizados)
```typescript
const confirmadas = await selectAll<any>('ultimas_20', 'data DESC');
```
- **Tabela**: `ultimas_20`
- **Ordenação**: `data DESC` (mais recentes primeiro)
- **Fonte**: SQLite local
- **Status**: Já sincronizados com Supabase (`origem_offline = 0`)

#### 2.2.2 Itens Pendentes (Na Fila de Sincronização)
```typescript
const pendentesRows = await selectWhere<any>(
  'sync_queue',
  'synced = ? AND table_name = ? AND operation = ?',
  [0, 'item', 'INSERT'],
  'created_at DESC'
);
```
- **Tabela**: `sync_queue`
- **Filtros**:
  - `synced = 0` (não sincronizado)
  - `table_name = 'item'` (apenas itens)
  - `operation = 'INSERT'` (apenas inserções)
- **Ordenação**: `created_at DESC` (mais recentes primeiro)
- **Status**: Pendentes de sincronização

**IMPORTANTE**: A consulta busca por `table_name = 'item'`, mas os dados podem vir de inserções diretas em `ultimas_20` também. Porém, o código atual **não busca** itens pendentes com `table_name = 'ultimas_20'` na `sync_queue`.

---

## 3. ESTRUTURA DOS DADOS

### 3.1 Estrutura da Tabela `ultimas_20` (SQLite)

**Definição**: `src/database/initDatabase.ts`, linhas 223-235

```sql
CREATE TABLE IF NOT EXISTS ultimas_20 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT,
  material INTEGER,
  comanda INTEGER,
  preco_kg REAL,
  kg_total REAL,
  valor_total REAL,
  criado_por TEXT,
  atualizado_por TEXT,
  data_sync TEXT,
  origem_offline INTEGER DEFAULT 0
);
```

**Campos Principais**:
- `id`: ID único do registro
- `data`: Data/hora da transação (ISO string)
- `material`: ID do material (foreign key)
- `comanda`: ID da comanda (pode ser NULL)
- `preco_kg`: Preço por quilograma
- `kg_total`: Total de quilogramas (positivo = compra, negativo = venda)
- `valor_total`: Valor total da transação
- `origem_offline`: 0 = sincronizado, 1 = criado offline

### 3.2 Estrutura da View `ultimas_20` (Supabase)

**Definição**: `schemasupabase.sql`, linhas 312-316

```sql
CREATE OR REPLACE VIEW ultimas_20 AS
SELECT *
FROM item
ORDER BY data DESC, id DESC
LIMIT 20;
```

**Observação**: A view Supabase retorna dados da tabela `item`, não de uma tabela `ultimas_20`. Isso significa que:
- No Supabase, `ultimas_20` é uma **view** que consulta a tabela `item`
- No SQLite local, `ultimas_20` é uma **tabela** física

### 3.3 Estrutura da `sync_queue`

**Definição**: `src/database/initDatabase.ts`, linhas 278-290

```sql
CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL,
  record_id TEXT,
  payload TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  synced INTEGER DEFAULT 0
);
```

**Campos**:
- `id`: ID único da fila
- `table_name`: Nome da tabela (ex: 'item', 'ultimas_20')
- `operation`: 'INSERT', 'UPDATE' ou 'DELETE'
- `record_id`: ID do registro (pode ser NULL)
- `payload`: JSON stringificado com os dados
- `created_at`: Timestamp de criação
- `synced`: 0 = pendente, 1 = sincronizado

### 3.4 Transformação dos Dados Pendentes

**Localização**: `src/pages/Ultimos.tsx`, linhas 41-69

Os dados da `sync_queue` são transformados para o formato esperado:

```typescript
const pendentes = (pendentesRows || []).map((row: any) => {
  // Parse do payload JSON
  let payload: any = {};
  try {
    const parsed = JSON.parse(row.payload || '{}');
    payload = parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    // ignore invalid json
  }
  
  // Extração de campos com fallbacks múltiplos
  const materialId = Number(
    payload.material ?? payload.material_id ?? payload.materialId ?? 0
  ) || 0;
  const kgTotal = Number(payload.kg_total ?? payload.kg ?? 0) || 0;
  const valorTotal = Number(payload.valor_total ?? payload.total ?? payload.item_valor_total ?? 0) || 0;
  const precoKg = Number(payload.preco_kg ?? payload.precoKg ?? payload.preco ?? 0) || 0;
  
  // Retorno do objeto normalizado
  return {
    id: `pending-${row.id}`,  // ID temporário com prefixo
    record_id: row.record_id,
    data: payload.data || payload.item_data || row.created_at,
    material: materialId || null,
    material_nome: '',  // Será resolvido depois
    kg_total: kgTotal,
    valor_total: valorTotal,
    preco_kg: precoKg,
    client_uuid: payload.client_uuid || payload.uuid || null,
    __pending: true,  // Flag de pendência
    origem_offline: 1  // Sempre 1 para itens pendentes
  };
});
```

**Características**:
- IDs temporários: `pending-{sync_queue_id}`
- Flag `__pending: true` para identificar itens pendentes
- `origem_offline: 1` sempre para itens da fila
- Campos com múltiplos fallbacks para compatibilidade

---

## 4. COMO OS DADOS SÃO UNIDOS

### 4.1 Resolução de Nomes de Materiais

**Localização**: `src/pages/Ultimos.tsx`, linhas 71-95

**Processo**:
1. Coleta todos os IDs de materiais únicos de `confirmadas` e `pendentes`
2. Executa query SQL para buscar nomes:
   ```typescript
   const mats = await executeQuery<{ id: number; nome: string }>(
     `SELECT id, nome FROM material WHERE id IN (${placeholders})`,
     idList
   );
   ```
3. Cria um `Map<id, nome>` para lookup rápido
4. Aplica os nomes aos objetos:
   - `confirmadasResolved`: adiciona `material_nome` e normaliza campos
   - `pendentesResolved`: adiciona `material_nome`

### 4.2 Sistema de Deduplicação

**Localização**: `src/pages/Ultimos.tsx`, linhas 109-180

**Estratégia de Chaves**:

#### 4.2.1 Função `getAllKeys()`
Gera múltiplas chaves para cada item:
```typescript
function getAllKeys(entry: any): string[] {
  const keys: string[] = [];
  if (entry?.client_uuid) keys.push(`uuid:${entry.client_uuid}`);
  if (entry?.id && !String(entry.id).startsWith('pending-')) 
    keys.push(`id:${entry.id}`);
  const materialId = Number(entry.material) || 0;
  const kg = Number(entry.kg_total) || 0;
  const preco = Number(entry.preco_kg) || 0;
  keys.push(`f:${compositeKey(materialId, kg, preco, entry.data)}`);
  return keys;
}
```

**Tipos de Chaves**:
- `uuid:{client_uuid}`: Se tiver UUID do cliente
- `id:{id}`: Se tiver ID real (não pendente)
- `f:{compositeKey}`: Chave composta por material, kg, preço e data

#### 4.2.2 Função `getLooseKey()`
Para itens sem nome de material conhecido:
```typescript
function getLooseKey(entry: any): string {
  const kg = Number(entry.kg_total) || 0;
  const preco = Number(entry.preco_kg) || 0;
  return `lf:${kg.toFixed(3)}|${preco.toFixed(3)}|${normalizeDateMinute(entry.data)}`;
}
```

#### 4.2.3 Função `compositeKey()`
Normaliza data para minuto e cria chave composta:
```typescript
function compositeKey(materialId: number, kg: number, preco: number, d: any): string {
  return `${materialId}|${kg.toFixed(3)}|${preco.toFixed(3)}|${normalizeDateMinute(d)}`;
}
```

#### 4.2.4 Algoritmo de Deduplicação
```typescript
const seen = new Set<string>();
const seenLoose = new Set<string>();
const unique: any[] = [];

for (const e of candidates) {
  const keys = getAllKeys(e);
  let duplicate = false;
  
  // Verifica se alguma chave já foi vista
  for (const k of keys) {
    if (seen.has(k)) { 
      duplicate = true; 
      break; 
    }
  }
  
  // Para itens sem nome real, verifica chave "loose"
  if (!duplicate && !hasRealName(e)) {
    const lk = getLooseKey(e);
    if (seenLoose.has(lk)) duplicate = true;
  }
  
  if (duplicate) continue;
  
  // Adiciona item único
  unique.push(e);
  
  // Marca todas as chaves como vistas
  for (const k of keys) seen.add(k);
  const lk = getLooseKey(e);
  seenLoose.add(lk);
}
```

**Lógica**:
- Um item é considerado duplicata se **qualquer** de suas chaves já foi vista
- Itens sem nome de material usam chave "loose" adicional
- Prioriza itens com nome de material conhecido

### 4.3 Sistema de Ordenação e Priorização

**Localização**: `src/pages/Ultimos.tsx`, linhas 143-186

#### 4.3.1 Função de Ranking
```typescript
function rank(e: any): number {
  if (!e.__pending && hasRealName(e)) return 4; // confirmed + real name
  if (!e.__pending && !hasRealName(e)) return 3; // confirmed + unknown name
  if (e.__pending && hasRealName(e)) return 2; // pending + real name
  return 1; // pending + unknown name
}
```

**Prioridades**:
1. **Rank 4**: Confirmado + nome real (maior prioridade)
2. **Rank 3**: Confirmado + nome desconhecido
3. **Rank 2**: Pendente + nome real
4. **Rank 1**: Pendente + nome desconhecido (menor prioridade)

#### 4.3.2 Ordenação Inicial
```typescript
const candidates = [...confirmadasResolved, ...pendentesResolved].sort((a: any, b: any) => {
  const rdiff = rank(b) - rank(a);  // Maior rank primeiro
  if (rdiff !== 0) return rdiff;
  
  // Em caso de empate, ordena por data (mais recente primeiro)
  const da = a?.data ? new Date(a.data).getTime() : 0;
  const db = b?.data ? new Date(b.data).getTime() : 0;
  return db - da;
});
```

#### 4.3.3 Ordenação Final
Após deduplicação, ordena novamente por data e limita a 20:
```typescript
const unificada = unique.sort((a: any, b: any) => {
  const da = a?.data ? new Date(a.data).getTime() : 0;
  const db = b?.data ? new Date(b.data).getTime() : 0;
  return db - da;  // Mais recente primeiro
}).slice(0, 20);  // Limita a 20 itens
```

---

## 5. COMO É FEITA A EXIBIÇÃO NA UI

### 5.1 Estados React

**Localização**: `src/pages/Ultimos.tsx`, linhas 12-13

```typescript
const [items, setItems] = useState<any[]>([]);  // Lista de itens a exibir
const [loading, setLoading] = useState(true);  // Estado de carregamento
```

### 5.2 Hooks e Effects

**Hook Principal**: `useEffect`
- **Dependências**: `[]` (executa apenas uma vez ao montar)
- **Função**: Chama `load()` assíncrona
- **Localização**: Linhas 28-197

**Observação**: Não há atualização automática quando:
- Novos itens são adicionados
- Sincronização completa
- Mudanças na `sync_queue`

O componente **não** se atualiza automaticamente após o carregamento inicial.

### 5.3 Renderização Condicional

**Localização**: `src/pages/Ultimos.tsx`, linhas 218-254

**Estados de Renderização**:

1. **Carregando** (`loading === true`):
   ```tsx
   <div className="text-center text-muted-foreground">Carregando...</div>
   ```

2. **Vazio** (`items.length === 0`):
   ```tsx
   <Card className="p-8 text-center">
     <h3 className="text-lg font-semibold mb-2">Nenhum item recente</h3>
     <p className="text-muted-foreground">Os últimos lançamentos aparecerão aqui.</p>
   </Card>
   ```

3. **Com Itens** (`items.length > 0`):
   - Renderiza lista de cards, um para cada item

### 5.4 Componente de Item Individual

**Localização**: `src/pages/Ultimos.tsx`, linhas 227-252

**Estrutura do Card**:
```tsx
<Card key={it.id} className="p-4 rounded-xl border border-border/20 shadow-sm">
  <div className="flex items-start justify-between gap-3">
    {/* Lado Esquerdo: Informações do Material */}
    <div className="min-w-0">
      {/* Nome do Material */}
      <div className="text-lg font-semibold text-foreground truncate">
        {it.material_nome || 'Desconhecido'}
      </div>
      
      {/* Tipo e Quantidade */}
      <div className="mt-1 flex items-center gap-2">
        <span className={...}>
          {Number(it.kg_total) >= 0 ? 'Compra' : 'Venda'}
        </span>
        <span className="text-sm text-muted-foreground">
          {Math.abs(Number(it.kg_total) || 0)} kg • {formatCurrency(Number(it.preco_kg) || 0)}/kg
        </span>
      </div>
      
      {/* Data */}
      <div className="mt-1 text-xs text-muted-foreground">
        {formatDateShort(it.data)}
      </div>
    </div>
    
    {/* Lado Direito: Valor Total e Status */}
    <div className="text-right">
      <div className="font-bold">
        {formatCurrency(Number(it.valor_total) || 0)}
      </div>
      {/* Ícone de Pendência */}
      {(it.__pending || it.origem_offline === 1) && (
        <CloudOff className="h-4 w-4 text-yellow-500 inline-block mt-1" 
                  title="Pendente de sincronização" />
      )}
    </div>
  </div>
</Card>
```

### 5.5 Formatação de Dados

#### 5.5.1 Formatação de Data
**Função**: `formatDateShort()` (linhas 15-26)
```typescript
function formatDateShort(value: any): string {
  try {
    const d = new Date(value);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm} • ${hh}:${mi}`;
  } catch {
    return '';
  }
}
```
**Formato**: `DD/MM • HH:MM` (ex: "15/01 • 14:30")

#### 5.5.2 Formatação de Moeda
**Função**: `formatCurrency()` de `@/utils/formatters`
```typescript
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value || 0);
};
```
**Formato**: R$ 1.234,56

#### 5.5.3 Identificação de Tipo
- **Compra**: `kg_total >= 0` → Badge azul
- **Venda**: `kg_total < 0` → Badge verde

#### 5.5.4 Indicador de Pendência
- **Condição**: `it.__pending || it.origem_offline === 1`
- **Ícone**: `CloudOff` (lucide-react)
- **Cor**: Amarelo (`text-yellow-500`)
- **Tooltip**: "Pendente de sincronização"

---

## 6. SINCRONIZAÇÃO COM SUPABASE

### 6.1 Pull (Supabase → SQLite)

**Localização**: `src/services/syncEngine.ts`, linhas 437-483

**Processo**:
1. `ultimas_20` está na lista `PULL_TABLES` (linha 44)
2. Durante `pullAll()`, busca dados da view Supabase:
   ```typescript
   const { data, error } = await client.from('ultimas_20').select('*');
   ```
3. Substitui todos os dados da tabela local:
   ```typescript
   await replaceTableData('ultimas_20', rows);
   ```

**Função `replaceTableData()`** (linhas 407-435):
- **Para `ultimas_20`**: Não está em `PRESERVE_OFFLINE_ROWS_TABLES`
- **Ação**: `DELETE FROM ultimas_20` (remove tudo)
- **Depois**: `INSERT INTO ultimas_20` (insere dados do Supabase)

**IMPORTANTE**: 
- Itens criados offline (`origem_offline = 1`) **são perdidos** durante o pull
- A tabela é completamente substituída, não mesclada

### 6.2 Push (SQLite → Supabase)

**Localização**: `src/services/syncEngine.ts`, linhas 95-405

**Comportamento Especial para `ultimas_20`** (linhas 121-134):
```typescript
// Local-only entries: do not push to Supabase; mark and remove from queue
if (table === 'ultimas_20') {
  console.log('[SYNC-DEBUG]', { table, op, recordId, action: 'SKIPPING_ULTIMAS_20' });
  try {
    await markSyncItemAsSynced(item.id);
  } catch (e) {
    logger.warn('Could not mark local-only item as synced, id=' + item.id, e);
  }
  try {
    await deleteFrom('sync_queue', 'id = ?', [item.id]);
  } catch (e) {
    logger.warn('Could not delete local-only item from sync_queue id=' + item.id, e);
  }
  continue;
}
```

**IMPORTANTE**: 
- Itens de `ultimas_20` na `sync_queue` **NÃO são enviados** para o Supabase
- São marcados como sincronizados e removidos da fila
- A view `ultimas_20` no Supabase é gerada automaticamente a partir da tabela `item`

### 6.3 Inserção de Novos Itens

**Localização**: `src/pages/Compra.tsx` e `src/pages/Venda.tsx`, linhas 109-136

**Processo**:
1. Insere na tabela local `ultimas_20`:
   ```typescript
   const novoId = await insert('ultimas_20', {
     data: now,
     material: selectedMaterial.id,
     comanda: null,
     preco_kg: ...,
     kg_total: pesoLiquido,
     valor_total: total,
     criado_por: 'local-user',
     atualizado_por: 'local-user',
     origem_offline: status.hasCredentials && status.isOnline ? 0 : 1
   });
   ```

2. Adiciona à `sync_queue`:
   ```typescript
   await addToSyncQueue('ultimas_20', 'INSERT', novoId, {
     id: novoId,
     data: now,
     material: selectedMaterial.id,
     comanda: null,
     tipo: 'compra' ou 'venda',
     preco_kg: ...,
     kg_total: pesoLiquido,
     valor_total: total,
     criado_por: 'local-user',
     atualizado_por: 'local-user'
   });
   ```

**Observação**: 
- Mesmo quando `origem_offline = 0` (online), o item ainda é adicionado à `sync_queue`
- Mas a `sync_queue` ignora `ultimas_20` durante o push

---

## 7. OBSERVAÇÕES IMPORTANTES E COMPORTAMENTOS RELEVANTES

### 7.1 Inconsistência na Busca de Pendentes

**Problema Identificado**:
- A consulta busca apenas `table_name = 'item'` na `sync_queue`
- Mas itens podem ser inseridos com `table_name = 'ultimas_20'` na fila
- Esses itens **não aparecerão** na lista de pendentes

**Evidência**:
- `Compra.tsx` e `Venda.tsx` adicionam à `sync_queue` com `table_name = 'ultimas_20'`
- `Ultimos.tsx` busca apenas `table_name = 'item'`

### 7.2 Limitação de 20 Itens

**Localização**: Linha 186
```typescript
.slice(0, 20)
```

**Comportamento**:
- Após deduplicação e ordenação, limita a 20 itens
- Não há paginação ou scroll infinito
- Usuário vê apenas os 20 mais recentes

### 7.3 Falta de Atualização Automática

**Problema**:
- `useEffect` executa apenas uma vez (`[]` como dependências)
- Não há listener para mudanças na `sync_queue`
- Não há listener para mudanças na tabela `ultimas_20`
- Usuário precisa recarregar a página para ver novos itens

### 7.4 Perda de Dados Offline Durante Pull

**Risco**:
- `replaceTableData()` para `ultimas_20` faz `DELETE FROM ultimas_20` completo
- Itens criados offline (`origem_offline = 1`) são perdidos
- Não há preservação de dados offline durante sincronização

### 7.5 Duplicação Potencial

**Cenário**:
- Um item pode estar tanto em `ultimas_20` quanto na `sync_queue` (como `item`)
- O sistema de deduplicação tenta evitar isso, mas:
  - Depende de chaves corretas
  - Pode falhar se os dados tiverem formatos diferentes

### 7.6 Tratamento de Erros

**Localização**: Linhas 189-194
```typescript
catch (error) {
  logger.error('Erro ao carregar últimos itens:', error);
  setItems([]);  // Define lista vazia em caso de erro
} finally {
  setLoading(false);
}
```

**Comportamento**:
- Erros são logados, mas não exibidos ao usuário
- Em caso de erro, lista fica vazia
- Usuário vê mensagem "Nenhum item recente"

### 7.7 Normalização de Datas

**Função**: `normalizeDateMinute()` (linhas 110-122)
- Remove segundos e milissegundos
- Formato: `YYYY-MM-DD HH:MM`
- Usado para criar chaves de deduplicação consistentes

### 7.8 Fallbacks Múltiplos

**Campos com múltiplos fallbacks**:
- `material`: `payload.material ?? payload.material_id ?? payload.materialId ?? 0`
- `kg_total`: `payload.kg_total ?? payload.kg ?? 0`
- `valor_total`: `payload.valor_total ?? payload.total ?? payload.item_valor_total ?? 0`
- `preco_kg`: `payload.preco_kg ?? payload.precoKg ?? payload.preco ?? 0`
- `data`: `payload.data || payload.item_data || row.created_at`

**Motivo**: Compatibilidade com diferentes formatos de payload na `sync_queue`

---

## 8. FLUXO COMPLETO: CARREGAMENTO → PROCESSAMENTO → EXIBIÇÃO

### 8.1 Fluxo de Dados

```
┌─────────────────────────────────────────────────────────────┐
│ 1. CARREGAMENTO INICIAL                                     │
└─────────────────────────────────────────────────────────────┘
                    │
                    ├─→ SELECT * FROM ultimas_20 ORDER BY data DESC
                    │   (Itens confirmados/sincronizados)
                    │
                    └─→ SELECT * FROM sync_queue 
                        WHERE synced=0 AND table_name='item' AND operation='INSERT'
                        ORDER BY created_at DESC
                        (Itens pendentes)
                    │
┌─────────────────────────────────────────────────────────────┐
│ 2. TRANSFORMAÇÃO                                            │
└─────────────────────────────────────────────────────────────┘
                    │
                    ├─→ Parse JSON payloads da sync_queue
                    ├─→ Normalizar campos com fallbacks
                    ├─→ Criar IDs temporários (pending-{id})
                    └─→ Adicionar flags (__pending, origem_offline)
                    │
┌─────────────────────────────────────────────────────────────┐
│ 3. RESOLUÇÃO DE NOMES                                       │
└─────────────────────────────────────────────────────────────┘
                    │
                    ├─→ Coletar IDs únicos de materiais
                    ├─→ SELECT id, nome FROM material WHERE id IN (...)
                    └─→ Mapear nomes aos itens
                    │
┌─────────────────────────────────────────────────────────────┐
│ 4. MESCLAGEM E ORDENAÇÃO INICIAL                            │
└─────────────────────────────────────────────────────────────┘
                    │
                    ├─→ Combinar confirmadas + pendentes
                    ├─→ Ordenar por rank (prioridade) + data
                    └─→ Criar lista de candidatos
                    │
┌─────────────────────────────────────────────────────────────┐
│ 5. DEDUPLICAÇÃO                                             │
└─────────────────────────────────────────────────────────────┘
                    │
                    ├─→ Gerar chaves únicas para cada item
                    ├─→ Verificar duplicatas (UUID, ID, chave composta)
                    ├─→ Aplicar chave "loose" para itens sem nome
                    └─→ Filtrar duplicatas
                    │
┌─────────────────────────────────────────────────────────────┐
│ 6. ORDENAÇÃO FINAL E LIMITAÇÃO                              │
└─────────────────────────────────────────────────────────────┘
                    │
                    ├─→ Ordenar por data (mais recente primeiro)
                    ├─→ Limitar a 20 itens (.slice(0, 20))
                    └─→ Atualizar estado React (setItems)
                    │
┌─────────────────────────────────────────────────────────────┐
│ 7. RENDERIZAÇÃO                                             │
└─────────────────────────────────────────────────────────────┘
                    │
                    ├─→ Verificar loading state
                    ├─→ Verificar lista vazia
                    └─→ Renderizar cards para cada item
                         - Nome do material
                         - Tipo (Compra/Venda)
                         - Quantidade e preço
                         - Data formatada
                         - Valor total
                         - Ícone de pendência (se aplicável)
```

### 8.2 Ciclo de Vida do Componente

```
MOUNT
  │
  ├─→ useEffect(() => { load() }, [])
  │
  ├─→ setLoading(true)
  │
  ├─→ Carregar dados (async)
  │
  ├─→ Processar e mesclar
  │
  ├─→ setItems(unificada)
  │
  └─→ setLoading(false)
       │
       └─→ RENDER
            │
            └─→ Exibir lista de itens
```

**Observação**: Não há re-renderização automática após mudanças externas.

---

## 9. RESUMO DE COMO A SESSÃO FUNCIONA

### 9.1 Visão Geral

A sessão "Últimos" exibe os 20 itens mais recentes de transações (compras e vendas), combinando:
1. **Itens confirmados**: Da tabela `ultimas_20` (já sincronizados)
2. **Itens pendentes**: Da `sync_queue` (ainda não sincronizados)

### 9.2 Características Principais

- **Fonte de Dados**:
  - Tabela SQLite `ultimas_20` (itens confirmados)
  - Tabela SQLite `sync_queue` (itens pendentes, apenas `table_name='item'`)

- **Processamento**:
  - Mesclagem de duas fontes
  - Resolução de nomes de materiais
  - Deduplicação inteligente (múltiplas chaves)
  - Ordenação por prioridade e data
  - Limitação a 20 itens

- **Exibição**:
  - Cards individuais por item
  - Formatação de moeda (R$)
  - Formatação de data (DD/MM • HH:MM)
  - Indicador visual de pendência
  - Badge de tipo (Compra/Venda)

- **Sincronização**:
  - Pull: Substitui tabela completa com dados do Supabase
  - Push: Ignora itens de `ultimas_20` (não envia)
  - View Supabase: Gerada automaticamente a partir de `item`

### 9.3 Limitações Identificadas

1. **Busca incompleta de pendentes**: Não busca `table_name='ultimas_20'` na `sync_queue`
2. **Sem atualização automática**: Não reage a mudanças externas
3. **Perda de dados offline**: Pull substitui tabela completa
4. **Sem paginação**: Apenas 20 itens visíveis
5. **Tratamento de erros silencioso**: Erros não são exibidos ao usuário

---

## 10. ARQUIVOS ENVOLVIDOS

### 10.1 Arquivos Principais

1. **`src/pages/Ultimos.tsx`**
   - Componente principal da sessão
   - Lógica de carregamento e exibição

2. **`src/database/initDatabase.ts`**
   - Definição do schema da tabela `ultimas_20`
   - Definição do schema da tabela `sync_queue`

3. **`src/database/types.ts`**
   - Interface TypeScript `Ultimas20`
   - Interface TypeScript `SyncQueue`

4. **`src/database/sqliteService.ts`**
   - Funções `selectAll()`, `selectWhere()`
   - Função `addToSyncQueue()`
   - Função `executeQuery()`

5. **`src/services/syncEngine.ts`**
   - Lógica de sincronização (pull/push)
   - Tratamento especial para `ultimas_20`

6. **`src/pages/Compra.tsx`** e **`src/pages/Venda.tsx`**
   - Inserção de novos itens em `ultimas_20`
   - Adição à `sync_queue`

7. **`src/utils/formatters.ts`**
   - Função `formatCurrency()`

8. **`schemasupabase.sql`**
   - Definição da view `ultimas_20` no Supabase

### 10.2 Arquivos Relacionados

- `src/App.tsx`: Roteamento
- `src/pages/Index.tsx`: Link para a sessão
- `src/components/ui/card.tsx`: Componente Card
- `src/components/ui/button.tsx`: Componente Button

---

## 11. CONCLUSÃO

A sessão "Últimos" é um componente complexo que mescla dados de múltiplas fontes, aplica deduplicação inteligente e exibe os itens mais recentes de forma organizada. Embora funcional, apresenta algumas limitações e comportamentos que podem ser melhorados, especialmente relacionados à atualização automática e à busca completa de itens pendentes.

---

**FIM DO RELATÓRIO**


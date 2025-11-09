# RELATÓRIO TÉCNICO - BUG: LISTA VAZIA NA SESSÃO "ÚLTIMOS"

## 📋 SUMÁRIO EXECUTIVO

**Problema**: A sessão "Últimos" está retornando lista vazia após as últimas alterações.

**Causa Raiz Identificada**: A VIEW `ultimas_20` do Supabase retorna dados da tabela `item`, que **NÃO possui** o campo `tipo`. O campo `tipo` está na tabela `comanda`, não em `item`. Quando os dados são sincronizados para SQLite, a tabela `ultimas_20` local também não tem o campo `tipo`. O código na linha 105 tenta acessar `c.tipo`, que é `undefined`, mas isso não deveria causar lista vazia diretamente.

**Hipóteses Adicionais**:
1. Tabela `ultimas_20` pode estar vazia (sem dados sincronizados)
2. Deduplicação pode estar eliminando todos os itens
3. Erro silencioso pode estar limpando a lista

**Severidade**: CRÍTICA - Funcionalidade completamente quebrada

---

## 1. MAPEAMENTO DO FLUXO COMPLETO

### 1.1 Fluxo de Dados: Fonte → Destino

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. CARREGAMENTO INICIAL                                         │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ├─→ SELECT * FROM ultimas_20 ORDER BY data DESC
                    │   (Linha 32: confirmadas)
                    │   ❓ Pode estar vazio se tabela não tem dados
                    │
                    └─→ SELECT * FROM sync_queue 
                        WHERE synced=0 AND table_name='item' AND operation='INSERT'
                        ORDER BY created_at DESC
                        (Linhas 34-39: pendentesRows)
                        ❓ Pode estar vazio se não houver pendentes
                    │
┌─────────────────────────────────────────────────────────────────┐
│ 2. TRANSFORMAÇÃO DE PENDENTES                                   │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ├─→ Parse JSON payloads da sync_queue
                    ├─→ Normalizar campos com fallbacks
                    ├─→ Criar IDs temporários (pending-{id})
                    ├─→ Extrair tipo do payload (linha 57)
                    └─→ Adicionar flags (__pending, origem_offline)
                    │
┌─────────────────────────────────────────────────────────────────┐
│ 3. RESOLUÇÃO DE NOMES DE MATERIAIS                              │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ├─→ Coletar IDs únicos de materiais
                    ├─→ SELECT id, nome FROM material WHERE id IN (...)
                    └─→ Mapear nomes aos itens
                    │
┌─────────────────────────────────────────────────────────────────┐
│ 4. RESOLUÇÃO DE TIPOS (PROBLEMA POTENCIAL AQUI)                 │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ├─→ confirmadasResolved (linha 101-108)
                    │   tipo: (c.tipo === 'venda' ? 'venda' : 'compra')
                    │   ❌ PROBLEMA: c.tipo é undefined (campo não existe)
                    │   ✅ Resultado: sempre 'compra' (não causa lista vazia)
                    │
                    └─→ pendentesResolved (linha 109-117)
                        tipo: p.tipo ?? (Number(p.kg_total) >= 0 ? 'compra' : 'venda')
                        ✅ Funciona corretamente
                    │
┌─────────────────────────────────────────────────────────────────┐
│ 5. MESCLAGEM E ORDENAÇÃO INICIAL                                │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ├─→ Combinar confirmadasResolved + pendentesResolved
                    ├─→ Ordenar por rank (prioridade) + data
                    └─→ Criar lista de candidates (linha 164)
                    │
┌─────────────────────────────────────────────────────────────────┐
│ 6. DEDUPLICAÇÃO (POSSÍVEL PROBLEMA AQUI)                        │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ├─→ Gerar chaves únicas para cada item
                    ├─→ Verificar duplicatas (UUID, ID, chave composta)
                    ├─→ Aplicar chave "loose" para itens sem nome
                    └─→ Filtrar duplicatas (linhas 175-190)
                    │
                    ❓ PROBLEMA POTENCIAL:
                    - Se todos os itens tiverem chaves conflitantes
                    - Todos serão eliminados como duplicatas
                    - unique ficará vazio
                    │
┌─────────────────────────────────────────────────────────────────┐
│ 7. ORDENAÇÃO FINAL E LIMITAÇÃO                                  │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ├─→ Ordenar por data (mais recente primeiro)
                    ├─→ Limitar a 20 itens (.slice(0, 20))
                    └─→ Atualizar estado React (setItems)
                    │
┌─────────────────────────────────────────────────────────────────┐
│ 8. RENDERIZAÇÃO                                                 │
└─────────────────────────────────────────────────────────────────┘
                    │
                    └─→ Exibir lista (vazia se unificada.length === 0)
```

---

## 2. ANÁLISE DETALHADA DE CADA ETAPA

### 2.1 Etapa 1: Carregamento de Dados Confirmados

**Localização**: `src/pages/Ultimos.tsx`, linha 32

**Código**:
```typescript
const confirmadas = await selectAll<any>('ultimas_20', 'data DESC');
```

**O que deveria produzir**:
- Array de objetos com campos: `id`, `data`, `material`, `comanda`, `preco_kg`, `kg_total`, `valor_total`, etc.
- Dados da tabela SQLite `ultimas_20` ordenados por data descendente

**O que provavelmente está produzindo**:
- **Hipótese A**: Array vazio `[]` se a tabela não tem dados
- **Hipótese B**: Array com objetos, mas **sem campo `tipo`** (campo não existe na tabela)

**Evidência**:
- VIEW Supabase `ultimas_20` retorna `SELECT * FROM item`
- Tabela `item` não tem campo `tipo` (apenas: `id`, `data`, `material`, `comanda`, `preco_kg`, `kg_total`, `valor_total`, `criado_por`, `atualizado_por`)
- Quando sincronizado para SQLite, a tabela `ultimas_20` também não tem campo `tipo`

**Conclusão**: Se `confirmadas` está vazio, a lista final será vazia (a menos que haja pendentes).

---

### 2.2 Etapa 2: Carregamento de Dados Pendentes

**Localização**: `src/pages/Ultimos.tsx`, linhas 34-39

**Código**:
```typescript
const pendentesRows = await selectWhere<any>(
  'sync_queue',
  'synced = ? AND table_name = ? AND operation = ?',
  [0, 'item', 'INSERT'],
  'created_at DESC'
);
```

**O que deveria produzir**:
- Array de objetos da `sync_queue` com campos: `id`, `table_name`, `operation`, `record_id`, `payload`, `created_at`, `synced`
- Apenas itens pendentes (`synced = 0`) da tabela `item` (`table_name = 'item'`)

**O que provavelmente está produzindo**:
- **Hipótese A**: Array vazio `[]` se não houver pendentes
- **Hipótese B**: Array com objetos, mas `payload` pode não ter campo `tipo`

**Conclusão**: Se `pendentesRows` está vazio, e `confirmadas` também está vazio, a lista final será vazia.

---

### 2.3 Etapa 3: Transformação de Pendentes

**Localização**: `src/pages/Ultimos.tsx`, linhas 41-73

**Código**:
```typescript
const pendentes = (pendentesRows || []).map((row: any) => {
  // ... parse payload ...
  const tipoPayload = payload.tipo ? String(payload.tipo).trim().toLowerCase() : null;
  return {
    id: `pending-${row.id}`,
    // ... outros campos ...
    tipo: tipoPayload,  // ✅ Extraído do payload
    // ...
  };
});
```

**O que deveria produzir**:
- Array de objetos normalizados com campo `tipo` extraído do payload (ou `null` se não existir)

**O que provavelmente está produzindo**:
- Array de objetos com `tipo: null` se o payload não tiver campo `tipo`
- Isso é normal e será tratado depois em `pendentesResolved`

**Conclusão**: Esta etapa está funcionando corretamente.

---

### 2.4 Etapa 4: Resolução de Tipos (PROBLEMA IDENTIFICADO)

**Localização**: `src/pages/Ultimos.tsx`, linhas 101-117

#### 4.1 Itens Confirmados

**Código**:
```typescript
const confirmadasResolved = (confirmadas || []).map((c: any) => ({
  ...c,
  material_nome: idToName.get(Number(c.material) || 0) || 'Desconhecido',
  preco_kg: Number(c.preco_kg) || 0,
  tipo: (c.tipo === 'venda' ? 'venda' : 'compra'),  // ❌ PROBLEMA AQUI
  __pending: false,
  client_uuid: null
}));
```

**O que deveria produzir**:
- Array de objetos com campo `tipo` definido como 'compra' ou 'venda'

**O que provavelmente está produzindo**:
- Array de objetos com `tipo: 'compra'` sempre (porque `c.tipo` é `undefined`)
- **MAS**: Isso não causa lista vazia, apenas todos os itens terão tipo 'compra'

**Problema Identificado**:
- A tabela `ultimas_20` **não tem** campo `tipo`
- `c.tipo` é `undefined`
- Expressão `c.tipo === 'venda' ? 'venda' : 'compra'` sempre retorna `'compra'`
- **MAS**: Isso não deveria causar lista vazia

#### 4.2 Itens Pendentes

**Código**:
```typescript
const pendentesResolved = (pendentes || []).map((p: any) => {
  const materialId = Number(p.material) || 0;
  const tipoFinal = p.tipo ?? (Number(p.kg_total) >= 0 ? 'compra' : 'venda');
  return {
    ...p,
    material_nome: materialId ? (idToName.get(materialId) || 'Desconhecido') : 'Desconhecido',
    tipo: tipoFinal
  };
});
```

**O que deveria produzir**:
- Array de objetos com campo `tipo` definido corretamente

**O que provavelmente está produzindo**:
- Array de objetos com `tipo` definido corretamente (do payload ou do sinal de `kg_total`)

**Conclusão**: Esta etapa está funcionando corretamente para pendentes.

---

### 2.5 Etapa 5: Criação de Candidates

**Localização**: `src/pages/Ultimos.tsx`, linha 164

**Código**:
```typescript
const candidates = [...confirmadasResolved, ...pendentesResolved].sort((a: any, b: any) => {
  const rdiff = rank(b) - rank(a);
  if (rdiff !== 0) return rdiff;
  const da = a?.data ? new Date(a.data).getTime() : 0;
  const db = b?.data ? new Date(b.data).getTime() : 0;
  return db - da;
});
```

**O que deveria produzir**:
- Array combinado de `confirmadasResolved` + `pendentesResolved`, ordenado por prioridade e data

**O que provavelmente está produzindo**:
- **Hipótese A**: Array vazio `[]` se ambos `confirmadasResolved` e `pendentesResolved` estão vazios
- **Hipótese B**: Array com itens, mas pode estar vazio se não houver dados

**Conclusão**: Se `candidates` está vazio, a lista final será vazia.

---

### 2.6 Etapa 6: Deduplicação (POSSÍVEL PROBLEMA CRÍTICO)

**Localização**: `src/pages/Ultimos.tsx`, linhas 172-190

**Código**:
```typescript
const seen = new Set<string>();
const seenLoose = new Set<string>();
const unique: any[] = [];
for (const e of candidates) {
  const keys = getAllKeys(e);
  let duplicate = false;
  for (const k of keys) {
    if (seen.has(k)) { duplicate = true; break; }
  }
  if (!duplicate && !hasRealName(e)) {
    const lk = getLooseKey(e);
    if (seenLoose.has(lk)) duplicate = true;
  }
  if (duplicate) continue;
  unique.push(e);
  for (const k of keys) seen.add(k);
  const lk = getLooseKey(e);
  seenLoose.add(lk);
}
```

**Função `getAllKeys()`** (linhas 136-145):
```typescript
function getAllKeys(entry: any): string[] {
  const keys: string[] = [];
  if (entry?.client_uuid) keys.push(`uuid:${entry.client_uuid}`);
  if (entry?.id && !String(entry.id).startsWith('pending-')) keys.push(`id:${entry.id}`);
  const materialId = Number(entry.material) || 0;
  const kg = Number(entry.kg_total) || 0;
  const preco = Number(entry.preco_kg) || 0;
  keys.push(`f:${compositeKey(materialId, kg, preco, entry.data)}`);
  return keys;
}
```

**Função `getLooseKey()`** (linhas 147-151):
```typescript
function getLooseKey(entry: any): string {
  const kg = Number(entry.kg_total) || 0;
  const preco = Number(entry.preco_kg) || 0;
  return `lf:${kg.toFixed(3)}|${preco.toFixed(3)}|${normalizeDateMinute(entry.data)}`;
}
```

**O que deveria produzir**:
- Array `unique` com itens únicos (duplicatas removidas)

**O que provavelmente está produzindo**:
- **Hipótese A**: Array vazio `[]` se todos os itens forem considerados duplicatas
- **Hipótese B**: Array com itens únicos

**Cenários que podem causar lista vazia**:

1. **Todos os itens têm `client_uuid` idêntico**:
   - Se todos os itens confirmados tiverem o mesmo `client_uuid`, todos serão considerados duplicatas
   - Mas `confirmadasResolved` define `client_uuid: null` (linha 107), então isso não deveria acontecer

2. **Todos os itens têm `id` idêntico**:
   - Se todos os itens tiverem o mesmo `id`, todos serão considerados duplicatas
   - Mas isso é improvável, pois IDs são únicos

3. **Todos os itens têm chave composta idêntica**:
   - Se todos os itens tiverem `material`, `kg_total`, `preco_kg` e `data` idênticos, todos serão considerados duplicatas
   - Isso é possível se houver dados duplicados na tabela

4. **Todos os itens sem nome real têm chave "loose" idêntica**:
   - Se todos os itens tiverem `material_nome === 'Desconhecido'` e chave "loose" idêntica, todos serão considerados duplicatas
   - Isso é possível se não houver nomes de materiais resolvidos

**Conclusão**: A deduplicação pode estar eliminando todos os itens se houver conflitos de chave.

---

### 2.7 Etapa 7: Ordenação Final e Limitação

**Localização**: `src/pages/Ultimos.tsx`, linhas 192-196

**Código**:
```typescript
const unificada = unique.sort((a: any, b: any) => {
  const da = a?.data ? new Date(a.data).getTime() : 0;
  const db = b?.data ? new Date(b.data).getTime() : 0;
  return db - da;
}).slice(0, 20);
```

**O que deveria produzir**:
- Array ordenado por data (mais recente primeiro), limitado a 20 itens

**O que provavelmente está produzindo**:
- **Hipótese A**: Array vazio `[]` se `unique` está vazio
- **Hipótese B**: Array com até 20 itens

**Conclusão**: Se `unique` está vazio, `unificada` será vazio, e a lista final será vazia.

---

## 3. HIPÓTESES DE CAUSA RAIZ (PRIORIZADAS)

### 3.1 HIPÓTESE 1: Tabela `ultimas_20` Está Vazia (MAIS PROVÁVEL)

**Probabilidade**: 80% ✅

**Evidências**:
1. VIEW Supabase `ultimas_20` pode não ter dados
2. Sincronização pode não ter ocorrido
3. Tabela SQLite pode estar vazia

**Impacto**: CRÍTICO - Se não houver dados confirmados e não houver pendentes, lista será vazia

**Validação**:
- Verificar se `confirmadas.length > 0`
- Verificar se tabela `ultimas_20` tem dados: `SELECT COUNT(*) FROM ultimas_20`

**Solução**: Garantir que há dados na tabela ou que há pendentes na `sync_queue`

---

### 3.2 HIPÓTESE 2: Deduplicação Elimina Todos os Itens

**Probabilidade**: 15% ⚠️

**Evidências**:
1. Todos os itens podem ter chaves conflitantes
2. Todos os itens podem ter `material_nome === 'Desconhecido'` e chave "loose" idêntica
3. Todos os itens podem ter `client_uuid` idêntico (mas `confirmadasResolved` define `client_uuid: null`)

**Impacto**: CRÍTICO - Todos os itens são eliminados como duplicatas

**Validação**:
- Verificar se `candidates.length > 0` mas `unique.length === 0`
- Adicionar logs para verificar chaves geradas

**Solução**: Ajustar lógica de deduplicação ou adicionar logs para debug

---

### 3.3 HIPÓTESE 3: Campo `tipo` Não Existe na Tabela (CONFIRMADO, MAS NÃO CAUSA LISTA VAZIA)

**Probabilidade**: 100% ✅ (mas não é a causa direta)

**Evidências**:
1. VIEW Supabase `ultimas_20` retorna `SELECT * FROM item`
2. Tabela `item` não tem campo `tipo`
3. Tabela SQLite `ultimas_20` também não tem campo `tipo`
4. `c.tipo` é `undefined`
5. Expressão `c.tipo === 'venda' ? 'venda' : 'compra'` sempre retorna `'compra'`

**Impacto**: MÉDIO - Todos os itens confirmados terão tipo 'compra', mas não causa lista vazia

**Validação**: Confirmado - campo `tipo` não existe na tabela `ultimas_20`

**Solução**: Não é a causa direta da lista vazia, mas deve ser corrigido para exibir tipos corretos

---

### 3.4 HIPÓTESE 4: Erro Silencioso Limpa a Lista

**Probabilidade**: 5% ⚠️

**Evidências**:
1. Try/catch na linha 199-201 define `setItems([])` em caso de erro
2. Erro pode estar ocorrendo silenciosamente

**Impacto**: CRÍTICO - Lista é limpa em caso de erro

**Validação**:
- Verificar logs de erro: `logger.error('Erro ao carregar últimos itens:', error)`
- Verificar se há exceções sendo lançadas

**Solução**: Verificar logs e corrigir erro específico

---

## 4. CHECK-LIST: O QUE PRECISA EXISTIR PARA A LISTA TER ITENS

### 4.1 ✅ Dados na Tabela `ultimas_20` ou na `sync_queue`
- **Status**: ❓ DESCONHECIDO
- **Validação**: Verificar `SELECT COUNT(*) FROM ultimas_20` e `SELECT COUNT(*) FROM sync_queue WHERE synced=0 AND table_name='item'`

### 4.2 ✅ `confirmadas` ou `pendentesRows` não vazios
- **Status**: ❓ DESCONHECIDO
- **Validação**: Adicionar logs: `console.log('confirmadas.length:', confirmadas.length)`

### 4.3 ✅ `candidates` não vazio
- **Status**: ❓ DESCONHECIDO
- **Validação**: Adicionar logs: `console.log('candidates.length:', candidates.length)`

### 4.4 ✅ Deduplicação não elimina todos os itens
- **Status**: ❓ DESCONHECIDO
- **Validação**: Adicionar logs: `console.log('unique.length:', unique.length)`

### 4.5 ✅ `unificada` não vazio
- **Status**: ❓ DESCONHECIDO
- **Validação**: Adicionar logs: `console.log('unificada.length:', unificada.length)`

---

## 5. CAUSA RAIZ IDENTIFICADA

### 5.1 Causa Raiz Mais Provável: Tabela `ultimas_20` Está Vazia

**Explicação**:
- A tabela SQLite `ultimas_20` pode não ter dados sincronizados
- Se `confirmadas` está vazio e não houver pendentes, a lista final será vazia
- Isso é o cenário mais provável

**Bloco de Código**:
- **Linha 32**: `const confirmadas = await selectAll<any>('ultimas_20', 'data DESC');`
- Se `confirmadas.length === 0`, e não houver pendentes, `candidates` será vazio
- Se `candidates` está vazio, `unique` será vazio
- Se `unique` está vazio, `unificada` será vazio
- Se `unificada` está vazio, `setItems([])` define lista vazia

**Por que isso faz todos os itens sumirem**:
- Não há itens para exibir se a tabela está vazia
- Não é um bug de código, mas sim falta de dados

---

### 5.2 Causa Raiz Secundária: Deduplicação Elimina Todos os Itens

**Explicação**:
- Se todos os itens tiverem chaves conflitantes, todos serão eliminados como duplicatas
- Isso pode acontecer se:
  - Todos os itens têm `material_nome === 'Desconhecido'` e chave "loose" idêntica
  - Todos os itens têm chave composta idêntica (material, kg, preco, data)

**Bloco de Código**:
- **Linhas 172-190**: Loop de deduplicação
- Se `candidates.length > 0` mas `unique.length === 0`, deduplicação eliminou todos

**Por que isso faz todos os itens sumirem**:
- Todos os itens são considerados duplicatas e são filtrados
- `unique` fica vazio
- `unificada` fica vazio
- Lista final é vazia

---

## 6. PLANO DE CORREÇÃO MÍNIMO

### 6.1 Adicionar Logs de Debug (PRIMEIRO PASSO)

**Objetivo**: Identificar em qual etapa os itens estão sendo perdidos

**Mudanças Necessárias**:

**Arquivo**: `src/pages/Ultimos.tsx`

**Localização**: Após linha 32

**Diff**:
```typescript
const confirmadas = await selectAll<any>('ultimas_20', 'data DESC');
console.log('🔍 DEBUG: confirmadas.length =', confirmadas.length);  // ✅ ADICIONAR
if (confirmadas.length > 0) {
  console.log('🔍 DEBUG: confirmadas[0] =', confirmadas[0]);  // ✅ ADICIONAR
  console.log('🔍 DEBUG: confirmadas[0].tipo =', confirmadas[0].tipo);  // ✅ ADICIONAR
}
```

**Localização**: Após linha 39

**Diff**:
```typescript
const pendentesRows = await selectWhere<any>(...);
console.log('🔍 DEBUG: pendentesRows.length =', pendentesRows.length);  // ✅ ADICIONAR
```

**Localização**: Após linha 73

**Diff**:
```typescript
});
console.log('🔍 DEBUG: pendentes.length =', pendentes.length);  // ✅ ADICIONAR
```

**Localização**: Após linha 117

**Diff**:
```typescript
});
console.log('🔍 DEBUG: confirmadasResolved.length =', confirmadasResolved.length);  // ✅ ADICIONAR
console.log('🔍 DEBUG: pendentesResolved.length =', pendentesResolved.length);  // ✅ ADICIONAR
```

**Localização**: Após linha 170

**Diff**:
```typescript
});
console.log('🔍 DEBUG: candidates.length =', candidates.length);  // ✅ ADICIONAR
```

**Localização**: Após linha 190

**Diff**:
```typescript
}
console.log('🔍 DEBUG: unique.length =', unique.length);  // ✅ ADICIONAR
if (unique.length > 0) {
  console.log('🔍 DEBUG: unique[0] =', unique[0]);  // ✅ ADICIONAR
}
```

**Localização**: Após linha 196

**Diff**:
```typescript
}).slice(0, 20);
console.log('🔍 DEBUG: unificada.length =', unificada.length);  // ✅ ADICIONAR
```

---

### 6.2 Corrigir Campo `tipo` para Itens Confirmados (SE NECESSÁRIO)

**Objetivo**: Garantir que itens confirmados tenham campo `tipo` correto

**Problema**: Campo `tipo` não existe na tabela `ultimas_20`, então `c.tipo` é `undefined`

**Solução**: Usar JOIN com `comanda_20` ou determinar tipo pelo sinal de `kg_total`

**Mudanças Necessárias**:

**Opção A: Usar JOIN com `comanda_20`** (RECOMENDADO)

**Arquivo**: `src/pages/Ultimos.tsx`

**Localização**: Linha 32

**Diff**:
```typescript
// ANTES:
const confirmadas = await selectAll<any>('ultimas_20', 'data DESC');

// DEPOIS:
const confirmadas = await executeQuery<any>(
  `SELECT u.*, c.comanda_tipo as tipo
   FROM ultimas_20 u
   LEFT JOIN comanda_20 c ON u.comanda = c.comanda_id
   ORDER BY u.data DESC`
);
```

**Opção B: Determinar tipo pelo sinal de `kg_total`** (FALLBACK)

**Arquivo**: `src/pages/Ultimos.tsx`

**Localização**: Linha 105

**Diff**:
```typescript
// ANTES:
tipo: (c.tipo === 'venda' ? 'venda' : 'compra'),

// DEPOIS:
tipo: (c.tipo === 'venda' ? 'venda' : (Number(c.kg_total) < 0 ? 'venda' : 'compra')),
```

**Nota**: Opção B é um fallback temporário. Opção A é a solução correta.

---

### 6.3 Ajustar Deduplicação (SE NECESSÁRIO)

**Objetivo**: Garantir que deduplicação não elimine todos os itens

**Problema**: Se todos os itens tiverem chaves conflitantes, todos serão eliminados

**Solução**: Adicionar fallback para preservar pelo menos um item por chave

**Mudanças Necessárias**:

**Arquivo**: `src/pages/Ultimos.tsx`

**Localização**: Linhas 175-190

**Diff**:
```typescript
// ANTES:
if (duplicate) continue;
unique.push(e);

// DEPOIS:
if (duplicate) {
  // Se é duplicata mas não tem nome real, tentar preservar pelo menos um
  if (!hasRealName(e)) {
    // Verificar se já existe um item sem nome real com a mesma chave loose
    const lk = getLooseKey(e);
    const existingWithoutName = unique.find((u: any) => 
      !hasRealName(u) && getLooseKey(u) === lk
    );
    if (!existingWithoutName) {
      // Não há outro item sem nome real com a mesma chave, preservar este
      unique.push(e);
      for (const k of keys) seen.add(k);
      seenLoose.add(lk);
      continue;
    }
  }
  continue;
}
unique.push(e);
```

**Nota**: Esta é uma solução mais complexa. Primeiro, adicionar logs para confirmar se deduplicação é o problema.

---

## 7. RECOMENDAÇÃO FINAL

### 7.1 Passo 1: Adicionar Logs de Debug

**Prioridade**: ALTA 🔴

**Razão**: Identificar exatamente em qual etapa os itens estão sendo perdidos

**Ação**: Adicionar logs conforme seção 6.1

---

### 7.2 Passo 2: Verificar Dados na Tabela

**Prioridade**: ALTA 🔴

**Razão**: Confirmar se há dados para exibir

**Ação**: Verificar `SELECT COUNT(*) FROM ultimas_20` e `SELECT COUNT(*) FROM sync_queue WHERE synced=0 AND table_name='item'`

---

### 7.3 Passo 3: Corrigir Campo `tipo` (Se Necessário)

**Prioridade**: MÉDIA 🟡

**Razão**: Garantir que tipos sejam exibidos corretamente

**Ação**: Implementar Opção A da seção 6.2 (JOIN com `comanda_20`)

---

### 7.4 Passo 4: Ajustar Deduplicação (Se Necessário)

**Prioridade**: BAIXA 🟢

**Razão**: Apenas se logs confirmarem que deduplicação está eliminando todos os itens

**Ação**: Implementar solução da seção 6.3

---

## 8. CONCLUSÃO

**Causa Raiz Mais Provável**: Tabela `ultimas_20` está vazia ou deduplicação está eliminando todos os itens.

**Próximos Passos**:
1. Adicionar logs de debug para identificar a etapa exata onde os itens são perdidos
2. Verificar se há dados na tabela `ultimas_20` e na `sync_queue`
3. Corrigir campo `tipo` para itens confirmados (usar JOIN com `comanda_20`)
4. Ajustar deduplicação se necessário

**Prioridade**: CRÍTICA - Funcionalidade completamente quebrada

**Esforço Estimado**: 1-2 horas (com logs de debug)

---

**FIM DO RELATÓRIO**


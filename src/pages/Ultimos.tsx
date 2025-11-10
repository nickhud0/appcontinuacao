import { ArrowLeft, Clock, CloudOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { selectAll, selectWhere, executeQuery } from "@/database";
import { formatCurrency } from "@/utils/formatters";
import { logger } from "@/utils/logger";

const Ultimos = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const confirmadas = await executeQuery<any>(
          "SELECT id, data, material, comanda, preco_kg, kg_total, valor_total, tipo FROM ultimas_20 ORDER BY data DESC"
        );

        const pendentesRows = await selectWhere<any>(
          'sync_queue',
          'synced = ? AND operation = ? AND (table_name = ? OR table_name = ?)',
          [0, 'INSERT', 'item', 'ultimas_20'],
          'created_at DESC'
        );

        async function tryGetTipoDaComanda(comandaId: number): Promise<string | null> {
          if (comandaId <= 0) return null;
          try {
            const r = await executeQuery<{ tipo: string }>(
              "SELECT tipo FROM ultimas_20 WHERE comanda = ? ORDER BY data DESC LIMIT 1",
              [comandaId]
            );
            const t = (r?.[0]?.tipo || "").trim().toLowerCase();
            return (t === "venda" || t === "compra") ? t : null;
          } catch {
            return null;
          }
        }

        async function tryGetTipoByCodigo(codigo: string): Promise<string | null> {
          if (!codigo || codigo.trim() === '') return null;
          try {
            const r = await executeQuery<{ tipo: string }>(
              "SELECT tipo FROM ultimas_20 WHERE codigo = ? ORDER BY data DESC LIMIT 1",
              [codigo]
            );
            const t = (r?.[0]?.tipo || "").trim().toLowerCase();
            return (t === "venda" || t === "compra") ? t : null;
          } catch {
            return null;
          }
        }

        const pendentesComandas = await executeQuery(
          "SELECT payload FROM sync_queue WHERE synced = 0 AND table_name = 'comanda' AND operation IN ('INSERT','UPSERT')"
        );

        const mapComandaTipoOffline = new Map<string, string>();
        for (const row of pendentesComandas) {
          try {
            const payload = JSON.parse(row.payload ?? row.PAYLOAD ?? "{}");
            const codigo = (payload?.codigo ?? "").toString().trim();
            const tipo = (payload?.tipo ?? "").toString().trim().toLowerCase();
            if (codigo && (tipo === 'compra' || tipo === 'venda')) {
              mapComandaTipoOffline.set(codigo, tipo);
            }
          } catch {}
        }

        const pendentes: any[] = [];
        for (const row of (pendentesRows || [])) {
          let payload: any = {};
          try {
            const parsed = JSON.parse(row.payload || '{}');
            payload = parsed && typeof parsed === 'object' ? parsed : {};
          } catch (e) {
            // ignore invalid json
          }
          const comandaId = Number(payload.comanda ?? payload.comanda_id ?? payload.comandaId ?? 0) || 0;
          const materialId = Number(payload.material ?? payload.material_id ?? payload.materialId ?? 0) || 0;
          const precoKg = Number(payload.preco_kg ?? payload.precoKg ?? payload.preco ?? 0) || 0;
          const kgTotal = Number(payload.kg_total ?? payload.kgTotal ?? payload.kg ?? 0) || 0;
          const valorTotal = Number(payload.valor_total ?? payload.total ?? payload.item_valor_total ?? 0) || 0;

          let materialNome = 'Desconhecido';
          if (materialId > 0) {
            try {
              const mat = await executeQuery<{ nome: string }>(
                "SELECT nome FROM material WHERE id = ? LIMIT 1",
                [materialId]
              );
              materialNome = mat?.[0]?.nome ?? 'Desconhecido';
            } catch {
              materialNome = 'Desconhecido';
            }
          }

          const codigo = (payload?.codigo ?? "").toString().trim() || null;
          const tipoFromPayload = payload?.tipo ? String(payload.tipo).trim().toLowerCase() : null;
          const tipoFromOfflineMap = codigo ? (mapComandaTipoOffline.get(codigo) ?? null) : null;
          const tipoFromCodigoLocal = codigo ? (await tryGetTipoByCodigo(codigo)) : null;
          const tipoFromComandaId = await tryGetTipoDaComanda(comandaId); // já existente (por comanda)

          const tipoFinal =
            (tipoFromPayload === 'compra' || tipoFromPayload === 'venda') ? tipoFromPayload :
            (tipoFromOfflineMap === 'compra' || tipoFromOfflineMap === 'venda') ? tipoFromOfflineMap :
            (tipoFromCodigoLocal === 'compra' || tipoFromCodigoLocal === 'venda') ? tipoFromCodigoLocal :
            (tipoFromComandaId === 'compra' || tipoFromComandaId === 'venda') ? tipoFromComandaId :
            (kgTotal < 0 ? 'venda' : 'compra');
          const pData = payload.data || payload.item_data || row.created_at;

          pendentes.push({
            id: `pending-${row.id}`,
            record_id: row.record_id,
            data: pData,
            material: materialId || null,
            comanda: comandaId || null,
            material_nome: materialNome,
            kg_total: kgTotal,
            preco_kg: precoKg,
            valor_total: valorTotal,
            tipo: tipoFinal,
            __pending: true,
            origem_offline: 1,
            client_uuid: payload.client_uuid ?? payload.uuid ?? null
          } as any);
        }

        // Resolve material names
        const neededMaterialIds = new Set<number>();
        for (const c of (confirmadas || [])) {
          const mid = Number(c.material) || 0;
          if (mid > 0) neededMaterialIds.add(mid);
        }
        for (const p of pendentes) {
          const mid = Number(p.material) || 0;
          if (mid > 0) neededMaterialIds.add(mid);
        }

        const idList = Array.from(neededMaterialIds);
        const idToName = new Map<number, string>();
        if (idList.length > 0) {
          const placeholders = idList.map(() => '?').join(',');
          try {
            const mats = await executeQuery<{ id: number; nome: string }>(
              `SELECT id, nome FROM material WHERE id IN (${placeholders})`,
              idList
            );
            for (const m of mats) idToName.set(Number(m.id), m.nome);
          } catch (e) {
            logger.warn('Falha ao carregar nomes de materiais', e);
          }
        }

        const confirmadasResolved = (confirmadas || []).map((c: any) => ({
          ...c,
          material_nome: idToName.get(Number(c.material) || 0) || 'Desconhecido',
          preco_kg: Number(c.preco_kg) || 0,
          tipo: c.tipo === 'venda' ? 'venda' : 'compra', // usar a coluna existente
          __pending: false,
          client_uuid: null
        }));
        // DEBUG: Antes do candidates
        for (const e of [...confirmadasResolved, ...pendentes]) {
          if (String(e.id).startsWith('pending-')) {
            console.log('DEBUG stage=beforeCandidates', {id: e.id, tipo: e.tipo, pending: e.__pending, offline: e.origem_offline, kg: e.kg_total});
          }
        }

        function pad(n: number) { return n < 10 ? `0${n}` : String(n); }
        function normalizeDateMinute(d: any): string {
          try {
            const dt = new Date(d);
            const y = dt.getFullYear();
            const m = pad(dt.getMonth() + 1);
            const day = pad(dt.getDate());
            const hh = pad(dt.getHours());
            const mm = pad(dt.getMinutes());
            return `${y}-${m}-${day} ${hh}:${mm}`;
          } catch {
            return String(d || '');
          }
        }
        function compositeKey(materialId: number, kg: number, preco: number, d: any): string {
          return `${materialId}|${kg.toFixed(3)}|${preco.toFixed(3)}|${normalizeDateMinute(d)}`;
        }
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

        function getLooseKey(entry: any): string {
          const kg = Number(entry.kg_total) || 0;
          const preco = Number(entry.preco_kg) || 0;
          return `lf:${kg.toFixed(3)}|${preco.toFixed(3)}|${normalizeDateMinute(entry.data)}`;
        }

        function hasRealName(e: any): boolean {
          return !!(e?.material_nome && e.material_nome !== 'Desconhecido');
        }

        function rank(e: any): number {
          if (!e.__pending && hasRealName(e)) return 4; // confirmed + real name
          if (!e.__pending && !hasRealName(e)) return 3; // confirmed + unknown name
          if (e.__pending && hasRealName(e)) return 2; // pending + real name
          return 1; // pending + unknown name
        }

        const candidates = [...confirmadasResolved, ...pendentes].sort((a: any, b: any) => {
          const rdiff = rank(b) - rank(a);
          if (rdiff !== 0) return rdiff;
          const da = a?.data ? new Date(a.data).getTime() : 0;
          const db = b?.data ? new Date(b.data).getTime() : 0;
          return db - da;
        });

        // DEBUG: Depois do candidates
        for (const e of candidates) {
          if (String(e.id).startsWith('pending-')) {
            console.log('DEBUG stage=afterCandidates', {id: e.id, tipo: e.tipo, pending: e.__pending, offline: e.origem_offline, kg: e.kg_total});
          }
        }

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

        // DEBUG: Depois do unique (deduplicação)
        for (const e of unique) {
          if (String(e.id).startsWith('pending-')) {
            console.log('DEBUG stage=afterUnique', {id: e.id, tipo: e.tipo, pending: e.__pending, offline: e.origem_offline, kg: e.kg_total});
          }
        }

        const unificada = unique.sort((a: any, b: any) => {
          const da = a?.data ? new Date(a.data).getTime() : 0;
          const db = b?.data ? new Date(b.data).getTime() : 0;
          return db - da;
        }).slice(0, 20);

        // DEBUG: Antes do setItems
        for (const e of unificada) {
          if (String(e.id).startsWith('pending-')) {
            console.log('DEBUG stage=beforeSetItems', {id: e.id, tipo: e.tipo, pending: e.__pending, offline: e.origem_offline, kg: e.kg_total});
          }
        }

        setItems(unificada);
      } catch (error) {
        logger.error('Erro ao carregar últimos itens:', error);
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  return (
    <div className="min-h-screen bg-background p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Button variant="ghost" size="sm" className="mr-3" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Últimos Itens</h1>
        </div>
      </div>

      {/* Conteúdo */}
      <Card className="p-6">
        <div className="flex items-center mb-6">
          <Clock className="h-6 w-6 text-primary mr-3" />
          <h2 className="text-lg font-semibold">Histórico Recente</h2>
        </div>

        {loading ? (
          <div className="text-center text-muted-foreground">Carregando...</div>
        ) : items.length === 0 ? (
          <Card className="p-8 text-center">
            <h3 className="text-lg font-semibold mb-2">Nenhum item recente</h3>
            <p className="text-muted-foreground">Os últimos lançamentos aparecerão aqui.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((it) => (
              <Card key={it.id} className="p-4 rounded-xl border border-border/20 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold text-foreground truncate" title={it.material_nome || 'Desconhecido'}>
                      {it.material_nome || 'Desconhecido'}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${it.tipo === 'venda' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                        {it.tipo === 'venda' ? 'Venda' : 'Compra'}
                      </span>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {Math.abs(Number(it.kg_total) || 0)} kg • {formatCurrency(Number(it.preco_kg) || 0)}/kg
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{formatDateShort(it.data)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{formatCurrency(Number(it.valor_total) || 0)}</div>
                    {(it.__pending || it.origem_offline === 1) && (
                      <CloudOff className="h-4 w-4 text-yellow-500 inline-block mt-1" title="Pendente de sincronização" />
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default Ultimos;
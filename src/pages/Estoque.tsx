import { ArrowLeft, Package, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { selectAll } from "@/database";
import { formatCurrency, formatWeight } from "@/utils/formatters";
import { onSyncStatus, type SyncStatus } from "@/services/syncEngine";
import type { Estoque as EstoqueRow, Material } from "@/database";
import { useGlobalShortcuts } from "@/shortcuts";

const Estoque = () => {
  const navigate = useNavigate();

  useGlobalShortcuts({
    "-": () => navigate(-1),
  });

  const [estoque, setEstoque] = useState<EstoqueRow[]>([]);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const rows = await selectAll<EstoqueRow>('estoque', 'material ASC');
    setEstoque(rows);
    
    // Buscar materiais para ter acesso aos preços de venda
    const materiaisRows = await selectAll<Material>('material', 'nome ASC');
    setMateriais(materiaisRows);
  }, []);

  useEffect(() => {
    async function loadInitial() {
      try {
        setLoading(true);
        await refresh();
      } finally {
        setLoading(false);
      }
    }
    void loadInitial();
  }, [refresh]);

  // Silent background refresh after a successful sync cycle
  const prevStatusRef = useRef<SyncStatus | null>(null);
  useEffect(() => {
    const off = onSyncStatus((status) => {
      const prev = prevStatusRef.current;
      if (prev && prev.syncing && !status.syncing && !status.lastError) {
        void refresh();
      }
      prevStatusRef.current = status;
    });
    return () => off();
  }, [refresh]);

  const filtrado = useMemo(() => {
    const q = busca.toLowerCase();
    return estoque.filter((e) => (e.material || '').toLowerCase().includes(q));
  }, [estoque, busca]);

  // Calcular resumo financeiro baseado nos dados do estoque e materiais
  const resumo = useMemo(() => {
    // Criar um mapa de materiais por nome para busca rápida de preços
    const materiaisMap = new Map<string, number>();
    materiais.forEach((m) => {
      if (m.nome) {
        materiaisMap.set(m.nome, m.preco_venda || 0);
      }
    });

    // Calcular KG: soma de todos os kg_total
    const totalKg = estoque.reduce((sum, item) => {
      return sum + (item.kg_total || 0);
    }, 0);

    // Calcular CUSTO: soma de todos os valor_total_gasto
    const totalCusto = estoque.reduce((sum, item) => {
      return sum + (item.valor_total_gasto || 0);
    }, 0);

    // Calcular POTENCIAL: para cada material, preco_venda * kg_total, depois somar tudo
    const totalPotencial = estoque.reduce((sum, item) => {
      if (!item.material) return sum;
      const precoVenda = materiaisMap.get(item.material) || 0;
      const kgTotal = item.kg_total || 0;
      return sum + (precoVenda * kgTotal);
    }, 0);

    // Calcular LUCRO: POTENCIAL - CUSTO
    const lucroPotencial = totalPotencial - totalCusto;

    return {
      total_kg: totalKg,
      total_custo: totalCusto,
      total_venda_potencial: totalPotencial,
      lucro_potencial: lucroPotencial,
    };
  }, [estoque, materiais]);

  const StatBlock = ({ title, value = "—", valueClassName, titleClassName, cardClassName }: { title: string; value?: string | number; valueClassName?: string; titleClassName?: string; cardClassName?: string }) => {
    return (
      <Card className={`bg-card rounded-2xl p-3 shadow-sm border border-border/10 flex flex-col items-center justify-center text-center ${cardClassName || ''}`}>
        <div className={`text-sm font-medium text-muted-foreground uppercase tracking-wide ${titleClassName || ''}`}>{title}</div>
        <div className={`mt-1 text-xl font-bold text-foreground ${valueClassName || ''}`}>{value}</div>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Button variant="ghost" size="sm" className="mr-3" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Estoque</h1>
        </div>
      </div>

      {/* Conteúdo */}
      <Card className="p-6">
        <div className="flex items-center mb-6">
          <Package className="h-6 w-6 text-primary mr-3" />
          <h2 className="text-lg font-semibold">Controle de Estoque</h2>
        </div>

        {/* Busca */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar material no estoque..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Título Resumo */}
        <h2 className="text-lg font-bold text-foreground px-3 mt-3 mb-1">Resumo Financeiro</h2>
        {/* Indicadores */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3">
          <StatBlock
            title="KG"
            value={formatWeight(resumo.total_kg)}
            titleClassName="text-blue-300"
            cardClassName="bg-blue-500/10"
          />
          <StatBlock
            title="Custo"
            value={formatCurrency(resumo.total_custo)}
            titleClassName="text-red-300"
            cardClassName="bg-red-500/10"
          />
          <StatBlock
            title="Potencial"
            value={formatCurrency(resumo.total_venda_potencial)}
            titleClassName="text-emerald-300"
            cardClassName="bg-emerald-500/10"
          />
          <StatBlock
            title="Lucro"
            value={formatCurrency(resumo.lucro_potencial)}
            valueClassName={
              resumo.lucro_potencial > 0
                ? 'text-emerald-500'
                : resumo.lucro_potencial < 0
                  ? 'text-red-500'
                  : 'text-muted-foreground'
            }
            titleClassName={
              resumo.lucro_potencial > 0
                ? 'text-emerald-300'
                : resumo.lucro_potencial < 0
                  ? 'text-red-300'
                  : ''
            }
            cardClassName={
              resumo.lucro_potencial > 0
                ? 'bg-emerald-500/10'
                : resumo.lucro_potencial < 0
                  ? 'bg-red-500/10'
                  : 'bg-card'
            }
          />
        </div>
        <div className="mb-3" />

        {/* Título Materiais */}
        <h2 className="text-lg font-bold text-foreground px-3 mt-2 mb-2">Materiais em Estoque</h2>

        {loading ? (
          <div className="text-center text-muted-foreground">Carregando...</div>
        ) : filtrado.length === 0 ? (
          <Card className="p-8 text-center">
            <h3 className="text-lg font-semibold mb-2">Nenhum item encontrado</h3>
            <p className="text-muted-foreground">Tente ajustar a busca.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtrado.map((item) => (
              <Card key={item.material} className="bg-card/60 border border-border/20 rounded-2xl p-4 shadow-sm backdrop-blur-md">
                <div className="space-y-3">
                  {/* Nome do Material */}
                  <div className="text-lg font-bold text-foreground leading-tight">
                    {item.material}
                  </div>
                  
                  {/* Informações do Material */}
                  <div className="grid grid-cols-1 gap-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">KG:</span>
                      <span className="font-semibold text-primary">{formatWeight(item.kg_total || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Médio:</span>
                      <span className="font-semibold text-primary">{formatCurrency(item.valor_medio_kg || 0)}/kg</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total:</span>
                      <span className="font-semibold text-primary">{formatCurrency(item.valor_total_gasto || 0)}</span>
                    </div>
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

export default Estoque;
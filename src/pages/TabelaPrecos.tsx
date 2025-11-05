import { ArrowLeft, Search, Edit3, List, Plus, CloudOff, Filter, Check, Trash2, GripVertical, Save, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/utils/formatters";
import { selectAll, selectById, selectWhere, update as dbUpdate, deleteFrom, exists, addToSyncQueue } from "@/database";
import { getSyncStatus } from "@/services/syncEngine";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableMaterialCard({ material, children }: { material: any; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(material.id),
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="select-none">
      <div className="flex items-center gap-2">
        {/* ✅ O handle agora é uma div HTML com listeners/attributes */}
        <div
          {...attributes}
          {...listeners}
          role="button"
          tabIndex={0}
          aria-label="Arrastar material"
          className="cursor-grab active:cursor-grabbing opacity-70 mr-2 p-1 rounded hover:bg-accent/20 touch-none"
        >
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>
        {children}
      </div>
    </div>
  );
}

const TabelaPrecos = () => {
  const navigate = useNavigate();
  const [selectedMaterial, setSelectedMaterial] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [novoPrecoVenda, setNovoPrecoVenda] = useState("");
  const [novoPrecoCompra, setNovoPrecoCompra] = useState("");
  const [busca, setBusca] = useState("");
  const [categoriaSelecionada, setCategoriaSelecionada] = useState("Todas");
  const { toast } = useToast();
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  const [categoriaSearch, setCategoriaSearch] = useState("");
  
  const [materiais, setMateriais] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [materialToDelete, setMaterialToDelete] = useState<any>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [materiaisReordenados, setMateriaisReordenados] = useState<any[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<number | string>>(new Set());

  async function loadMateriais() {
    try {
      setLoading(true);
      const rows = await selectAll<any>('material', 'display_order ASC, nome ASC');
      setMateriais(rows);
      
      // Buscar materiais pendentes na sync_queue
      const syncQueue = await selectWhere<any>(
        'sync_queue',
        'table_name = ? AND synced = ?',
        ['material', 0]
      );
      
      // Extrair IDs dos materiais pendentes (normalizar para número ou string)
      const pendingMaterialIds = new Set<number | string>();
      syncQueue.forEach((item: any) => {
        if (item.record_id != null) {
          // Normalizar para número se possível, senão manter como string
          const id = Number(item.record_id);
          pendingMaterialIds.add(isNaN(id) ? item.record_id : id);
        }
      });
      setPendingIds(pendingMaterialIds);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMateriais();
  }, []);

  // Filtrar materiais por busca e categoria
  const materiaisFiltrados = materiais.filter(material => {
    const matchBusca = material.nome.toLowerCase().includes(busca.toLowerCase());
    const matchCategoria = categoriaSelecionada === "Todas" || material.categoria === categoriaSelecionada;
    return matchBusca && matchCategoria;
  });

  // Obter categorias únicas
  const categorias = ["Todas", ...Array.from(new Set(materiais.map(m => m.categoria || "Outros")))];
  const categoriasFiltradas = useMemo(
    () => categorias.filter((c) => c.toLowerCase().includes(categoriaSearch.toLowerCase())),
    [categorias, categoriaSearch]
  );

  const handleEditClick = (material: any) => {
    setSelectedMaterial(material);
    const venda = Number(material.preco_venda);
    const compra = Number(material.preco_compra);
    setNovoPrecoVenda(Number.isFinite(venda) && venda > 0 ? String(venda) : "");
    setNovoPrecoCompra(Number.isFinite(compra) && compra > 0 ? String(compra) : "");
    setIsEditDialogOpen(true);
  };

  useEffect(() => {
    if (selectedMaterial && isEditDialogOpen) {
      const venda = Number(selectedMaterial.preco_venda);
      const compra = Number(selectedMaterial.preco_compra);
      setNovoPrecoVenda(Number.isFinite(venda) && venda > 0 ? String(venda) : "");
      setNovoPrecoCompra(Number.isFinite(compra) && compra > 0 ? String(compra) : "");
    }
  }, [selectedMaterial, isEditDialogOpen]);

  const handleSaveEdit = async () => {
    if (!selectedMaterial) return;

    const novoPrecoVendaNum = parseFloat(novoPrecoVenda) || 0;
    const novoPrecoCompraNum = parseFloat(novoPrecoCompra) || 0;

    if (novoPrecoVendaNum <= 0 || novoPrecoCompraNum <= 0) {
      toast({
        title: "Preços inválidos",
        description: "Os preços devem ser maiores que zero",
        variant: "destructive"
      });
      return;
    }

    try {
      const now = new Date().toISOString();
      const status = getSyncStatus();
      const origem_offline = status.hasCredentials && status.isOnline ? 0 : 1;

      await dbUpdate('material', {
        preco_compra: novoPrecoCompraNum,
        preco_venda: novoPrecoVendaNum,
        atualizado_por: 'local-user',
        origem_offline,
        data_sync: origem_offline ? null : now
      }, 'id = ?', [selectedMaterial.id]);

      // Sempre adicionar à sync_queue para garantir sincronização (online ou offline)
      const materialAtualizado = await selectById<any>('material', selectedMaterial.id);
      if (materialAtualizado) {
        const materialParaSync = {
          ...materialAtualizado,
          preco_compra: novoPrecoCompraNum,
          preco_venda: novoPrecoVendaNum,
          display_order: materialAtualizado.display_order ?? 9999,
          atualizado_por: 'local-user',
          origem_offline: 1, // Sempre marcar como offline para garantir reenvio
          data_sync: null    // Garantir reenvio
        };
        await addToSyncQueue(
          'material',
          'UPDATE',
          materialAtualizado.id,
          materialParaSync
        );
      }

      await loadMateriais();

      // success toast removed to keep UI silent
      setIsEditDialogOpen(false);
      setSelectedMaterial(null);
    } catch (error) {
      console.error('Error updating material prices:', error);
      toast({
        title: "Erro ao atualizar",
        description: "Erro ao atualizar preços do material",
        variant: "destructive"
      });
    }
  };

  function handleDeleteClick(material: any) {
    setMaterialToDelete(material);
    setIsDeleteDialogOpen(true);
  }

  async function handleConfirmDelete() {
    if (!materialToDelete) return;
    const id = materialToDelete.id;
    try {
      setDeleting(true);
      // Safety checks: referenced by comandas/items
      const usedInUltimas = await exists('ultimas_20', 'material = ?', [id]);
      const usedInComanda = await exists('comanda_20', 'material_id = ?', [id]);
      if (usedInUltimas || usedInComanda) {
        toast({ title: 'Este material está em uso e não pode ser removido.', variant: 'destructive' });
        return;
      }

      // Delete locally
      await deleteFrom('material', 'id = ?', [id]);

      // Always enqueue for sync (offline-first)
      await addToSyncQueue('material', 'DELETE', id, {} as any);

      await loadMateriais();
      // success toast removed to keep UI silent
      setIsDeleteDialogOpen(false);
      setMaterialToDelete(null);
    } catch (error) {
      toast({ title: 'Erro ao excluir material', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  }

  const handleCancelEdit = () => {
    setIsEditDialogOpen(false);
    setSelectedMaterial(null);
    setNovoPrecoVenda("");
    setNovoPrecoCompra("");
  };

  // Iniciar modo de reordenação
  const handleStartReorder = () => {
    setIsReorderMode(true);
    setMateriaisReordenados([...materiaisFiltrados]);
  };

  // Cancelar modo de reordenação
  const handleCancelReorder = () => {
    setIsReorderMode(false);
    setMateriaisReordenados([]);
  };

  // Salvar nova ordem
  const handleSaveReorder = async () => {
    if (materiaisReordenados.length === 0) {
      setIsReorderMode(false);
      return;
    }

    setSavingOrder(true);
    try {
      // Buscar todos os materiais uma vez para ter os dados completos
      const todosMateriais = await selectAll<any>('material', '', []);

      // Atualizar display_order para cada material na nova ordem
      for (let i = 0; i < materiaisReordenados.length; i++) {
        const material = materiaisReordenados[i];
        const novoDisplayOrder = i;
        const displayOrderAtual = material.display_order ?? 9999;

        if (novoDisplayOrder !== displayOrderAtual) {
          // Buscar o registro completo na lista já carregada
          const materialParaAtualizar = todosMateriais.find((m: any) => m.id === material.id);

          if (materialParaAtualizar) {
            // ✅ Sempre marcar como edição offline para garantir sincronização
            await dbUpdate(
              'material',
              {
                display_order: novoDisplayOrder,
                atualizado_por: 'local-user',
                origem_offline: 1, // ✅ Sempre marcar como edição offline
                data_sync: null     // ✅ Garante que será reenviado depois
              },
              'id = ?',
              [material.id]
            );

            // ✅ Sempre adicionar à sync_queue quando origem_offline = 1
            // Construir o payload completo com todos os campos atualizados
            const materialParaSync = {
              ...materialParaAtualizar,
              display_order: novoDisplayOrder,
              atualizado_por: 'local-user',
              origem_offline: 1,
              data_sync: null,
            };
            await addToSyncQueue('material', 'UPDATE', material.id, materialParaSync);
          }
        }
      }

      await loadMateriais();
      setIsReorderMode(false);
      setMateriaisReordenados([]);
      toast({
        title: "Ordem atualizada",
        description: "A ordem dos materiais foi atualizada com sucesso",
      });
    } catch (error) {
      console.error('Error saving material order:', error);
      toast({
        title: "Erro ao salvar ordem",
        description: "Erro ao atualizar a ordem dos materiais",
        variant: "destructive"
      });
    } finally {
      setSavingOrder(false);
    }
  };

  // Drag end handler
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setMateriaisReordenados((items) => {
        const oldIndex = items.findIndex((item) => String(item.id) === active.id);
        const newIndex = items.findIndex((item) => String(item.id) === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // ✅ Adiciona activationConstraint para iniciar drag só após leve movimento/click seguro
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4, // evita conflito com cliques normais
      },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Carregando materiais...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      {/* Header */}
      <div className="mb-6">
        {/* Linha 1: Título */}
        <div className="flex items-center mb-3">
          <Button variant="ghost" size="sm" className="mr-3" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Tabela de Preços</h1>
        </div>
        {/* Linha 2: Ações */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {!isReorderMode ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="hover:bg-accent/20"
                onClick={() => setIsFilterDialogOpen(true)}
                aria-label="Abrir filtro de categorias"
              >
                <Filter className="h-5 w-5 text-primary" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleStartReorder}
                aria-label="Reordenar materiais"
              >
                <List className="h-4 w-4 mr-2" />
                Reordenar Materiais
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/cadastrar-material')}
                aria-label="Cadastrar material"
              >
                <Plus className="h-4 w-4 mr-2" />
                Cadastrar Material
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelReorder}
                disabled={savingOrder}
              >
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleSaveReorder}
                disabled={savingOrder}
              >
                <Save className="h-4 w-4 mr-2" />
                {savingOrder ? 'Salvando...' : 'Salvar Ordem'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Busca */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Buscar materiais..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Filtro por categoria (em popup) */}
      <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
        <DialogContent className="rounded-2xl shadow-xl p-4 bg-background max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg font-bold text-foreground">Filtrar por Categoria</DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            <Label htmlFor="buscaCategoria" className="text-muted-foreground">Buscar</Label>
            <Input
              id="buscaCategoria"
              placeholder="Digite para filtrar categorias..."
              value={categoriaSearch}
              onChange={(e) => setCategoriaSearch(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="space-y-2 mt-3">
            {categoriasFiltradas.map((cat) => (
              <Button
                key={cat}
                variant={categoriaSelecionada === cat ? "secondary" : "ghost"}
                className="w-full justify-start rounded-lg text-left text-sm sm:text-base"
                onClick={() => {
                  setCategoriaSelecionada(cat);
                  setIsFilterDialogOpen(false);
                }}
              >
                {cat}
                {categoriaSelecionada === cat && <Check className="ml-auto h-4 w-4 text-primary" />}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsFilterDialogOpen(false)} className="w-full mt-3">Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lista de Materiais */}
      {materiaisFiltrados.length === 0 ? (
        <Card className="p-8 text-center rounded-xl shadow-sm">
          <List className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhum material encontrado</h3>
          <p className="text-muted-foreground mb-4">
            {materiais.length === 0 
              ? "Cadastre materiais primeiro para visualizar na tabela de preços"
              : "Nenhum material corresponde aos filtros aplicados"
            }
          </p>
          {materiais.length === 0 && (
            <Button onClick={() => navigate('/cadastrar-material')}>
              <Plus className="h-4 w-4 mr-2" />
              Cadastrar Material
            </Button>
          )}
        </Card>
      ) : isReorderMode ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={materiaisReordenados.map((m) => String(m.id))}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid grid-cols-1 gap-3 sm:gap-4">
              {materiaisReordenados.map((material) => (
                <SortableMaterialCard key={material.id} material={material}>
                  <div className="relative">
                    {pendingIds.has(material.id) && (
                      <div className="absolute top-1.5 right-1.5 bg-yellow-500 rounded-full w-5 h-5 flex items-center justify-center shadow-md z-10">
                        <CloudOff size={12} className="text-black" />
                      </div>
                    )}
                    <Card className="bg-background shadow-sm rounded-xl p-3 sm:p-4 border border-border/20 hover:bg-accent/5 transition-colors flex flex-col gap-1.5 sm:gap-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <h3 className="text-lg sm:text-xl font-semibold text-foreground truncate" title={material.nome}>
                            {material.nome}
                          </h3>
                        </div>
                      </div>
                    <p className="text-sm sm:text-base text-muted-foreground">{material.categoria}</p>
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex flex-col leading-tight space-y-0.5">
                        <p className="text-base sm:text-lg font-bold text-primary tabular-nums">
                          {formatCurrency(material.preco_venda || 0)}/kg
                        </p>
                        <p className="text-sm sm:text-base font-medium text-foreground tabular-nums">
                          {formatCurrency(material.preco_compra || 0)}/kg
                        </p>
                      </div>
                    </div>
                  </Card>
                  </div>
                </SortableMaterialCard>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
            <div className="grid grid-cols-1 gap-3 sm:gap-4">
              {materiaisFiltrados.map((material) => (
                <div key={material.id} className="relative">
                  {pendingIds.has(material.id) && (
                    <div className="absolute top-1.5 right-1.5 bg-yellow-500 rounded-full w-5 h-5 flex items-center justify-center shadow-md z-10">
                      <CloudOff size={12} className="text-black" />
                    </div>
                  )}
                  <Card className="bg-background shadow-sm rounded-xl p-3 sm:p-4 border border-border/20 hover:bg-accent/5 transition-colors flex flex-col gap-1.5 sm:gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="text-lg sm:text-xl font-semibold text-foreground truncate" title={material.nome}>
                          {material.nome}
                        </h3>
                      </div>
                    </div>
              <p className="text-sm sm:text-base text-muted-foreground">{material.categoria}</p>
              <div className="flex items-center justify-between mt-1">
                <div className="flex flex-col leading-tight space-y-0.5">
                  <p className="text-base sm:text-lg font-bold text-primary tabular-nums">
                    {formatCurrency(material.preco_venda || 0)}/kg
                  </p>
                  <p className="text-sm sm:text-base font-medium text-foreground tabular-nums">
                    {formatCurrency(material.preco_compra || 0)}/kg
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="hover:bg-accent/20 min-w-[36px] min-h-[36px]"
                          onClick={() => handleEditClick(material)}
                          aria-label="Editar material"
                        >
                          <Edit3 className="h-5 w-5 text-primary" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Editar material</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="hover:bg-accent/20 min-w-[36px] min-h-[36px]"
                          onClick={() => handleDeleteClick(material)}
                          aria-label="Excluir material"
                        >
                          <Trash2 className="h-5 w-5 text-red-600" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Excluir material</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </Card>
                </div>
          ))}
        </div>
      )}

      {/* Dialog de Edição */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Preços</DialogTitle>
          </DialogHeader>
          
          {selectedMaterial && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="material">Material</Label>
                <Input 
                  id="material"
                  value={selectedMaterial.nome}
                  disabled
                  className="bg-muted"
                />
              </div>
              
              <div>
                <Label htmlFor="precoCompra">Preço de compra</Label>
                <Input 
                  id="precoCompra"
                  type="number"
                  step="0.01"
                  value={novoPrecoCompra}
                  onChange={(e) => setNovoPrecoCompra(e.target.value)}
                  placeholder="Digite o valor"
                />
              </div>
              
              <div>
                <Label htmlFor="precoVenda">Preço de venda</Label>
                <Input 
                  id="precoVenda"
                  type="number"
                  step="0.01"
                  value={novoPrecoVenda}
                  onChange={(e) => setNovoPrecoVenda(e.target.value)}
                  placeholder="Digite o valor"
                />
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={handleCancelEdit}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveEdit}>
                  Salvar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmar Exclusão */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Material</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este material? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} disabled={deleting} className="bg-red-600 text-white hover:bg-red-600/90">
              {deleting ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TabelaPrecos;
import { ArrowLeft, FileText, Plus, Trash2, Edit, Calculator, ShoppingCart, DollarSign } from "lucide-react";
import { Device } from '@capacitor/device';
import { App } from '@capacitor/app';
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/utils/formatters";
import { insert, addToSyncQueue } from "@/database";
import { getSyncStatus, triggerSyncNow } from "@/services/syncEngine";
import { getComandaPrefix, setComandaPrefix, nextComandaSequence, buildComandaCodigo } from "@/services/settings";

interface ComandaItem {
  id: number;
  material: string;
  preco: number;
  quantidade: number;
  total: number;
}

interface Comanda {
  itens: ComandaItem[];
  tipo: 'compra' | 'venda';
  total: number;
}

const ComandaAtual = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [materiais, setMateriais] = useState<any[]>([]);
  
  const [comanda, setComanda] = useState<Comanda | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ComandaItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<ComandaItem | null>(null);
  const [editQuantidade, setEditQuantidade] = useState("");
  const [editPreco, setEditPreco] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState<any>(null);
  const [novaQuantidade, setNovaQuantidade] = useState("");
  const [novoPreco, setNovoPreco] = useState("");

  // Helper para formatar números com 2 casas decimais
  const formatNumber = (value: number): string => {
    return value.toFixed(2);
  };

  // Calculate subtotal in real-time for edit dialog
  const calcularSubtotalEdit = () => {
    const quantidade = parseFloat(editQuantidade) || 0;
    const preco = parseFloat(editPreco) || 0;
    return quantidade * preco;
  };

  useEffect(() => {
    const comandaStorage = localStorage.getItem('comandaAtual');
    if (comandaStorage) {
      setComanda(JSON.parse(comandaStorage));
    }
  }, []);

  // Configurar botão "Voltar" nativo do Android para ir ao menu inicial
  useEffect(() => {
    const backHandler = App.addListener('backButton', () => {
      navigate('/');
    });
    
    return () => {
      backHandler.remove();
    };
  }, [navigate]);

  const updateComanda = (novaComanda: Comanda) => {
    setComanda(novaComanda);
    localStorage.setItem('comandaAtual', JSON.stringify(novaComanda));
  };

  const handleEditItem = (item: ComandaItem) => {
    setSelectedItem(item);
    setEditQuantidade(item.quantidade.toString());
    setEditPreco(item.preco.toString());
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!selectedItem || !comanda) return;

    const novaQuantidade = parseFloat(editQuantidade) || 0;
    const novoPreco = parseFloat(editPreco) || 0;
    const novoTotal = novaQuantidade * novoPreco;

    const novaComanda = {
      ...comanda,
      itens: comanda.itens.map(item => 
        item.id === selectedItem.id 
          ? { ...item, quantidade: novaQuantidade, preco: novoPreco, total: novoTotal }
          : item
      )
    };
    novaComanda.total = novaComanda.itens.reduce((acc, item) => acc + item.total, 0);

    updateComanda(novaComanda);
    setIsEditDialogOpen(false);
    setSelectedItem(null);
    // success toast removed to keep UI silent
  };

  const handleOpenDeleteDialog = (item: ComandaItem) => {
    setItemToDelete(item);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!itemToDelete || !comanda) return;

    const novaComanda = {
      ...comanda,
      itens: comanda.itens.filter(item => item.id !== itemToDelete.id)
    };
    novaComanda.total = novaComanda.itens.reduce((acc, item) => acc + item.total, 0);

    updateComanda(novaComanda);
    setIsDeleteDialogOpen(false);
    setItemToDelete(null);
    // success toast removed to keep UI silent
  };

  const handleAddItem = () => {
    if (!selectedMaterial || !comanda) return;

    const quantidade = parseFloat(novaQuantidade) || 0;
    const preco = parseFloat(novoPreco) || 0;
    const total = quantidade * preco;

    const novoItem: ComandaItem = {
      id: Date.now(),
      material: selectedMaterial.nome,
      preco: preco,
      quantidade: quantidade,
      total: total
    };

    const novaComanda = {
      ...comanda,
      itens: [...comanda.itens, novoItem]
    };
    novaComanda.total = novaComanda.itens.reduce((acc, item) => acc + item.total, 0);

    updateComanda(novaComanda);
    setIsAddDialogOpen(false);
    setSelectedMaterial(null);
    setNovaQuantidade("");
    setNovoPreco("");
    // success toast removed to keep UI silent
  };

  const handleLimparComanda = () => {
    setComanda(null);
    localStorage.removeItem('comandaAtual');
    // success toast removed to keep UI silent
  };

  // Não agrupar itens - mostrar cada inserção separadamente
  // (Para manter a tela "Comanda Atual" diferente de Preview/PDF que agrupam)

  const handleFinalizarComanda = async () => {
    if (!comanda || comanda.itens.length === 0) return;

    try {
      const status = getSyncStatus();
      const origem_offline = status.hasCredentials && status.isOnline ? 0 : 1;
      const now = new Date().toISOString();
      // Identify the device for attribution
      let deviceName = 'Dispositivo Local';
      try {
        const info = await Device.getInfo();
        deviceName = (info as any)?.name || (info as any)?.model || 'Dispositivo Local';
      } catch {}
      // Create a local synthetic comanda id and codigo to correlate pending inserts in Historico
      const localComandaId = Date.now();
      // Build codigo using saved prefix and per-prefix sequence
      let prefix = getComandaPrefix();
      if (!prefix || prefix.trim() === "") {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        const newPrefix = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
        setComandaPrefix(newPrefix);
        // atualizar variável prefix no escopo local
        prefix = newPrefix;
      }
      const sequence = nextComandaSequence(prefix);
      const codigo = `${prefix || ''}${sequence}`;

      // Enqueue the comanda itself with its tipo so Historico can show "Tipo: Compra/Venda"
      try {
        await addToSyncQueue('comanda', 'INSERT', String(localComandaId), {
          // optional id omitted to allow server to assign; record_id links pending view
          data: now,
          codigo,
          tipo: comanda.tipo,
          observacoes: null,
          total: comanda.total,
          criado_por: deviceName,
          atualizado_por: 'local-user'
        });
        // removed verification log to keep console silent
      } catch {}

      // Enfileirar cada item diretamente na tabela 'item' usando codigo como vínculo
      for (const it of comanda.itens) {
        try {
          await addToSyncQueue('item', 'INSERT', '', {
            data: now,
            codigo, // chave de ligação entre comanda e itens
            // material id pode não estar disponível offline; incluir fallbacks
            material: null,
            material_nome: it.material,
            categoria: null,
            preco_kg: it.preco,
            kg_total: it.quantidade,
            valor_total: it.total,
            criado_por: deviceName,
            atualizado_por: 'local-user'
          });
        } catch {}
      }

      // Disparar sincronização silenciosa se online e com credenciais
      try {
        if (status.hasCredentials && status.isOnline) {
          triggerSyncNow();
        }
      } catch {}

      // success toast removed to keep UI silent
      localStorage.setItem("ultimaComandaFinalizada", JSON.stringify(comanda));

      handleLimparComanda();
      navigate('/');
    } catch (error) {
      toast({ title: 'Erro ao finalizar comanda', variant: 'destructive' });
    }
  };

  if (!comanda || comanda.itens.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b p-3 z-10">
          <div className="flex items-center">
            <Button variant="ghost" size="sm" className="mr-2" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-lg font-bold text-foreground">Comanda Atual</h1>
          </div>
        </div>

        {/* Conteúdo vazio */}
        <div className="p-3">
          <Card className="p-6 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <h2 className="text-lg font-semibold mb-2">Nenhuma comanda ativa</h2>
            <p className="text-muted-foreground mb-4 text-sm">
              Adicione itens nas páginas de compra ou venda para começar uma comanda.
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => navigate('/compra')} className="w-full">
                <ShoppingCart className="h-4 w-4 mr-2" />
                Nova Compra
              </Button>
              <Button variant="outline" onClick={() => navigate('/venda')} className="w-full">
                <DollarSign className="h-4 w-4 mr-2" />
                Nova Venda
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header - Responsivo */}
      <div className="sticky top-0 bg-background border-b p-3 z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <Button variant="ghost" size="sm" className="mr-2" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-lg font-bold text-foreground">Comanda Atual</h1>
          </div>
        </div>
        
        {/* Botões de ação - Responsivos */}
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigate(comanda.tipo === "compra" ? "/compra" : "/venda")}
            className="flex-1"
          >
            Adicionar
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleLimparComanda}
            className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 border-red-300 hover:border-red-400"
          >
            Cancelar
          </Button>
        </div>
      </div>

      {/* Conteúdo Principal */}
      <div className="p-3 pb-24">
        {/* Tipo da Comanda */}
        <Card className="p-4 mb-4 bg-primary/5 border border-primary/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {comanda.tipo === 'compra' ? (
                <ShoppingCart className="h-5 w-5 text-primary" />
              ) : (
                <DollarSign className="h-5 w-5 text-green-600" />
              )}
              <span className="text-base font-semibold text-foreground">
                Comanda de {comanda.tipo === 'compra' ? 'Compra' : 'Venda'}
              </span>
            </div>
            <span className="text-sm text-muted-foreground font-medium">
              {comanda.itens.length} item{comanda.itens.length !== 1 ? 's' : ''}
            </span>
          </div>
        </Card>

        {/* Lista de Itens - Sem agrupamento, cada inserção separada */}
        <div className="space-y-4 mb-6">
          {comanda.itens.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <h3 className="font-semibold text-foreground text-base leading-tight flex-1 pr-3">
                    {item.material}
                  </h3>
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={() => handleEditItem(item)}
                      className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors"
                      title="Editar item"
                    >
                      <Edit className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </button>
                    <button
                      onClick={() => handleOpenDeleteDialog(item)}
                      className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                      title="Excluir item"
                    >
                      <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="bg-muted/30 p-2 rounded">
                    <span className="text-muted-foreground text-xs block">Kg total</span>
                    <span className="font-semibold text-base">{formatNumber(item.quantidade)}kg</span>
                  </div>
                  <div className="bg-muted/30 p-2 rounded">
                    <span className="text-muted-foreground text-xs block">Preço/kg</span>
                    <span className="font-semibold text-base">{formatCurrency(parseFloat(formatNumber(item.preco)))}</span>
                  </div>
                  <div className="bg-muted/30 p-2 rounded">
                    <span className="text-muted-foreground text-xs block">Total</span>
                    <span className="font-bold text-base text-primary">{formatCurrency(parseFloat(formatNumber(item.total)))}</span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Total da Comanda */}
        <Card className="p-4 bg-primary/10 border-2 border-primary/20 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-base font-semibold text-foreground">Total da Comanda:</span>
            <span className="text-2xl font-bold text-primary">
              {formatCurrency(parseFloat(formatNumber(comanda.total)))}
            </span>
          </div>
        </Card>
      </div>

      {/* Botão Finalizar - Fixo na parte inferior */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t-2 border-primary/20 p-4 z-20">
        <Button 
          onClick={handleFinalizarComanda} 
          className="w-full h-14 bg-green-600 hover:bg-green-700 text-white font-bold text-base"
          size="lg"
        >
          <Calculator className="h-6 w-6 mr-3" />
          Finalizar Comanda
        </Button>
      </div>

      {/* Dialog de Edição */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-center">Editar Item</DialogTitle>
          </DialogHeader>
          
          {selectedItem && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="material">Material</Label>
                <Input 
                  id="material"
                  value={selectedItem.material}
                  disabled
                  className="bg-muted"
                />
              </div>
              
              <div>
                <Label htmlFor="quantidade">Quantidade (kg)</Label>
                <Input 
                  id="quantidade"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editQuantidade}
                  onChange={(e) => setEditQuantidade(e.target.value)}
                  placeholder="Digite a quantidade"
                />
              </div>
              
              <div>
                <Label htmlFor="preco">Preço por kg</Label>
                <Input 
                  id="preco"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editPreco}
                  onChange={(e) => setEditPreco(e.target.value)}
                  placeholder="Digite o preço"
                />
              </div>
              
              {/* Subtotal Section */}
              <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4 mt-4">
                <div className="flex items-center justify-between">
                  <p className="text-lg text-green-700 dark:text-green-300 font-semibold">Subtotal</p>
                  <p className="text-3xl font-black text-green-800 dark:text-green-200">
                    {formatCurrency(calcularSubtotalEdit())}
                  </p>
                </div>
              </div>
              
              <div className="flex flex-col gap-2">
                <Button onClick={handleSaveEdit} className="w-full">
                  Salvar
                </Button>
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="w-full">
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Exclusão */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-center text-red-600 dark:text-red-400">Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          
          {itemToDelete && (
            <div className="space-y-4">
              <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-center text-foreground mb-3">
                  Deseja realmente excluir este item da comanda?
                </p>
                <div className="bg-background/50 p-3 rounded">
                  <p className="font-semibold text-center text-base">{itemToDelete.material}</p>
                  <p className="text-sm text-muted-foreground text-center mt-1">
                    {formatNumber(itemToDelete.quantidade)}kg × {formatCurrency(parseFloat(formatNumber(itemToDelete.preco)))} = {formatCurrency(parseFloat(formatNumber(itemToDelete.total)))}
                  </p>
                </div>
              </div>
              
              <div className="flex flex-col gap-2">
                <Button 
                  onClick={handleConfirmDelete} 
                  className="w-full bg-red-600 hover:bg-red-700 text-white"
                >
                  Confirmar Exclusão
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setIsDeleteDialogOpen(false);
                    setItemToDelete(null);
                  }} 
                  className="w-full"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de Adicionar Item */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-center">Adicionar Item</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="materialSelect">Material</Label>
              <select
                id="materialSelect"
                value={selectedMaterial?.id || ""}
                onChange={(e) => {
                  const material = materiais.find(m => m.id === parseInt(e.target.value));
                  setSelectedMaterial(material);
                  if (material) {
                    setNovoPreco(comanda.tipo === 'compra' ? material.preco_compra_kg.toString() : material.preco_venda_kg.toString());
                  }
                }}
                className="w-full mt-1 p-3 border border-input rounded-md bg-background text-sm"
              >
                <option value="">Selecione um material</option>
                {materiais.map(material => (
                  <option key={material.id} value={material.id}>
                    {material.nome}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <Label htmlFor="novaQuantidade">Quantidade (kg)</Label>
              <Input 
                id="novaQuantidade"
                type="number"
                inputMode="decimal"
                pattern="[0-9]*"
                step="0.01"
                autoFocus={true}
                value={novaQuantidade}
                onChange={(e) => setNovaQuantidade(e.target.value)}
                placeholder="Digite a quantidade"
                className="p-3"
              />
            </div>
            
            <div>
              <Label htmlFor="novoPreco">Preço por kg</Label>
              <Input 
                id="novoPreco"
                type="number"
                inputMode="decimal"
                pattern="[0-9]*"
                step="0.01"
                value={novoPreco}
                onChange={(e) => setNovoPreco(e.target.value)}
                placeholder="Digite o preço"
                className="p-3"
              />
            </div>
            
            <div className="flex flex-col gap-2">
              <Button 
                onClick={handleAddItem} 
                disabled={!selectedMaterial || !novaQuantidade}
                className="w-full"
              >
                Adicionar
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setIsAddDialogOpen(false)} 
                className="w-full"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ComandaAtual;
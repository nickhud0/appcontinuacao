import { ArrowLeft, AlertCircle, CloudOff, Edit, Trash2, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { insert, addToSyncQueue, selectAll, selectWhere, update as dbUpdate, deleteFrom } from "@/database";
import { getSyncStatus, triggerSyncNow } from "@/services/syncEngine";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import { formatCurrency } from "@/utils/formatters";

const Pendencias = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [nome, setNome] = useState("");
  const [valor, setValor] = useState("");
  const [tipo, setTipo] = useState<'a_pagar' | 'a_receber'>('a_pagar');
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [isTipoDialogOpen, setIsTipoDialogOpen] = useState(false);
  const [alterandoId, setAlterandoId] = useState<string | number | null>(null);
  const [confirmPagoOpen, setConfirmPagoOpen] = useState(false);
  const [pendenciaParaPagar, setPendenciaParaPagar] = useState<any | null>(null);
  
  // Estados para edição
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [pendenciaParaEditar, setPendenciaParaEditar] = useState<any | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editValor, setEditValor] = useState("");
  const [editTipo, setEditTipo] = useState<'a_pagar' | 'a_receber'>('a_pagar');
  const [editObservacao, setEditObservacao] = useState("");
  const [isEditTipoDialogOpen, setIsEditTipoDialogOpen] = useState(false);
  const [confirmEditOpen, setConfirmEditOpen] = useState(false);
  
  // Estados para exclusão
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pendenciaParaExcluir, setPendenciaParaExcluir] = useState<any | null>(null);

  async function loadItems() {
    try {
      const confirmadas = await selectWhere<any>('pendencia_false', 'status = ?', [0], 'data DESC');
      
      // Buscar pendências pendentes na sync_queue: table_name='pendencia' AND operation='INSERT' AND synced=0
      const pendentesRows = await selectWhere<any>('sync_queue', 'synced = ? AND table_name = ? AND operation = ?', [0, 'pendencia', 'INSERT'], 'created_at DESC');
      const pendentes = (pendentesRows || []).map((row: any) => {
        let payload: any = {};
        try {
          const parsed = JSON.parse(row.payload || '{}');
          payload = parsed && typeof parsed === 'object' ? parsed : {};
        } catch {}
        return {
          id: `pending-${row.id}`,
          record_id: row.record_id || '',
          data: payload.data || row.created_at,
          status: payload.status !== undefined ? payload.status : 0,
          nome: payload.nome || '(sem nome)',
          valor: Number(payload.valor) || 0,
          tipo: payload.tipo || 'a_pagar',
          observacao: payload.observacao || null,
          criado_por: payload.criado_por || 'local-user',
          atualizado_por: payload.atualizado_por || 'local-user',
          __pending: true,
          origem_offline: 1
        };
      });
      
      const pendingRecordIds = new Set<string>((pendentes || []).map((p: any) => String(p.record_id || '')));
      const confirmadasSemDuplicatas = (confirmadas || []).filter((c: any) => !pendingRecordIds.has(String(c.id)));
      const unificada = [...pendentes, ...confirmadasSemDuplicatas].sort((a: any, b: any) => {
        const da = a?.data ? new Date(a.data).getTime() : 0;
        const db = b?.data ? new Date(b.data).getTime() : 0;
        return db - da;
      });
      setItems(Array.isArray(unificada) ? unificada : []);
    } catch {
      setItems([]);
    }
  }

  useEffect(() => {
    void loadItems();
  }, []);

  async function handleSalvar() {
    if (!nome.trim() || !valor) {
      toast({ title: 'Campos obrigatórios', description: 'Preencha nome e valor', variant: 'destructive' });
      return;
    }
    setSalvando(true);
    try {
      const status = getSyncStatus();
      const now = new Date().toISOString();
      await addToSyncQueue('pendencia', 'INSERT', '', {
        nome: nome.trim(),
        valor: parseFloat(valor),
        tipo,
        observacao: observacao.trim() || null,
        data: now,
        status: 0,
        criado_por: 'local-user',
        atualizado_por: 'local-user'
      });
      if (status.hasCredentials && status.isOnline) {
        triggerSyncNow();
      }
      // success toast removed to keep UI silent
      setNome("");
      setValor("");
      setObservacao("");
      await loadItems();
    } catch (error) {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  }

  async function handleMarcarComoPago(p: any) {
    try {
      const localId = p?.__pending ? p?.record_id : p?.id;
      if (localId == null || String(localId).trim() === '') {
        toast({ title: 'Não foi possível identificar a pendência.', variant: 'destructive' });
        return;
      }
      setAlterandoId(localId);
      await dbUpdate('pendencia_false', { status: 1, atualizado_por: 'local-user' }, 'id = ?', [localId]);
      await addToSyncQueue('pendencia', 'UPDATE', String(localId), {
        id: Number(localId),
        data: p?.data || new Date().toISOString(),
        status: true,
        nome: p?.nome || '(sem nome)',
        valor: Number(p?.valor) || 0,
        tipo: p?.tipo || 'a_pagar',
        observacao: p?.observacao || null,
        criado_por: 'local-user',
        atualizado_por: 'local-user'
      });
      const statusNow = getSyncStatus();
      if (statusNow.hasCredentials && statusNow.isOnline) {
        triggerSyncNow();
      }
      await loadItems();
    } catch (error) {
      toast({ title: 'Erro ao atualizar status', variant: 'destructive' });
    } finally {
      setAlterandoId(null);
    }
  }

  // Função para abrir modal de edição
  function handleAbrirEdicao(p: any) {
    setPendenciaParaEditar(p);
    setEditNome(p.nome || '');
    setEditValor(String(p.valor || ''));
    setEditTipo(p.tipo || 'a_pagar');
    setEditObservacao(p.observacao || '');
    setIsEditDialogOpen(true);
  }

  // Função para salvar edição
  async function handleSalvarEdicao() {
    if (!editNome.trim() || !editValor) {
      toast({ title: 'Campos obrigatórios', description: 'Preencha nome e valor', variant: 'destructive' });
      return;
    }

    try {
      const p = pendenciaParaEditar;
      
      // Verificar se está na sync_queue (__pending === true)
      if (p?.__pending === true) {
        // Localizar na sync_queue usando o ID da sync_queue (extrair de p.id que é "pending-{syncQueueId}")
        const syncQueueId = String(p.id).replace('pending-', '');
        const syncQueueRows = await selectWhere<any>('sync_queue', 'synced = ? AND table_name = ? AND operation = ? AND id = ?', [0, 'pendencia', 'INSERT', syncQueueId]);
        
        if (syncQueueRows.length > 0) {
          const syncItem = syncQueueRows[0];
          const updatedPayload = {
            nome: editNome.trim(),
            valor: parseFloat(editValor),
            tipo: editTipo,
            observacao: editObservacao.trim() || null,
            data: p?.data || new Date().toISOString(),
            status: p?.status !== undefined ? p.status : 0,
            criado_por: p?.criado_por || 'local-user',
            atualizado_por: 'local-user'
          };
          
          await dbUpdate('sync_queue', { payload: JSON.stringify(updatedPayload) }, 'id = ?', [syncItem.id]);
        }
      } else {
        // Pendência já sincronizada - adicionar UPDATE na sync_queue
        const statusNow = getSyncStatus();
        await addToSyncQueue('pendencia', 'UPDATE', String(p.id), {
          nome: editNome.trim(),
          valor: parseFloat(editValor),
          tipo: editTipo,
          observacao: editObservacao.trim() || null,
          atualizado_por: 'local-user',
          data: p?.data || new Date().toISOString()
        });
        
        if (statusNow.hasCredentials && statusNow.isOnline) {
          triggerSyncNow();
        }
      }

      setItems((current) =>
        current.map((item) =>
          item.id === p.id
            ? { ...item, nome: editNome.trim(), valor: parseFloat(editValor), tipo: editTipo, observacao: editObservacao.trim() || null, __pending: true }
            : item
        )
      );

      setIsEditDialogOpen(false);
      setPendenciaParaEditar(null);
    } catch (error) {
      toast({ title: 'Erro ao editar pendência', variant: 'destructive' });
    }
  }

  // Função para abrir modal de exclusão
  function handleAbrirExclusao(p: any) {
    setPendenciaParaExcluir(p);
    setConfirmDeleteOpen(true);
  }

  // Função para confirmar exclusão
  async function handleConfirmarExclusao() {
    try {
      const p = pendenciaParaExcluir;
      
      // Verificar se está na sync_queue (__pending === true)
      if (p?.__pending === true) {
        // Remover da sync_queue usando o ID da sync_queue (extrair de p.id que é "pending-{syncQueueId}")
        const syncQueueId = String(p.id).replace('pending-', '');
        const syncQueueRows = await selectWhere<any>('sync_queue', 'synced = ? AND table_name = ? AND operation = ? AND id = ?', [0, 'pendencia', 'INSERT', syncQueueId]);
        
        if (syncQueueRows.length > 0) {
          await deleteFrom('sync_queue', 'id = ?', [syncQueueRows[0].id]);
        }
      } else {
        // Pendência já sincronizada - adicionar DELETE na sync_queue
        const statusNow = getSyncStatus();
        await addToSyncQueue('pendencia', 'DELETE', String(p.id), {});
        
        if (statusNow.hasCredentials && statusNow.isOnline) {
          triggerSyncNow();
        }
      }

      setItems((current) => current.filter((item) => item.id !== p.id));

      setConfirmDeleteOpen(false);
      setPendenciaParaExcluir(null);
    } catch (error) {
      toast({ title: 'Erro ao excluir pendência', variant: 'destructive' });
    }
  }

  return (
    <div className="min-h-screen bg-background p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Button variant="ghost" size="sm" className="mr-3" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Pendências</h1>
        </div>
      </div>

      {/* Conteúdo */}
      <Card className="p-4 sm:p-5 rounded-xl shadow-sm">
        <div className="flex items-center mb-4">
          <AlertCircle className="h-6 w-6 text-primary mr-3" />
          <h2 className="text-base sm:text-lg font-semibold text-foreground">Registrar Pendência</h2>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:gap-4 mb-4">
          <div>
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="valor">Valor (R$)</Label>
            <Input id="valor" type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Tipo</Label>
            <div className="mt-1">
              <Button
                variant="outline"
                className="w-full justify-between rounded-lg"
                onClick={() => setIsTipoDialogOpen(true)}
              >
                <span className="text-sm sm:text-base">{tipo === 'a_pagar' ? 'A pagar' : 'A receber'}</span>
              </Button>
            </div>
          </div>
          <div>
            <Label htmlFor="obs">Observação (opcional)</Label>
            <Input id="obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} className="mt-1" />
          </div>
          <Button onClick={handleSalvar} disabled={salvando} className="w-full">
            {salvando ? 'Salvando...' : 'Salvar Pendência'}
          </Button>
        </div>

        <div className="space-y-3">
          {items.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground rounded-xl border border-border/20">Nenhuma pendência registrada.</Card>
          ) : (
            items.map((p) => {
              console.log("PENDENCIA ITEM", p);
              return (
              <Card key={p.id} className="p-3 sm:p-4 rounded-xl border border-border/20 shadow-sm hover:bg-accent/5 transition-colors">
                {/* Linha superior: Edit/Delete à esquerda, CloudOff à direita */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAbrirEdicao(p)}
                      className="h-8 w-8 p-0 text-blue-500 hover:text-blue-600"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAbrirExclusao(p)}
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {(p.__pending || p.origem_offline === 1) && (
                    <CloudOff className="h-4 w-4 text-yellow-500" />
                  )}
                </div>
                
                {/* Conteúdo principal */}
                <div className="min-w-0 mb-2">
                  <div className="text-lg sm:text-xl font-semibold text-foreground truncate">{p.nome}</div>
                  {p.observacao && (
                    <div className="text-sm text-blue-700 whitespace-pre-wrap break-words mt-1">
                      {p.observacao}
                    </div>
                  )}
                  <div className="text-sm sm:text-base text-muted-foreground mt-0.5">
                    {formatCurrency(Number(p.valor) || 0)} • {(p.tipo === 'a_pagar' ? 'A pagar' : 'A receber')} • {new Date(p.data).toLocaleString()}
                  </div>
                </div>
                
                {/* Botão marcar como pago (ícone) no canto inferior direito */}
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setPendenciaParaPagar(p); setConfirmPagoOpen(true); }}
                    disabled={alterandoId === (p?.__pending ? p?.record_id : p?.id)}
                    className="h-8 w-8 p-0 text-gray-500 hover:text-green-600"
                  >
                    <CheckCircle className="h-[18px] w-[18px]" />
                  </Button>
                </div>
              </Card>
              );
            })
          )}
        </div>
        <AlertDialog open={confirmPagoOpen} onOpenChange={setConfirmPagoOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar pagamento desta pendência?</AlertDialogTitle>
              <AlertDialogDescription>
                <div className="mt-2 space-y-1">
                  <div>
                    <span className="font-medium">Nome:</span> {pendenciaParaPagar?.nome || '—'}
                  </div>
                  <div>
                    <span className="font-medium">Valor:</span> {formatCurrency(Number(pendenciaParaPagar?.valor) || 0)}
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={!!alterandoId}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (pendenciaParaPagar) {
                    await handleMarcarComoPago(pendenciaParaPagar);
                  }
                  setConfirmPagoOpen(false);
                  setPendenciaParaPagar(null);
                }}
                disabled={!!alterandoId}
              >
                Confirmar Pagamento
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>

      {/* Tipo Selector Dialog */}
      <Dialog open={isTipoDialogOpen} onOpenChange={setIsTipoDialogOpen}>
        <DialogContent className="rounded-2xl shadow-xl p-4 bg-background max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg font-bold text-foreground">Selecionar Tipo</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            <Button
              variant={tipo === 'a_pagar' ? 'secondary' : 'ghost'}
              className="w-full justify-start rounded-lg text-left text-sm sm:text-base"
              onClick={() => { setTipo('a_pagar'); setIsTipoDialogOpen(false); }}
            >
              A pagar
            </Button>
            <Button
              variant={tipo === 'a_receber' ? 'secondary' : 'ghost'}
              className="w-full justify-start rounded-lg text-left text-sm sm:text-base"
              onClick={() => { setTipo('a_receber'); setIsTipoDialogOpen(false); }}
            >
              A receber
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsTipoDialogOpen(false)} className="w-full mt-3">Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Edição */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="rounded-2xl shadow-xl p-4 bg-background max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg font-bold text-foreground">Editar Pendência</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="edit-nome">Nome</Label>
              <Input 
                id="edit-nome" 
                value={editNome} 
                onChange={(e) => setEditNome(e.target.value)} 
                className="mt-1" 
              />
            </div>
            <div>
              <Label htmlFor="edit-valor">Valor (R$)</Label>
              <Input 
                id="edit-valor" 
                type="number" 
                step="0.01" 
                value={editValor} 
                onChange={(e) => setEditValor(e.target.value)} 
                className="mt-1" 
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <div className="mt-1">
                <Button
                  variant="outline"
                  className="w-full justify-between rounded-lg"
                  onClick={() => setIsEditTipoDialogOpen(true)}
                >
                  <span className="text-sm sm:text-base">{editTipo === 'a_pagar' ? 'A pagar' : 'A receber'}</span>
                </Button>
              </div>
            </div>
            <div>
              <Label htmlFor="edit-obs">Observação (opcional)</Label>
              <Input 
                id="edit-obs" 
                value={editObservacao} 
                onChange={(e) => setEditObservacao(e.target.value)} 
                className="mt-1" 
              />
            </div>
          </div>
          <DialogFooter className="gap-2 mt-6">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => setConfirmEditOpen(true)}>
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Seleção de Tipo para Edição */}
      <Dialog open={isEditTipoDialogOpen} onOpenChange={setIsEditTipoDialogOpen}>
        <DialogContent className="rounded-2xl shadow-xl p-4 bg-background max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg font-bold text-foreground">Selecionar Tipo</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            <Button
              variant={editTipo === 'a_pagar' ? 'secondary' : 'ghost'}
              className="w-full justify-start rounded-lg text-left text-sm sm:text-base"
              onClick={() => { setEditTipo('a_pagar'); setIsEditTipoDialogOpen(false); }}
            >
              A pagar
            </Button>
            <Button
              variant={editTipo === 'a_receber' ? 'secondary' : 'ghost'}
              className="w-full justify-start rounded-lg text-left text-sm sm:text-base"
              onClick={() => { setEditTipo('a_receber'); setIsEditTipoDialogOpen(false); }}
            >
              A receber
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsEditTipoDialogOpen(false)} className="w-full mt-3">Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de Edição */}
      <AlertDialog open={confirmEditOpen} onOpenChange={setConfirmEditOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja alterar esta pendência?</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="mt-2 space-y-1">
                <div>
                  <span className="font-medium">Nome:</span> {editNome || '—'}
                </div>
                <div>
                  <span className="font-medium">Valor:</span> {formatCurrency(Number(editValor) || 0)}
                </div>
                <div>
                  <span className="font-medium">Tipo:</span> {editTipo === 'a_pagar' ? 'A pagar' : 'A receber'}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await handleSalvarEdicao();
                setConfirmEditOpen(false);
              }}
            >
              Confirmar Alteração
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de Exclusão */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja remover esta pendência?</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="mt-2 space-y-1">
                <div>
                  <span className="font-medium">Nome:</span> {pendenciaParaExcluir?.nome || '—'}
                </div>
                <div>
                  <span className="font-medium">Valor:</span> {formatCurrency(Number(pendenciaParaExcluir?.valor) || 0)}
                </div>
              </div>
              <div className="mt-3 text-sm text-red-600">
                Esta ação não pode ser desfeita.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarExclusao}
              className="bg-red-600 hover:bg-red-700"
            >
              Confirmar Exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Pendencias;
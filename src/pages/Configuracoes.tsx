import { ArrowLeft, Settings, Cloud, CloudOff, Save, RefreshCw, Bluetooth, Database } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getSupabaseSettings, saveSupabaseSettings, getComandaPrefix, setComandaPrefix } from "@/services/settings";
import { onSyncStatus, triggerSyncNow, notifyCredentialsUpdated, type SyncStatus } from "@/services/syncEngine";
import { count } from "@/database";
import { isDatabaseInitialized } from "@/database/initDatabase";
import { Capacitor } from "@capacitor/core";
import BluetoothPrinterModal from "@/components/BluetoothPrinterModal";

const Configuracoes = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<SyncStatus>({
    isOnline: false,
    hasCredentials: false,
    syncing: false,
    lastSyncAt: null,
    pendingCount: 0,
    lastError: null
  });
  const [pendingCount, setPendingCount] = useState(0);
  const prevStatusRef = useRef<SyncStatus | null>(null);
  const [codigoPrefix, setCodigoPrefix] = useState("");
  const [prefixSaving, setPrefixSaving] = useState(false);
  const [isBluetoothModalOpen, setIsBluetoothModalOpen] = useState(false);
  const [dbInitialized, setDbInitialized] = useState(false);

  useEffect(() => {
    // Load saved settings
    const s = getSupabaseSettings();
    if (s) {
      setUrl(s.url);
      setAnonKey(s.anonKey);
    }
    // Load comanda prefix
    setCodigoPrefix(getComandaPrefix());
    // Check database status
    setDbInitialized(isDatabaseInitialized());
    // Subscribe to sync status
    const unsubscribe = onSyncStatus((st) => setStatus(st));
    return () => unsubscribe();
  }, []);

  const connected = status.hasCredentials && status.isOnline;

  async function refreshPendingCount() {
    try {
      const c = await count('sync_queue', 'synced = ?', [0]);
      setPendingCount(c);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void refreshPendingCount();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshPendingCount();
    }, 5000) as unknown as number;
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    // Update pending count and show toasts on status transitions
    void refreshPendingCount();

    const prev = prevStatusRef.current;
    // success/info toasts removed to keep UI silent
    if ((status.lastError && !prev?.lastError) || (status.lastError && prev?.lastError !== status.lastError)) {
      toast({ title: 'Erro de sincronização', description: String(status.lastError), variant: 'destructive' as any });
    }
    prevStatusRef.current = status;
  }, [status]);

  const friendlyStatus = useMemo(() => {
    if (!status.hasCredentials) {
      return { label: 'Conexão não configurada', color: 'text-red-600', Icon: CloudOff };
    }
    if (!status.isOnline) {
      return { label: 'Usando dados locais (Offline)', color: 'text-yellow-700', Icon: CloudOff };
    }
    return { label: 'Conectado à Nuvem', color: 'text-green-600', Icon: Cloud };
  }, [status.hasCredentials, status.isOnline]);

  async function handleSave() {
    if (!url.trim() || !anonKey.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Informe a Supabase URL e a Anon Key",
        variant: "destructive"
      });
      return;
    }
    setSaving(true);
    try {
      saveSupabaseSettings({ url: url.trim(), anonKey: anonKey.trim() });
      notifyCredentialsUpdated();
      // success toast removed to keep UI silent
    } catch (error) {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function normalizePrefix(v: string) {
    return (v || "").toUpperCase().replace(/\s+/g, '').slice(0, 8);
  }

  async function handleSavePrefix() {
    setPrefixSaving(true);
    try {
      setComandaPrefix(normalizePrefix(codigoPrefix));
      // success toast removed to keep UI silent
    } catch {
      toast({ title: "Erro ao salvar prefixo", variant: "destructive" });
    } finally {
      setPrefixSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 max-w-xl mx-auto">
        <div className="flex items-center">
          <Button variant="ghost" size="sm" className="mr-3" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsBluetoothModalOpen(true)}
          className="flex items-center gap-2"
        >
          <Bluetooth className="h-4 w-4" />
          <span className="hidden sm:inline">Impressora</span>
        </Button>
      </div>

      {/* Supabase Config */}
      <Card className="p-6 mb-6 max-w-xl mx-auto rounded-xl border border-border/20 shadow-sm">
        <div className="flex items-center mb-1">
          <Settings className="h-6 w-6 text-primary mr-3" />
          <h2 className="text-lg font-semibold">Conexão com Supabase</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Informe as credenciais para habilitar a sincronização.</p>

        <div className="space-y-4">
          <div>
            <Label htmlFor="supabase-url">Supabase URL</Label>
            <Input
              id="supabase-url"
              placeholder="https://YOUR-PROJECT.supabase.co"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="supabase-key">Supabase Anon Key</Label>
            <Input
              id="supabase-key"
              type="password"
              placeholder="eyJhbGciOiJI..."
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                <div className="mb-1">Última sincronização: {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : '—'}</div>
                <div className="mb-1">Pendentes: {pendingCount}</div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-flex items-center gap-2 text-xs ${friendlyStatus.color}`}>
                  <friendlyStatus.Icon className="h-3 w-3" />
                  {friendlyStatus.label}
                </span>
              </div>
                {status.lastError && (
                  <div className="text-red-600 mt-1">Erro: {status.lastError}</div>
                )}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => triggerSyncNow()}
                disabled={!status.hasCredentials || status.syncing}
                className="w-full sm:w-auto"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${status.syncing ? 'animate-spin' : ''}`} />
                {status.syncing ? 'Sincronizando...' : 'Sincronizar Agora'}
              </Button>
              <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
                <Save className="h-4 w-4 mr-2" /> {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Database Status Warning (Web only) */}
      {Capacitor.getPlatform() === 'web' && !dbInitialized && (
        <Card className="p-6 mb-6 max-w-xl mx-auto rounded-xl border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/10 shadow-sm">
          <div className="flex items-start gap-3">
            <Database className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-yellow-900 dark:text-yellow-100 mb-1">
                Banco de Dados Local Não Disponível
              </h3>
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                O SQLite local não está funcionando na versão web. Algumas funcionalidades podem estar limitadas:
              </p>
              <ul className="text-sm text-yellow-800 dark:text-yellow-200 mt-2 ml-4 list-disc space-y-1">
                <li>Não é possível criar novos materiais</li>
                <li>Não é possível fazer compras ou vendas</li>
                <li>Não é possível salvar dados localmente</li>
              </ul>
              <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-2 font-medium">
                💡 Use a versão mobile Android para funcionalidade completa.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Comandas - Prefixo do Código */}
      <Card className="p-6 mb-6 max-w-xl mx-auto rounded-xl border border-border/20 shadow-sm">
        <div className="flex items-center mb-6">
          <Settings className="h-6 w-6 text-primary mr-3" />
          <h2 className="text-lg font-semibold">Comandas</h2>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="comanda-prefix">Prefixo do Código da Comanda</Label>
            <Input
              id="comanda-prefix"
              placeholder="Ex.: TR"
              value={codigoPrefix}
              onChange={(e) => setCodigoPrefix(normalizePrefix(e.target.value))}
              className="mt-1"
            />
            <div className="text-xs text-muted-foreground mt-1">Será usado como prefixo ao gerar o código, por exemplo TR-1</div>
          </div>
          <div className="flex items-center justify-end">
            <Button onClick={handleSavePrefix} disabled={prefixSaving} className="w-full sm:w-auto">
              <Save className="h-4 w-4 mr-2" /> {prefixSaving ? 'Salvando...' : 'Salvar Prefixo'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Bluetooth Printer Modal */}
      <BluetoothPrinterModal
        isOpen={isBluetoothModalOpen}
        onClose={() => setIsBluetoothModalOpen(false)}
      />

    </div>
  );
};

export default Configuracoes;
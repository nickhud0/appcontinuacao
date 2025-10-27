import { X, Bluetooth, Search, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useBluetoothPrinter } from "@/hooks/useBluetoothPrinter";
import { useCordovaReady } from "@/hooks/useCordovaReady";
import { useEffect } from "react";

interface BluetoothPrinterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const BluetoothPrinterModal = ({ isOpen, onClose }: BluetoothPrinterModalProps) => {
  const cordovaReady = useCordovaReady();
  const {
    isScanning,
    isConnecting,
    isConnected,
    devices,
    connectedDevice,
    error,
    scanForDevices,
    connectToDevice,
    disconnect,
    checkSavedPrinter,
    clearError
  } = useBluetoothPrinter();

  // Verificar impressora salva quando o modal abre
  useEffect(() => {
    if (isOpen) {
      checkSavedPrinter();
    }
  }, [isOpen, checkSavedPrinter]);

  // Limpar erro quando modal fecha
  useEffect(() => {
    if (!isOpen) {
      clearError();
    }
  }, [isOpen, clearError]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md mx-auto rounded-xl border border-border/20 shadow-lg">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <Bluetooth className="h-6 w-6 text-primary mr-3" />
              <h2 className="text-lg font-semibold">Impressora Bluetooth</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Conecte-se a uma impressora térmica 58mm via Bluetooth para imprimir comandas.
            </p>

            {/* Loading do Cordova */}
            {cordovaReady.isLoading && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center">
                  <Loader2 className="h-4 w-4 text-blue-600 mr-2 animate-spin" />
                  <p className="text-sm text-blue-800">
                    Carregando sistema Bluetooth...
                  </p>
                </div>
              </div>
            )}

            {/* Erro do Cordova */}
            {cordovaReady.error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-center">
                  <AlertCircle className="h-4 w-4 text-red-600 mr-2" />
                  <p className="text-sm text-red-800">{cordovaReady.error}</p>
                </div>
              </div>
            )}

            {/* Status de Conexão */}
            {isConnected && connectedDevice && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-800">
                      Impressora Conectada
                    </p>
                    <p className="text-xs text-green-600">
                      {connectedDevice.name} ({connectedDevice.address})
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={disconnect}
                    className="text-green-700 border-green-300 hover:bg-green-100"
                  >
                    Desconectar
                  </Button>
                </div>
              </div>
            )}

            {/* Mensagem de Erro */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-center">
                  <AlertCircle className="h-4 w-4 text-red-600 mr-2" />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
            )}

            {/* Device List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Dispositivos Encontrados</h3>
                {devices.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {devices.length} dispositivo{devices.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              
              {devices.length === 0 && !isScanning ? (
                <div className="border border-dashed border-border/30 rounded-lg p-4 text-center">
                  <Bluetooth className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Nenhum dispositivo encontrado
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Clique em "Buscar Impressora" para procurar dispositivos
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {devices.map((device) => (
                    <div
                      key={device.id}
                      className="flex items-center justify-between p-3 border border-border/30 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {device.name || 'Dispositivo Desconhecido'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {device.address}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => connectToDevice(device)}
                        disabled={isConnecting || isConnected}
                        className="ml-2"
                      >
                        {isConnecting ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          'Conectar'
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={scanForDevices}
                disabled={isScanning || isConnecting || !cordovaReady.isReady}
                className="flex-1"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Buscando...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Buscar Impressora
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default BluetoothPrinterModal;


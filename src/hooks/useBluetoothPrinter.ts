import { useState, useCallback } from 'react';
import { Preferences } from '@capacitor/preferences';
import { useToast } from './use-toast';
import { Capacitor } from '@capacitor/core';
import { useBluetoothPermissions } from './useBluetoothPermissions';

export interface BluetoothDevice {
  id: string;
  name: string;
  address: string;
  class?: number;
}

export interface BluetoothPrinterState {
  isScanning: boolean;
  isConnecting: boolean;
  isConnected: boolean;
  devices: BluetoothDevice[];
  connectedDevice: BluetoothDevice | null;
  error: string | null;
}

const STORAGE_KEY = 'bluetooth_printer_mac';

// Obter o plugin Bluetooth Serial diretamente
const getBluetoothSerial = (): any => {
  console.log('[BT] Obtendo plugin Bluetooth Serial...');
  
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Bluetooth disponível apenas em plataforma nativa');
  }

  const w = window as any;
  
  // Tentar acessar o plugin diretamente
  if (w.cordova && w.cordova.plugins && w.cordova.plugins.bluetoothSerial) {
    console.log('[BT] Plugin encontrado via window.cordova.plugins.bluetoothSerial');
    return w.cordova.plugins.bluetoothSerial;
  }

  // Tentar acessar o plugin de outra forma
  if (w.bluetoothSerial) {
    console.log('[BT] Plugin encontrado via window.bluetoothSerial');
    return w.bluetoothSerial;
  }

  console.error('[BT] Plugin Bluetooth Serial não encontrado');
  console.log('[BT] window.cordova:', w.cordova);
  console.log('[BT] window.cordova.plugins:', w.cordova?.plugins);
  console.log('[BT] Plugins disponíveis:', w.cordova?.plugins ? Object.keys(w.cordova.plugins) : 'nenhum');
  
  throw new Error('Plugin Bluetooth Serial não está disponível. Certifique-se de que o app foi gerado corretamente.');
};

export const useBluetoothPrinter = () => {
  const { toast } = useToast();
  const { ensureBluetoothPermissions, openAppSettings, lastStatus } = useBluetoothPermissions();
  
  const [state, setState] = useState<BluetoothPrinterState>({
    isScanning: false,
    isConnecting: false,
    isConnected: false,
    devices: [],
    connectedDevice: null,
    error: null,
  });

  // Buscar dispositivos Bluetooth emparelhados
  const scanForDevices = useCallback(async () => {
    console.log('[BT] Iniciando busca por dispositivos...');
    setState(prev => ({ ...prev, isScanning: true, error: null, devices: [] }));
    
    try {
      // PASSO 1: Verificar e solicitar permissões (Android 12+)
      console.log('[BT] Verificando permissões...');
      const permissionsResult = await ensureBluetoothPermissions();
      
      if (permissionsResult.status === 'blocked') {
        console.log('[BT] Permissões bloqueadas');
        setState(prev => ({ ...prev, isScanning: false, error: 'Permissões bloqueadas' }));
        
        toast({
          title: "Permissões bloqueadas",
          description: "Você bloqueou as permissões de Bluetooth. Clique abaixo para abrir as configurações e habilitar.",
          variant: "destructive",
          action: {
            label: "Abrir Configurações",
            onClick: openAppSettings
          } as any
        });
        return;
      }
      
      if (permissionsResult.status === 'denied') {
        console.log('[BT] Permissões negadas');
        setState(prev => ({ ...prev, isScanning: false, error: 'Permissões negadas' }));
        return; // O hook já mostrou o toast
      }
      
      console.log('[BT] Permissões concedidas, continuando...');
      
      // PASSO 2: Obter plugin Bluetooth
      const bluetoothSerial = getBluetoothSerial();
      
      console.log('[BT] Plugin obtido, verificando se Bluetooth está habilitado...');

      // Verificar se o Bluetooth está habilitado
      bluetoothSerial.isEnabled(
        () => {
          console.log('[BT] Bluetooth está habilitado, listando dispositivos...');
          
          // Listar dispositivos emparelhados
          bluetoothSerial.list(
            (devices: any[]) => {
              console.log('[BT] Dispositivos encontrados:', devices);
              
              // Mapear os dispositivos para o formato esperado
              const mappedDevices: BluetoothDevice[] = (devices || []).map((device: any, index: number) => ({
                id: device.id || device.address || `device-${index}`,
                name: device.name || 'Dispositivo Desconhecido',
                address: device.address || device.id || '',
                class: device.class || 0
              }));

              console.log('[BT] Dispositivos mapeados:', mappedDevices);

              setState(prev => ({ 
                ...prev, 
                devices: mappedDevices, 
                isScanning: false,
                error: null
              }));
              
              if (mappedDevices.length === 0) {
                toast({
                  title: "Nenhum dispositivo encontrado",
                  description: "Nenhum dispositivo Bluetooth emparelhado foi encontrado. Emparelhe um dispositivo primeiro nas configurações do Android.",
                  variant: "destructive"
                });
              } else {
                toast({
                  title: "Dispositivos encontrados",
                  description: `${mappedDevices.length} dispositivo(s) Bluetooth encontrado(s).`,
                });
              }
            },
            (error: any) => {
              console.error('[BT] Erro ao listar dispositivos:', error);
              const errorMessage = typeof error === 'string' ? error : (error?.message || 'Erro ao listar dispositivos');
              
              setState(prev => ({ 
                ...prev, 
                error: errorMessage, 
                isScanning: false 
              }));
              
              toast({
                title: "Erro ao buscar dispositivos",
                description: errorMessage,
                variant: "destructive"
              });
            }
          );
        },
        () => {
          console.error('[BT] Bluetooth não está habilitado');
          const errorMessage = 'Bluetooth não está habilitado. Habilite o Bluetooth nas configurações do dispositivo.';
          
          setState(prev => ({ 
            ...prev, 
            error: errorMessage, 
            isScanning: false 
          }));
          
          toast({
            title: "Bluetooth desabilitado",
            description: errorMessage,
            variant: "destructive"
          });
        }
      );

    } catch (error) {
      console.error('[BT] Erro ao buscar dispositivos Bluetooth:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao buscar dispositivos';
      
      setState(prev => ({ 
        ...prev, 
        error: errorMessage, 
        isScanning: false 
      }));
      
      toast({
        title: "Erro ao buscar dispositivos",
        description: errorMessage,
        variant: "destructive"
      });
    }
  }, [toast, ensureBluetoothPermissions, openAppSettings]);

  // Conectar a um dispositivo específico
  const connectToDevice = useCallback(async (device: BluetoothDevice) => {
    console.log('[BT] Tentando conectar ao dispositivo:', device);
    setState(prev => ({ ...prev, isConnecting: true, error: null }));
    
    try {
      const bluetoothSerial = getBluetoothSerial();
      
      bluetoothSerial.connect(
        device.address,
        async () => {
          console.log('[BT] Conectado com sucesso ao dispositivo:', device.name);
          
          // Salvar MAC address no storage
          await Preferences.set({
            key: STORAGE_KEY,
            value: device.address
          });
          
          setState(prev => ({ 
            ...prev, 
            isConnecting: false,
            isConnected: true,
            connectedDevice: device,
            error: null
          }));
          
          toast({
            title: "Impressora conectada!",
            description: `Conectado com sucesso à ${device.name}`,
          });
        },
        (error: any) => {
          console.error('[BT] Erro ao conectar ao dispositivo:', error);
          const errorMessage = typeof error === 'string' ? error : (error?.message || 'Erro ao conectar');
          
          setState(prev => ({ 
            ...prev, 
            error: errorMessage, 
            isConnecting: false 
          }));
          
          toast({
            title: "Erro ao conectar",
            description: `Falha ao conectar com ${device.name}: ${errorMessage}`,
            variant: "destructive"
          });
        }
      );
      
    } catch (error) {
      console.error('[BT] Erro ao conectar ao dispositivo:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao conectar';
      
      setState(prev => ({ 
        ...prev, 
        error: errorMessage, 
        isConnecting: false 
      }));
      
      toast({
        title: "Erro ao conectar",
        description: `Falha ao conectar com ${device.name}: ${errorMessage}`,
        variant: "destructive"
      });
    }
  }, [toast]);

  // Desconectar do dispositivo atual
  const disconnect = useCallback(async () => {
    console.log('[BT] Desconectando do dispositivo...');
    
    try {
      if (state.isConnected) {
        const bluetoothSerial = getBluetoothSerial();
        
        bluetoothSerial.disconnect(
          async () => {
            console.log('[BT] Desconectado com sucesso');
            
            // Remover MAC salvo
            await Preferences.remove({ key: STORAGE_KEY });
            
            setState(prev => ({ 
              ...prev, 
              isConnected: false,
              connectedDevice: null,
              error: null
            }));
            
            toast({
              title: "Impressora desconectada",
              description: "Conexão Bluetooth encerrada",
            });
          },
          (error: any) => {
            console.error('[BT] Erro ao desconectar:', error);
            const errorMessage = typeof error === 'string' ? error : (error?.message || 'Erro ao desconectar');
            
            setState(prev => ({ ...prev, error: errorMessage }));
            
            toast({
              title: "Erro ao desconectar",
              description: errorMessage,
              variant: "destructive"
            });
          }
        );
      }
    } catch (error) {
      console.error('[BT] Erro ao desconectar:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao desconectar';
      
      setState(prev => ({ ...prev, error: errorMessage }));
      
      toast({
        title: "Erro ao desconectar",
        description: errorMessage,
        variant: "destructive"
      });
    }
  }, [state.isConnected, toast]);

  // Verificar se há impressora salva
  const checkSavedPrinter = useCallback(async () => {
    console.log('[BT] Verificando impressora salva...');
    
    try {
      const { value } = await Preferences.get({ key: STORAGE_KEY });
      if (value) {
        console.log('[BT] Impressora salva encontrada:', value);
        setState(prev => ({ 
          ...prev, 
          isConnected: true,
          connectedDevice: { id: value, name: 'Impressora Salva', address: value, class: 0 }
        }));
      } else {
        console.log('[BT] Nenhuma impressora salva');
      }
    } catch (error) {
      console.warn('[BT] Erro ao verificar impressora salva:', error);
    }
  }, []);

  // Limpar erro
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    scanForDevices,
    connectToDevice,
    disconnect,
    checkSavedPrinter,
    clearError,
  };
};

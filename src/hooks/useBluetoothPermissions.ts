import { useState, useCallback } from 'react';
import { Device } from '@capacitor/device';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useToast } from './use-toast';

type BluetoothPermissionStatus = 'unknown' | 'granted' | 'denied' | 'blocked';

interface EnsurePermissionsResult {
  status: BluetoothPermissionStatus;
  details: {
    sdkInt: number;
    granted: string[];
    denied: string[];
    blocked: string[];
  };
}

// Flag para habilitar/desabilitar logs (produção: false)
const DEBUG_PERMISSIONS = true;

const log = (...args: any[]) => {
  if (DEBUG_PERMISSIONS) {
    console.log('[BT-PERM]', ...args);
  }
};

const logError = (...args: any[]) => {
  if (DEBUG_PERMISSIONS) {
    console.error('[BT-PERM]', ...args);
  }
};

// Obter o plugin de permissões via Cordova
const getPermissionsPlugin = (): any => {
  const w = window as any;
  
  if (w.cordova && w.cordova.plugins && w.cordova.plugins.permissions) {
    return w.cordova.plugins.permissions;
  }
  
  log('Plugin de permissões não encontrado, usando fallback');
  return null;
};

export const useBluetoothPermissions = () => {
  const { toast } = useToast();
  const [lastStatus, setLastStatus] = useState<BluetoothPermissionStatus>('unknown');

  // Detectar versão do Android
  const getAndroidSdk = useCallback(async (): Promise<number> => {
    try {
      const info = await Device.getInfo();
      const sdkInt = parseInt(info.androidSDKVersion || '0', 10);
      log('Android SDK detectado:', sdkInt);
      return sdkInt;
    } catch (error) {
      logError('Erro ao detectar SDK:', error);
      return 31; // Assumir Android 12+ para garantir
    }
  }, []);

  // Verificar se uma permissão está concedida
  const checkPermission = useCallback((permissions: any, permission: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!permissions) {
        resolve(false);
        return;
      }

      permissions.checkPermission(
        permission,
        (status: any) => {
          const hasPermission = status?.hasPermission || false;
          log(`Permissão ${permission}: ${hasPermission ? 'granted' : 'denied'}`);
          resolve(hasPermission);
        },
        () => {
          log(`Erro ao verificar ${permission}`);
          resolve(false);
        }
      );
    });
  }, []);

  // Solicitar uma permissão
  const requestPermission = useCallback((permissions: any, permission: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!permissions) {
        resolve(false);
        return;
      }

      permissions.requestPermission(
        permission,
        (status: any) => {
          const hasPermission = status?.hasPermission || false;
          log(`Solicitação de ${permission}: ${hasPermission ? 'granted' : 'denied'}`);
          resolve(hasPermission);
        },
        () => {
          logError(`Erro ao solicitar ${permission}`);
          resolve(false);
        }
      );
    });
  }, []);

  // Função principal: garantir permissões de Bluetooth
  const ensureBluetoothPermissions = useCallback(async (): Promise<EnsurePermissionsResult> => {
    log('Iniciando verificação de permissões Bluetooth...');
    
    // Verificar se estamos em plataforma nativa
    if (!Capacitor.isNativePlatform()) {
      log('Não está em plataforma nativa');
      const result: EnsurePermissionsResult = {
        status: 'granted',
        details: { sdkInt: 0, granted: [], denied: [], blocked: [] }
      };
      setLastStatus('granted');
      return result;
    }

    try {
      const sdkInt = await getAndroidSdk();
      const permissions = getPermissionsPlugin();
      
      const result: EnsurePermissionsResult = {
        status: 'unknown',
        details: { sdkInt, granted: [], denied: [], blocked: [] }
      };

      // Se não temos o plugin de permissões, tentar sem ele
      if (!permissions) {
        log('Plugin de permissões não disponível, tentando sem ele...');
        result.status = 'granted';
        setLastStatus('granted');
        return result;
      }

      // Determinar permissões necessárias
      let neededPermissions: string[] = [];
      
      if (sdkInt >= 31) {
        // Android 12+
        neededPermissions = [
          'android.permission.BLUETOOTH_CONNECT',
          'android.permission.BLUETOOTH_SCAN'
        ];
        log('Android 12+: Permissões necessárias:', neededPermissions);
      } else if (sdkInt >= 23) {
        // Android 6-11
        neededPermissions = [
          'android.permission.ACCESS_FINE_LOCATION'
        ];
        log('Android 6-11: Permissão necessária:', neededPermissions);
      } else {
        // Android < 6
        log('Android < 6: Permissões concedidas na instalação');
        result.status = 'granted';
        setLastStatus('granted');
        return result;
      }

      // Verificar permissões atuais
      const checkResults = await Promise.all(
        neededPermissions.map(async (perm) => ({
          permission: perm,
          hasPermission: await checkPermission(permissions, perm)
        }))
      );

      log('Resultado da verificação:', checkResults);

      const alreadyGranted = checkResults.filter(r => r.hasPermission).map(r => r.permission);
      const needToRequest = checkResults.filter(r => !r.hasPermission).map(r => r.permission);

      result.details.granted = alreadyGranted;

      // Se todas já estão concedidas
      if (needToRequest.length === 0) {
        log('Todas as permissões já concedidas');
        result.status = 'granted';
        setLastStatus('granted');
        return result;
      }

      log('Solicitando permissões:', needToRequest);

      // Solicitar permissões em sequência
      for (const perm of needToRequest) {
        const granted = await requestPermission(permissions, perm);
        if (granted) {
          result.details.granted.push(perm);
        } else {
          result.details.denied.push(perm);
        }
      }

      // Determinar status final
      if (result.details.denied.length > 0) {
        result.status = 'denied';
        setLastStatus('denied');
        
        toast({
          title: "Permissões necessárias",
          description: "É necessário conceder permissões de Bluetooth para buscar impressoras. Tente novamente.",
          variant: "destructive"
        });
      } else {
        result.status = 'granted';
        setLastStatus('granted');
        log('Todas as permissões concedidas!');
      }

      log('Status final:', result.status);
      return result;

    } catch (error) {
      logError('Erro ao verificar permissões:', error);
      
      // Em caso de erro, assumir concedido para não bloquear
      const result: EnsurePermissionsResult = {
        status: 'granted',
        details: { sdkInt: 0, granted: [], denied: [], blocked: [] }
      };
      setLastStatus('granted');
      return result;
    }
  }, [getAndroidSdk, checkPermission, requestPermission, toast]);

  // Abrir configurações do app
  const openAppSettings = useCallback(async (): Promise<void> => {
    try {
      log('Abrindo configurações do app...');
      await App.openSettings();
    } catch (error) {
      logError('Erro ao abrir configurações:', error);
      
      toast({
        title: "Erro",
        description: "Não foi possível abrir as configurações. Abra manualmente em Configurações > Apps > Reciclagem Pereque > Permissões",
        variant: "destructive"
      });
    }
  }, [toast]);

  return {
    ensureBluetoothPermissions,
    openAppSettings,
    lastStatus
  };
};

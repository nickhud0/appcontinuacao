import { Capacitor } from '@capacitor/core';

export interface PluginCheckResult {
  isAvailable: boolean;
  error?: string;
  details: {
    isNativePlatform: boolean;
    windowAvailable: boolean;
    cordovaAvailable: boolean;
    pluginsAvailable: boolean;
    bluetoothSerialAvailable: boolean;
    pluginMethods: string[];
  };
}

export const checkBluetoothPlugin = (): PluginCheckResult => {
  const details = {
    isNativePlatform: false,
    windowAvailable: false,
    cordovaAvailable: false,
    pluginsAvailable: false,
    bluetoothSerialAvailable: false,
    pluginMethods: [] as string[],
  };

  try {
    // Verificar plataforma nativa
    details.isNativePlatform = Capacitor.isNativePlatform();
    if (!details.isNativePlatform) {
      return {
        isAvailable: false,
        error: 'Não está em plataforma nativa',
        details
      };
    }

    // Verificar window
    details.windowAvailable = typeof window !== 'undefined';
    if (!details.windowAvailable) {
      return {
        isAvailable: false,
        error: 'Window não está disponível',
        details
      };
    }

    const w = window as any;

    // Verificar Cordova
    details.cordovaAvailable = !!(w.cordova);
    if (!details.cordovaAvailable) {
      return {
        isAvailable: false,
        error: 'Cordova não está disponível',
        details
      };
    }

    // Verificar plugins
    details.pluginsAvailable = !!(w.cordova.plugins);
    if (!details.pluginsAvailable) {
      return {
        isAvailable: false,
        error: 'Plugins Cordova não estão disponíveis',
        details
      };
    }

    // Verificar Bluetooth Serial
    details.bluetoothSerialAvailable = !!(w.cordova.plugins.bluetoothSerial);
    if (!details.bluetoothSerialAvailable) {
      return {
        isAvailable: false,
        error: 'Plugin Bluetooth Serial não está disponível',
        details
      };
    }

    // Listar métodos disponíveis
    const bluetoothSerial = w.cordova.plugins.bluetoothSerial;
    details.pluginMethods = Object.keys(bluetoothSerial).filter(key => 
      typeof bluetoothSerial[key] === 'function'
    );

    return {
      isAvailable: true,
      details
    };

  } catch (error) {
    return {
      isAvailable: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      details
    };
  }
};

export const waitForBluetoothPlugin = (timeoutMs: number = 15000): Promise<PluginCheckResult> => {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const checkInterval = 100; // Verificar a cada 100ms

    const check = () => {
      const result = checkBluetoothPlugin();
      
      if (result.isAvailable) {
        resolve(result);
        return;
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= timeoutMs) {
        resolve({
          ...result,
          error: `Timeout: Plugin não carregou em ${timeoutMs}ms`
        });
        return;
      }

      // Continuar verificando
      setTimeout(check, checkInterval);
    };

    // Iniciar verificação
    check();
  });
};

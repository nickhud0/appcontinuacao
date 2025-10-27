import { Capacitor } from '@capacitor/core';

export interface BluetoothDebugInfo {
  isNativePlatform: boolean;
  cordovaAvailable: boolean;
  bluetoothPluginAvailable: boolean;
  pluginMethods: string[];
  error?: string;
}

export const debugBluetoothPlugin = (): BluetoothDebugInfo => {
  console.log('[BT-DEBUG] Iniciando diagnóstico do plugin Bluetooth...');
  
  const info: BluetoothDebugInfo = {
    isNativePlatform: false,
    cordovaAvailable: false,
    bluetoothPluginAvailable: false,
    pluginMethods: [],
  };

  try {
    // Verificar se estamos em plataforma nativa
    info.isNativePlatform = Capacitor.isNativePlatform();
    console.log('[BT-DEBUG] Plataforma nativa:', info.isNativePlatform);

    if (!info.isNativePlatform) {
      info.error = 'Não está em plataforma nativa';
      return info;
    }

    // Verificar se window está disponível
    if (typeof window === 'undefined') {
      info.error = 'Window não está disponível';
      return info;
    }

    const w = window as any;

    // Verificar se Cordova está disponível
    info.cordovaAvailable = !!(w.cordova);
    console.log('[BT-DEBUG] Cordova disponível:', info.cordovaAvailable);

    if (!info.cordovaAvailable) {
      info.error = 'Cordova não está disponível - aguarde o carregamento';
      return info;
    }

    // Verificar se plugins estão disponíveis
    const pluginsAvailable = !!(w.cordova.plugins);
    console.log('[BT-DEBUG] Plugins disponíveis:', pluginsAvailable);

    if (!pluginsAvailable) {
      info.error = 'Plugins Cordova não estão disponíveis - aguarde o carregamento';
      return info;
    }

    // Verificar se Bluetooth Serial está disponível
    info.bluetoothPluginAvailable = !!(w.cordova.plugins.bluetoothSerial);
    console.log('[BT-DEBUG] Plugin Bluetooth Serial disponível:', info.bluetoothPluginAvailable);

    if (!info.bluetoothPluginAvailable) {
      info.error = 'Plugin Bluetooth Serial não está disponível - aguarde o carregamento';
      return info;
    }

    // Listar métodos disponíveis
    const bluetoothSerial = w.cordova.plugins.bluetoothSerial;
    info.pluginMethods = Object.keys(bluetoothSerial).filter(key => 
      typeof bluetoothSerial[key] === 'function'
    );
    console.log('[BT-DEBUG] Métodos disponíveis:', info.pluginMethods);

    // Verificar métodos essenciais
    const essentialMethods = ['isEnabled', 'list', 'connect', 'disconnect', 'write'];
    const missingMethods = essentialMethods.filter(method => 
      !info.pluginMethods.includes(method)
    );

    if (missingMethods.length > 0) {
      info.error = `Métodos essenciais ausentes: ${missingMethods.join(', ')}`;
      return info;
    }

    console.log('[BT-DEBUG] Plugin Bluetooth Serial está funcionando corretamente!');
    return info;

  } catch (error) {
    console.error('[BT-DEBUG] Erro durante diagnóstico:', error);
    info.error = error instanceof Error ? error.message : 'Erro desconhecido';
    return info;
  }
};

export const testBluetoothConnection = async (): Promise<{ success: boolean; error?: string }> => {
  console.log('[BT-DEBUG] Testando conexão Bluetooth...');
  
  try {
    const info = debugBluetoothPlugin();
    
    if (info.error) {
      return { success: false, error: info.error };
    }

    if (!info.bluetoothPluginAvailable) {
      return { success: false, error: 'Plugin Bluetooth Serial não está disponível' };
    }

    const w = window as any;
    const bluetoothSerial = w.cordova.plugins.bluetoothSerial;

    // Testar isEnabled
    return new Promise((resolve) => {
      bluetoothSerial.isEnabled(
        () => {
          console.log('[BT-DEBUG] Bluetooth está habilitado');
          resolve({ success: true });
        },
        () => {
          console.log('[BT-DEBUG] Bluetooth não está habilitado');
          resolve({ success: false, error: 'Bluetooth não está habilitado' });
        }
      );
    });

  } catch (error) {
    console.error('[BT-DEBUG] Erro no teste de conexão:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erro desconhecido' 
    };
  }
};

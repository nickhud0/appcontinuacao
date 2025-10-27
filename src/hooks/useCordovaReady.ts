import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

export interface CordovaReadyState {
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
}

export const useCordovaReady = (): CordovaReadyState => {
  const [state, setState] = useState<CordovaReadyState>({
    isReady: false,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    console.log('[CORDOVA] Verificando disponibilidade do plugin...');
    
    // Verificar se está em plataforma nativa
    if (!Capacitor.isNativePlatform()) {
      setState({
        isReady: false,
        isLoading: false,
        error: 'Não está em plataforma nativa'
      });
      return;
    }

    const w = window as any;

    // Verificar se o plugin está disponível
    if (w.cordova && w.cordova.plugins && w.cordova.plugins.bluetoothSerial) {
      console.log('[CORDOVA] Plugin Bluetooth Serial disponível');
      setState({
        isReady: true,
        isLoading: false,
        error: null
      });
    } else if (w.bluetoothSerial) {
      console.log('[CORDOVA] Plugin Bluetooth Serial disponível (via window.bluetoothSerial)');
      setState({
        isReady: true,
        isLoading: false,
        error: null
      });
    } else {
      console.error('[CORDOVA] Plugin Bluetooth Serial não disponível');
      setState({
        isReady: false,
        isLoading: false,
        error: 'Plugin Bluetooth Serial não disponível. O app precisa ser gerado novamente.'
      });
    }
  }, []);

  return state;
};

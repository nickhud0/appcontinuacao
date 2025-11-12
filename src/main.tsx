import React from 'react'
import { logger } from '@/utils/logger';
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { initializeDatabase } from './database/initDatabase';
import { initializeSyncEngine, startSyncLoop } from '@/services/syncEngine';

// Suprimir erros conhecidos do jeep-sqlite WASM na web
// Esses erros são esperados e não impedem o funcionamento do app
if (typeof window !== 'undefined') {
  const shouldSuppressError = (message: string): boolean => {
    return (
      message.includes('LinkError: WebAssembly.instantiate()') ||
      message.includes('function import requires a callable') ||
      message.includes('wasm streaming compile failed') ||
      message.includes('RuntimeError: Aborted') ||
      message.includes('falling back to ArrayBuffer instantiation') ||
      message.includes('jeep-sqlite.entry')
    );
  };

  // Suprimir console.error
  const originalError = console.error;
  console.error = (...args: any[]) => {
    const errorMessage = args.map(arg => 
      typeof arg === 'string' ? arg : 
      arg?.toString?.() || 
      JSON.stringify(arg)
    ).join(' ');
    
    if (shouldSuppressError(errorMessage)) {
      return; // Não logar esses erros específicos do jeep-sqlite
    }
    originalError.apply(console, args);
  };

  // Capturar erros não tratados de promises
  window.addEventListener('unhandledrejection', (event) => {
    const errorMessage = event.reason?.toString() || 
                         event.reason?.message || 
                         JSON.stringify(event.reason);
    
    if (shouldSuppressError(errorMessage)) {
      event.preventDefault(); // Prevenir que apareça no console
      return;
    }
  });

  // Capturar erros gerais não tratados
  window.addEventListener('error', (event) => {
    const errorMessage = event.message || 
                         event.error?.toString() || 
                         event.error?.message || '';
    
    if (shouldSuppressError(errorMessage)) {
      event.preventDefault(); // Prevenir que apareça no console
      return;
    }
  });
}

// Registrar service worker para PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        logger.info('SW registered: ', registration);
      })
      .catch((registrationError) => {
        logger.error('SW registration failed: ', registrationError);
      });
  });
}

// Configuração inicial para mobile e database
const initializeMobileFeatures = async () => {
  try {
    // Inicializar banco de dados SQLite
    logger.info('🗄️ Initializing SQLite database...');
    await initializeDatabase();
    logger.info('✅ Database ready for use');
  } catch (error) {
    logger.error('❌ Database initialization failed:', error);
    // Continue app initialization even if database fails
    // The app can still function in a degraded mode
    // Na web, isso é especialmente importante se o jeep-sqlite falhar
    if (Capacitor.getPlatform() === 'web') {
      logger.warn('⚠️ Running in degraded mode on web platform (no local SQLite). Some features may not work.');
    }
  }

  // Inicializar sync engine (fica inativo sem credenciais)
  try {
    initializeSyncEngine({ intervalMs: 30000 });
    startSyncLoop();
  } catch (error) {
    logger.warn('Sync engine init failed (will remain idle):', error);
  }

  if (Capacitor.isNativePlatform()) {
    try {
      // Configurar status bar
      await StatusBar.setStyle({ style: Style.Default });
      await StatusBar.setBackgroundColor({ color: '#3b82f6' });
      
      // Ocultar splash screen após carregamento
      await SplashScreen.hide();
    } catch (error) {
      console.warn('Mobile features initialization failed:', error);
    }
  }
};

// Inicializar app
const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error('Root element not found');
}

const root = createRoot(rootElement);

// Render with proper React structure
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Inicializar recursos mobile em background
initializeMobileFeatures();

import { useState, useCallback } from 'react';
import { Preferences } from '@capacitor/preferences';
import { useToast } from './use-toast';
import EscPosEncoder from 'esc-pos-encoder';
import { Capacitor } from '@capacitor/core';

export interface ComandaData {
  header: {
    codigo: string | null;
    comanda_data: string | null;
    comanda_tipo: string | null;
    observacoes: string | null;
  };
  groupedItens: Array<{
    nome: string;
    kg: number;
    total: number;
    precoMedio: number;
  }>;
  total: number;
}

const STORAGE_KEY = 'bluetooth_printer_mac';
const STORAGE_KEY_USB_PORT = 'usb_printer_port_info'; // Para salvar info da porta USB na web

// ============================================================
// WEB SERIAL API (Para PWA - USB)
// ============================================================

// Tipos para Web Serial API
interface SerialPortInfo {
  portId: string; // Identificador único da porta
  vendorId?: number;
  productId?: number;
}

interface SerialOptions {
  baudRate: number;
  dataBits?: 7 | 8;
  parity?: 'none' | 'even' | 'odd';
  stopBits?: 1 | 2;
  flowControl?: 'none' | 'hardware';
}

interface SerialPort {
  getInfo(): { usbVendorId?: number; usbProductId?: number };
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
}

interface Serial extends EventTarget {
  requestPort(): Promise<SerialPort>;
  getPorts(): Promise<SerialPort[]>;
}

declare global {
  interface Navigator {
    serial?: Serial;
  }
}

// Verificar se Web Serial API está disponível
const isWebSerialAvailable = (): boolean => {
  return 'serial' in navigator && typeof navigator.serial !== 'undefined';
};

// Salvar porta USB escolhida
const saveUsbPort = async (port: SerialPort): Promise<void> => {
  try {
    const info: SerialPortInfo = {
      portId: port.getInfo().usbVendorId && port.getInfo().usbProductId
        ? `usb-${port.getInfo().usbVendorId}-${port.getInfo().usbProductId}`
        : `serial-${Date.now()}`,
      vendorId: port.getInfo().usbVendorId,
      productId: port.getInfo().usbProductId,
    };
    localStorage.setItem(STORAGE_KEY_USB_PORT, JSON.stringify(info));
    console.log('[PRINT-USB] Porta USB salva:', info);
  } catch (error) {
    console.warn('[PRINT-USB] Erro ao salvar porta USB:', error);
  }
};

// Obter porta USB salva (apenas info, não reconecta automaticamente)
const getSavedUsbPortInfo = (): SerialPortInfo | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_USB_PORT);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};

// Solicitar porta USB do usuário
const requestUsbPort = async (): Promise<SerialPort> => {
  if (!isWebSerialAvailable() || !navigator.serial) {
    throw new Error('Web Serial API não está disponível. Use Chrome ou Edge.');
  }

  try {
    const port = await navigator.serial.requestPort();
    await saveUsbPort(port);
    return port;
  } catch (error: any) {
    if (error.name === 'NotFoundError') {
      throw new Error('Nenhuma porta USB selecionada.');
    }
    throw new Error(`Erro ao selecionar porta USB: ${error.message}`);
  }
};

// Enviar dados via USB Serial
const sendViaUsbSerial = async (commands: Uint8Array, port?: SerialPort): Promise<void> => {
  let portToUse = port;
  let shouldClosePort = false;

  try {
    // Se não foi passada porta, solicitar ao usuário
    if (!portToUse) {
      portToUse = await requestUsbPort();
      shouldClosePort = true;
    }

    console.log('[PRINT-USB] Abrindo conexão serial...');
    
    // Configurações comuns para impressoras térmicas
    await portToUse.open({ 
      baudRate: 9600, // Padrão para impressoras térmicas (pode ser 115200 em algumas)
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
      flowControl: 'none'
    });

    console.log('[PRINT-USB] Enviando dados...');
    
    const writer = portToUse.writable.getWriter();
    try {
      await writer.write(commands);
      console.log('[PRINT-USB] Dados enviados com sucesso');
    } finally {
      writer.releaseLock();
    }

    // Aguardar um pouco para garantir que todos os dados foram enviados
    await new Promise(resolve => setTimeout(resolve, 500));

  } catch (error: any) {
    console.error('[PRINT-USB] Erro ao enviar via USB:', error);
    throw new Error(`Erro na impressão USB: ${error.message || 'Erro desconhecido'}`);
  } finally {
    // Fechar porta apenas se foi aberta nesta função
    if (shouldClosePort && portToUse) {
      try {
        await portToUse.close();
        console.log('[PRINT-USB] Porta fechada');
      } catch (closeError) {
        console.warn('[PRINT-USB] Erro ao fechar porta:', closeError);
      }
    }
  }
};

// ============================================================
// BLUETOOTH (Para Mobile Android - CÓDIGO ORIGINAL INTACTO)
// ============================================================

// Obter o plugin Bluetooth Serial diretamente
const getBluetoothSerial = (): any => {
  console.log('[PRINT] Obtendo plugin Bluetooth Serial...');
  
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Bluetooth disponível apenas em plataforma nativa');
  }

  const w = window as any;
  
  // Tentar acessar o plugin diretamente
  if (w.cordova && w.cordova.plugins && w.cordova.plugins.bluetoothSerial) {
    console.log('[PRINT] Plugin encontrado via window.cordova.plugins.bluetoothSerial');
    return w.cordova.plugins.bluetoothSerial;
  }

  // Tentar acessar o plugin de outra forma
  if (w.bluetoothSerial) {
    console.log('[PRINT] Plugin encontrado via window.bluetoothSerial');
    return w.bluetoothSerial;
  }

  console.error('[PRINT] Plugin Bluetooth Serial não encontrado');
  throw new Error('Plugin Bluetooth Serial não está disponível');
};

export const usePrintComanda = () => {
  const { toast } = useToast();
  const [isPrinting, setIsPrinting] = useState(false);

  // Verificar se há impressora conectada
  const checkPrinterConnection = useCallback(async (): Promise<boolean> => {
    try {
      const { value } = await Preferences.get({ key: STORAGE_KEY });
      return !!value;
    } catch {
      return false;
    }
  }, []);

  // Verificar se já está conectado
  const isConnected = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        const bluetoothSerial = getBluetoothSerial();
        
        bluetoothSerial.isConnected(
          () => {
            console.log('[PRINT] Já está conectado');
            resolve(true);
          },
          () => {
            console.log('[PRINT] Não está conectado');
            resolve(false);
          }
        );
      } catch (error) {
        console.error('[PRINT] Erro ao verificar conexão:', error);
        resolve(false);
      }
    });
  }, []);

  // Conectar à impressora salva
  const connectToSavedPrinter = useCallback((): Promise<boolean> => {
    return new Promise(async (resolve, reject) => {
      try {
        const bluetoothSerial = getBluetoothSerial();
        
        // Verificar se já está conectado
        const connected = await isConnected();
        if (connected) {
          console.log('[PRINT] Já conectado, não é necessário reconectar');
          resolve(true);
          return;
        }

        const { value } = await Preferences.get({ key: STORAGE_KEY });
        if (!value) {
          reject(new Error('Nenhuma impressora salva'));
          return;
        }

        console.log('[PRINT] Conectando à impressora salva:', value);
        
        bluetoothSerial.connect(
          value,
          () => {
            console.log('[PRINT] Conectado com sucesso');
            resolve(true);
          },
          (error: any) => {
            console.error('[PRINT] Erro ao conectar:', error);
            reject(new Error(`Erro ao conectar: ${typeof error === 'string' ? error : error?.message || 'Erro desconhecido'}`));
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }, [isConnected]);

  // Gerar comandos ESC/POS da comanda
  const generateEscPosCommands = useCallback((data: ComandaData): Uint8Array => {
    console.log('[PRINT] Gerando comandos ESC/POS...');
    const encoder = new EscPosEncoder();
    
    // Capturar data e hora atual
    const now = new Date();
    const dataAtual = now.toLocaleDateString('pt-BR');
    const horaAtual = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    // Truncar texto se necessário
    const truncate = (text: string, maxLength: number): string => {
      return text.length > maxLength ? text.substring(0, maxLength) : text;
    };

    // Separador de 32 caracteres
    const separator = '--------------------------------';

    // Configurações iniciais e cabeçalho
    encoder
      .initialize()
      .align('left')
      .size(1, 1) // Fonte pequena para melhor encaixe
      .text('Reciclagem Perequê')
      .newline()
      .text('Ubatuba - SP')
      .newline()
      .text('Tel: 12 99162-0321')
      .newline()
      .text('CNPJ/PIX 45.492.161/0001-88')
      .newline()
      .text(`Data: ${dataAtual}  Hora: ${horaAtual}`)
      .newline()
      .text(separator)
      .newline();

    // Número da comanda
    encoder
      .text(`COMANDA Nº ${data.header.codigo || '---'}`)
      .newline()
      .text(separator)
      .newline();

    // Cabeçalho da tabela com 4 colunas alinhadas (fonte reduzida)
    // Fonte pequena já aplicada (.size(1, 1)) no início, mantida para toda impressão
    const headerLine =
      "Item".padEnd(6) +
      "KG".padStart(6) +
      "Preço".padStart(8) +
      "Total".padStart(10);
    
    encoder
      .text(headerLine)
      .newline()
      .text(separator)
      .newline();

    // Itens
    if (data.groupedItens.length === 0) {
      encoder.text('Nenhum item').newline();
    } else {
      data.groupedItens.forEach((item) => {
        const nomeItem = truncate(item.nome, 6); // Truncar nome para 6 caracteres
        const kg = parseFloat(item.kg.toString()).toFixed(1); // 1 casa decimal
        const preco = parseFloat(item.precoMedio.toString()).toFixed(1); // 1 casa decimal
        const total = parseFloat(item.total.toString()).toFixed(2); // 2 casas decimais
        
        const line =
          nomeItem.padEnd(6) +
          kg.toString().padStart(6) +
          preco.toString().padStart(8) +
          total.toString().padStart(10);
        
        encoder.text(line).newline();
      });
    }

    // Separador antes do total
    encoder
      .text(separator)
      .newline();

    // Total (com bold e espaço após R$)
    encoder
      .bold(true)
      .text(`TOTAL: R$ ${data.total.toFixed(2)}`)
      .bold(false)
      .newline()
      .text(separator)
      .newline();

    // Rodapé
    encoder
      .text('Obrigado pela preferência!')
      .newline()
      .text('Deus seja louvado!!!!')
      .newline()
      .newline()
      .newline()
      .cut(); // Cortar papel

    const result = encoder.encode();
    console.log('[PRINT] Comandos ESC/POS gerados, tamanho:', result.length, 'bytes');
    return result;
  }, []);

  // Função principal de impressão
  const printComanda = useCallback(async (data: ComandaData): Promise<void> => {
    console.log('[PRINT] Iniciando impressão...');
    setIsPrinting(true);
    
    try {
      // Gerar comandos ESC/POS (mesmo para ambas plataformas)
      const commands = generateEscPosCommands(data);

      // ============================================================
      // MOBILE ANDROID: Usa Bluetooth (CÓDIGO ORIGINAL INTACTO)
      // ============================================================
      if (Capacitor.isNativePlatform()) {
        console.log('[PRINT] Modo: Mobile Android (Bluetooth)');

        // Verificar se há impressora conectada
        const hasPrinter = await checkPrinterConnection();
        if (!hasPrinter) {
          throw new Error('Nenhuma impressora conectada. Vá em Configurações e conecte uma impressora.');
        }

        // Verificar se já está conectado, se não, conectar
        const bluetoothSerial = getBluetoothSerial();
        const alreadyConnected = await isConnected();
        
        if (!alreadyConnected) {
          console.log('[PRINT] Não conectado, conectando agora...');
          await connectToSavedPrinter();
          
          // Aguardar 500ms para a impressora estar pronta após conexão
          console.log('[PRINT] Aguardando impressora ficar pronta...');
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          console.log('[PRINT] Já conectado, continuando...');
        }

        // Enviar via Bluetooth
        await new Promise<void>((resolve, reject) => {
          console.log('[PRINT] Enviando dados para impressora Bluetooth...');
          bluetoothSerial.write(
            commands,
            () => {
              console.log('[PRINT] Dados enviados com sucesso');
              resolve();
            },
            (error: any) => {
              console.error('[PRINT] Erro ao enviar dados:', error);
              reject(new Error(typeof error === 'string' ? error : error?.message || 'Erro ao enviar dados'));
            }
          );
        });

        toast({
          title: "Impressão realizada!",
          description: "Comanda enviada para a impressora Bluetooth com sucesso.",
        });

      } 
      // ============================================================
      // WEB PWA: Usa USB Serial (NOVO CÓDIGO)
      // ============================================================
      else {
        console.log('[PRINT] Modo: Web PWA (USB Serial)');

        // Verificar se Web Serial API está disponível
        if (!isWebSerialAvailable()) {
          throw new Error('Impressão USB não está disponível. Use Chrome ou Edge para impressão USB.');
        }

        // Enviar via USB Serial (solicita porta se necessário)
        await sendViaUsbSerial(commands);

        toast({
          title: "Impressão realizada!",
          description: "Comanda enviada para a impressora USB com sucesso.",
        });
      }

    } catch (error) {
      console.error('[PRINT] Erro na impressão:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      
      toast({
        title: "Erro na impressão",
        description: errorMessage,
        variant: "destructive"
      });
      
      throw error;
    } finally {
      setIsPrinting(false);
    }
  }, [checkPrinterConnection, connectToSavedPrinter, generateEscPosCommands, isConnected, toast]);

  // Verificar se impressão USB está disponível (apenas web)
  const isUsbPrintAvailable = useCallback((): boolean => {
    return !Capacitor.isNativePlatform() && isWebSerialAvailable();
  }, []);

  return {
    isPrinting,
    printComanda,
    checkPrinterConnection,
    isUsbPrintAvailable,
  };
};

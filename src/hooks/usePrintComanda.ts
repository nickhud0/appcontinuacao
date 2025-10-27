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

// Obter o plugin Bluetooth Serial diretamente
const getBluetoothSerial = (): any => {
  console.log('[PRINT] Obtendo plugin Bluetooth Serial...');
  
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Impressão disponível apenas em plataforma nativa');
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
    
    // Configurações iniciais
    encoder
      .initialize()
      .align('center')
      .size(2, 2)
      .text('Reciclagem Pereque')
      .newline()
      .size(1, 1)
      .text('Ubatuba, Pereque Mirim, Av Marginal, 2504')
      .newline()
      .text('12 99162-0321')
      .newline()
      .text('CNPJ/PIX - 45.492.161/0001-88')
      .newline()
      .newline()
      .align('left')
      .text('--------------------------------')
      .newline()
      .newline();

    // Dados da comanda
    encoder
      .text(`Comanda: ${data.header.codigo || '—'}`)
      .newline()
      .text(`Data: ${data.header.comanda_data ? new Date(data.header.comanda_data).toLocaleDateString('pt-BR') : '—'}`)
      .newline()
      .text(`Horário: ${data.header.comanda_data ? new Date(data.header.comanda_data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}`)
      .newline()
      .text(`Tipo: ${(data.header.comanda_tipo || '—').toUpperCase()}`)
      .newline()
      .newline()
      .text('--------------------------------')
      .newline()
      .newline();

    // Itens
    if (data.groupedItens.length === 0) {
      encoder.text('Nenhum item').newline();
    } else {
      data.groupedItens.forEach((item) => {
        encoder
          .text(item.nome)
          .newline()
          .text(`  ${item.kg.toFixed(2)}x R$ ${item.precoMedio.toFixed(2)}`)
          .align('right')
          .text(`R$ ${item.total.toFixed(2)}`)
          .align('left')
          .newline();
      });
    }

    encoder
      .newline()
      .text('--------------------------------')
      .newline()
      .newline()
      .align('center')
      .size(2, 2)
      .text('TOTAL:')
      .newline()
      .text(`R$ ${data.total.toFixed(2)}`)
      .newline()
      .newline()
      .size(1, 1)
      .text('--------------------------------')
      .newline()
      .newline()
      .align('center')
      .text('Obrigado')
      .newline()
      .size(2, 2)
      .text('DEUS SEJA LOUVADO!!!')
      .newline()
      .newline()
      .size(1, 1)
      .text('Versao 1.0')
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
      // Verificar se estamos em plataforma nativa
      if (!Capacitor.isNativePlatform()) {
        throw new Error('Impressão disponível apenas em dispositivos móveis');
      }

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

      // Gerar comandos ESC/POS
      const commands = generateEscPosCommands(data);
      
      await new Promise<void>((resolve, reject) => {
        console.log('[PRINT] Enviando dados para impressora...');
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
        description: "Comanda enviada para a impressora com sucesso.",
      });

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

  return {
    isPrinting,
    printComanda,
    checkPrinterConnection,
  };
};

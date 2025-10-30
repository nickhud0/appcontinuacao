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

    // Cabeçalho da tabela com 4 colunas alinhadas
    const headerLine = 
      "Item".padEnd(14) +
      "KG".padStart(5) +
      "Preço".padStart(7) +
      "Total".padStart(8);
    
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
        const nomeItem = truncate(item.nome, 14); // Truncar nome para 14 caracteres
        const kg = parseFloat(item.kg.toString()).toFixed(1); // 1 casa decimal
        const preco = parseFloat(item.precoMedio.toString()).toFixed(1); // 1 casa decimal
        const total = parseFloat(item.total.toString()).toFixed(2); // 2 casas decimais
        
        const colItem = nomeItem.padEnd(14);
        const colKg = kg.toString().padStart(5);
        const colPreco = preco.toString().padStart(7);
        const colTotal = total.toString().padStart(8);
        
        const linha = `${colItem}${colKg}${colPreco}${colTotal}`;
        encoder.text(linha).newline();
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

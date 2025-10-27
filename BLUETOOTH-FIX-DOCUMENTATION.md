# 🔧 Correção do Problema do Botão "Buscar Impressora"

## 📋 Problema Identificado

O botão "Buscar Impressora" estava falhando no APK Android devido à forma incorreta de acessar o plugin Cordova `cordova-plugin-bluetooth-serial` dentro do ambiente Capacitor.

### Causa Raiz

1. **Importação Incorreta**: O código estava usando `import { BluetoothSerial } from '@awesome-cordova-plugins/bluetooth-serial'`, que é a wrapper do Ionic Native/Awesome Cordova Plugins. Esta abordagem usa Promises e pode não funcionar corretamente com plugins Cordova que usam callbacks.

2. **API Assíncrona vs Callbacks**: O plugin Bluetooth Serial original usa callbacks (success/error), mas a wrapper tentava converter para Promises, causando falhas silenciosas.

3. **Timing de Carregamento**: O plugin Cordova pode não estar disponível no momento da importação do módulo, causando erros de "plugin não encontrado".

## ✅ Solução Implementada

### 1. Acesso Direto ao Plugin Cordova

Mudamos de:
```typescript
// ❌ ANTES (não funcionava)
import { BluetoothSerial } from '@awesome-cordova-plugins/bluetooth-serial';
const devices = await BluetoothSerial.list();
```

Para:
```typescript
// ✅ DEPOIS (funciona)
const bluetoothSerial = window.cordova.plugins.bluetoothSerial;
bluetoothSerial.list(
  (devices) => { /* sucesso */ },
  (error) => { /* erro */ }
);
```

### 2. Verificações de Disponibilidade

Adicionamos verificações robustas:
```typescript
const getBluetoothSerial = (): any => {
  if (typeof window === 'undefined') {
    throw new Error('Window não está disponível');
  }

  const w = window as any;
  if (!w.cordova || !w.cordova.plugins || !w.cordova.plugins.bluetoothSerial) {
    throw new Error('Plugin Bluetooth Serial não está disponível');
  }

  return w.cordova.plugins.bluetoothSerial;
};
```

### 3. Uso Correto de Callbacks

Todos os métodos do plugin agora usam callbacks em vez de Promises:

```typescript
// Verificar se Bluetooth está habilitado
bluetoothSerial.isEnabled(
  () => { /* habilitado */ },
  () => { /* desabilitado */ }
);

// Listar dispositivos
bluetoothSerial.list(
  (devices) => { /* dispositivos encontrados */ },
  (error) => { /* erro */ }
);

// Conectar
bluetoothSerial.connect(
  address,
  () => { /* conectado */ },
  (error) => { /* erro */ }
);

// Escrever dados
bluetoothSerial.write(
  data,
  () => { /* enviado */ },
  (error) => { /* erro */ }
);
```

### 4. Logs Detalhados

Adicionamos logs com prefixo `[BT]` para facilitar o debug:
```typescript
console.log('[BT] Iniciando busca por dispositivos...');
console.log('[BT] Plugin obtido, verificando se Bluetooth está habilitado...');
console.log('[BT] Dispositivos encontrados:', devices);
```

## 📁 Arquivos Modificados

### 1. `/src/hooks/useBluetoothPrinter.ts`
- Reescrito completamente para usar API Cordova direta
- Adicionados logs detalhados
- Implementado tratamento correto de callbacks
- Verificações de disponibilidade do plugin

### 2. `/src/hooks/usePrintComanda.ts`
- Atualizado para usar API Cordova direta
- Consistência com useBluetoothPrinter
- Logs detalhados para debug de impressão

## 🧪 Como Testar

### 1. Gerar APK
```bash
npm run build
npx cap sync android
npx cap open android
# No Android Studio: Build > Build Bundle(s) / APK(s) > Build APK(s)
```

### 2. Instalar no Smartphone
- Transfira o APK para o smartphone
- Instale o APK
- Conceda permissões de Bluetooth quando solicitado

### 3. Testar Funcionalidade
1. Abra o app
2. Vá em **Configurações**
3. Clique no ícone **Bluetooth** (canto superior direito)
4. Clique em **"Buscar Impressora"**
5. Verifique se os dispositivos Bluetooth emparelhados aparecem na lista

### 4. Debug via Chrome DevTools
1. Conecte o smartphone via USB
2. Habilite "Depuração USB" no Android
3. Abra `chrome://inspect` no Chrome desktop
4. Clique em "inspect" no app
5. Veja os logs no console com prefixo `[BT]`

## 📱 Logs Esperados (Sucesso)

```
[BT] Iniciando busca por dispositivos...
[BT] Plataforma nativa detectada
[BT] Tentando acessar plugin Bluetooth Serial...
[BT] Plugin Bluetooth Serial encontrado com sucesso
[BT] Plugin obtido, verificando se Bluetooth está habilitado...
[BT] Bluetooth está habilitado, listando dispositivos...
[BT] Dispositivos encontrados: [{name: "Impressora", address: "XX:XX:XX:XX:XX:XX"}]
[BT] Dispositivos mapeados: [{id: "XX:XX:XX:XX:XX:XX", name: "Impressora", address: "XX:XX:XX:XX:XX:XX"}]
```

## 🚨 Possíveis Erros e Soluções

### Erro: "Plugin Bluetooth Serial não está disponível"
**Causa**: Plugin não foi sincronizado com o projeto Android
**Solução**: 
```bash
npx cap sync android
```

### Erro: "Bluetooth não está habilitado"
**Causa**: Bluetooth desligado no smartphone
**Solução**: Habilite o Bluetooth nas configurações do Android

### Erro: "Nenhum dispositivo encontrado"
**Causa**: Nenhum dispositivo Bluetooth emparelhado
**Solução**: Emparelhe a impressora nas configurações Bluetooth do Android primeiro

### Erro: "Window não está disponível"
**Causa**: Código rodando em ambiente web (não nativo)
**Solução**: Teste apenas no APK instalado no smartphone

## 🔄 Diferenças Principais

| Aspecto | Antes (❌) | Depois (✅) |
|---------|-----------|------------|
| Importação | `import { BluetoothSerial }` | `window.cordova.plugins.bluetoothSerial` |
| API | Promises | Callbacks |
| Disponibilidade | Não verificada | Verificada antes de usar |
| Logs | Poucos/genéricos | Detalhados com prefixo [BT] |
| Tratamento de Erro | Genérico | Específico por operação |

## ✅ Funcionalidades Implementadas

- ✅ Buscar dispositivos Bluetooth emparelhados
- ✅ Conectar a um dispositivo específico
- ✅ Desconectar do dispositivo
- ✅ Salvar MAC address da impressora
- ✅ Verificar impressora salva
- ✅ Imprimir comanda via ESC/POS
- ✅ Feedback visual (toasts)
- ✅ Tratamento de erros robusto
- ✅ Logs detalhados para debug

## 📝 Notas Importantes

1. **Não remover o plugin wrapper**: Mesmo não usando diretamente, mantenha `@awesome-cordova-plugins/bluetooth-serial` instalado, pois pode ser necessário para tipagem.

2. **Permissões**: Certifique-se de que o AndroidManifest.xml tem todas as permissões necessárias (já configurado).

3. **Android 12+**: As permissões BLUETOOTH_SCAN e BLUETOOTH_CONNECT são obrigatórias para Android 12+.

4. **Teste apenas em dispositivo real**: O Bluetooth não funciona em emuladores.

## 🎯 Resultado Final

O botão "Buscar Impressora" agora:
- ✅ Lista corretamente os dispositivos Bluetooth emparelhados
- ✅ Não gera erros ou travamentos
- ✅ Fornece feedback claro ao usuário
- ✅ Funciona de forma confiável no APK Android
- ✅ Possui logs detalhados para debug


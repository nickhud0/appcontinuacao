# Guia de Build Android - Reciclagem Pereque

Este documento fornece instruções completas para gerar o APK do aplicativo e testar as funcionalidades nativas.

## Pré-requisitos

### 1. Ambiente de Desenvolvimento
- Node.js 16+ instalado
- Android Studio instalado
- JDK 17+ configurado
- Git instalado

### 2. Configuração do Projeto
```bash
# Clone o repositório
git clone [URL_DO_REPOSITORIO]
cd reciclagem-pereque

# Instale as dependências
npm install

# Build do projeto web
npm run build
```

## Build do APK

### 1. Adicionar Platform Android
```bash
# Adicionar plataforma Android (primeira vez)
npx cap add android

# Ou sincronizar se já existir
npx cap sync android
```

### 2. Abrir no Android Studio
```bash
# Abrir projeto no Android Studio
npx cap open android
```

### 3. Configurar no Android Studio

#### Permissões
O arquivo `android/app/src/main/AndroidManifest.xml` deve conter:
```xml
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
```

#### Build do APK
1. No Android Studio, vá em `Build > Build Bundle(s) / APK(s) > Build APK(s)`
2. Aguarde o processo de build
3. O APK será gerado em `android/app/build/outputs/apk/debug/app-debug.apk`

## Teste das Funcionalidades

### 1. Impressão Bluetooth

#### Preparação da Impressora
1. Ligue a impressora térmica
2. Ative o modo de pareamento (geralmente segure o botão até piscar)
3. No Android, vá em Configurações > Bluetooth e pareie manualmente

#### Teste no App
1. Abra o app e vá para "Imprimir Comanda"
2. Toque no ícone de configurações (⚙️)
3. Toque em "Buscar Impressoras"
4. Selecione sua impressora da lista
5. Teste a conexão com "Teste de Impressão"
6. Imprima uma comanda real

### 2. Geração e Download de PDF

#### Teste
1. Vá para "Histórico de Comandas"
2. Selecione uma comanda e toque "Imprimir"
3. Na tela de impressão, toque "Baixar PDF"
4. Verifique se o PDF foi salvo na pasta Documentos
5. Abra o gerenciador de arquivos e localize o PDF

### 3. Compartilhamento WhatsApp

#### Teste
1. Na tela de "Imprimir Comanda"
2. Toque em "Compartilhar WhatsApp"
3. Aguarde o PDF ser gerado
4. Selecione WhatsApp na tela de compartilhamento
5. Escolha um contato e envie

## Funcionalidades Offline

### Teste de Funcionalidade Offline
1. Desative Wi-Fi e dados móveis
2. Abra o app (deve funcionar normalmente)
3. Crie uma nova comanda
4. Gere PDF da comanda (deve funcionar)
5. Tente imprimir (funciona se impressora já pareada)
6. Reative a conexão para sincronizar dados

## Solução de Problemas

### Bluetooth não Funciona
- **Causa**: Permissões negadas
- **Solução**: Vá em Configurações > Aplicativos > Reciclagem Pereque > Permissões e ative todas as permissões

### PDF não é Gerado
- **Causa**: Permissão de armazenamento negada
- **Solução**: Ative permissões de armazenamento nas configurações do app

### Impressora não Conecta
- **Causa**: Impressora não pareada ou fora de alcance
- **Solução**: 
  1. Pareie manualmente via Bluetooth do Android
  2. Mantenha impressora próxima (máx 10m)
  3. Verifique se está em modo de pareamento

### App Crash ao Abrir
- **Causa**: Banco de dados corrompido ou plugin mal instalado
- **Solução**:
  1. Desinstale completamente o app
  2. Reinstale o APK
  3. Verifique se todas as dependências foram instaladas

## Logs de Debug

Para debugar problemas:
```bash
# Visualizar logs do dispositivo
npx cap run android --livereload

# Ou usar adb diretamente
adb logcat | grep -i "reciclagem"
```

## Distribuição

### Para Produção
1. Configure assinatura no Android Studio
2. Gere APK assinado via `Build > Generate Signed Bundle / APK`
3. Use o APK assinado para distribuição

### Para Teste
- O APK debug pode ser instalado diretamente
- Compartilhe o arquivo `app-debug.apk` via WhatsApp, email ou drive

## Checklist Final

Antes de distribuir, teste:
- [ ] App abre sem crash
- [ ] Criação de comandas funciona
- [ ] Histórico carrega corretamente
- [ ] Impressão Bluetooth conecta e imprime
- [ ] PDF é gerado e salvo
- [ ] Compartilhamento WhatsApp funciona
- [ ] App funciona offline
- [ ] Sincronização funciona quando volta online
- [ ] Todas as permissões são solicitadas corretamente

## Suporte

Para problemas técnicos:
1. Verifique os logs usando `adb logcat`
2. Teste em diferentes dispositivos Android
3. Verifique se todas as dependências estão atualizadas
4. Consulte a documentação do Capacitor: https://capacitorjs.com/
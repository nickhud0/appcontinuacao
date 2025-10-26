# Reciclagem Pereque - Sistema de Gestão

Sistema offline-first para gestão de reciclagem com sincronização Supabase.

## 🚀 Tecnologias

- **Frontend**: React 18 + TypeScript + Vite
- **UI**: Tailwind CSS + shadcn/ui
- **Mobile**: Capacitor (iOS/Android)
- **Database**: SQLite (offline) + Supabase (sync)
- **State**: React Hooks + React Query

## 📱 Instalação e Desenvolvimento

### Pré-requisitos
- Node.js 18+ e npm
- Git

### Configuração Local

```bash
# 1. Clone o repositório
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# 2. Instalar dependências
npm install

# 3. Executar em desenvolvimento
npm run dev

# 4. Build para produção
npm run build

# 5. Preview do build
npm run preview
```

### Scripts Disponíveis

```bash
# Desenvolvimento
npm run dev              # Servidor de desenvolvimento
npm run build            # Build para produção
npm run preview          # Preview do build

# Qualidade de código
npm run lint             # Executar ESLint
npm run lint:fix         # Corrigir problemas do ESLint
npm run format           # Formatar código com Prettier
npm run type-check       # Verificar tipos TypeScript
npm run test             # Executar testes

# Mobile (após configuração)
npm run build:mobile     # Build para mobile
npx cap sync             # Sincronizar com Capacitor
npx cap run android      # Executar no Android
npx cap run ios          # Executar no iOS
```

## 📱 Build Mobile

### Android
```bash
# 1. Build do projeto
npm run build

# 2. Adicionar plataforma Android (primeira vez)
npx cap add android

# 3. Sincronizar arquivos
npx cap sync android

# 4. Abrir no Android Studio
npx cap open android
```

### iOS
```bash
# 1. Build do projeto
npm run build

# 2. Adicionar plataforma iOS (primeira vez)
npx cap add ios

# 3. Sincronizar arquivos
npx cap sync ios

# 4. Abrir no Xcode
npx cap open ios
```

## 🗃️ Estrutura do Projeto

```
src/
├── components/          # Componentes reutilizáveis
│   └── ui/             # Componentes base (shadcn/ui)
├── hooks/              # Hooks customizados
├── pages/              # Páginas da aplicação
├── services/           # Serviços (database, supabase, network)
├── utils/              # Utilitários e helpers
└── lib/                # Configurações de bibliotecas
```

## 🔄 Funcionalidades

### Offline-First
- Cache local com SQLite
- Funcionamento completo offline
- Sincronização automática quando online
- Fila de sincronização para operações pendentes

### Gestão de Comandas
- Criação e finalização de comandas
- Histórico e busca de comandas
- Controle de estoque integrado
- Relatórios e fechamentos

### Mobile
- APK nativo Android/iOS
- Interface otimizada para mobile
- Funcionalidades nativas (camera, etc.)

## 🔧 Configuração Supabase

1. Acesse o projeto no Lovable
2. Clique no botão verde "Supabase" no canto superior direito
3. Configure suas credenciais do Supabase
4. As tabelas serão criadas automaticamente na primeira sincronização

## 📝 Contribuição

1. Faça fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.
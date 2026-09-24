# ZReader

<p align="center">
  <img src="src/assets/icon.png" alt="ZReader Logo" width="128" height="128" />
</p>

<h3 align="center">Leitor de Mangás Desktop & Mobile Moderno, Local-First e Seguro</h3>

<p align="center">
  Um leitor de mangás de alta performance, 100% gratuito e de código aberto, projetado com arquitetura <strong>local-first</strong>, integração oficial com a API da <strong>MangaDex</strong>, proteção de dados de ponta a ponta e uma experiência visual moderna, minimalista e editorial.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-35.0-47848F?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-6.2-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/TailwindCSS-3.4-38B2AC?logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Capacitor-8.5-119EFF?logo=capacitor&logoColor=white" alt="Capacitor" />
  <img src="https://img.shields.io/badge/SQLite-node:sqlite-003B57?logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/MangaDex_API-v5-FF6740" alt="MangaDex API" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License" />
</p>

---

## 📑 Sumário

- [Visão Geral](#-visão-geral)
- [Tecnologias Utilizadas](#-tecnologias-utilizadas)
- [Integração com a API do MangaDex](#-integração-com-a-api-do-mangadex)
  - [Autenticação e Personal Client](#1-autenticação-segura-personal-client)
  - [Gerenciamento e Renovação de Tokens](#2-gerenciamento-e-renovação-de-tokens-em-memória)
  - [Rede Distribuída MangaDex@Home](#3-rede-distribuída-mangadexhome)
  - [Rate Limiting e Respeito aos Limites da API](#4-rate-limiting-inteligente-e-fair-use)
  - [Sincronização de Biblioteca e Leitura](#5-sincronização-bidirecional-de-biblioteca)
- [Arquitetura de Segurança e Privacidade](#-arquitetura-de-segurança-e-privacidade)
  - [Zero Credenciais Públicas](#1-zero-credenciais-ou-dados-sensíveis-expostos)
  - [Criptografia Nativa com SafeStorage / DPAPI](#2-criptografia-nativa-com-safestorage--dpapi)
  - [Isolamento de Processos (IPC & CSP)](#3-isolamento-de-processos-e-context-isolation)
- [Motor de Armazenamento Local-First](#-motor-de-armazenamento-local-first)
- [Principais Funcionalidades](#-principais-funcionalidades)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Como Executar o Projeto](#-como-executar-o-projeto)
  - [Pré-requisitos](#pré-requisitos)
  - [Ambiente de Desenvolvimento](#1-desenvolvimento-desktop)
  - [Geração de Builds e Instaladores](#2-build-de-produção-desktop)
  - [Build Mobile (Android)](#3-build-mobile-android)
- [Licença e Isenção de Responsabilidade](#-licença-e-isenção-de-responsabilidade)

---

## 🎯 Visão Geral

O **ZReader** nasceu para resolver as dores mais comuns em aplicativos de mangá: interfaces poluídas por anúncios, dependência constante de conexão de rede, lentidão ao carregar páginas e falta de privacidade.

Construído com base na filosofia **Local-First**, todas as preferências, metadados de mangás, histórico de capítulos lidos e downloads são armazenados primariamente no dispositivo do usuário. A sincronização com a MangaDex ocorre sob demanda ou de forma transparente em segundo plano, respeitando fielmente as diretrizes da comunidade.

---

## 🛠 Tecnologias Utilizadas

### Frontend & Interface
- **React 19** (`react`, `react-dom`): Interface declarativa, reativa e ultra-otimizada.
- **TypeScript 5.8**: Tipagem estática rigorosa para payloads da API MangaDex, IPCs e schemas de banco.
- **Vite 6**: Ambiente de build e empacotamento com Hot Module Replacement (HMR) instantâneo.
- **Tailwind CSS 3**: Sistema de design utilitário com paleta escura editorial personalizada (`#0d0d0f`, `#16161a`, `#ff6740`).
- **Phosphor Icons & Lucide React**: Iconografia moderna, consistente e vetorial.
- **Tailwind Merge & clsx**: Interpolação inteligente e semântica de classes CSS condicionais.
- **Lenis**: Motor de rolagem suave física para modos Webtoon e navegação longa.

### Desktop & Backend (Electron)
- **Electron 35**: Framework multiplataforma para runtime desktop nativo moderno (Chromium + Node.js 22).
- **Node.js 22 `node:sqlite`**: Banco de dados relacional SQLite embutido no Node, com modo WAL (*Write-Ahead Logging*), dispensando dependências C++ nativas problemáticas (como `better-sqlite3`).
- **esbuild**: Compilador ultrarrápido utilizado para empacotar o processo principal (`main.ts`) e o preload script (`preload.ts`) em milissegundos.
- **Electron SafeStorage API & Node.js Crypto**: Integração com a DPAPI do Windows (e Keychain no macOS) para criptografia simétrica de segredos, combinada com scrypt para derivação de senhas mestras locais.
- **Electron Builder**: Pipeline automatizada para geração de instaladores Windows (NSIS com suporte a atualização preservando dados), executáveis portáteis (`.exe`) e arquivos `.zip`.

### Mobile & Cross-Platform (Capacitor)
- **Capacitor 8** (`@capacitor/core`, `@capacitor/android`, `@capacitor/cli`): Ponte híbrida nativa para execução em dispositivos Android.
- **Capacitor Plugins**:
  - `@capacitor/filesystem`: Gerenciamento do armazenamento local de páginas e capítulos baixados.
  - `@capacitor/preferences`: Armazenamento de chaves rápidas e flags de configuração.
  - `@capacitor/screen-orientation`: Bloqueio e rotação de tela inteligente durante a leitura.
  - `@capacitor/status-bar`: Estilização e ocultação imersiva da barra de status no leitor.
- **IndexedDB**: Banco de dados local de alta capacidade no ambiente móvel, emulando o mesmo comportamento do SQLite do desktop via padrão adapter.

---

## 📡 Integração com a API do MangaDex

O ZReader consome a API oficial v5 do **MangaDex** (`https://api.mangadex.org`), seguindo estritamente as boas práticas e políticas da comunidade.

### 1. Autenticação Segura (Personal Client)
Para sincronizar a biblioteca do usuário e marcar leituras, o ZReader utiliza a autenticação oficial via OpenID Connect (OIDC) com o fluxo **Resource Owner Password Credentials / Personal Client**:
- **Endpoint**: `https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token`
- O usuário fornece seu **Client ID**, **Client Secret**, **Username** e **Password** criados nas configurações de desenvolvedor de sua própria conta no MangaDex.
- Não existem chaves de API ou segredos compartilhados embutidos no código-fonte. O controle pertence inteiramente ao usuário.

### 2. Gerenciamento e Renovação de Tokens em Memória
- **Zero Gravação de Tokens em Texto**: O `access_token` JWT obtido após o login é mantido **estritamente em memória volátil** e nunca é gravado no disco rígido.
- **Renovação Proativa e Silenciosa**: O `AppVault` monitora o tempo de vida (`expires_in`) do token de acesso e agenda automaticamente a renovação (`refresh_token`) **3 minutos antes** da expiração real, impedindo que requisições em andamento falhem por token expirado.
- Os dados do `refresh_token` e `client_secret` necessários para a renovação são armazenados no disco somente sob **criptografia nativa do sistema operacional**.

### 3. Rede Distribuída MangaDex@Home
Para a exibição das páginas dos capítulos, o ZReader integra o sistema distribuído **MangaDex@Home**:
- Consulta a rota `/at-home/server/{chapterId}` para obter o nó de distribuição ideal e os nomes de arquivos da imagem.
- Suporte a fallback dinâmico: se um nó de CDN apresentar lentidão ou erro, a requisição pode alternar para servidores alternativos.
- Suporte a modo econômico de dados (*Data Saver*), requisitando versões compactadas quando habilitado pelo usuário nas configurações.
- Headers HTTP devidamente higienizados: remoção automática de cabeçalhos `Referer` conflitantes via listeners do Electron Session, garantindo conformidade com a entrega de mídia da MangaDex.

### 4. Rate Limiting Inteligente e Fair Use
A MangaDex estabelece limites rigorosos de requisições por segundo para evitar sobrecarga em seus servidores. O ZReader implementa uma fila de requisições (`RateLimiter`) com algoritmo de *Token Bucket*:
- **Limite Controlado**: Taxa nominal regulada para ~4 requisições por segundo.
- **Tratamento de HTTP 429**: Em caso de resposta `429 Too Many Requests`, o motor respeita automaticamente o cabeçalho `Retry-After` ou aplica *exponential backoff* com jitter antes de reprocessar a chamada.
- **Requisições em Lote**: Consultas a múltiplos mangás utilizam o parâmetro `ids[]` para reduzir drasticamente a quantidade de requisições individuais.

### 5. Sincronização Bidirecional de Biblioteca
- Leitura de mangás seguidos (`GET /user/follows/manga`).
- Leitura de status de acompanhamento (`GET /user/reading-statuses`): *Reading, Plan to Read, Completed, Dropped, On Hold, Re-reading*.
- Envio de progresso de leitura (`POST /manga/{id}/read`): sincronização dos marcadores de capítulos concluídos quando o usuário estiver online.

---

## 🔒 Arquitetura de Segurança e Privacidade

A segurança e a soberania dos dados do usuário foram pilares fundamentais no desenvolvimento do ZReader.

### 1. Zero Credenciais ou Dados Sensíveis Expostos
- **Nenhum Segredo no Repositório**: O código-fonte não contém senhas, chaves de API privadas, tokens de acesso, caminhos locais de diretório de máquina de desenvolvimento ou arquivos de ambiente (`.env`).
- **Estrutura de `.gitignore` Rigorosa**: Todos os diretórios de cache (`secure/`, `userData/`, `downloads/`), saídas de compilação (`dist/`, `dist-electron/`, `release/`, `build/`), configurações locais (`local.properties`) e chaves criptográficas são estritamente excluídos do controle de versão.
- **Sem Rastreamento ou Telemetria**: O aplicativo não envia métricas de uso, telemetria analítica, relatórios de crash ou informações de perfil para servidores terceiros.

### 2. Criptografia Nativa com SafeStorage / DPAPI
- No Windows, o ZReader delega a criptografia dos segredos da MangaDex ao módulo nativo **`safeStorage`** do Electron, que utiliza a **DPAPI (Data Protection API)** do Windows. Isso garante que os dados só possam ser descriptografados pelo mesmo usuário autenticado na mesma máquina.
- Caso a API nativa não esteja disponível no ambiente, um cofre criptográfico baseado em **AES-256-GCM** com chave de máquina aleatória persistente de 256 bits (`crypto.randomBytes`) é empregado.
- **Senha Mestra Local**: O usuário pode proteger o acesso ao aplicativo definindo uma Senha Mestra. A chave de verificação é gerada utilizando **scrypt** com alto fator de custo de memória e salt criptográfico individual por perfil.

### 3. Isolamento de Processos e Content-Security-Policy (CSP)
- **Context Isolation Ativo**: `contextIsolation: true` e `nodeIntegration: false` no processo de renderização. O frontend não possui acesso direto aos módulos nativos do Node.js.
- **IPC Higienizado**: Comunicação unidirecional e bidirecional através de métodos tipados expostos explicitamente no `preload.ts`.
- **Content-Security-Policy (CSP) Restritiva**: Conexões de rede e imagens são estritamente limitadas aos domínios oficiais da MangaDex (`api.mangadex.org`, `auth.mangadex.org`, `*.mangadex.network`, `uploads.mangadex.org`) e fontes do Google.
- Bloqueio automático de abertura de janelas e popups arbitrários dentro da interface do app.

---

## 💾 Motor de Armazenamento Local-First

O ZReader opera de forma totalmente independente de conectividade constante à internet:

| Componente | Desktop (Electron) | Mobile (Android / Capacitor) |
| :--- | :--- | :--- |
| **Banco de Dados** | SQLite (`node:sqlite` nativo Node 22 com WAL) | IndexedDB estruturado com índices por mangá/capítulo |
| **Cache de Metadados** | Detalhes de títulos, capas e lista de capítulos | Armazenamento reativo no IndexedDB |
| **Histórico e Progresso** | Tabela `reading_progress` com offset de página | Store `reading_progress` com sincronização atrasada |
| **Capítulos Offline** | Diretório local do usuário (`userData/downloads`) | Sistema de arquivos interno via `@capacitor/filesystem` |
| **Fila de Downloads** | Concorrência controlada e retentativas automáticas | Processamento sequencial em background |

---

## ✨ Principais Funcionalidades

- 📖 **Múltiplos Modos de Leitura**:
  - **Página Única**: Leitura tradicional focada.
  - **Página Dupla (Spread)**: Diagramação típica de mangás físicos com detecção de páginas duplas.
  - **Rolagem Vertical Contínua (Webtoon)**: Experiência contínua com rolagem física suave via Lenis.
- 🔄 **Direção de Leitura Configurável**: Da direita para a esquerda (RTL - padrão japonês) ou da esquerda para a direita (LTR).
- 🌙 **Tema Dark Editorial**: Interface escura ergonômica para redução do cansaço visual, com controles de brilho noturno integrados.
- 🔍 **Busca & Filtros Abrangentes**:
  - Busca por título, autor e sinopse.
  - Filtros por conteúdo etário (*Safe, Suggestive, Erotica*).
  - Seleção por múltiplos gêneros e tags (Ação, Romance, Isekai, Shounen, Seinen, etc.).
  - Ordenação por relevância, últimos capítulos lançados, mais lidos ou data de criação.
- 🇧🇷 **Prioridade para Português (PT-BR)**: Seleção automática de capítulos traduzidos para Português Brasileiro, com suporte a outros idiomas configuráveis.
- 📥 **Gerenciador de Downloads Offline**:
  - Baixe capítulos inteiros com um clique para ler em viagens ou sem sinal de internet.
  - Indicadores de progresso página a página e validação de integridade de imagens.

---

## 📂 Estrutura do Projeto

```text
├── android/                    # Projeto nativo Android gerado pelo Capacitor
├── electron/                   # Código do processo principal (Node.js/Electron)
│   ├── ipc/                    # Handlers IPC registrados para o renderer
│   ├── services/               # Serviços do backend
│   │   ├── download-manager.ts # Gerenciador de downloads concorrentes
│   │   ├── mangadex-api.ts     # Cliente completo da API MangaDex v5
│   │   ├── mangadex-home.ts    # Resolvedor de servidores de imagem MangaDex@Home
│   │   └── rate-limiter.ts     # Fila com controle de requisições por segundo
│   ├── storage/                # Persistência de dados
│   │   ├── database.ts         # Schema e operações do SQLite (node:sqlite)
│   │   └── vault.ts            # Cofre seguro de senhas e tokens criptografados
│   ├── main.ts                 # Ponto de entrada do Electron (ciclo de vida e janelas)
│   ├── preload.ts              # Script de ponte IPC isolada (contextBridge)
│   └── security.ts             # Políticas de CSP, sessões e bloqueio de popups
├── scripts/                    # Scripts auxiliares de build, versão e testes
├── src/                        # Código do Renderer (Frontend React + Vite)
│   ├── assets/                 # Fontes e recursos visuais estáticos
│   ├── components/             # Componentes reutilizáveis (Titlebar, Sidebar, Cards)
│   ├── features/               # Módulos funcionais da aplicação
│   │   ├── auth/               # Modais de Onboarding, Perfil e Senha Mestra
│   │   ├── browse/             # Catálogo, pesquisa, filtros e recomendações
│   │   ├── library/            # Biblioteca pessoal sincronizada
│   │   ├── manga/              # Visualização de detalhes do título e capítulos
│   │   ├── reader/             # Leitor com modos Página Única, Dupla e Webtoon
│   │   └── settings/           # Configurações de tema, idioma, cache e credenciais
│   ├── services/mobile/        # Implementação do bridge nativo para Capacitor/IndexedDB
│   ├── types/                  # Definições TypeScript (MangaDex, IPC, Banco)
│   ├── App.tsx                 # Roteamento e gerenciamento de estado global
│   ├── index.css               # Folha de estilo global com Tailwind CSS
│   └── main.tsx                # Ponto de entrada do React
├── capacitor.config.ts         # Configurações do runtime Capacitor
├── electron-builder.json5      # Configuração de empacotamento NSIS e Portable
├── package.json                # Manifesto de dependências e scripts do projeto
├── tailwind.config.js          # Configuração do Tailwind CSS
└── vite.config.ts              # Configuração do Vite
```

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
- **Node.js**: Versão 22 ou superior recomendada.
- **npm** (ou gerenciador de pacotes equivalente).
- *(Opcional para Android)*: Android Studio com SDK e Gradle configurados.

### 1. Desenvolvimento Desktop
Para rodar a aplicação em modo de desenvolvimento com recarregamento em tempo real:

```bash
# Instalar todas as dependências
npm install

# Iniciar o Vite e o Electron concorrentemente
npm run dev
```

### 2. Build de Produção Desktop
Para compilar o código TypeScript e gerar os executáveis para Windows:

```bash
# Compilar renderer e processo principal
npm run build

# Gerar instalador e pacote portátil na pasta release/
npm run dist
```

Os arquivos gerados serão salvos no diretório `release/`:
- `release/ZReader Setup 2.0.10.exe`: Instalador completo via NSIS.
- `release/ZReader 2.0.10.exe`: Executável portátil independente.
- `release/ZReader-2.0.10-win.zip`: Pacote compactado limpo.

### 3. Build Mobile (Android)
Para sincronizar a aplicação web com o projeto nativo do Android:

```bash
# Compilar o frontend e sincronizar com o projeto Android
npm run build:mobile

# Abrir o projeto no Android Studio para gerar o APK
npm run cap:open
```

---

## ⚖️ Licença e Isenção de Responsabilidade

Este projeto está licenciado sob os termos da licença **MIT** — consulte o arquivo `package.json` para obter mais detalhes.

### Isenção de Responsabilidade
- O **ZReader** é um aplicativo de código aberto e independente. Não possui afiliação oficial direta com a equipe de desenvolvimento do MangaDex.
- Todo o conteúdo de mangás, sinopses, capas e capítulos exibidos no aplicativo é fornecido e hospedado pela rede **MangaDex** e seus respectivos grupos de *scanlation*.
- O ZReader não hospeda, não altera e não comercializa nenhum conteúdo protegido por direitos autorais. O projeto incentiva o apoio aos autores e editoras oficiais sempre que os títulos estiverem disponíveis para compra em sua região.

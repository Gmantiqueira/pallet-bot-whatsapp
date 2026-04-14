# Arquitetura do Projeto

Este documento descreve a arquitetura em camadas do bot, suas responsabilidades e como os componentes interagem.

## Visão Geral

O projeto segue uma arquitetura em camadas (layered architecture) com separação clara de responsabilidades:

```
┌─────────────────────────────────────┐
│         Routes (HTTP)               │
│  /webhook, /files, /simulator       │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Application Layer              │
│  messageRouter, messageBuilder      │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│        Domain Layer                 │
│  stateMachine, session, repository  │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Infrastructure Layer           │
│  db, repositories, pdf, server      │
└─────────────────────────────────────┘
```

### Deploy na Vercel

- **`api/[[...path]].js`**: após `npm run build`, carrega `dist/fastifyApp` e expõe o Fastify via **`serverless-http`** (catch‑all para `/api/...`). O ficheiro não se chama `app.ts` para a Vercel não confundir com Next.js App Router (`src/app`). Tanto este ficheiro como `src/server.ts` fazem **`require`/`import` direto de `fastify`**, porque o [preset Fastify da Vercel](https://vercel.com/docs/frameworks/backend/fastify) procura esse import na entrada.
- **Simulador estático**: o `npm run build` corre `scripts/sync-simulator-static.cjs`, que gera **`simulator.html` na raiz** (artefacto em `.gitignore`). Assim o rewrite **`/simulator` → `/simulator.html`** serve HTML **sem** passar pela Lambda; só `public/simulator.html` por vezes não chega para a edge servir ficheiro estático no preset “Other”, e o pedido caía no catch‑all **`/api/simulator`** (cold start longo → “loading” até timeout). O script também injeta **`WEBHOOK_SECRET`** no HTML a partir da env de build (visível no “view source” — uso só para este simulador).
- **`vercel.json`**: **sem** rewrite catch‑all `/* → /api/*`. Só há rewrites explícitos: **`/simulator`** e **`/simulator/`** → **`/simulator.html`** (estático); **`/webhook`** → **`/api/webhook`**; **`/files/:name`** → **`/api/files/:name`**. Assim **`/favicon.ico`**, **`/simulator.html`**, ou outros ficheiros estáticos na raiz **não** passam pela Lambda — deixam de ser capturados por um padrão largo que mandava quase tudo para **`/api/...`** (o que fazia **`/simulator`** cair em **`/api/simulator`** e originar cold start / timeout). O prefixo **`/api`** é removido em **`api/[[...path]].js`**. `ignoreTrailingSlash: true` no Fastify alinha rotas com ou sem barra final.
- **`npm start` / `src/server.ts`**: continuam a servir para VPS ou `docker run` local; não são usados pelo runtime serverless da Vercel.
- Limites de tempo e CPU aplicam-se às [Vercel Functions](https://vercel.com/docs/functions/limitations). A geração de PDF + cold start pode ultrapassar 1 minuto; `vercel.json` usa `maxDuration: 300` para não cortar com 504. Se o dashboard do projeto tiver um **Default Max Duration** mais baixo, alinha com isto ou aumenta nas definições.

## Camadas

### 1. Domain Layer (`src/domain/`)

**Responsabilidade:** Contém a lógica de negócio pura, entidades e regras do domínio.

#### Arquivos:

- **`session.ts`**
  - Entidade `Session` com estrutura de dados da sessão
  - Campos: `phone`, `state`, `answers`, `stack`, `updatedAt`

- **`sessionRepository.ts`**
  - Interface `SessionRepository` (contrato)
  - Métodos: `get(phone)`, `upsert(session)`, `reset(phone)`

- **`stateMachine.ts`**
  - State machine pura (sem dependências externas)
  - Tipos: `State`, `Input`, `Effect`, `TransitionResult`
  - Função `transition(session, input)` - lógica de transição de estados
  - Validações de negócio
  - Regras de stack management

**Características:**
- Não depende de frameworks ou bibliotecas externas
- Pode ser testada isoladamente
- Contém toda a lógica de negócio

### 2. Application Layer (`src/application/`)

**Responsabilidade:** Orquestra casos de uso, coordena domain e infrastructure.

#### Arquivos:

- **`messageRouter.ts`**
  - Converte payload HTTP para `Input` da state machine
  - Chama `transition()` da state machine
  - Processa effects (ex: `GENERATE_PDF`)
  - Coordena persistência de sessão
  - Retorna `OutgoingMessage[]`

- **`messageBuilder.ts`**
  - Constrói mensagens de resposta baseadas no estado
  - Formata textos e botões
  - Gera resumos formatados
  - Trata contexto (erros, status, etc.)

**Características:**
- Depende do Domain Layer
- Orquestra fluxo de casos de uso
- Não contém lógica de negócio pura

### 3. Infrastructure Layer (`src/infra/`)

**Responsabilidade:** Implementações concretas de adaptadores e infraestrutura.

#### Estrutura:

- **`repositories/createSessionRepository.ts`**
  - Escolhe `UpstashSessionRepository` (Redis HTTPS) ou `MemorySessionRepository` (dev)

- **`repositories/upstashSessionRepository.ts` / `memorySessionRepository.ts`**
  - Implementações de `SessionRepository` (JSON em Redis ou Map em memória)

- **`pdf/pdfService.ts`**
  - Geração de PDFs usando pdfkit
  - Formatação de documentos
  - Gerenciamento de arquivos

**Características:**
- Implementa interfaces do Domain
- Depende de bibliotecas externas
- Pode ser substituída por outras implementações

### 4. Routes Layer (`src/routes/`)

**Responsabilidade:** Endpoints HTTP, parsing de requisições, formatação de respostas.

#### Arquivos:

- **`webhook.ts`**
  - POST `/webhook`
  - Recebe payload do WhatsApp
  - Carrega/cria sessão
  - Chama `messageRouter.routeIncoming()`
  - Retorna `{ messages: OutgoingMessage[] }`

- **`files.ts`**
  - GET `/files/:name`
  - Serve arquivos PDF
  - Proteção contra path traversal
  - Validação de arquivos

- **`simulator.ts`**
  - GET `/simulator`
  - Serve interface web do simulador

**Características:**
- Depende do Application Layer
- Lida com HTTP/Fastify
- Validação de entrada

### 5. Types (`src/types/`)

**Responsabilidade:** Definições de tipos compartilhados.

#### Arquivos:

- **`messages.ts`**
  - `OutgoingMessage` - estrutura de mensagens de saída
  - Suporta: `text`, `buttons`, `document`, `media`

## Fluxo de Dados

### 1. Requisição HTTP → Resposta

```
HTTP POST /webhook
  ↓
routes/webhook.ts
  ↓
application/messageRouter.ts
  ├─→ domain/stateMachine.ts (transition)
  ├─→ application/messageBuilder.ts (buildMessages)
  └─→ infra/repositories (sessão Redis ou memória)
  ↓
HTTP 200 { messages: [...] }
```

### 2. Geração de PDF

```
SUMMARY_CONFIRM → GERAR
  ↓
GENERATING_DOC (effect: GENERATE_PDF)
  ↓
application/messageRouter.ts detecta effect
  ↓
infra/pdf/pdfService.ts (generatePdf)
  ↓
DONE (com PDF URL)
```

### 3. Edição de Campo

```
SUMMARY_CONFIRM → EDITAR
  ↓
CHOOSE_EDIT_FIELD
  ↓
Estado de edição (ex: WAIT_CORRIDOR)
  ↓
domain/stateMachine.ts detecta modo edição
  ↓
Retorna para SUMMARY_CONFIRM
```

## Princípios de Design

### 1. Separação de Responsabilidades
- Cada camada tem uma responsabilidade clara
- Domain não conhece HTTP ou banco de dados
- Infrastructure implementa interfaces do Domain

### 2. Dependency Inversion
- Domain define interfaces (ex: `SessionRepository`)
- Infrastructure implementa interfaces
- Application depende de abstrações, não implementações

### 3. Testabilidade
- Domain pode ser testado sem mocks
- Application pode ser testado com mocks de Infrastructure
- Infrastructure pode ser testada isoladamente

### 4. State Machine Pura
- State machine não tem side effects
- Effects são retornados, não executados
- Router processa effects (PDF, persistência)

## Estrutura de Diretórios

```
src/
├── domain/              # Lógica de negócio
│   ├── session.ts
│   ├── sessionRepository.ts
│   └── stateMachine.ts
├── application/         # Casos de uso
│   ├── messageRouter.ts
│   └── messageBuilder.ts
├── infra/              # Infraestrutura
│   ├── db/
│   ├── repositories/
│   └── pdf/
├── routes/             # HTTP endpoints
│   ├── webhook.ts
│   ├── files.ts
│   └── simulator.ts
├── types/              # Tipos compartilhados
│   └── messages.ts
├── config/             # Configurações
│   └── env.ts
├── fastifyApp.ts       # Setup Fastify (evita nome `app.ts` na Vercel)
└── server.ts            # Entry point
```

## Dependências entre Camadas

```
Routes → Application → Domain
         ↓
      Infrastructure
```

- Routes depende de Application
- Application depende de Domain e Infrastructure
- Infrastructure implementa interfaces de Domain
- Domain não depende de ninguém

## Extensibilidade

### Adicionar Novo Estado
1. Adicionar estado em `domain/stateMachine.ts`
2. Implementar transição no `transition()`
3. Adicionar mensagem em `application/messageBuilder.ts`

### Adicionar Nova Validação
1. Criar função de validação em `domain/stateMachine.ts`
2. Chamar no estado apropriado
3. Retornar erro se inválido

### Trocar Persistência
1. Implementar nova `SessionRepository`
2. Substituir em `routes/webhook.ts`
3. Domain não precisa mudar

### Adicionar Novo Effect
1. Adicionar tipo em `domain/stateMachine.ts`
2. Processar em `application/messageRouter.ts`
3. Implementar ação em Infrastructure

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

- **`db/sqlite.ts`**
  - Conexão com SQLite
  - Migrations
  - Funções: `getDb()`, `migrate()`, `closeDb()`

- **`repositories/sqliteSessionRepository.ts`**
  - Implementação concreta de `SessionRepository`
  - Persistência em SQLite
  - Serialização/deserialização JSON

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
  └─→ infra/repositories/sqliteSessionRepository.ts (persist)
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
├── app.ts              # Setup Fastify
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

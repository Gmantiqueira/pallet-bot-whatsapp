# Pallet Bot WhatsApp

Bot de WhatsApp para Projeto Porta-Paletes baseado em state machine.

## Como rodar

### Pré-requisitos

- Node.js 18+ 
- npm

### Instalação

```bash
npm install
```

### Configuração

Copie o arquivo `.env.example` para `.env` e ajuste as variáveis conforme necessário:

```bash
cp .env.example .env
```

### Desenvolvimento

```bash
npm run dev
```

O servidor estará rodando em `http://localhost:3000` (ou a porta configurada no `.env`).

### Build

```bash
npm run build
```

### Produção

```bash
npm start
```

### Testes

```bash
npm test
```

### Lint e Formatação

```bash
npm run lint        # Verifica código
npm run lint:fix    # Corrige problemas automaticamente
npm run format      # Formata código com Prettier
```

## Estrutura do Projeto

```
src/
  ├── server.ts      # Ponto de entrada do servidor
  ├── app.ts         # Instância Fastify
  ├── config/        # Configurações (env)
  ├── types/         # Tipos TypeScript
  ├── routes/        # Rotas HTTP
  │   ├── webhook.ts # POST /webhook
  │   └── files.ts   # GET /files/:name
  ├── domain/        # Entidades e regras de negócio
  └── application/   # Casos de uso e lógica de aplicação
```

## Tecnologias

- Node.js + TypeScript (strict mode)
- Fastify (servidor HTTP)
- Jest (testes)
- ESLint + Prettier (qualidade de código)

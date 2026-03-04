# Pallet Bot WhatsApp

Bot de WhatsApp para Projeto Porta-Paletes baseado em state machine.

## Estrutura do Projeto

```
src/
  ├── domain/       # Entidades e regras de negócio
  ├── application/  # Casos de uso e lógica de aplicação
  ├── infra/        # Infraestrutura (servidor, adaptadores)
  └── routes/       # Rotas HTTP
```

## Scripts

- `npm run dev` - Inicia servidor em modo desenvolvimento
- `npm run build` - Compila TypeScript
- `npm start` - Inicia servidor em produção
- `npm test` - Executa testes
- `npm run lint` - Verifica código com ESLint
- `npm run format` - Formata código com Prettier

## Tecnologias

- Node.js + TypeScript (strict mode)
- Fastify (servidor HTTP)
- Jest (testes)
- ESLint + Prettier (qualidade de código)

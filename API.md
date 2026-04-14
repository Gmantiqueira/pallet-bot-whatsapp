# API Documentation

Documentação da API do bot de WhatsApp para Projeto Porta-Paletes.

## Base URL

```
http://localhost:3000
```

## Endpoints

### POST /webhook

Endpoint principal para receber mensagens do WhatsApp.

#### Request Body

```typescript
interface IncomingWebhookPayload {
  from: string;              // Número (E.164); o servidor normaliza: trim, remove espaços e prefixo "+"
  text?: string;             // Texto da mensagem
  buttonReply?: string;      // ID do botão clicado
  /** Simulador web: com `true`, a sessão não é lida nem gravada no Redis — usa `clientSession` no cliente. */
  simulator?: boolean;
  /** Estado anterior devolvido na resposta (obrigatório após o 1.º turno em modo simulador). */
  clientSession?: object;
  media?: {
    type: "image";
    id: string;              // ID da mídia
  };
}
```

#### Response

```typescript
interface WebhookResponse {
  messages: OutgoingMessage[];
  /** `upstash` = Redis (sessão partilhada). `memory` = só no processo (em serverless multi-pedido pode falhar). */
  sessionBackend: "memory" | "upstash";
  /** Com `simulator: true` na request: sessão completa para o cliente manter em memória (ex.: simulador; F5 recomeça). */
  clientSession?: object;
  /** Com `simulator: true` e PDF gerado neste pedido: ficheiro em base64 (download no simulador sem depender de `/files` entre instâncias). */
  pdfBase64?: string;
  /** Opcional: presente quando o PDF é gerado neste pedido (integrador WhatsApp). */
  generatedPdf?: object;
}

interface OutgoingMessage {
  to: string;                // Número do destinatário
  text?: string;             // Texto da mensagem
  buttons?: Array<{
    id: string;              // ID do botão
    label: string;           // Label do botão
  }>;
  document?: {
    filename: string;        // Nome do arquivo
    url: string;            // URL do arquivo
  };
  media?: {
    type: "image" | "document";
    id?: string;
    url?: string;
  };
}
```

#### Exemplos

##### 1. Mensagem de Texto

**Request:**
```json
POST /webhook
Content-Type: application/json

{
  "from": "5511999999999",
  "text": "novo"
}
```

**Response:**
```json
{
  "messages": [
    {
      "to": "5511999999999",
      "text": "NOVO PROJETO\n\nComo deseja iniciar?\n\n1️⃣ Planta real\n2️⃣ Medidas digitadas",
      "buttons": [
        { "id": "1", "label": "PLANTA" },
        { "id": "2", "label": "MEDIDAS" }
      ]
    }
  ]
}
```

##### 2. Botão Clicado

**Request:**
```json
POST /webhook
Content-Type: application/json

{
  "from": "5511999999999",
  "buttonReply": "2"
}
```

**Response:**
```json
{
  "messages": [
    {
      "to": "5511999999999",
      "text": "Digite o comprimento em mm\n\nExemplo: 12000"
    }
  ]
}
```

##### 3. Envio de Imagem

**Request:**
```json
POST /webhook
Content-Type: application/json

{
  "from": "5511999999999",
  "media": {
    "type": "image",
    "id": "image_12345"
  }
}
```

**Response:**
```json
{
  "messages": [
    {
      "to": "5511999999999",
      "text": "✅ IMAGEM ANALISADA!\nComprimento: 12000 mm\nLargura: 10000 mm\nPorta: não detectada"
    },
    {
      "to": "5511999999999",
      "text": "Digite a largura do corredor em mm\n\nExemplos: 2800 ou 2000"
    }
  ]
}
```

##### 4. Validação de Erro

**Request:**
```json
POST /webhook
Content-Type: application/json

{
  "from": "5511999999999",
  "text": "400"
}
```

**Response:**
```json
{
  "messages": [
    {
      "to": "5511999999999",
      "text": "❌ Valor deve estar entre 500 e 200000 mm"
    },
    {
      "to": "5511999999999",
      "text": "Digite o comprimento em mm\n\nExemplo: 12000"
    }
  ]
}
```

##### 5. Resumo com Botões

**Request:**
```json
POST /webhook
Content-Type: application/json

{
  "from": "5511999999999",
  "buttonReply": "ambos"
}
```

**Response:**
```json
{
  "messages": [
    {
      "to": "5511999999999",
      "text": "📋 RESUMO DO PROJETO\n\nComprimento: 12000 mm\nLargura: 10000 mm\nCorredor: 3000 mm\nCapacidade: 2000 kg\nAltura: 5000 mm (direta)\nGuard rail: Ambos",
      "buttons": [
        { "id": "GERAR", "label": "Gerar documento" },
        { "id": "EDITAR", "label": "Editar" }
      ]
    }
  ]
}
```

##### 6. Documento PDF

**Request:**
```json
POST /webhook
Content-Type: application/json

{
  "from": "5511999999999",
  "buttonReply": "GERAR"
}
```

**Response:**
```json
{
  "messages": [
    {
      "to": "5511999999999",
      "text": "⏳ Gerando documento..."
    },
    {
      "to": "5511999999999",
      "text": "✅ Projeto concluído",
      "document": {
        "filename": "projeto-5511999999999-1234567890.pdf",
        "url": "http://localhost:3000/files/projeto-5511999999999-1234567890.pdf"
      }
    }
  ]
}
```

### GET /files/:name

Endpoint para servir arquivos PDF gerados.

#### Path Parameters

- `name` (string) - Nome do arquivo PDF

#### Response

- **200 OK**: Arquivo PDF (Content-Type: application/pdf)
- **400 Bad Request**: Nome de arquivo inválido (path traversal detectado)
- **404 Not Found**: Arquivo não encontrado

#### Exemplo

**Request:**
```
GET /files/projeto-5511999999999-1234567890.pdf
```

**Response:**
```
Content-Type: application/pdf
[Binary PDF data]
```

### GET /simulator

Interface web do simulador (chat estilo WhatsApp para testar o `POST /webhook`).

- **Local (`npm run dev`)**: Fastify serve `public/simulator.html` (após `npm run build`) ou `public/simulator.source.html`.
- **Vercel**: `vercel.json` reescreve `/simulator` → `/simulator.html`; o ficheiro estático é **`public/simulator.html`** (gerado no build a partir de `simulator.source.html`).

#### Response

- **200 OK**: HTML do simulador (Content-Type: text/html)
- **404 Not Found**: Arquivo não encontrado

## Comandos Globais

Os seguintes comandos podem ser enviados via `text` em qualquer estado:

### novo

Limpa todas as respostas e volta ao menu principal.

**Request:**
```json
{
  "from": "5511999999999",
  "text": "novo"
}
```

### cancelar

Limpa todas as respostas e volta ao menu principal.

**Request:**
```json
{
  "from": "5511999999999",
  "text": "cancelar"
}
```

### voltar

Retorna ao estado anterior preservando as respostas.

**Request:**
```json
{
  "from": "5511999999999",
  "text": "voltar"
}
```

### status

Mostra resumo parcial sem alterar o estado atual.

**Request:**
```json
{
  "from": "5511999999999",
  "text": "status"
}
```

**Response:**
```json
{
  "messages": [
    {
      "to": "5511999999999",
      "text": "📋 RESUMO DO PROJETO\n\nComprimento: 12000 mm\nLargura: 10000 mm\n..."
    }
  ]
}
```

## Validações

### Comprimento e Largura

- **Range:** 500 - 200000 mm
- **Erro:** "Valor deve estar entre 500 e 200000 mm"

### Corredor

- **Range:** 1000 - 6000 mm
- **Erro:** "Corredor deve estar entre 1000 e 6000 mm"

### Capacidade

- **Range:** 100 - 5000 kg
- **Erro:** "Capacidade deve estar entre 100 e 5000 kg"

### Níveis

- **Range:** 1 - 12
- **Erro:** "Níveis deve estar entre 1 e 12"

## Estados e Botões

### MENU

**Botões:**
- `1` - Planta real
- `2` - Medidas digitadas

### CHOOSE_HEIGHT_MODE

**Botões:**
- `DIRECT` - Digitar altura
- `CALC` - Calcular pela carga

### WAIT_EXTRAS_GUARD_RAIL

**Botões:**
- `inicio` - Início
- `final` - Final
- `ambos` - Ambos
- `nao` - Não

### SUMMARY_CONFIRM

**Botões:**
- `GERAR` - Gerar documento
- `EDITAR` - Editar campos

### CHOOSE_EDIT_FIELD

**Botões:**
- `MEDIDAS` - Editar medidas
- `CORREDOR` - Editar corredor
- `CAPACIDADE` - Editar capacidade
- `ALTURA` - Editar altura
- `GUARD_RAIL` - Editar guard rail
- `VOLTAR_RESUMO` - Voltar ao resumo

## Códigos de Status HTTP

- **200 OK**: Requisição processada com sucesso
- **400 Bad Request**: Dados inválidos (ex: path traversal)
- **404 Not Found**: Recurso não encontrado
- **500 Internal Server Error**: Erro interno do servidor

## Rate Limiting

Atualmente não há rate limiting implementado. Recomenda-se implementar em produção.

## Segurança

### Path Traversal Protection

O endpoint `/files/:name` protege contra path traversal:
- Bloqueia `..`, `/`, `\` no nome do arquivo
- Retorna 400 se detectado

### Validação de Entrada

- Todos os valores numéricos são validados
- Comandos globais são case-insensitive
- Números são extraídos de strings (remove caracteres não numéricos)

## Exemplos de Fluxo Completo

Veja `docs/examples.http` para exemplos completos de todas as interações possíveis.

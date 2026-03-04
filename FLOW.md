# Fluxo do Bot - Projeto Porta-Paletes

Este documento descreve o fluxo completo de interação do bot, incluindo todos os estados e transições possíveis.

## Estados do Sistema

O bot utiliza uma state machine com os seguintes estados:

- `START` - Estado inicial
- `MENU` - Menu principal com opções de início
- `WAIT_PLANT_IMAGE` - Aguardando envio de imagem da planta
- `WAIT_LENGTH` - Aguardando comprimento em mm
- `WAIT_WIDTH` - Aguardando largura em mm
- `WAIT_CORRIDOR` - Aguardando largura do corredor em mm
- `WAIT_CAPACITY` - Aguardando capacidade por nível em kg
- `CHOOSE_HEIGHT_MODE` - Escolha do modo de altura (direta ou calculada)
- `WAIT_HEIGHT_DIRECT` - Aguardando altura direta em mm
- `WAIT_LOAD_HEIGHT` - Aguardando altura da carga em mm
- `WAIT_LEVELS` - Aguardando número de níveis
- `WAIT_EXTRAS_GUARD_RAIL` - Aguardando escolha do guard rail
- `SUMMARY_CONFIRM` - Resumo do projeto para confirmação
- `CHOOSE_EDIT_FIELD` - Escolha de campo para edição
- `GENERATING_DOC` - Gerando documento PDF
- `DONE` - Projeto concluído

## Comandos Globais

Em qualquer estado, os seguintes comandos podem ser enviados via texto:

- `novo` - Limpa todas as respostas e volta ao MENU
- `cancelar` - Limpa todas as respostas e volta ao MENU
- `voltar` - Retorna ao estado anterior (preserva respostas)
- `status` - Mostra resumo parcial sem alterar estado

## Fluxo Principal

### 1. Início (START)

**Estado:** `START`

**Mensagem:** "Olá! Para começar, digite *novo*"

**Transições:**
- Qualquer mensagem → sugere digitar "novo"
- Comando "novo" → `MENU`

### 2. Menu Principal (MENU)

**Estado:** `MENU`

**Mensagem:**
```
NOVO PROJETO

Como deseja iniciar?

1️⃣ Planta real
2️⃣ Medidas digitadas
3️⃣ Galpão fictício
```

**Botões:**
- `1` (PLANTA) → `WAIT_PLANT_IMAGE`
- `2` (MEDIDAS) → `WAIT_LENGTH`
- `3` (FICTICIO) → `WAIT_LENGTH`

### 3. Fluxo: Planta Real

#### 3.1. Aguardando Imagem (WAIT_PLANT_IMAGE)

**Estado:** `WAIT_PLANT_IMAGE`

**Mensagem:** "Envie uma imagem da planta do galpão...\n⚠️ As medidas precisam estar visíveis."

**Transições:**
- Recebe `MEDIA_IMAGE` → `WAIT_CORRIDOR`
  - Define valores mock: `lengthMm: 12000`, `widthMm: 10000`
  - Envia mensagem: "✅ IMAGEM ANALISADA!\nComprimento: X mm\nLargura: Y mm\nPorta: não detectada"

### 4. Fluxo: Medidas Digitadas / Galpão Fictício

#### 4.1. Comprimento (WAIT_LENGTH)

**Estado:** `WAIT_LENGTH`

**Mensagem:** "Digite o comprimento em mm\n\nExemplo: 12000"

**Validação:** 500 - 200000 mm

**Transições:**
- Texto válido → `WAIT_WIDTH` (ou `SUMMARY_CONFIRM` se em modo edição)

#### 4.2. Largura (WAIT_WIDTH)

**Estado:** `WAIT_WIDTH`

**Mensagem:** "Digite a largura em mm\n\nExemplo: 10000"

**Validação:** 500 - 200000 mm

**Transições:**
- Texto válido → `WAIT_CORRIDOR` (ou `SUMMARY_CONFIRM` se em modo edição)

### 5. Corredor (WAIT_CORRIDOR)

**Estado:** `WAIT_CORRIDOR`

**Mensagem:** "Digite a largura do corredor em mm\n\nExemplos: 2800 ou 2000"

**Validação:** 1000 - 6000 mm

**Transições:**
- Texto válido → `WAIT_CAPACITY` (ou `SUMMARY_CONFIRM` se em modo edição)

### 6. Capacidade (WAIT_CAPACITY)

**Estado:** `WAIT_CAPACITY`

**Mensagem:** "Digite a capacidade por nível em kg\n\nExemplos: 1200, 1500 ou 2000"

**Validação:** 100 - 5000 kg

**Transições:**
- Texto válido → `CHOOSE_HEIGHT_MODE` (ou `SUMMARY_CONFIRM` se em modo edição)

### 7. Modo de Altura (CHOOSE_HEIGHT_MODE)

**Estado:** `CHOOSE_HEIGHT_MODE`

**Mensagem:** "Como deseja definir a altura?\n\n• Digitar altura diretamente\n• Calcular pela carga"

**Botões:**
- `DIRECT` (Digitar altura) → `WAIT_HEIGHT_DIRECT`
- `CALC` (Calcular pela carga) → `WAIT_LOAD_HEIGHT`

### 8. Fluxo: Altura Direta

#### 8.1. Altura Direta (WAIT_HEIGHT_DIRECT)

**Estado:** `WAIT_HEIGHT_DIRECT`

**Mensagem:** "Digite a altura em mm\n\nExemplo: 5000"

**Transições:**
- Texto válido → `WAIT_EXTRAS_GUARD_RAIL` (ou `SUMMARY_CONFIRM` se em modo edição)

### 9. Fluxo: Altura Calculada

#### 9.1. Altura da Carga (WAIT_LOAD_HEIGHT)

**Estado:** `WAIT_LOAD_HEIGHT`

**Mensagem:** "Digite a altura da carga em mm\n\nExemplo: 1500"

**Transições:**
- Texto válido → `WAIT_LEVELS` (ou `SUMMARY_CONFIRM` se em modo edição)

#### 9.2. Níveis (WAIT_LEVELS)

**Estado:** `WAIT_LEVELS`

**Mensagem:** "Digite o número de níveis\n\nValor entre 1 e 12"

**Validação:** 1 - 12 níveis

**Transições:**
- Texto válido → `WAIT_EXTRAS_GUARD_RAIL` (ou `SUMMARY_CONFIRM` se em modo edição)

### 10. Guard Rail (WAIT_EXTRAS_GUARD_RAIL)

**Estado:** `WAIT_EXTRAS_GUARD_RAIL`

**Mensagem:** "Guard rail:\n\nOnde deseja instalar?"

**Botões:**
- `inicio` (Início)
- `final` (Final)
- `ambos` (Ambos)
- `nao` (Não)

**Transições:**
- Botão selecionado → `SUMMARY_CONFIRM` (ou `SUMMARY_CONFIRM` se em modo edição)

### 11. Resumo e Confirmação (SUMMARY_CONFIRM)

**Estado:** `SUMMARY_CONFIRM`

**Mensagem:** Resumo formatado com todos os dados coletados:
```
📋 RESUMO DO PROJETO

Comprimento: 12000 mm
Largura: 10000 mm
Corredor: 3000 mm
Capacidade: 2000 kg
Altura: 5000 mm (direta)
Guard rail: Ambos
```

**Botões:**
- `GERAR` (Gerar documento) → `GENERATING_DOC`
- `EDITAR` (Editar) → `CHOOSE_EDIT_FIELD`

### 12. Edição (CHOOSE_EDIT_FIELD)

**Estado:** `CHOOSE_EDIT_FIELD`

**Mensagem:** "Qual campo deseja editar?"

**Botões:**
- `MEDIDAS` → `WAIT_LENGTH`
- `CORREDOR` → `WAIT_CORRIDOR`
- `CAPACIDADE` → `WAIT_CAPACITY`
- `ALTURA` → `CHOOSE_HEIGHT_MODE`
- `GUARD_RAIL` → `WAIT_EXTRAS_GUARD_RAIL`
- `VOLTAR_RESUMO` → `SUMMARY_CONFIRM`

**Comportamento:**
- Ao editar um campo, retorna automaticamente para `SUMMARY_CONFIRM`
- Preserva todas as outras respostas

### 13. Geração de Documento (GENERATING_DOC)

**Estado:** `GENERATING_DOC`

**Mensagem:** "⏳ Gerando documento..."

**Comportamento:**
- Gera PDF automaticamente
- Transiciona para `DONE` após geração

### 14. Concluído (DONE)

**Estado:** `DONE`

**Mensagem:** "✅ Projeto concluído"

**Documento:**
- Envia PDF com URL: `http://localhost:${PORT}/files/${filename}`

## Validações

### Comprimento e Largura
- **Mínimo:** 500 mm
- **Máximo:** 200000 mm
- **Erro:** "Valor deve estar entre 500 e 200000 mm"

### Corredor
- **Mínimo:** 1000 mm
- **Máximo:** 6000 mm
- **Erro:** "Corredor deve estar entre 1000 e 6000 mm"

### Capacidade
- **Mínimo:** 100 kg
- **Máximo:** 5000 kg
- **Erro:** "Capacidade deve estar entre 100 e 5000 kg"

### Níveis
- **Mínimo:** 1
- **Máximo:** 12
- **Erro:** "Níveis deve estar entre 1 e 12"

## Exemplos de Fluxo

### Exemplo 1: Fluxo Completo - Medidas Digitadas

1. `START` → digite "novo"
2. `MENU` → botão "2" (MEDIDAS)
3. `WAIT_LENGTH` → "12000"
4. `WAIT_WIDTH` → "10000"
5. `WAIT_CORRIDOR` → "3000"
6. `WAIT_CAPACITY` → "2000"
7. `CHOOSE_HEIGHT_MODE` → botão "DIRECT"
8. `WAIT_HEIGHT_DIRECT` → "5000"
9. `WAIT_EXTRAS_GUARD_RAIL` → botão "ambos"
10. `SUMMARY_CONFIRM` → botão "GERAR"
11. `GENERATING_DOC` → gera PDF
12. `DONE` → envia PDF

### Exemplo 2: Edição de Campo

1. `SUMMARY_CONFIRM` → botão "EDITAR"
2. `CHOOSE_EDIT_FIELD` → botão "CORREDOR"
3. `WAIT_CORRIDOR` → "3500"
4. `SUMMARY_CONFIRM` → retorna automaticamente

### Exemplo 3: Comando Voltar

1. `WAIT_CAPACITY` → comando "voltar"
2. `WAIT_CORRIDOR` → estado anterior
3. Respostas preservadas

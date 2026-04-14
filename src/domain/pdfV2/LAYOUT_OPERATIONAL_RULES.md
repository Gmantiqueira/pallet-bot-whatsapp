# Regras operacionais do layout (PDF V2)

Este documento descreve as **regras geométricas** assumidas pelo motor em
`layoutSolutionV2.ts` ao posicionar fileiras e corredores no referencial do galpão.
Não substitui normas de segurança locais; define um **modelo mínimo** para implantação
coerente com uso de empilhador em corredor.

## Eixos

- **Vão (longitudinal / ao longo da fileira):** eixo das longarinas e deslocamento do empilhador
  entre montantes — modelado com `corridorMm` **entre** fileiras quando há mais do que uma.
- **Transversal (profundidade da faixa):** eixo perpendicular ao vão, de uma parede do
  compartimento à outra.

## Fileira simples (uma costa)

- **Pode encostar a uma parede** do compartimento no lado transversal **sem** corredor
  dedicado nesse segmento de parede.
- O acesso à face de picking assume-se a partir do **corredor operacional entre fileiras**
  (e, quando existe, da **faixa transversal remanescente** ou de passagem modelada à parte).
- Uma face da fileira pode estar “no limite” do desenho sem faixa com a largura total
  `corridorMm`; isso não implica duas faces operacionais simétricas.

## Fileira dupla (costas voltadas / back-to-back)

- A banda tem **duas faces exteriores** de picking (lados opostos no eixo transversal),
  para além da zona de espinha entre costas.
- **Regra assumida:** para operação realista com empilhador, **ambas** as faces exteriores
  precisam de uma faixa livre com largura **≥ `corridorMm`** (o corredor principal declarado
  pelo utilizador) **antes** de cada parede do compartimento nesse eixo.
- Por isso, no modo duplo, o comprimento transversal útil para **contar e posicionar** fileiras
  é `crossSpan − 2×corridorMm`. Essas duas faixas entram no modelo como
  **“Corredor operacional (acesso — perímetro)”** (lado inicial) e o remanescente após a última
  fileira é cotado como corredor operacional ou residual conforme a largura disponível.
- **Uma fileira dupla não é colocada com uma face exterior colada à parede** sem essa reserva:
  o primeiro retângulo de fileira começa em `corridorMm` e o empacotamento garante espaço
  simétrico na modelagem.

## Área residual vs corredor operacional

- **Entre fileiras:** retângulos com etiqueta **“Corredor operacional”** — circulação nominal
  com a largura pedida.
- **Perímetro (modo duplo):** **“Corredor operacional (acesso — perímetro)”** — faixa reservada
  para acesso à face exterior da banda.
- **Faixa transversal** após a última fileira: se a largura for **≥ `corridorMm`**, trata-se
  como corredor operacional (com texto que distingue fileira dupla quando aplicável); se for
  **inferior** a `corridorMm`, o rótulo indica explicitamente **faixa residual** (não equiparável
  a corredor de serviço com a largura declarada).

## O que o PDF mostra

- A planta colore e etiqueta zonas de `circulationZones` conforme a etiqueta semântica acima.
- Não se desenha “acesso” onde o modelo só tem **residual** estreita — o texto da etiqueta
  desambigua.

## Validação

- **`validateOperationalAccess(geo)`** — função explícita (em `layoutGeometryV2.ts`) que aplica o
  modelo de acesso acima sobre o `LayoutGeometry` usado na planta. Fileiras `backToBack` sem faixa
  bilateral ≥ `corridorMm` falham (área residual estreita **não** satisfaz o requisito).
- **`validateLayoutGeometry`** chama `validateOperationalAccess` no fim (após invariantes de pegada).
- **`layoutSolutionPassesOperationalAccess(sol)`** — mesmo critério sobre `LayoutSolutionV2`, para o
  motor rejeitar candidatos inviáveis antes da pontuação (`MELHOR_LAYOUT` pode preferir outra
  orientação, fileira simples, ou menos fileiras quando o duplo não cabe com acesso bilateral).

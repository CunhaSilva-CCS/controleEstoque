# ControleEstoque

Aplicativo **desktop** de controle de estoque (Electron + React + TypeScript + SQLite/sql.js), com requisitos e fluxos detalhados.

## Documentação

- [Requisitos](docs/REQUISITOS.md) — RF/RNF, escopo e critérios de aceite
- [Fluxos](docs/FLUXOS.md) — F0–F9 (inicialização, cadastros, entrada/saída/ajuste, alertas, CSV)

## Funcionalidades

- Dashboard com alertas de estoque baixo e movimentos recentes
- Categorias, fornecedores e produtos (SKU único; saldo só via movimentos)
- Movimentos: **ENTRADA**, **SAIDA** (com validação de saldo) e **AJUSTE**
- Histórico append-only com saldo antes/depois
- Exportação CSV (inventário, crítico, movimentos)
- Seed de demonstração na primeira execução

## Como rodar

```bash
npm install
npm run dev          # UI no navegador (modo demo com localStorage)
npm test             # regras + repositório
npm run build        # UI + processo Electron
```

### Desktop (Electron)

Com a UI em `npm run dev` em um terminal:

```bash
npx tsc -p tsconfig.electron.json
npx electron .
```

Ou use o script combinado (requer display):

```bash
npm run electron:dev
```

## Arquitetura

| Camada | Pasta | Papel |
|--------|-------|-------|
| Domínio compartilhado | `shared/` | Tipos + regras puras de estoque |
| Main / IPC / DB | `electron/` | Janela, persistência SQLite, handlers |
| UI | `src/` | React (dashboard, cadastros, movimentos, relatórios) |
| Testes | `tests/` | Vitest (regras e repositório) |

No Electron, o banco fica em `userData/controle-estoque/inventory.sqlite`. No modo navegador, os dados ficam em `localStorage`.

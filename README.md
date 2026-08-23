# Controle de Estoque

Aplicativo **desktop** (Electron + React + TypeScript + SQLite) para gestão de estoque offline.

## Documentação

- [Requisitos detalhados](docs/REQUISITOS.md)
- [Fluxos do sistema](docs/FLUXOS.md)

### Release e operação

- [Plano de produção corporativo](docs/PLANO-PRODUCAO.md)
- [Política de cobertura de testes](docs/POLITICA-COBERTURA-TESTES.md)
- [Checklist Go/No-Go](docs/CHECKLIST-GO-NOGO.md)
- [Runbook de operação](docs/RUNBOOK-OPERACAO.md)

## Funcionalidades

- Dashboard com indicadores e alertas de estoque baixo
- Cadastro de produtos, categorias e fornecedores
- Movimentações: entrada, saída e ajuste (histórico imutável)
- Relatórios com exportação CSV
- Persistência local SQLite (modo Electron) ou memória (preview no navegador)

## Pré-requisitos

- Node.js 20+
- npm 10+

## Como executar

```bash
npm install
npm run dev
```

Isso sobe o Vite e abre a janela Electron.  
Para preview só no navegador (API em memória):

```bash
npm run dev
# abra http://127.0.0.1:5173 se a janela Electron não estiver disponível
```

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Desenvolvimento (Vite + Electron) |
| `npm run build` | Build de produção (renderer + main) |
| `npm start` | Abre o app a partir do build |
| `npm test` | Testes unitários das regras de estoque |
| `npm run smoke` | Smoke test automatizado (API em memória) |
| `npm run typecheck` | Verificação TypeScript |
| `npm run electron:build` | Empacota instalador (electron-builder) |

## CI/CD

- **CI** (`.github/workflows/ci.yml`): roda em PRs e push na `main` — typecheck, testes, smoke, build e empacotamento Linux.
- **Release** (`.github/workflows/release.yml`): roda ao criar tag `v*` — build matrix (Linux, Windows, macOS) e publica draft no GitHub Releases.

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Telemetria (Sentry)

Crash reporting opcional via `@sentry/electron`. Copie `.env.example` para `.env` e configure:

```bash
SENTRY_DSN=https://...@sentry.io/...
SENTRY_ENVIRONMENT=production
```

Sem `SENTRY_DSN`, o app funciona normalmente sem enviar eventos. Em desenvolvimento, use `SENTRY_ENABLED=true` para testar.

## Fluxo rápido sugerido

1. Abrir o app → aceitar dados demo (opcional)
2. Cadastrar categorias e fornecedores
3. Cadastrar produtos (com estoque inicial se houver)
4. Registrar entradas/saídas/ajustes
5. Acompanhar alertas no dashboard e exportar relatórios

## Stack

- Electron 33
- React 19 + React Router
- Vite 6
- better-sqlite3
- TypeScript 5

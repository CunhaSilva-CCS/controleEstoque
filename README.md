# ERP Cortexis Tech — Módulo Controle de Estoque

Aplicativo **desktop** (Electron + React + TypeScript + SQLite) do ecossistema **ERP Cortexis Tech**, desenvolvido pela [Cortexis Tech](https://cortexists.com), para gestão de estoque **offline**.

## Documentação

- [Requisitos detalhados](docs/REQUISITOS.md)
- [Fluxos do sistema](docs/FLUXOS.md)

### Release e operação

- [Plano de produção corporativo](docs/PLANO-PRODUCAO.md)
- [Política de cobertura de testes](docs/POLITICA-COBERTURA-TESTES.md)
- [Checklist Go/No-Go](docs/CHECKLIST-GO-NOGO.md)
- [Relatório de prontidão da v1](docs/RELATORIO-PRONTIDAO-V1.md)
- [Runbook de operação](docs/RUNBOOK-OPERACAO.md)
- [Code signing e notarização](docs/CODE-SIGNING.md)

## Funcionalidades

- Login local com perfis **administrador** e **operador** (troca obrigatória da senha padrão)
- Painel com indicadores e alertas de estoque baixo / zerado
- Cadastro de produtos (insumo ou produto final), categorias, fornecedores e receitas
- Entrada de insumos por **fatura de compra**
- Saída de insumos e entrada de produtos finais por **fabricação** (receita / BOM)
- **Ajuste de inventário** manual (saldo absoluto)
- Relatórios com exportação CSV
- Marca da empresa contratante, tema claro/escuro, cópia de segurança e atualizações
- Persistência local SQLite (Electron) ou memória (preview no navegador)

## Modelo de estoque

O cadastro de produto **não** gera estoque. O saldo só muda por:

| Origem | Efeito |
|--------|--------|
| Fatura de compra | Entrada de **insumo** |
| Fabricação | Saída de insumos da receita + entrada do **produto final** |
| Ajuste de inventário | Define o novo saldo absoluto |

## Pré-requisitos

- Node.js 20+
- npm 10+

## Como executar

```bash
npm install
npm run dev
```

Isso sobe o Vite e abre a janela Electron.

Login padrão (primeiro uso): usuário `admin` / senha `admin123` — o sistema exige troca de senha antes de continuar.

Para preview só no navegador (API em memória):

```bash
npm run dev:web
# abra http://127.0.0.1:5173
```

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Desenvolvimento (Vite + Electron) |
| `npm run dev:web` | Preview web (API em memória) |
| `npm run build` | Build de produção (renderer + main) |
| `npm start` | Abre o app a partir do build |
| `npm run test:e2e` | Testes E2E Playwright (fluxos em modo web) |
| `npm test` | Testes unitários (estoque, auth, backup) |
| `npm run smoke` | Smoke test automatizado (API em memória) |
| `npm run typecheck` | Verificação TypeScript |
| `npm run electron:build` | Empacota instalador (electron-builder) |
| `npm run icons` | Regenera ícones a partir do logo |

## CI/CD

- **CI** (`.github/workflows/ci.yml`): PRs e push na `main` — typecheck, testes, smoke, build e empacotamento Linux.
- **Release** (`.github/workflows/release.yml`): tag `v*` — build matrix (Linux, Windows, macOS) e draft no GitHub Releases.

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

Sem `SENTRY_DSN`, o app funciona sem enviar eventos. Em desenvolvimento, use `SENTRY_ENABLED=true` para testar.

## Code signing (produção)

Para releases corporativos, configure os secrets no GitHub conforme [docs/CODE-SIGNING.md](docs/CODE-SIGNING.md):

| Secret | Plataforma |
|--------|------------|
| `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD` | Windows (Authenticode) |
| `MAC_CSC_LINK` + `MAC_CSC_KEY_PASSWORD` | macOS (Developer ID) |
| `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID` | macOS (notarização) |
| `LINUX_GPG_PRIVATE_KEY` | Linux (.deb) |

Sem secrets, o CI gera instaladores **sem assinatura** (OK para QA).

## Fluxo rápido sugerido

1. Abrir o app → entrar como `admin` → trocar a senha padrão
2. (Admin) Aceitar ou recusar dados de demonstração no painel
3. Cadastrar categorias e fornecedores
4. Cadastrar insumos e produtos finais (saldo inicia em zero)
5. Lançar fatura de compra para entrar insumos
6. Cadastrar receita do produto final e registrar fabricação
7. Usar ajuste de inventário só para correção física
8. Acompanhar o painel e exportar relatórios

## Stack

- Electron 33
- React 19 + React Router
- Vite 6
- better-sqlite3-multiple-ciphers (SQLite com criptografia AES-256 compatível com SQLCipher)
- TypeScript 5

## Cópia de segurança e atualizações

- Em **Configurações** (admin): exportar / restaurar o banco SQLite (`.db`).
- Auto-update via GitHub Releases em builds empacotados (`electron-updater`).
- Em desenvolvimento / modo web, as atualizações aparecem como indisponíveis.

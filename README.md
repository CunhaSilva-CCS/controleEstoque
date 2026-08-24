# ERP Cortexis Tech — Controlo de Stock

Aplicação **desktop** (Electron + React + TypeScript + SQLite) do ecossistema **ERP Cortexis Tech**, desenvolvida pela [Cortexis Tech](https://cortexists.com), para gestão de stock **offline**.

## Documentação

- [Índice completo da documentação](docs/README.md)
- [Manual do Utilizador (PDF)](docs/Manual-do-Utilizador-ERP-Cortexis-Tech.pdf)
- [Especificação funcional e regras de negócio](docs/ESPECIFICACAO-FUNCIONAL-E-REGRAS-DE-NEGOCIO.md)
- [Fluxos operacionais do sistema](docs/FLUXOS-OPERACIONAIS-DO-SISTEMA.md)
- [Guia de operação e recuperação](docs/GUIA-DE-OPERACAO-E-RECUPERACAO.md)

## Funcionalidades

- Login local com perfis **administrador** e **operador** (troca obrigatória da senha padrão)
- Licenciamento offline por chave assinada, vinculada ao código da instalação
- Painel com indicadores e alertas de estoque baixo / zerado
- Registo de matérias-primas e produtos finais, categorias, fornecedores, clientes e receitas
- Entrada de matérias-primas por **fatura de compra**, com custo médio ponderado
- Saída de matérias-primas e entrada de produtos finais por **fabrico** (receita / BOM)
- Faturação de saída de produtos finais, baixa de stock e emissão de recibo
- **Ajuste de inventário** manual (saldo absoluto)
- Relatórios com exportação CSV
- Marca da empresa contratante, tema claro/escuro, cópia de segurança e atualizações
- Persistência local SQLite (Electron) ou memória (preview no navegador)

## Modelo de estoque

O cadastro de produto **não** gera estoque. O saldo só muda por:

| Origem | Efeito |
|--------|--------|
| Fatura de entrada | Entrada de **matéria-prima** e atualização do custo médio |
| Fabrico | Saída de matérias-primas da receita + entrada do **produto final** |
| Fatura de saída | Saída de **produto final** |
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
| `npm run manual` | Regenera o PDF do Manual do Utilizador |
| `npm run license:keypair` | Cria uma única vez o par de licenciamento |
| `npm run license:generate -- ...` | Emite uma licença para um cliente/instalação |

> Antes de usar os comandos de licenciamento, defina `CORTEXIS_LICENSE_PRIVATE_KEY` com o caminho absoluto da chave privada armazenada fora deste projeto. A aplicação distribuída contém apenas a chave pública.

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

Para releases corporativos, configure os secrets no GitHub conforme o [Guia de assinatura e notarização](docs/GUIA-DE-ASSINATURA-E-NOTARIZACAO.md):

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
3. Registar categorias, fornecedores e clientes
4. Registar matérias-primas e produtos finais (o saldo começa em zero)
5. Lançar a fatura de entrada para receber matérias-primas
6. Definir a Receita de Fabrico e registar o fabrico
7. Emitir a fatura de saída para vender produtos finais
8. Utilizar ajustes de inventário apenas para correções físicas
9. Acompanhar o painel e exportar relatórios

## Stack

- Electron 42
- React 19 + React Router
- Vite 6
- better-sqlite3-multiple-ciphers (SQLite com criptografia AES-256 compatível com SQLCipher)
- TypeScript 5

## Cópia de segurança e atualizações

- Em **Configurações** (admin): exportar / restaurar o banco SQLite (`.db`).
- Auto-update via GitHub Releases em builds empacotados (`electron-updater`).
- Uma tag `vX.Y.Z` cria um draft com instaladores e metadados `latest*.yml`; a atualização fica disponível aos clientes após publicar o draft.
- No macOS são publicados DMG para instalação manual e ZIP para o mecanismo de atualização automática.
- Em desenvolvimento / modo web, as atualizações aparecem como indisponíveis.

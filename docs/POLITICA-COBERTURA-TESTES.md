# Política de Cobertura de Testes — Controle de Estoque

Documento oficial de requisitos de qualidade para release de produção.

---

## 1. Objetivo

Garantir que o aplicativo desktop Controle de Estoque atenda aos requisitos funcionais e não funcionais com risco controlado, priorizando **regras de negócio de estoque** (integridade de saldo, documentos de fatura/fabricação, imutabilidade de histórico, autenticação).

---

## 2. Metas de cobertura

### 2.1 Testes unitários

| Módulo | Meta mínima | Justificativa |
|--------|-------------|---------------|
| Regras de estoque (`electron/db.ts` + API memória: fatura, fabricação, ajuste, saldo, status) | **≥ 90%** | Core business — falha = perda financeira |
| Validações de cadastro (código, categorias, fornecedores, usuários) | **≥ 80%** | Integridade referencial |
| Formatadores e rótulos (`src/lib/format.ts`, `shared/labels.ts`) | **≥ 80%** | Alta frequência de uso |
| Auth e permissões (troca de senha, admin vs operador) | **≥ 80%** | Controle de acesso |
| Componentes React (UI) | **≥ 60%** | Cobertura via E2E/manual |
| IPC handlers (`electron/main.ts`) | **≥ 70%** | Testados indiretamente via integração |

**Meta global de linhas:** ≥ **75%** nos módulos de negócio (`electron/db.ts`, `src/lib/`, `shared/`).

### 2.2 Testes de integração

| Escopo | Meta | Método |
|--------|------|--------|
| API IPC completa (renderer ↔ main ↔ SQLite) | **100%** dos handlers | better-sqlite3 in-memory ou temp file |
| Transações atômicas (fatura, fabricação, ajuste) | **100%** dos tipos | Unit + integração |
| Seed de demonstração | **1 cenário** completo | Smoke test |
| Exportação CSV | **1 cenário** por tipo de relatório | Manual + smoke |

### 2.3 Testes E2E

| Fluxo | Cobertura | Prioridade |
|-------|-----------|--------------|
| F01 — Login + troca de senha padrão + seed | Obrigatório | Alta |
| F02 — Cadastrar categoria | Obrigatório | Alta |
| F03 — Cadastrar fornecedor | Obrigatório | Alta |
| F04 — Cadastrar produto (saldo 0) | Obrigatório | Alta |
| F05 — Inativar produto | Obrigatório | Alta |
| F06 — Fatura de compra (entrada de insumo) | Obrigatório | Alta |
| F07 — Receita + fabricação | Obrigatório | Alta |
| F08 — Ajuste de inventário | Obrigatório | Alta |
| F09 — Painel | Obrigatório | Alta |
| F10 — Relatório + export CSV | Recomendado | Média |
| F11 — Configurações (backup / updates stub) | Obrigatório | Média |

**Meta E2E:** 100% dos fluxos **Must** de [FLUXOS.md](./FLUXOS.md) cobertos por automação ou checklist manual em build empacotado.

### 2.4 Smoke test automatizado

Script: `scripts/smoke.mts`

**Critério de aprovação:** execução completa com saída `SMOKE_OK`.

```bash
npm run smoke
npm run test:e2e
```

Cenários cobertos pelo smoke (API em memória):
1. Init + login + troca de senha padrão
2. Seed de demonstração
3. Painel com dados
4. Criar produto (saldo 0)
5. Entrada via fatura
6. Ajuste de inventário
7. Relatório de posição
8. Cópia de segurança / status de atualização

---

## 3. Suite de comandos obrigatória (CI)

Todo PR e tag de release **deve** passar:

```bash
npm ci
npm run typecheck
npm test
npm run smoke
npm run test:e2e
npm run build
```

Para release final, adicionalmente:

```bash
npm run electron:build
```

---

## 4. Testes manuais obrigatórios (QA)

Executar em **build empacotado** em cada plataforma alvo:

### 4.1 Critérios de aceite ([REQUISITOS.md](./REQUISITOS.md) §8)

| # | Cenário | Resultado esperado |
|---|---------|-------------------|
| 1 | Login com senha padrão | Força troca antes do uso |
| 2 | Cadastro com código duplicado | Bloqueado, mensagem clara |
| 3 | Produto novo | Saldo 0 |
| 4 | Fatura de insumo | Saldo aumenta; acabado rejeitado na fatura |
| 5 | Fabricação sem saldo | Bloqueada; saldo inalterado |
| 6 | Fabricação válida | Consome insumos e credita acabado |
| 7 | Ajuste | Define saldo absoluto |
| 8 | Operador tenta backup/usuários | Bloqueado (UI + IPC) |
| 9 | Exportação CSV posição | Arquivo UTF-8 válido |
| 10 | App sem internet | Inicia e carrega dados locais |

### 4.2 Testes de resiliência

| Cenário | Resultado esperado |
|---------|-------------------|
| Fechar app durante fatura/fabricação | Saldo consistente (transação revertida ou completada) |
| Banco corrompido (simular) | Mensagem clara de falha |
| 5.000 produtos cadastrados | Lista carrega em < 1s (RNF-04) |
| Reinstalar sobre versão existente | Dados preservados em `{userData}` |

### 4.3 Testes cross-platform

| SO | Versão mínima | Instalador |
|----|---------------|------------|
| Windows | 10/11 x64 | NSIS (.exe) |
| Linux | Ubuntu 22.04+ | AppImage + deb |
| macOS | 13 Ventura+ | dmg |

---

## 5. Testes de performance

| Métrica | Limite | Método |
|---------|--------|--------|
| Startup (cold) | < 5s | Cronômetro em build empacotado |
| Lista 5.000 produtos | < 1s | Script de seed + medição |
| Fatura / fabricação (transação) | < 200ms | Log de timestamp |
| Export CSV 5.000 linhas | < 3s | Cronômetro |

---

## 6. Testes de segurança (QA + AppSec)

| Verificação | Critério |
|-------------|----------|
| DevTools desabilitado em produção | Não abre com F12/Ctrl+Shift+I |
| IPC surface | Apenas handlers do preload; admin-only nas rotas sensíveis |
| Senha padrão | Não permite permanecer em `admin123` |
| npm audit | Zero High/Critical |
| Links externos | Abrem no browser, não na janela Electron |

---

## 7. Relatório de qualidade (template)

```markdown
## Relatório de Qualidade — vX.Y.Z

**Data:** YYYY-MM-DD
**Responsável QA:** _______________

### Automatizado
- [ ] typecheck: PASS / FAIL
- [ ] unit tests: ___/___ passed
- [ ] smoke test: PASS / FAIL
- [ ] e2e: PASS / FAIL

### Manual
- [ ] Critérios de aceite (§8): PASS / FAIL
- [ ] Fluxos Must (FLUXOS.md): PASS / FAIL
- [ ] Cross-platform: PASS / FAIL
- [ ] Resiliência: PASS / FAIL
- [ ] Performance: PASS / FAIL

### Bloqueadores abertos
| ID | Descrição | Severidade | Status |
|----|-----------|------------|--------|
|    |           |            |        |

### Recomendação
- [ ] GO — Aprovado para produção
- [ ] NO-GO — Bloqueadores pendentes
```

---

## 8. Exceções

Exceções à meta de cobertura requerem:
1. Justificativa escrita do Tech Lead
2. Plano de mitigação (teste manual, monitoramento)
3. Aprovação do QA Lead
4. Registro no relatório de qualidade

---

## 9. Evolução

| Versão | Meta adicional |
|--------|----------------|
| Atual | Playwright E2E cobrindo login, seed, cadastros, fatura, receita, fabricação, ajuste e configurações; integração SQLite para atomicidade |
| Próxima | E2E com Electron empacotado nas três plataformas |
| +1 | Testes de auto-update (`electron-updater`) |
| Futuro | Cobertura ≥ 85% global + carga com 50.000 produtos |

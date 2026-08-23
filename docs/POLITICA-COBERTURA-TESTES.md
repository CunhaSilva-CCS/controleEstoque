# Política de Cobertura de Testes — Controle de Estoque v1.0.0

Documento oficial de requisitos de qualidade para release de produção.

---

## 1. Objetivo

Garantir que o aplicativo desktop Controle de Estoque atenda aos requisitos funcionais e não funcionais com risco controlado, priorizando **regras de negócio de estoque** (integridade de saldo, imutabilidade de histórico, validações).

---

## 2. Metas de cobertura

### 2.1 Testes unitários

| Módulo | Meta mínima | Justificativa |
|--------|-------------|---------------|
| Regras de estoque (`electron/db.ts`: movimentações, saldo, status) | **≥ 90%** | Core business — falha = perda financeira |
| Validações de cadastro (SKU, categorias, fornecedores) | **≥ 80%** | Integridade referencial |
| Formatadores e utilitários (`src/lib/format.ts`) | **≥ 80%** | Baixo risco, alta frequência de uso |
| Componentes React (UI) | **≥ 60%** | Cobertura via E2E/manual na v1 |
| IPC handlers (`electron/main.ts`) | **≥ 70%** | Testados indiretamente via integração |

**Meta global de linhas (v1.0.0):** ≥ **75%** nos módulos de negócio (`electron/db.ts`, `src/lib/`).

### 2.2 Testes de integração

| Escopo | Meta | Método |
|--------|------|--------|
| API IPC completa (renderer ↔ main ↔ SQLite) | **100%** dos handlers | Testes com better-sqlite3 in-memory ou temp file |
| Transações atômicas (movimento + saldo) | **100%** dos tipos (entrada, saída, ajuste) | Unit + integração |
| Seed de demonstração | **1 cenário** completo | Smoke test |
| Exportação CSV | **1 cenário** por tipo de relatório | Manual + smoke |

### 2.3 Testes E2E

| Fluxo | Cobertura | Prioridade |
|-------|-----------|--------------|
| F01 — Inicialização + seed | Obrigatório | Alta |
| F04 — Cadastrar produto (com/sem estoque inicial) | Obrigatório | Alta |
| F06 — Entrada de estoque | Obrigatório | Alta |
| F07 — Saída (incluindo bloqueio por saldo) | Obrigatório | Alta |
| F08 — Ajuste de estoque | Obrigatório | Alta |
| F10 — Dashboard (indicadores corretos) | Obrigatório | Alta |
| F11 — Relatório + export CSV | Obrigatório | Alta |
| F02, F03, F05, F09 | Recomendado | Média |

**Meta E2E:** 100% dos fluxos **Must** de [FLUXOS.md](./FLUXOS.md).

### 2.4 Smoke test automatizado

Script existente: `scripts/smoke.mts`

**Critério de aprovação:** execução completa com saída `SMOKE_OK`.

```bash
npx tsx scripts/smoke.mts
```

Cenários cobertos:
1. Init + seed
2. Dashboard com dados
3. Criar produto com estoque inicial
4. Saída bloqueada (saldo insuficiente)
5. Entrada válida
6. Relatório de posição

---

## 3. Suite de comandos obrigatória (CI)

Todo PR e tag de release **deve** passar:

```bash
npm ci
npm run typecheck    # TypeScript strict — zero erros
npm test             # Vitest — zero falhas
npx tsx scripts/smoke.mts  # Smoke — SMOKE_OK
npm run build        # Build renderer + main — zero erros
```

Para release final, adicionalmente:

```bash
npm run electron:build   # Artefatos em release/ — zero erros
```

---

## 4. Testes manuais obrigatórios (QA)

Executar em **build empacotado** (não em dev server) em cada plataforma alvo:

### 4.1 Critérios de aceite (REQUISITOS.md §8)

| # | Cenário | Resultado esperado |
|---|---------|-------------------|
| 1 | Cadastro com SKU duplicado | Bloqueado, mensagem clara |
| 2 | Saída acima do saldo | Bloqueada, saldo inalterado |
| 3 | Movimentação → dashboard | Saldo refletido imediatamente |
| 4 | Produto inativo | Ausente do seletor de movimentações |
| 5 | Exportação CSV posição | Arquivo UTF-8 válido, abre no Excel/LibreOffice |
| 6 | App sem internet | Inicia e carrega dados locais |

### 4.2 Testes de resiliência

| Cenário | Resultado esperado |
|---------|-------------------|
| Fechar app durante movimentação | Saldo consistente (transação revertida ou completada) |
| Banco corrompido (simular) | Mensagem "Não foi possível abrir o banco de dados" |
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
| Movimentação (transação) | < 200ms | Log de timestamp |
| Export CSV 5.000 linhas | < 3s | Cronômetro |

---

## 6. Testes de segurança (QA + AppSec)

| Verificação | Critério |
|-------------|----------|
| DevTools desabilitado em produção | Não abre com F12/Ctrl+Shift+I |
| IPC surface | Apenas handlers documentados no preload |
| npm audit | Zero High/Critical |
| Links externos | Abrem no browser, não na janela Electron |

---

## 7. Relatório de qualidade (template)

Preencher antes do go/no-go:

```markdown
## Relatório de Qualidade — v1.0.0

**Data:** YYYY-MM-DD
**Responsável QA:** _______________

### Automatizado
- [ ] typecheck: PASS / FAIL
- [ ] unit tests: ___/___ passed (coverage: ___%)
- [ ] smoke test: PASS / FAIL

### Manual
- [ ] Critérios de aceite (6/6): PASS / FAIL
- [ ] Fluxos E2E Must (8/8): PASS / FAIL
- [ ] Cross-platform (3/3): PASS / FAIL
- [ ] Resiliência (4/4): PASS / FAIL
- [ ] Performance (4/4): PASS / FAIL

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

## 9. Evolução pós-v1

| Versão | Meta adicional |
|--------|----------------|
| v1.1 | Playwright E2E automatizado com Electron |
| v1.1 | Testes de backup/restore do SQLite |
| v1.2 | Testes de auto-update (electron-updater) |
| v2.0 | Cobertura ≥ 85% global + testes de carga com 50.000 produtos |

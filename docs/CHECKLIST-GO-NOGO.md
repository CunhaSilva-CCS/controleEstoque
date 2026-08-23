# Checklist Go/No-Go — Release v1.0.0

Checklist de aprovação final antes da publicação do Controle de Estoque em produção.

---

## Informações da release

| Campo | Valor |
|-------|-------|
| **Versão** | 1.0.0 |
| **Tag Git** | v1.0.0 |
| **Data prevista** | _______________ |
| **Responsável release** | _______________ |

---

## Matriz RACI

| Atividade | Gestão | Produto | Engenharia | QA | AppSec | DevOps | Jurídico |
|-----------|--------|---------|------------|----|--------|--------|----------|
| Go/no-go final | A | C | R | R | R | R | C |
| Publicar release | I | C | C | I | I | R | I |
| Comunicação lançamento | R | R | I | I | I | C | I |
| Suporte pós-lançamento | A | R | R | R | I | R | I |

*R = Responsável, A = Aprovador, C = Consultado, I = Informado*

---

## 1. Engenharia

| # | Critério | Prioridade | Status | Responsável | Data |
|---|----------|------------|--------|-------------|------|
| E01 | Code review 100% dos PRs da release concluído | Alta | ☐ | | |
| E02 | Tag `v1.0.0` criada no repositório | Alta | ☐ | | |
| E03 | Build reproduzível (`npm ci && npm run build`) | Alta | ☐ | | |
| E04 | Zero secrets/credenciais no repositório | Alta | ☐ | | |
| E05 | Hardening Electron validado (contextIsolation, nodeIntegration) | Alta | ☐ | | |
| E06 | Transações atômicas em movimentações verificadas | Alta | ☐ | | |
| E07 | Performance 5.000 produtos < 1s validada | Média | ☐ | | |
| E08 | ADRs documentados | Baixa | ☐ | | |

**Aprovador Engenharia:** _______________ **Assinatura/Data:** _______________

---

## 2. Qualidade (QA)

| # | Critério | Prioridade | Status | Responsável | Data |
|---|----------|------------|--------|-------------|------|
| Q01 | `npm test` — zero falhas | Alta | ☐ | | |
| Q02 | `npm run typecheck` — zero erros | Alta | ☐ | | |
| Q03 | Smoke test (`SMOKE_OK`) | Alta | ☐ | | |
| Q04 | Critérios de aceite REQUISITOS §8 (6/6) | Alta | ☐ | | |
| Q05 | Fluxos E2E Must FLUXOS F01–F11 | Alta | ☐ | | |
| Q06 | Testes em build empacotado (não dev) | Alta | ☐ | | |
| Q07 | Cross-platform: Windows + Linux + macOS | Alta | ☐ | | |
| Q08 | Testes de resiliência (crash, banco corrompido) | Média | ☐ | | |
| Q09 | Relatório de qualidade preenchido | Alta | ☐ | | |

**Aprovador QA:** _______________ **Assinatura/Data:** _______________

---

## 3. Segurança (AppSec)

| # | Critério | Prioridade | Status | Responsável | Data |
|---|----------|------------|--------|-------------|------|
| S01 | `npm audit` — zero High/Critical | Alta | ☐ | | |
| S02 | Varredura de dependências nativas (Trivy/Grype) | Alta | ☐ | | |
| S03 | Code signing configurado (win/mac) — ver [CODE-SIGNING.md](./CODE-SIGNING.md) | Alta | ☐ | | |
| S04 | macOS notarização aprovada (secrets Apple) | Alta | ☐ | | |
| S05 | IPC surface mínima (preload auditado) | Alta | ☐ | | |
| S06 | DevTools desabilitado em produção | Média | ☐ | | |
| S07 | CSP configurado no renderer | Média | ☐ | | |

**Aprovador AppSec:** _______________ **Assinatura/Data:** _______________

---

## 4. Jurídico / Dados (DPO)

| # | Critério | Prioridade | Status | Responsável | Data |
|---|----------|------------|--------|-------------|------|
| J01 | Política de Privacidade publicada | Alta | ☐ | | |
| J02 | Termos de Uso publicados | Alta | ☐ | | |
| J03 | Fluxo de dados pessoais mapeado (fornecedores) | Alta | ☐ | | |
| J04 | Orientação de backup/responsabilidade do operador | Alta | ☐ | | |
| J05 | Base legal LGPD documentada | Média | ☐ | | |

**Aprovador Jurídico/DPO:** _______________ **Assinatura/Data:** _______________

---

## 5. Infraestrutura / DevOps

| # | Critério | Prioridade | Status | Responsável | Data |
|---|----------|------------|--------|-------------|------|
| I01 | CI/CD pipeline verde na tag v1.0.0 | Alta | ☐ | | |
| I02 | Artefatos gerados: win + linux + mac | Alta | ☐ | | |
| I03 | Instaladores assinados e testados | Alta | ☐ | | |
| I04 | Versão N-1 disponível para rollback | Alta | ☐ | | |
| I05 | Dry-run: instalação limpa → smoke test | Alta | ☐ | | |
| I06 | Documentação de backup SQLite publicada | Média | ☐ | | |
| I07 | Crash reporting (Sentry) — `SENTRY_DSN` configurado | Alta | ☐ | | |

**Aprovador DevOps:** _______________ **Assinatura/Data:** _______________

---

## 6. Produto (PO / PM)

| # | Critério | Prioridade | Status | Responsável | Data |
|---|----------|------------|--------|-------------|------|
| P01 | UAT aprovado por operadores reais | Alta | ☐ | | |
| P02 | Release notes publicadas | Alta | ☐ | | |
| P03 | FAQ de suporte pronto | Alta | ☐ | | |
| P04 | Escopo v1 congelado (sem features extras) | Alta | ☐ | | |
| P05 | Guia de primeiro uso disponível | Média | ☐ | | |
| P06 | Canal de feedback configurado | Média | ☐ | | |

**Aprovador Produto:** _______________ **Assinatura/Data:** _______________

---

## 7. Gestão

| # | Critério | Prioridade | Status | Responsável | Data |
|---|----------|------------|--------|-------------|------|
| G01 | Janela de release confirmada | Alta | ☐ | | |
| G02 | On-call definido (72h pós-lançamento) | Alta | ☐ | | |
| G03 | Comunicação interna enviada | Alta | ☐ | | |
| G04 | Plano de rollback documentado | Alta | ☐ | | |
| G05 | Suporte reforçado ativado | Média | ☐ | | |

**Aprovador Gestão:** _______________ **Assinatura/Data:** _______________

---

## Decisão final

### Contagem de bloqueadores

| Área | Itens Alta pendentes | Bloqueador? |
|------|---------------------|-------------|
| Engenharia | ___/6 | ☐ Sim ☐ Não |
| Qualidade | ___/7 | ☐ Sim ☐ Não |
| Segurança | ___/5 | ☐ Sim ☐ Não |
| Jurídico | ___/4 | ☐ Sim ☐ Não |
| DevOps | ___/5 | ☐ Sim ☐ Não |
| Produto | ___/4 | ☐ Sim ☐ Não |
| Gestão | ___/4 | ☐ Sim ☐ Não |

### Resultado

- [ ] **GO** — Todos os itens **Alta** aprovados. Autorizado publicar v1.0.0.
- [ ] **NO-GO** — Bloqueadores pendentes. Nova data: _______________

**Decisão por:** _______________
**Data/hora:** _______________

### Bloqueadores (se NO-GO)

| ID | Descrição | Área | Responsável | Prazo |
|----|-----------|------|-------------|-------|
| | | | | |
| | | | | |

---

## Pós-go-live (primeiras 72h)

| Horas | Ação | Responsável | Status |
|-------|------|-------------|--------|
| 0–4 | War room — monitorar crashes e feedback | DevOps + Eng | ☐ |
| 0–4 | Smoke test em produção (3 plataformas) | QA | ☐ |
| 4–24 | Revisar crash reports (Sentry) | Eng | ☐ |
| 24–48 | Checkpoint com suporte (tickets abertos) | Produto | ☐ |
| 48–72 | Relatório de estabilidade D+3 | Gestão | ☐ |

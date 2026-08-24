# Relatório de Prontidão — v1.0.0

**Data da avaliação:** 2026-08-24  
**Estado:** **NO-GO administrativo** até concluir os gates externos abaixo.

## Evidências automatizadas

| Controle | Resultado |
|----------|-----------|
| Testes unitários/API em memória | PASS — 12 testes |
| Integração SQLite | Implementada — 3 cenários; requer ABI Node compatível no runner |
| E2E Chromium | PASS — 6 testes, incluindo receita e fabricação completas |
| TypeScript | PASS |
| Build renderer/main/preload | PASS |
| Smoke test | PASS (`SMOKE_OK`) |
| Auditoria npm High/Critical | PASS — zero High/Critical |
| Auditoria npm Moderate | 17 achados transitivos via Sentry/OpenTelemetry; avaliar upgrade isolado |
| SAST | CodeQL configurado; resultado depende da execução no GitHub |
| SBOM | Geração CycloneDX configurada no CI e na release |
| Checksums | SHA-256 configurado na publicação da release |

## Controles implementados nesta preparação

- Validação integral da fatura antes de qualquer movimento no modo web.
- Bloqueio de custo negativo, item repetido e fatura duplicada no modo web.
- Validações de receita e fabricação alinhadas entre web e SQLite.
- Teste E2E de produto final, receita, consumo de insumo e produção.
- Testes SQLite de rollback de fatura, fabricação válida e saldo insuficiente.
- Senhas SQLite protegidas com `scrypt`, salt aleatório e comparação constante.
- Migração transparente do hash SHA-256 legado após login válido.
- Dependabot para npm e GitHub Actions.
- CodeQL semanal e em pull requests.
- Retenção de evidências de QA no CI.

## Bloqueadores externos para GO

| ID | Bloqueador | Responsável esperado |
|----|-----------|----------------------|
| EXT-01 | Code review e aprovação formal da release | Tech Lead |
| EXT-02 | UAT e aceite das histórias por operadores reais | PO + QA |
| EXT-03 | Teste dos instaladores em Windows, macOS e Linux | QA + DevOps |
| EXT-04 | Certificados de assinatura Windows/macOS e notarização | DevOps/AppSec |
| EXT-05 | Configuração e teste do projeto Sentry de produção | SRE |
| EXT-06 | Aprovação jurídica da política de privacidade e termos | Jurídico/DPO |
| EXT-07 | Definição de janela, on-call e canal de suporte | Gestão |
| EXT-08 | Dry-run de instalação, atualização e rollback N-1 | QA + DevOps |

## Decisão

Não publicar automaticamente enquanto qualquer bloqueador `EXT-*` permanecer sem evidência e assinatura no [Checklist Go/No-Go](./CHECKLIST-GO-NOGO.md).


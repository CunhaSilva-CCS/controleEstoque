# Runbook de Operação — Controle de Estoque

Procedimentos operacionais para suporte, troubleshooting e manutenção do aplicativo desktop.

---

## 1. Visão geral do sistema

```
┌─────────────────────────────────────────────┐
│  Electron Main Process (Node.js)            │
│  ├── electron/main.ts    (IPC handlers)     │
│  ├── electron/db.ts      (SQLite + regras)  │
│  └── electron/preload.ts (bridge seguro)    │
├─────────────────────────────────────────────┤
│  Renderer (React + Vite)                    │
│  └── src/                (UI + pages)        │
├─────────────────────────────────────────────┤
│  Persistência                               │
│  └── {userData}/data/estoque.db (SQLite)    │
└─────────────────────────────────────────────┘
```

### Caminhos importantes

| Item | Caminho |
|------|---------|
| Banco de dados | `{userData}/data/estoque.db` |
| WAL file | `{userData}/data/estoque.db-wal` |
| SHM file | `{userData}/data/estoque.db-shm` |
| userData (Windows) | `%APPDATA%/controle-estoque/` |
| userData (Linux) | `~/.config/controle-estoque/` |
| userData (macOS) | `~/Library/Application Support/controle-estoque/` |
| Artefatos de build | `release/` (no repositório) |

---

## 2. Procedimentos de release

### 2.1 Build local

```bash
npm ci
npm run typecheck
npm test
npx tsx scripts/smoke.mts
npm run build
npm run electron:build
```

Artefatos gerados em `release/`:
- Windows: `Controle de Estoque Setup X.X.X.exe`
- Linux: `Controle de Estoque-X.X.X.AppImage`, `.deb`
- macOS: `Controle de Estoque-X.X.X.dmg`

### 2.2 Publicar release

1. Garantir checklist [CHECKLIST-GO-NOGO.md](./CHECKLIST-GO-NOGO.md) aprovado
2. Criar tag: `git tag -a v1.0.0 -m "Release v1.0.0"`
3. Push tag: `git push origin v1.0.0`
4. CI gera artefatos assinados
5. Publicar no GitHub Releases (ou canal interno)
6. Executar smoke test pós-publicação

### 2.3 Rollback

1. Identificar versão estável anterior (N-1)
2. Remover/ocultar release problemática do canal de download
3. Redistribuir instalador N-1
4. Comunicar usuários afetados
5. Abrir incidente e investigar root cause

> **Nota:** Dados do usuário em `{userData}` são preservados entre versões. Rollback de app não afeta o banco SQLite.

---

## 3. Backup e recuperação de dados

### 3.1 Backup manual (operador)

**Procedimento para o usuário final:**

1. Fechar o aplicativo completamente
2. Navegar até o diretório `{userData}/data/`
3. Copiar os 3 arquivos:
   - `estoque.db`
   - `estoque.db-wal` (se existir)
   - `estoque.db-shm` (se existir)
4. Salvar em local seguro (pendrive, nuvem pessoal, NAS)

**Frequência recomendada:** diária (operações críticas) ou semanal.

### 3.2 Restaurar backup

1. Fechar o aplicativo
2. Substituir arquivos em `{userData}/data/` pelos do backup
3. Abrir o aplicativo
4. Validar dashboard e saldos

### 3.3 Backup programático (suporte avançado)

```bash
# Linux/macOS — identificar userData
ls ~/.config/controle-estoque/data/    # Linux
ls ~/Library/Application\ Support/controle-estoque/data/  # macOS

# Backup com sqlite3 (opcional — export SQL)
sqlite3 estoque.db ".backup backup_$(date +%Y%m%d).db"
```

---

## 4. Troubleshooting

### 4.1 App não inicia

| Sintoma | Causa provável | Ação |
|---------|---------------|------|
| Janela não abre, sem erro | Antivírus bloqueou | Verificar quarentena; adicionar exceção |
| "Não foi possível abrir o banco de dados" | DB corrompido ou sem permissão | Restaurar backup; verificar permissões do diretório |
| Tela branca | Build corrompido ou cache | Reinstalar; limpar `{userData}` (⚠️ perde dados) |
| Crash imediato (macOS) | App não notarizado | Verificar certificado; reinstalar versão assinada |

**Logs:** verificar console do main process (se logging habilitado) ou crash reports no Sentry.

### 4.2 Saldo inconsistente

| Sintoma | Causa provável | Ação |
|---------|---------------|------|
| Saldo diferente do esperado | Movimentação parcial (crash mid-transaction) | Verificar histórico de movimentações; executar ajuste |
| Saldo negativo (impossível por design) | Bug ou corrupção | Restaurar backup; reportar bug |
| Dashboard desatualizado | Cache de UI | Recarregar página (Ctrl+R) ou reiniciar app |

**Verificação de integridade:**

```sql
-- Executar via sqlite3 CLI
SELECT p.sku, p.stock AS saldo_atual,
       (SELECT new_stock FROM stock_movements
        WHERE product_id = p.id
        ORDER BY created_at DESC LIMIT 1) AS ultimo_movimento
FROM products p WHERE p.active = 1;
```

Se `saldo_atual ≠ ultimo_movimento` → inconsistência detectada → ajuste manual necessário.

### 4.3 Exportação CSV falha

| Sintoma | Ação |
|---------|------|
| Diálogo não abre | Verificar permissões de escrita no diretório destino |
| Arquivo vazio | Verificar se há dados no relatório selecionado |
| Caracteres estranhos no Excel | Arquivo usa UTF-8 BOM (`\uFEFF`); abrir via "Importar dados" no Excel |
| Separador errado | CSV usa `;` (padrão BR); configurar Excel para ponto-e-vírgula |

### 4.4 Performance degradada

| Sintoma | Limite (RNF-04) | Ação |
|---------|-----------------|------|
| Lista de produtos lenta | > 1s com 5.000 itens | Verificar índices; considerar paginação (v1.1) |
| Startup lento | > 5s | Verificar tamanho do DB; limpar WAL (`PRAGMA wal_checkpoint`) |
| Movimentação lenta | > 200ms | Verificar locks no DB; fechar outros apps acessando o arquivo |

---

## 5. Monitoramento

### 5.1 Métricas chave (SLOs)

| Métrica | SLO | Alerta |
|---------|-----|--------|
| Crash rate | < 1% sessões | > 1% nas primeiras 72h |
| Startup time p95 | < 5s | > 8s |
| DB open failure | 0% | Qualquer ocorrência |
| Build CI failure | 0% na tag release | Qualquer falha |

### 5.2 Crash reporting (Sentry)

Configurar no `electron/main.ts` (evolução):

```typescript
// Exemplo — não implementado na v1
import * as Sentry from '@sentry/electron'
Sentry.init({ dsn: '...' })
```

**Dashboard:** monitorar diariamente nas primeiras 72h pós-release.

### 5.3 Logs

| Nível | Quando | Onde |
|-------|--------|------|
| ERROR | Falha ao abrir DB, crash IPC, transação falhou | Console main + Sentry |
| WARN | Tentativa de operação inválida (SKU dup, saldo insuf.) | Console main |
| INFO | Startup, seed, export CSV | Console main |
| DEBUG | Queries, payloads IPC | Apenas em dev |

---

## 6. Incidentes

### 6.1 Classificação

| Severidade | Descrição | SLA resposta | Exemplo |
|------------|-----------|--------------|---------|
| **P1 — Crítico** | Perda de dados, app inutilizável | 1h | DB corrompido em massa |
| **P2 — Alto** | Funcionalidade core indisponível | 4h | Movimentações falhando |
| **P3 — Médio** | Funcionalidade secundária afetada | 24h | Export CSV com encoding errado |
| **P4 — Baixo** | Cosmético, workaround existe | 72h | Label de status incorreto |

### 6.2 Procedimento de incidente P1

1. **Detectar** — crash report, ticket de suporte, monitoramento
2. **Conter** — comunicar usuários; orientar backup imediato
3. **Diagnosticar** — reproduzir; verificar logs/Sentry
4. **Resolver** — hotfix ou rollback para N-1
5. **Recuperar** — orientar restauração de backup se necessário
6. **Post-mortem** — documentar causa raiz em 48h

### 6.3 Template de post-mortem

```markdown
## Post-Mortem — [Título]

**Data do incidente:** YYYY-MM-DD
**Severidade:** P1/P2/P3/P4
**Duração:** Xh
**Impacto:** N usuários afetados

### Timeline
- HH:MM — Detecção
- HH:MM — Contenção
- HH:MM — Resolução

### Causa raiz


### Ação corretiva


### Ação preventiva

```

---

## 7. Manutenção periódica

| Frequência | Ação | Responsável |
|------------|------|-------------|
| A cada release | Atualizar dependências (`npm audit`) | Engenharia |
| Mensal | Revisar crash reports acumulados | SRE |
| Trimestral | Testar backup/restore end-to-end | QA |
| Anual | Renovar certificados de code signing | DevOps |
| Anual | Revisar Política de Privacidade | Jurídico |

---

## 8. Contatos de escalonamento

| Papel | Nome | Contato | Disponibilidade |
|-------|------|---------|-----------------|
| Tech Lead | __________ | __________ | Horário comercial |
| DevOps On-call | __________ | __________ | 72h pós-release |
| QA Lead | __________ | __________ | Horário comercial |
| PO | __________ | __________ | Horário comercial |
| AppSec | __________ | __________ | Sob demanda |

---

## 9. Referências

- [PLANO-PRODUCAO.md](./PLANO-PRODUCAO.md)
- [POLITICA-COBERTURA-TESTES.md](./POLITICA-COBERTURA-TESTES.md)
- [CHECKLIST-GO-NOGO.md](./CHECKLIST-GO-NOGO.md)
- [REQUISITOS.md](./REQUISITOS.md)
- [FLUXOS.md](./FLUXOS.md)

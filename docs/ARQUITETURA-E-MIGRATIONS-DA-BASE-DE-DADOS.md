# Arquitetura e migrations da base de dados

## Objetivo

A camada de dados deixa de depender de um único ficheiro monolítico. `electron/db.ts` mantém-se como fachada compatível com o IPC existente, enquanto ligação, evolução do esquema, consultas por domínio e regras transversais ficam isoladas em módulos testáveis.

## Organização

```text
electron/database/
├── connection.ts
├── audit.ts
├── types.ts
├── migrations/
│   ├── 001-initial-schema.ts
│   ├── 002-add-purchases-and-production.ts
│   ├── 003-add-customers-and-sales.ts
│   ├── 004-add-cost-snapshots.ts
│   ├── 005-secure-password-history.ts
│   ├── 006-operation-governance.ts
│   ├── 007-physical-inventory.ts
│   ├── 008-units-and-lots.ts
│   └── index.ts
├── repositories/
│   ├── products.ts
│   ├── purchases.ts
│   ├── sales.ts
│   ├── production.ts
│   └── users.ts
└── services/
    ├── stock-service.ts
    ├── costing-service.ts
    ├── backup-service.ts
    └── password-service.ts
    ├── reversal-service.ts
    ├── inventory-service.ts
    ├── unit-service.ts
    ├── lot-service.ts
    ├── diagnostics-service.ts
    └── movement-query-service.ts
```

Os `repositories` concentram acesso e mapeamento de dados. Os `services` concentram regras que atravessam entidades ou exigem transações. `connection.ts` gere o ciclo de vida da ligação e a configuração SQLCipher. `audit.ts` centraliza o registo de ações relevantes.

## Processo de migration

Ao abrir uma base, o sistema:

1. Cria, se necessário, a tabela `schema_migrations`.
2. Compara as versões registadas com a lista de migrations no código.
3. Executa um checkpoint do WAL e cria `<base>.pre-migration`.
4. Aplica cada versão pendente numa transação própria.
5. Regista versão, nome e data dentro da mesma transação.
6. Executa `PRAGMA integrity_check` após a última versão.
7. Elimina a cópia temporária apenas depois da validação.

Se uma etapa falhar, a transação atual é revertida, a ligação é fechada, a cópia anterior é restaurada e a integridade da base restaurada é validada. O arranque é interrompido para impedir operações com um esquema incompleto.

## Regras para novas versões

- Nunca alterar uma migration já distribuída.
- Criar o próximo ficheiro numerado e adicioná-lo a `migrations/index.ts`.
- Tornar a operação repetível quando possível (`IF NOT EXISTS` ou teste de coluna).
- Evitar operações destrutivas. Quando indispensáveis, copiar dados para uma tabela nova e validar as contagens antes da troca.
- Não executar regras de negócio fora da transação da migration.
- Acrescentar testes de atualização, integridade e rollback.
- Testar uma cópia anonimizada da base de produção antes da publicação.

## Compatibilidade

`electron/db.ts` continua a expor as funções usadas pelo processo principal. A reorganização não altera o contrato do preload nem exige mudanças nas telas. Novos domínios devem nascer diretamente na estrutura modular, mantendo a fachada apenas como ponto de entrada para o IPC.

## Estado atual do esquema

As migrations `006` a `008` introduzem, respetivamente, estados e auditoria de operações com estorno, sessões de inventário físico e a estrutura de unidades/conversões/lotes. A base em produção é atualizada automaticamente no arranque, com cópia pré-migration e verificação de integridade. Não editar migrations já distribuídas; toda evolução inicia a próxima versão numerada.

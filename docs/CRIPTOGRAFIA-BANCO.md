# Criptografia do banco de dados

## Implementação

- Driver: `better-sqlite3-multiple-ciphers`.
- Modo: compatibilidade SQLCipher (`cipher=sqlcipher`, `legacy=4`).
- Chave: 32 bytes aleatórios (256 bits), nunca fixos no código.
- Proteção da chave: `safeStorage` do Electron; no Windows, o armazenamento usa DPAPI.
- Arquivo protegido: `data/estoque.key`, gravado com permissão restrita quando o sistema
  operacional oferece permissões POSIX.

## Migração automática

Ao encontrar um banco SQLite sem criptografia, o aplicativo:

1. verifica a integridade e consolida o WAL;
2. cria uma cópia temporária;
3. criptografa a cópia e verifica a abertura com a chave;
4. troca os arquivos de forma atômica;
5. remove a cópia em texto simples somente depois da validação;
6. restaura o original automaticamente se a troca falhar.

## Backup e restauração

Novos backups preservam a criptografia. Backups antigos em SQLite puro continuam sendo
aceitos e são criptografados durante a restauração. Arquivos inválidos ou bancos de
outro sistema são rejeitados antes de substituir os dados ativos.

## Recuperação

A proteção DPAPI vincula a chave ao usuário do Windows. Por isso, um backup criptografado
não é portátil sozinho para outro computador. Antes da distribuição corporativa deve ser
adicionada uma chave de recuperação exportável, protegida por senha administrativa e
armazenada separadamente do backup.

Nunca copie uma chave sem proteção, nunca a inclua no instalador e nunca a envie para o
repositório de código.

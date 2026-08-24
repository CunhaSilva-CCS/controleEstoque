# Relatório de segurança — 24/08/2026

## Escopo

Aplicativo local Electron, interface React, ponte IPC, autenticação/autorização, SQLite,
backup/restauração, dependências e empacotamento. Os testes foram não destrutivos e
restritos ao projeto e ao ambiente local autorizado.

## Resultados e correções

- Dependências: a auditoria inicial encontrou 17 vulnerabilidades moderadas de produção
  e 19 nas ferramentas (2 críticas, 14 altas e 3 moderadas). Sentry, Electron,
  electron-builder, Vitest e better-sqlite3 foram atualizados. Resultado final:
  **0 vulnerabilidades conhecidas no `npm audit`**.
- Isolamento Electron: ativado `sandbox`, mantendo `contextIsolation` e
  `nodeIntegration: false`.
- Navegação: bloqueada qualquer navegação fora da origem/página do aplicativo.
- Links externos: permitidos somente protocolos HTTP e HTTPS.
- Permissões Chromium: solicitações de câmera, microfone, localização e demais
  permissões são negadas por padrão.
- Força bruta: após cinco falhas de login em um minuto, novas tentativas ficam
  bloqueadas por 30 segundos.
- SQL injection: consultas usam parâmetros preparados; payloads de bypass de login
  foram adicionados à suíte de integração e rejeitados.
- Backup malicioso: antes de substituir o banco, o arquivo passa por abertura somente
  leitura, `integrity_check` e validação das tabelas obrigatórias. Um arquivo inválido
  foi rejeitado sem fechar ou alterar o banco ativo.
- Segredos: nenhum token, chave privada ou credencial real foi encontrado no código.
  A senha inicial `admin123` continua existindo somente para primeiro acesso e exige
  troca obrigatória.
- XSS: não há uso de `dangerouslySetInnerHTML`, `innerHTML`, `eval` ou `new Function`.
  A interface usa escape padrão do React e CSP.
- Autorização: operações administrativas de usuários, marca, backup, restauração e
  atualização são verificadas no processo principal, não apenas na interface.

## Evidências de validação

- 17/17 testes unitários e de integração aprovados.
- 7/7 fluxos E2E aprovados.
- TypeScript aprovado.
- Build de produção aprovado.
- `npm audit`: 0 vulnerabilidades.

## Riscos residuais e limites

- O banco local e os novos backups usam criptografia AES-256 compatível com SQLCipher.
  A chave aleatória de 256 bits é protegida pelo cofre do sistema operacional
  (`safeStorage`; DPAPI no Windows). A restauração em outro usuário/computador ainda
  exige um mecanismo de chave de recuperação portátil.
- O instalador não possui assinatura digital; deve ser assinado antes de distribuição
  corporativa.
- Não foram realizados fuzzing prolongado, engenharia reversa do binário, teste em AD,
  análise de rede corporativa ou ataque físico ao computador.
- Um pentest independente continua recomendado antes de tratar o produto como sistema
  de alta criticidade ou expô-lo à internet.

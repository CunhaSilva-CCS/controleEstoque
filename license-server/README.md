# Cortexis License Server

Serviço mínimo para revogação remota de licenças do ERP Cortexis Tech.

## Interface web

Acesse a URL raiz do serviço (ex: `https://cortexis-license-api-production.up.railway.app/`)
para abrir o painel de gestão. Cole o `ADMIN_TOKEN` e clique em "Guardar e validar" (o
token é testado contra `/auth/check` e só fica guardado no `localStorage` do navegador
se for válido). O painel permite:

- Verificar o status de uma licença específica sem precisar de token (rota pública);
- Revogar uma licença informando `licenseId`, cliente (opcional) e motivo (opcional);
- Listar, filtrar (por licenseId/cliente/motivo) e reverter revogações existentes;
- Confirmação antes de revogar/reverter, para evitar cliques acidentais.
- Registo de licenças emitidas offline (seção "Licenças emitidas"): consulta o histórico
  e permite registar manualmente uma emissão feita via `npm run license:generate`. Nunca
  guarda a chave nem a chave privada — só `licenseId`, `installationId`, cliente, edição
  e validade, para você acompanhar tudo num único lugar sem abrir mão da emissão offline.

## Registo automático ao emitir localmente

O script `npm run license:generate` pode registar a emissão automaticamente neste painel.
Defina, no seu ambiente local (nunca no repositório):

```bash
export CORTEXIS_LICENSE_ADMIN_TOKEN="<mesmo ADMIN_TOKEN do serviço>"
```

Com essa variável definida, cada `npm run license:generate` envia um `POST /licenses/issued`
com os metadados da licença (sem a chave) automaticamente. Sem ela, a geração continua
funcionando normalmente — só não fica registada no painel.

## Rotas

- `GET /health` — verificação de saúde.
- `GET /auth/check` — protegida, usada pela interface para validar o token colado.
- `GET /licenses/:licenseId/status` — pública, devolve `{ revoked: boolean, revokedAt?, reason?, customer? }`.
- `GET /licenses` — protegida por `Authorization: Bearer <ADMIN_TOKEN>`, lista todas as revogações.
- `POST /licenses/:licenseId/revoke` — protegida por `Authorization: Bearer <ADMIN_TOKEN>`, body opcional `{ "reason": "...", "customer": "..." }`.
- `POST /licenses/:licenseId/unrevoke` — protegida por `Authorization: Bearer <ADMIN_TOKEN>`.
- `POST /licenses/issued` — protegida, registra metadados de uma licença emitida offline (nunca a chave). Body: `{ licenseId, installationId, customer, edition, issuedAt, expiresAt }`.
- `GET /licenses/issued` — protegida, lista o histórico de licenças registadas.

## Variáveis de ambiente

- `DATABASE_URL` — string de conexão Postgres (o Railway injeta automaticamente ao vincular o serviço à base de dados).
- `ADMIN_TOKEN` — segredo usado para autenticar as rotas de revogação. Gere um valor aleatório forte e nunca o exponha no app cliente.
- `PORT` — porta HTTP (o Railway injeta automaticamente).

## Exemplos

```bash
# Revogar
curl -X POST "$URL/licenses/<licenseId>/revoke" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Cliente cancelou o contrato"}'

# Consultar
curl "$URL/licenses/<licenseId>/status"

# Reverter revogação
curl -X POST "$URL/licenses/<licenseId>/unrevoke" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

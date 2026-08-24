# Licenciamento por chave

## Modelo

O aplicativo usa licenças offline assinadas com Ed25519. A chave privada emite licenças;
o aplicativo contém somente a chave pública e, portanto, consegue validar uma licença,
mas não consegue gerar outra.

Cada licença contém:

- identificação única;
- código da instalação;
- cliente;
- edição (`standard` ou `professional`);
- emissão;
- validade ou licença perpétua.

A licença é vinculada ao código exibido na tela de ativação. Copiar somente a chave para
outro computador não ativa o sistema.

## Preparação única

O par inicial já foi criado. Para uma implantação nova, execute apenas uma vez:

```bash
npm run license:keypair
```

A chave privada fica em `private/license-private-key.pem` e é ignorada pelo Git e pelo
instalador. Faça ao menos duas cópias seguras e criptografadas. Perder essa chave impede
emitir novas licenças compatíveis. Vazar a chave permite a terceiros fabricar licenças.

Não execute novamente para um produto já distribuído: trocar o par invalida todas as
licenças emitidas anteriormente no próximo build do aplicativo.

## Emitir uma licença anual

Solicite ao cliente o Código da instalação exibido na tela e execute:

```bash
npm run license:generate -- \
  --customer "Empresa Cliente Ltda" \
  --installation "CODIGO-EXIBIDO-PELO-CLIENTE" \
  --edition professional \
  --days 365 \
  --out private/empresa-cliente.license
```

Para licença perpétua, omita `--days`. Envie ao cliente somente o conteúdo do arquivo
`.license`; nunca envie a chave privada.

## Ativação pelo cliente

1. Abra o aplicativo.
2. Copie o Código da instalação e envie à Cortexis Tech.
3. Receba a chave emitida.
4. Cole a chave completa no campo de ativação.
5. Clique em **Ativar sistema**.

O processo não requer internet. Em Configurações, o usuário pode consultar cliente,
edição, validade e identificação da licença.

## Limitações

Como a validação é totalmente offline, não existe revogação remota nem controle de
quantidade de ativações por servidor. O vínculo local reduz a cópia casual, mas um
atacante com controle administrativo e capacidade de modificar o binário pode tentar
remover verificações. Para controle comercial mais forte, use futuramente um servidor de
ativação com revogação, auditoria e limite de dispositivos.

# Gerador de Licenças Cortexis

Aplicativo administrativo independente do ERP. Ele não acessa o estoque nem contém a
chave privada.

## Executar

```bash
cd license-generator
npm install
npm start
```

Na interface, selecione `license-private-key.pem`, informe o cliente e o código exibido
na instalação, gere a licença e salve o arquivo `.license`.

## Registo no painel online (opcional)

Na seção "Registo no painel online", cole o `ADMIN_TOKEN` do serviço de revogação
(`license-server`, publicado no Railway) e clique em **Guardar token**. O token fica
cifrado localmente (via `safeStorage` do Electron); a chave privada de assinatura nunca
é enviada.

Com o token configurado, cada licença gerada é automaticamente registada no painel
(https://cortexis-license-api-production.up.railway.app) — só metadados (`licenseId`,
cliente, edição, validade). Sem o token, o app continua gerando licenças normalmente,
apenas sem o registo online. O botão **Registar no painel online**, no resultado, permite
tentar novamente manualmente se o registo automático falhar (ex: sem internet).

## Gerar executável portátil para Windows

```bash
cd license-generator
npm install
npm run build:win
```

O executável será criado em `license-generator/release`. Não coloque a chave privada
dentro da pasta do aplicativo nem junto ao executável distribuído.

## Gerar instalação local para macOS Apple Silicon

```bash
cd license-generator
npm install
npm run build:mac
```

O arquivo `.dmg` será criado em `license-generator/release`. Esta compilação é local,
sem certificado Apple, e deve ser utilizada somente no Mac do administrador. A chave
privada continua fora do aplicativo e deve ser selecionada na interface.

O build inclui uma correção de compatibilidade para o `electron-builder` 26 no macOS 26
Apple Silicon, restaurando os nomes dos processos auxiliares esperados pelo Electron.

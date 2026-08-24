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

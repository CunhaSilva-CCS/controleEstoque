import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const platform = process.env.RELEASE_PLATFORM ?? ''
const githubEnv = process.env.GITHUB_ENV
const githubOutput = process.env.GITHUB_OUTPUT

function appendEnv(key, value) {
  if (githubEnv) {
    fs.appendFileSync(githubEnv, `${key}=${value}\n`)
  }
}

function setOutput(key, value) {
  if (githubOutput) {
    fs.appendFileSync(githubOutput, `${key}=${value}\n`)
  }
}

function decodeBase64ToFile(base64, filename) {
  const trimmed = base64.trim()
  if (!trimmed) return null
  const filePath = path.join(os.tmpdir(), filename)
  fs.writeFileSync(filePath, Buffer.from(trimmed, 'base64'))
  return filePath
}

function configureWindows() {
  const certPath = decodeBase64ToFile(process.env.WIN_CSC_LINK ?? '', 'controle-estoque-win.p12')
  if (!certPath) {
    appendEnv('CSC_IDENTITY_AUTO_DISCOVERY', 'false')
    setOutput('signing_enabled', 'false')
    console.log('Windows: certificado não configurado — build sem assinatura')
    return
  }

  appendEnv('CSC_LINK', certPath)
  if (process.env.WIN_CSC_KEY_PASSWORD) {
    appendEnv('CSC_KEY_PASSWORD', process.env.WIN_CSC_KEY_PASSWORD)
  }
  appendEnv('CSC_IDENTITY_AUTO_DISCOVERY', 'true')
  setOutput('signing_enabled', 'true')
  console.log('Windows: certificado configurado para assinatura Authenticode')
}

function configureMac() {
  const certPath = decodeBase64ToFile(process.env.MAC_CSC_LINK ?? '', 'controle-estoque-mac.p12')
  if (!certPath) {
    appendEnv('CSC_IDENTITY_AUTO_DISCOVERY', 'false')
    setOutput('signing_enabled', 'false')
    console.log('macOS: certificado não configurado — build sem assinatura/notarização')
    return
  }

  appendEnv('CSC_LINK', certPath)
  if (process.env.MAC_CSC_KEY_PASSWORD) {
    appendEnv('CSC_KEY_PASSWORD', process.env.MAC_CSC_KEY_PASSWORD)
  }
  appendEnv('CSC_IDENTITY_AUTO_DISCOVERY', 'true')
  setOutput('signing_enabled', 'true')

  const hasNotarize =
    process.env.APPLE_ID &&
    process.env.APPLE_APP_SPECIFIC_PASSWORD &&
    process.env.APPLE_TEAM_ID

  setOutput('notarize_enabled', hasNotarize ? 'true' : 'false')

  if (hasNotarize) {
    console.log('macOS: assinatura + notarização Apple habilitadas')
  } else {
    console.log('macOS: assinatura habilitada; notarização requer APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD e APPLE_TEAM_ID')
  }
}

function configureLinux() {
  appendEnv('CSC_IDENTITY_AUTO_DISCOVERY', 'false')

  const gpgKey = process.env.LINUX_GPG_PRIVATE_KEY?.trim()
  if (!gpgKey) {
    setOutput('signing_enabled', 'false')
    console.log('Linux: GPG não configurado — pacotes .deb sem assinatura')
    return
  }

  const keyPath = path.join(os.tmpdir(), 'controle-estoque-release.asc')
  fs.writeFileSync(keyPath, Buffer.from(gpgKey, 'base64'))
  appendEnv('LINUX_GPG_KEY_PATH', keyPath)
  setOutput('signing_enabled', 'true')
  console.log('Linux: chave GPG preparada para assinatura de .deb')
}

switch (platform) {
  case 'win':
    configureWindows()
    break
  case 'mac':
    configureMac()
    break
  case 'linux':
    configureLinux()
    break
  default:
    appendEnv('CSC_IDENTITY_AUTO_DISCOVERY', 'false')
    setOutput('signing_enabled', 'false')
    console.log(`Plataforma desconhecida (${platform}) — build sem assinatura`)
}

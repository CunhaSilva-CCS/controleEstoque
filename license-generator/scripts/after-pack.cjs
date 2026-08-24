const fs = require('node:fs')
const path = require('node:path')

/**
 * Workaround para electron-builder 26 + macOS 26 ARM.
 *
 * Nessa combinação, o empacotador renomeia os helpers, mas o binário Electron
 * continua procurando pelos nomes originais. A falha ocorre antes do JavaScript
 * do aplicativo e termina em SIGTRAP. O hook restaura os nomes esperados.
 */
module.exports = async function restoreElectronHelperNames({ appOutDir, packager }) {
  if (packager.platform.name !== 'mac') return

  const product = packager.appInfo.productFilename
  const frameworksDir = path.join(
    appOutDir,
    `${product}.app`,
    'Contents',
    'Frameworks',
  )

  for (const suffix of ['', ' (GPU)', ' (Plugin)', ' (Renderer)']) {
    const sourceApp = path.join(frameworksDir, `${product} Helper${suffix}.app`)
    const targetApp = path.join(frameworksDir, `Electron Helper${suffix}.app`)
    if (!fs.existsSync(sourceApp) || fs.existsSync(targetApp)) continue

    fs.renameSync(sourceApp, targetApp)

    const macOSDirectory = path.join(targetApp, 'Contents', 'MacOS')
    const sourceBinary = path.join(macOSDirectory, `${product} Helper${suffix}`)
    const targetBinary = path.join(macOSDirectory, `Electron Helper${suffix}`)
    if (fs.existsSync(sourceBinary)) fs.renameSync(sourceBinary, targetBinary)
  }
}

const fs = require('node:fs')
const path = require('node:path')

/**
 * Compatibilidade entre electron-builder 26 e macOS 26 em Apple Silicon.
 * O binário Electron espera os helpers com os nomes originais e encerra em
 * SIGTRAP antes de carregar o JavaScript quando eles são renomeados.
 */
module.exports = async function restoreElectronHelperNames({ appOutDir, packager }) {
  if (packager.platform.name !== 'mac') return

  const product = packager.appInfo.productFilename
  const frameworksDirectory = path.join(
    appOutDir,
    `${product}.app`,
    'Contents',
    'Frameworks',
  )

  for (const suffix of ['', ' (GPU)', ' (Plugin)', ' (Renderer)']) {
    const sourceApp = path.join(frameworksDirectory, `${product} Helper${suffix}.app`)
    const targetApp = path.join(frameworksDirectory, `Electron Helper${suffix}.app`)
    if (!fs.existsSync(sourceApp) || fs.existsSync(targetApp)) continue

    fs.renameSync(sourceApp, targetApp)

    const macOSDirectory = path.join(targetApp, 'Contents', 'MacOS')
    const sourceBinary = path.join(macOSDirectory, `${product} Helper${suffix}`)
    const targetBinary = path.join(macOSDirectory, `Electron Helper${suffix}`)
    if (fs.existsSync(sourceBinary)) fs.renameSync(sourceBinary, targetBinary)
  }
}

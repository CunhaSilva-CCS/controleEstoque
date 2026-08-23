/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.controleestoque.app',
  productName: 'Controle de Estoque',
  directories: {
    output: 'release',
  },
  files: ['dist/**/*', 'dist-electron/**/*'],
  linux: {
    target: ['AppImage', 'deb'],
    category: 'Office',
  },
  win: {
    target: ['nsis'],
    signAndEditExecutable: true,
    publisherName: 'Controle Estoque',
  },
  mac: {
    target: ['dmg'],
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize: Boolean(
      process.env.APPLE_ID &&
        process.env.APPLE_APP_SPECIFIC_PASSWORD &&
        process.env.APPLE_TEAM_ID,
    ),
  },
  deb:
    process.env.LINUX_GPG_PRIVATE_KEY || process.env.DEB_SIGN_KEY_ID
      ? { sign: 'Controle Estoque' }
      : undefined,
  publish: [
    {
      provider: 'github',
      owner: 'CunhaSilva-CCS',
      repo: 'controleEstoque',
    },
  ],
}

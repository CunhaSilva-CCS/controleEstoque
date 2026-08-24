/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.cortexistech.erp.estoque',
  productName: 'ERP Cortexis Tech - Estoque',
  icon: 'build/icon.png',
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
    icon: 'build/icon.ico',
    signAndEditExecutable: true,
    publisherName: 'Cortexis Tech',
  },
  mac: {
    target: ['dmg'],
    icon: 'build/icon.icns',
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
      ? { sign: 'Cortexis Tech' }
      : undefined,
  publish: [
    {
      provider: 'github',
      owner: 'CunhaSilva-CCS',
      repo: 'controleEstoque',
    },
  ],
}

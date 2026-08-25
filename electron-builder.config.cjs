/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: "com.cortexistech.erp.estoque",
  productName: "ERP Cortexis Tech - Estoque",
  icon: "build/icon.png",
  directories: {
    output:
      process.env.npm_lifecycle_event === "electron:build:win"
        ? "release/windows"
        : "release",
  },
  afterPack: "scripts/after-pack-macos.cjs",
  files: ["dist/**/*", "dist-electron/**/*"],
  extraResources: [{ from: "build/icon.png", to: "icon.png" }],
  linux: {
    target: ["AppImage", "deb"],
    category: "Office",
  },
  win: {
    target: ["nsis"],
    // Usa a logo em alta resolução para o executável, atalhos e barra de tarefas.
    // O electron-builder gera internamente as resoluções necessárias do ICO.
    icon: "build/icon.png",
    signAndEditExecutable: true,
  },
  mac: {
    // O DMG é o instalador entregue ao cliente; o ZIP é obrigatório para o
    // electron-updater gerar e consumir o latest-mac.yml.
    target: ["dmg", "zip"],
    icon: "build/icon.icns",
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
    notarize: Boolean(
      process.env.APPLE_ID &&
      process.env.APPLE_APP_SPECIFIC_PASSWORD &&
      process.env.APPLE_TEAM_ID,
    ),
  },
  deb:
    process.env.LINUX_GPG_PRIVATE_KEY || process.env.DEB_SIGN_KEY_ID
      ? { sign: "Cortexis Tech" }
      : undefined,
  publish: [
    {
      provider: "github",
      owner: "CunhaSilva-CCS",
      repo: "controleEstoque",
      releaseType: "draft",
    },
  ],
};

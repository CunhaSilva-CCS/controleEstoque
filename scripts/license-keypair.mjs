import fs from 'node:fs'
import path from 'node:path'
import { generateKeyPairSync } from 'node:crypto'

const root = process.cwd()
const privatePath = process.env.CORTEXIS_LICENSE_PRIVATE_KEY
if (!privatePath || !path.isAbsolute(privatePath)) throw new Error('Defina CORTEXIS_LICENSE_PRIVATE_KEY com um caminho absoluto fora deste projeto.')
const privateDir = path.dirname(privatePath)
const publicSourcePath = path.join(root, 'shared', 'license-public-key.ts')

if (fs.existsSync(privatePath)) {
  console.error('A chave privada já existe. Remova-a manualmente somente se desejar invalidar todas as licenças emitidas.')
  process.exit(1)
}

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' })
const publicPem = publicKey.export({ type: 'spki', format: 'pem' })
fs.mkdirSync(privateDir, { recursive: true })
fs.writeFileSync(privatePath, privatePem, { mode: 0o600 })
fs.writeFileSync(
  publicSourcePath,
  `// Gerada por \`npm run license:keypair\`. Somente a chave pública entra no aplicativo.\nexport const LICENSE_PUBLIC_KEY_PEM = ${JSON.stringify(publicPem)}\n`,
  'utf8',
)
console.log(`Chave privada: ${privatePath}`)
console.log(`Chave pública incorporada: ${publicSourcePath}`)
console.log('Faça uma cópia segura da chave privada. Se ela for perdida, novas licenças não poderão ser emitidas.')

const missing = []

if (!process.env.CSC_LINK) missing.push('CSC_LINK')
if (!process.env.CSC_KEY_PASSWORD) missing.push('CSC_KEY_PASSWORD')

if (missing.length > 0) {
  console.error(
    `Assinatura digital não configurada. Defina: ${missing.join(', ')}. ` +
      'Use o caminho seguro do certificado PFX/P12 e forneça a senha somente pela variável de ambiente.',
  )
  process.exit(1)
}

console.log('Credenciais de assinatura detectadas. O certificado não será copiado para o projeto.')

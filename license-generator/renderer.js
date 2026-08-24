const $ = (id) => document.getElementById(id)
let generated = null

function showMessage(text, tone = 'error') {
  const element = $('message')
  element.textContent = text
  element.className = `message ${tone}`
  element.hidden = false
}
function unwrap(response) { if (!response.ok) throw new Error(response.error); return response.data }

$('selectKey').addEventListener('click', async () => {
  try {
    const result = unwrap(await window.licenseGenerator.selectKey())
    if (!result.selected) return
    $('keyStatus').textContent = result.name
    $('keyStatus').classList.add('success')
    $('message').hidden = true
  } catch (error) { showMessage(error.message) }
})

$('perpetual').addEventListener('change', (event) => { $('days').disabled = event.target.checked })

$('form').addEventListener('submit', async (event) => {
  event.preventDefault()
  try {
    generated = unwrap(await window.licenseGenerator.generate({
      customer: $('customer').value,
      installationId: $('installationId').value,
      edition: $('edition').value,
      days: $('days').value,
      perpetual: $('perpetual').checked,
    }))
    $('licenseKey').value = generated.licenseKey
    const expiry = generated.details.expiresAt ? new Date(generated.details.expiresAt).toLocaleDateString('pt-BR') : 'Perpétua'
    $('summary').innerHTML = `<div><span>Cliente</span><strong></strong></div><div><span>Edição</span><strong></strong></div><div><span>Validade</span><strong></strong></div>`
    const values = [generated.details.customer, generated.details.edition === 'professional' ? 'Profissional' : 'Standard', expiry]
    $('summary').querySelectorAll('strong').forEach((element, index) => { element.textContent = values[index] })
    $('result').hidden = false
    $('message').hidden = true
    $('result').scrollIntoView({ behavior: 'smooth' })
  } catch (error) { showMessage(error.message) }
})

$('copy').addEventListener('click', async () => {
  if (!generated) return
  try { unwrap(await window.licenseGenerator.copy(generated.licenseKey)); showMessage('Chave copiada.', 'success') } catch (error) { showMessage(error.message) }
})
$('save').addEventListener('click', async () => {
  if (!generated) return
  try {
    const result = unwrap(await window.licenseGenerator.save(generated.licenseKey, generated.details.customer))
    if (result.saved) showMessage(`Licença salva em ${result.path}`, 'success')
  } catch (error) { showMessage(error.message) }
})

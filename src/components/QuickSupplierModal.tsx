import { useState, type FormEvent } from 'react'
import { ModalForm } from './ModalForm'
import { api, unwrap } from '../lib/api'
import { useToast } from '../lib/toast'
import type { Supplier } from '@shared/types'

type Props = {
  open: boolean
  onClose: () => void
  onCreated: (supplier: Supplier) => void
}

export function QuickSupplierModal({ open, onClose, onCreated }: Props) {
  const { push } = useToast()
  const [name, setName] = useState('')
  const [document, setDocument] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  if (!open) return null

  async function save(e: FormEvent) {
    e.preventDefault()
    try {
      const supplier = await unwrap(
        api.createSupplier({
          name,
          document,
          phone,
          email,
        }),
      )
      push('Fornecedor cadastrado')
      onCreated(supplier)
      setName('')
      setDocument('')
      setPhone('')
      setEmail('')
      onClose()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha ao cadastrar fornecedor', 'err')
    }
  }

  return (
    <ModalForm
      title="Novo fornecedor"
      hint="Cadastro rápido para vincular à fatura"
      onClose={onClose}
      onSubmit={save}
      submitLabel="Cadastrar"
    >
      <div className="form-grid">
        <div className="field full">
          <label htmlFor="qsname">Nome *</label>
          <input id="qsname" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="qsdoc">Documento</label>
          <input id="qsdoc" value={document} onChange={(e) => setDocument(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="qsphone">Telefone</label>
          <input id="qsphone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="field full">
          <label htmlFor="qsemail">E-mail</label>
          <input
            id="qsemail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>
    </ModalForm>
  )
}

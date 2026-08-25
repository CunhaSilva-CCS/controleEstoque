import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { CollectionEmpty, CollectionPageHeader } from '../components/CollectionPage'
import { ModalForm } from '../components/ModalForm'
import { StatusBadge } from '../components/StatusBadge'
import { api, unwrap } from '../lib/api'
import { useToast } from '../lib/toast'
import type { Customer } from '@shared/types'

const blank = { name: '', taxNumber: '', address: '', phone: '', email: '', notes: '' }

export function CustomersPage() {
  const { push } = useToast()
  const [items, setItems] = useState<Customer[]>([])
  const [editing, setEditing] = useState<Customer | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(blank)
  const load = useCallback(async () => {
    try { setItems(await unwrap(api.listCustomers())) } catch (error) { push(error instanceof Error ? error.message : 'Não foi possível carregar os clientes', 'err') }
  }, [push])
  useEffect(() => { void load() }, [load])
  function openForm(customer?: Customer) {
    setEditing(customer ?? null)
    setForm(customer ? { name: customer.name, taxNumber: customer.taxNumber, address: customer.address, phone: customer.phone, email: customer.email, notes: customer.notes } : blank)
    setOpen(true)
  }

  function copyCustomer(id: string) {
    const customer = items.find((item) => item.id === id)
    if (!customer) return
    setEditing(null)
    setForm({
      name: customer.name,
      taxNumber: customer.taxNumber,
      address: customer.address,
      phone: customer.phone,
      email: customer.email,
      notes: customer.notes,
    })
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    try {
      if (editing) await unwrap(api.updateCustomer({ id: editing.id, ...form, active: editing.active }))
      else await unwrap(api.createCustomer(form))
      push(editing ? 'Cliente atualizado com sucesso' : 'Cliente registado com sucesso')
      setOpen(false); await load()
    } catch (error) { push(error instanceof Error ? error.message : 'Não foi possível guardar o cliente', 'err') }
  }
  async function toggle(customer: Customer) {
    try { await unwrap(api.updateCustomer({ ...customer, active: !customer.active })); await load(); push(customer.active ? 'Cliente desativado' : 'Cliente ativado') }
    catch (error) { push(error instanceof Error ? error.message : 'Não foi possível atualizar o cliente', 'err') }
  }
  return <div className="collection-page" data-testid="customers-page">
    <CollectionPageHeader icon="◎" description="Faça a gestão dos clientes associados às faturas de saída." count={items.length} singular="cliente registado" plural="clientes registados">
      <button className="btn btn-primary" onClick={() => openForm()}>Novo cliente</button>
    </CollectionPageHeader>
    <div className="panel table-wrap">{items.length === 0 ? <CollectionEmpty icon="◎" title="Ainda não existem clientes registados" description="Registe o primeiro cliente para iniciar a faturação de saída." /> : <table className="collection-table"><thead><tr><th>Cliente</th><th>NIF</th><th>Contacto</th><th>Estado</th><th>Ações</th></tr></thead><tbody>{items.map((customer) => <tr key={customer.id}><td><strong>{customer.name}</strong><small>{customer.address}</small></td><td>{customer.taxNumber || '—'}</td><td>{customer.phone || customer.email || '—'}</td><td><StatusBadge status={customer.active ? 'active' : 'inactive'} /></td><td><div className="row-actions"><button className="btn btn-small btn-ghost" onClick={() => openForm(customer)}>Editar</button><button className="btn btn-small btn-ghost" onClick={() => void toggle(customer)}>{customer.active ? 'Desativar' : 'Ativar'}</button></div></td></tr>)}</tbody></table>}</div>
    {open ? <ModalForm title={editing ? 'Editar cliente' : 'Novo cliente'} onClose={() => setOpen(false)} onSubmit={save} submitLabel="Guardar cliente" copyOptions={!editing ? items.map((item) => ({ value: item.id, label: item.name })) : undefined} onCopy={!editing ? copyCustomer : undefined}><div className="form-grid"><div className="field full"><label>Nome *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div><div className="field"><label>NIF</label><input value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} /></div><div className="field"><label>Telefone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div><div className="field full"><label>Morada</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div><div className="field full"><label>E-mail</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div><div className="field full"><label>Observações</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div></div></ModalForm> : null}
  </div>
}

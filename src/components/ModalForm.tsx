import { type FormEvent, type ReactNode, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  title: string
  hint?: string
  onClose: () => void
  onSubmit: (e: FormEvent) => void
  children: ReactNode
  submitLabel?: string
  cancelLabel?: string
}

function formSnapshot(form: HTMLFormElement): string {
  return Array.from(form.elements)
    .filter((element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement,
    )
    .map((element, index) => {
      const key = element.name || element.id || String(index)
      const value = element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')
        ? String(element.checked)
        : element.value
      return `${key}=${value}`
    })
    .join('\u001f')
}

export function ModalForm({
  title,
  hint,
  onClose,
  onSubmit,
  children,
  submitLabel = 'Guardar',
  cancelLabel = 'Cancelar',
}: Props) {
  const titleId = useId()
  const modalRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const initialSnapshot = useRef<string | null>(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const firstField = modalRef.current?.querySelector<HTMLElement>(
      'form input:not(:disabled), form select:not(:disabled), form textarea:not(:disabled), form button:not(:disabled)',
    )
    firstField?.focus()
    if (formRef.current) initialSnapshot.current = formSnapshot(formRef.current)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  function requestClose() {
    const isDirty = formRef.current && initialSnapshot.current !== formSnapshot(formRef.current)
    if (!isDirty || window.confirm('Existem alterações não guardadas. Deseja fechar esta janela?')) {
      onClose()
    }
  }

  return createPortal(
    <div className="modal-backdrop" onClick={requestClose}>
      <div
        ref={modalRef}
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-header">
          <div>
            <h3 id={titleId}>{title}</h3>
            {hint ? <p className="hint">{hint}</p> : null}
          </div>
          <button type="button" className="modal-close" aria-label="Fechar" onClick={requestClose}>
            ×
          </button>
        </div>
        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit(e)
          }}
        >
          {children}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={requestClose}>
              {cancelLabel}
            </button>
            <button type="submit" className="btn btn-primary" data-testid="btn-modal-submit">
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

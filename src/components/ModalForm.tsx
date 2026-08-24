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

export function ModalForm({
  title,
  hint,
  onClose,
  onSubmit,
  children,
  submitLabel = 'Salvar',
  cancelLabel = 'Cancelar',
}: Props) {
  const titleId = useId()
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const firstField = modalRef.current?.querySelector<HTMLElement>(
      'form input:not(:disabled), form select:not(:disabled), form textarea:not(:disabled), form button:not(:disabled)',
    )
    firstField?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
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
          <button type="button" className="modal-close" aria-label="Fechar" onClick={onClose}>
            ×
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit(e)
          }}
        >
          {children}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
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

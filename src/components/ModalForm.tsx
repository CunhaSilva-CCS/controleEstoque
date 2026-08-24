import { type FormEvent, type ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  title: string
  hint?: string
  onClose: () => void
  onSubmit: (e: FormEvent) => void
  children: ReactNode
  submitLabel?: string
}

export function ModalForm({
  title,
  hint,
  onClose,
  onSubmit,
  children,
  submitLabel = 'Salvar',
}: Props) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <h3 id="modal-title">{title}</h3>
        {hint ? <p className="hint">{hint}</p> : null}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit(e)
          }}
        >
          {children}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
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

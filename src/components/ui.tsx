import { useCallback, useEffect, useState, type ReactNode } from 'react';

interface ToastState {
  message: string;
  type: 'ok' | 'error';
}

export function Toast({ message, type }: ToastState) {
  return <div className={`toast ${type === 'error' ? 'error' : ''}`}>{message}</div>;
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const showOk = useCallback((message: string) => setToast({ message, type: 'ok' }), []);
  const showError = useCallback((message: string) => setToast({ message, type: 'error' }), []);

  return {
    toast,
    showOk,
    showError,
  };
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

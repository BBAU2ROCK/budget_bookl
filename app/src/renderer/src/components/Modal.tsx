import { useEffect } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const sizeClass: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'w-[420px]',
  md: 'w-[560px]',
  lg: 'w-[720px]'
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md'
}: ModalProps): React.JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`mt-8 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl ${sizeClass[size]} max-w-full`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="text-slate-400 transition hover:text-slate-100"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-700 bg-slate-950/40 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  danger,
  onConfirm,
  onCancel
}: {
  open: boolean
  title: string
  message: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}): React.JSX.Element | null {
  if (!open) return null
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button
            onClick={onCancel}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              danger
                ? 'border border-rose-500/60 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
                : 'border border-sky-500/60 bg-sky-500/20 text-sky-200 hover:bg-sky-500/30'
            }`}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-slate-300">{message}</div>
    </Modal>
  )
}

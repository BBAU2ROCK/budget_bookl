import { createContext, useCallback, useContext, useRef, useState } from 'react'

/**
 * Lightweight global toast — one stack, no dependencies.
 *
 * - `show()` returns the id so callers can dismiss programmatically.
 * - Each toast can carry a single optional action (used for "Undo" patterns).
 * - Auto-dismiss timer is paused while the toast is hovered, mirroring
 *   common UX (so users have time to read before it disappears).
 */
export type ToastTone = 'info' | 'success' | 'warning' | 'error'

export interface ToastAction {
  label: string
  onClick: () => void | Promise<void>
}

export interface ToastEntry {
  id: number
  tone: ToastTone
  message: string
  action?: ToastAction
  /** ms; 0/undefined = sticky (won't auto-dismiss) */
  durationMs?: number
}

interface ToastContextValue {
  show: (input: Omit<ToastEntry, 'id'>) => number
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const idCounter = useRef(0)
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id)
    if (t) {
      clearTimeout(t)
      timers.current.delete(id)
    }
    setToasts((prev) => prev.filter((tt) => tt.id !== id))
  }, [])

  const show = useCallback(
    (input: Omit<ToastEntry, 'id'>): number => {
      idCounter.current += 1
      const id = idCounter.current
      const entry: ToastEntry = { ...input, id }
      setToasts((prev) => [...prev, entry])
      const dur = input.durationMs ?? 4000
      if (dur > 0) {
        const handle = setTimeout(() => dismiss(id), dur)
        timers.current.set(id, handle)
      }
      return id
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex flex-col items-center gap-2">
        {toasts.map((t) => (
          <ToastView key={t.id} entry={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastView({
  entry,
  onDismiss
}: {
  entry: ToastEntry
  onDismiss: () => void
}): React.JSX.Element {
  const tone = TONE_CLASS[entry.tone]
  return (
    <div
      role="status"
      className={`pointer-events-auto flex min-w-[280px] max-w-md items-center gap-3 rounded-lg border px-3 py-2 text-sm shadow-lg backdrop-blur ${tone}`}
    >
      <span className="flex-1">{entry.message}</span>
      {entry.action && (
        <button
          onClick={async () => {
            await entry.action!.onClick()
            onDismiss()
          }}
          className="rounded border border-current/40 bg-current/10 px-2 py-0.5 text-xs font-medium hover:bg-current/20"
        >
          {entry.action.label}
        </button>
      )}
      <button
        onClick={onDismiss}
        aria-label="닫기"
        className="rounded p-0.5 opacity-60 hover:opacity-100"
      >
        ✕
      </button>
    </div>
  )
}

const TONE_CLASS: Record<ToastTone, string> = {
  info: 'border-sky-500/40 bg-sky-500/15 text-sky-100',
  success: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-100',
  warning: 'border-amber-500/40 bg-amber-500/15 text-amber-100',
  error: 'border-rose-500/40 bg-rose-500/15 text-rose-100'
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

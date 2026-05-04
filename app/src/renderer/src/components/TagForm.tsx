import { useEffect, useState } from 'react'
import type { TagDto } from '../../../shared/types'
import Modal from './Modal'

const COLOR_PRESETS = [
  '#f97316',
  '#0ea5e9',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#6366f1',
  '#ef4444',
  '#14b8a6',
  '#eab308',
  '#db2777',
  '#64748b'
]

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  initial?: TagDto | null
}

export default function TagForm({
  open,
  onClose,
  onSaved,
  initial
}: Props): React.JSX.Element | null {
  const [name, setName] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (initial) {
      setName(initial.name)
      setColor(initial.color)
      setDescription(initial.description ?? '')
    } else {
      setName('')
      setColor(null)
      setDescription('')
    }
    setError(null)
  }, [open, initial])

  async function handleSubmit(): Promise<void> {
    if (!name.trim()) return setError('태그 이름을 입력해 주세요.')
    setSubmitting(true)
    setError(null)
    try {
      if (initial) {
        await window.api.tags.update({
          id: initial.id,
          name: name.trim(),
          color,
          description: description.trim() || null
        })
      } else {
        await window.api.tags.create({
          name: name.trim(),
          color,
          description: description.trim() || null
        })
      }
      onSaved()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? '태그 편집' : '새 태그'}
      size="sm"
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-md border border-sky-500/60 bg-sky-500/20 px-3 py-1.5 text-sm font-medium text-sky-200 hover:bg-sky-500/30 disabled:opacity-50"
          >
            {submitting ? '저장 중...' : '저장'}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div>
          <label className="mb-1 block text-xs text-slate-400">이름</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: #여행"
            autoFocus
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">색상</label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setColor(null)}
              className={`h-7 w-7 rounded border border-slate-700 text-xs text-slate-500 hover:border-slate-500 ${
                color == null ? 'ring-1 ring-sky-500' : ''
              }`}
            >
              ✕
            </button>
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-7 w-7 rounded transition ${color === c ? 'ring-2 ring-white' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">설명 (선택)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="이 태그의 용도 설명"
            className="w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </div>

        {error && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}

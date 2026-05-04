import { useEffect, useState } from 'react'
import type { CategoryDto, CategoryKind } from '../../../shared/types'
import Modal from './Modal'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  /** When editing: category to edit. When adding: template with parent/kind presets. */
  initial?: CategoryDto | null
  defaultKind?: CategoryKind
  defaultParentId?: string | null
}

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

const ICON_PRESETS = [
  '🍚',
  '🍽️',
  '☕',
  '🚌',
  '🚕',
  '⛽',
  '🏠',
  '💡',
  '📱',
  '🌐',
  '🛍️',
  '👕',
  '🎬',
  '✈️',
  '🎨',
  '⚕️',
  '📚',
  '🛡️',
  '💐',
  '💼',
  '🏦',
  '📈',
  '🎁'
]

export default function CategoryForm({
  open,
  onClose,
  onSaved,
  initial,
  defaultKind,
  defaultParentId
}: Props): React.JSX.Element | null {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<CategoryKind>('expense')
  const [parentId, setParentId] = useState<string | null>(null)
  const [icon, setIcon] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [allCategories, setAllCategories] = useState<CategoryDto[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    window.api.categories.list().then(setAllCategories)
    if (initial) {
      setName(initial.name)
      setKind(initial.kind)
      setParentId(initial.parentId)
      setIcon(initial.icon ?? '')
      setColor(initial.color ?? null)
    } else {
      setName('')
      setKind(defaultKind ?? 'expense')
      setParentId(defaultParentId ?? null)
      setIcon('')
      setColor(null)
    }
    setError(null)
  }, [open, initial, defaultKind, defaultParentId])

  const possibleParents = allCategories.filter(
    (c) =>
      c.kind === kind &&
      c.id !== initial?.id &&
      // don't allow descendants as parent (simple guard: skip direct descendants only for Step)
      c.parentId !== initial?.id
  )

  async function handleSubmit(): Promise<void> {
    if (!name.trim()) {
      setError('이름을 입력해 주세요.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      if (initial) {
        await window.api.categories.update({
          id: initial.id,
          name: name.trim(),
          parentId,
          kind, // note: changing kind is allowed but probably rare
          icon: icon || null,
          color
        })
      } else {
        await window.api.categories.create({
          name: name.trim(),
          parentId,
          kind,
          icon: icon || null,
          color
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
      title={initial ? '카테고리 편집' : '새 카테고리'}
      size="md"
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
        {!initial && (
          <div>
            <label className="mb-1 block text-xs text-slate-400">분류</label>
            <div className="flex gap-2">
              <KindBtn
                active={kind === 'expense'}
                onClick={() => setKind('expense')}
                label="지출"
                tone="rose"
              />
              <KindBtn
                active={kind === 'income'}
                onClick={() => setKind('income')}
                label="수입"
                tone="emerald"
              />
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs text-slate-400">이름</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 점심식대"
            autoFocus
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">상위 카테고리 (선택)</label>
          <select
            value={parentId ?? ''}
            onChange={(e) => setParentId(e.target.value || null)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
          >
            <option value="">(최상위)</option>
            {possibleParents.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon ? `${c.icon} ` : ''}
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">아이콘 (이모지)</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="🍚"
              maxLength={4}
              className="w-20 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-center text-lg text-slate-100 focus:border-sky-500 focus:outline-none"
            />
            <div className="flex flex-wrap gap-1">
              {ICON_PRESETS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  className={`h-8 w-8 rounded text-lg hover:bg-slate-800 ${icon === ic ? 'bg-slate-800 ring-1 ring-sky-500' : ''}`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">색상</label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setColor(null)}
              className={`h-7 w-7 rounded border border-slate-700 text-xs text-slate-500 hover:border-slate-500 ${color == null ? 'ring-1 ring-sky-500' : ''}`}
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

        {error && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}

function KindBtn({
  active,
  onClick,
  label,
  tone
}: {
  active: boolean
  onClick: () => void
  label: string
  tone: 'rose' | 'emerald'
}): React.JSX.Element {
  const toneClass =
    tone === 'rose'
      ? 'bg-rose-500/20 text-rose-200 border-rose-500/60'
      : 'bg-emerald-500/20 text-emerald-200 border-emerald-500/60'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
        active ? toneClass : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
      }`}
    >
      {label}
    </button>
  )
}

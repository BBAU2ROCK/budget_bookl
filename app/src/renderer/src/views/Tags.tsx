import { useCallback, useEffect, useState } from 'react'
import type { TagDto } from '../../../shared/types'
import TagForm from '../components/TagForm'
import InfoTip from '../components/InfoTip'
import Modal, { ConfirmDialog } from '../components/Modal'
import { formatInteger } from '../lib/money'

export default function Tags(): React.JSX.Element {
  const [tags, setTags] = useState<TagDto[]>([])
  const [usage, setUsage] = useState<Record<string, number>>({})
  const [includeArchived, setIncludeArchived] = useState(false)
  const [editing, setEditing] = useState<TagDto | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<TagDto | null>(null)
  const [merging, setMerging] = useState<TagDto | null>(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [t, u] = await Promise.all([
      window.api.tags.list(includeArchived),
      window.api.tags.usageCounts()
    ])
    setTags(t)
    setUsage(u)
  }, [includeArchived])

  useEffect(() => {
    load()
  }, [load])

  async function archive(tag: TagDto): Promise<void> {
    setBusy(true)
    try {
      await window.api.tags.update({ id: tag.id, isArchived: !tag.isArchived })
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleting) return
    setBusy(true)
    try {
      await window.api.tags.delete(deleting.id)
      setDeleting(null)
      await load()
    } finally {
      setBusy(false)
    }
  }

  const visible = tags.filter((t) =>
    search.trim() ? t.name.toLowerCase().includes(search.trim().toLowerCase()) : true
  )

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center text-2xl font-bold text-slate-100">
            태그 관리
            <InfoTip side="bottom">
              카테고리와는 다른 <b>부가 분류 라벨</b>입니다. 한 거래에 <b>여러 개를 동시에</b>
              붙일 수 있어요.
              <br />
              <br />
              <b>예시:</b>
              <br />
              · 「식비」 카테고리 + 「#출장」 태그 → 출장 식비만 따로 추적
              <br />
              · 「쇼핑」 카테고리 + 「#자녀」, 「#선물」 태그 → 자녀 선물 지출 추적
              <br />
              <br />
              <b>병합</b>: 두 태그를 합칠 수 있습니다 (예: 「#비즈니스」 → 「#출장」). 거래의
              태그 링크가 모두 새 태그로 옮겨집니다.
              <br />
              <br />
              <b>보관(아카이브)</b>: 카테고리와 동일 — 삭제 안 하고 숨김.
            </InfoTip>
          </h1>
          <p className="text-sm text-slate-400">
            {tags.length}개 · 태그는 다차원 분류에 사용됩니다 (카테고리와 독립)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="태그 검색"
            className="w-48 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
          />
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900"
            />
            보관 포함
          </label>
          <button
            onClick={() => setCreating(true)}
            className="rounded-md border border-sky-500/60 bg-sky-500/20 px-3 py-1.5 text-sm font-medium text-sky-200 hover:bg-sky-500/30"
          >
            + 새 태그
          </button>
        </div>
      </header>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 p-10 text-center">
          <p className="text-sm text-slate-400">태그가 없습니다.</p>
          <button
            onClick={() => setCreating(true)}
            className="mt-4 rounded-md border border-sky-500/60 bg-sky-500/20 px-4 py-2 text-sm text-sky-200 hover:bg-sky-500/30"
          >
            첫 태그 만들기
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-700/70 bg-slate-900/40">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700/50 bg-slate-900/70 text-left text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-2.5">태그</th>
                <th className="px-4 py-2.5">설명</th>
                <th className="px-4 py-2.5 text-right">사용</th>
                <th className="px-4 py-2.5 text-right">액션</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr
                  key={t.id}
                  className={`border-b border-slate-800/50 last:border-0 hover:bg-slate-800/40 ${
                    t.isArchived ? 'opacity-50' : ''
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {t.color && (
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: t.color }}
                        />
                      )}
                      <span className="font-medium text-slate-200">{t.name}</span>
                      {t.isArchived && (
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">
                          보관
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">
                    {t.description ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm text-slate-300">
                    {formatInteger(usage[t.id] ?? 0)}
                    <span className="ml-1 text-xs text-slate-500">건</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      <ActionBtn onClick={() => setEditing(t)} disabled={busy} title="편집">
                        ✎
                      </ActionBtn>
                      <ActionBtn
                        onClick={() => setMerging(t)}
                        disabled={busy || (usage[t.id] ?? 0) === 0}
                        title="다른 태그로 병합"
                      >
                        ⇆
                      </ActionBtn>
                      <ActionBtn
                        onClick={() => archive(t)}
                        disabled={busy}
                        title={t.isArchived ? '보관 해제' : '보관'}
                        tone="amber"
                      >
                        {t.isArchived ? '↩' : '📦'}
                      </ActionBtn>
                      <ActionBtn
                        onClick={() => setDeleting(t)}
                        disabled={busy}
                        title="영구 삭제"
                        tone="rose"
                      >
                        🗑
                      </ActionBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TagForm open={creating} onClose={() => setCreating(false)} onSaved={load} />
      <TagForm
        open={!!editing}
        initial={editing}
        onClose={() => setEditing(null)}
        onSaved={load}
      />

      <MergeTagDialog
        source={merging}
        targets={tags.filter((t) => !t.isArchived)}
        onClose={() => setMerging(null)}
        onMerged={load}
      />

      <ConfirmDialog
        open={!!deleting}
        title="태그 영구 삭제"
        danger
        confirmLabel="영구 삭제"
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
        message={
          deleting && (
            <div className="space-y-2">
              <div>
                <span className="font-semibold text-slate-100">{deleting.name}</span> 을(를) 영구
                삭제합니다.
              </div>
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                · 이 태그가 붙어있던 <b>{usage[deleting.id] ?? 0}</b>건의 거래에서 태그 링크가
                제거됩니다 (거래 자체는 유지).
              </div>
              <div className="text-xs text-slate-500">
                다른 태그로 데이터를 이전하려면 <b>병합(⇆)</b> 기능을 사용하세요.
              </div>
            </div>
          )
        }
      />
    </div>
  )
}

function ActionBtn({
  children,
  onClick,
  disabled,
  title,
  tone
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title: string
  tone?: 'rose' | 'amber'
}): React.JSX.Element {
  const toneClass =
    tone === 'rose'
      ? 'hover:text-rose-300'
      : tone === 'amber'
        ? 'hover:text-amber-300'
        : 'hover:text-slate-200'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-7 w-7 items-center justify-center rounded text-xs text-slate-500 transition hover:bg-slate-700/60 ${toneClass} disabled:opacity-30`}
    >
      {children}
    </button>
  )
}

function MergeTagDialog({
  source,
  targets,
  onClose,
  onMerged
}: {
  source: TagDto | null
  targets: TagDto[]
  onClose: () => void
  onMerged: () => void
}): React.JSX.Element | null {
  const [targetId, setTargetId] = useState<string>('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setTargetId('')
  }, [source])

  async function doMerge(): Promise<void> {
    if (!source || !targetId) return
    setBusy(true)
    try {
      const r = await window.api.tags.merge(source.id, targetId)
      alert(`${r.moved}건의 거래가 이전되었습니다. 소스 태그는 삭제되었습니다.`)
      onMerged()
      onClose()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!source) return null

  const options = targets.filter((t) => t.id !== source.id)

  return (
    <Modal
      open={!!source}
      onClose={onClose}
      title="태그 병합"
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
            onClick={doMerge}
            disabled={!targetId || busy}
            className="rounded-md border border-sky-500/60 bg-sky-500/20 px-3 py-1.5 text-sm font-medium text-sky-200 hover:bg-sky-500/30 disabled:opacity-50"
          >
            병합 실행
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div>
          <span className="font-semibold text-slate-100">{source.name}</span> 을(를) 다른 태그로
          병합합니다.
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">대상 태그</label>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
          >
            <option value="">선택하세요</option>
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          원본 태그가 붙은 모든 거래에 대상 태그가 연결되고, 원본 태그는 영구 삭제됩니다.
        </div>
      </div>
    </Modal>
  )
}

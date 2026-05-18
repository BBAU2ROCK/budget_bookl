import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CategoryDto,
  CategoryKind,
  CategoryTreeNode
} from '../../../shared/types'
import CategoryForm from '../components/CategoryForm'
import InfoTip from '../components/InfoTip'
import { ConfirmDialog } from '../components/Modal'
import { useToast } from '../components/toast/ToastContext'
import { formatInteger } from '../lib/money'

type EditorState =
  | { mode: 'closed' }
  | { mode: 'create'; kind: CategoryKind; parentId: string | null }
  | { mode: 'edit'; category: CategoryDto }

type DeleteTarget = {
  category: CategoryDto
  directChildCount: number
  transactionCount: number
}

type DragTarget = {
  id: string
  position: 'before' | 'after' | 'inside'
} | null

export default function Categories(): React.JSX.Element {
  const [tree, setTree] = useState<CategoryTreeNode[]>([])
  const [flat, setFlat] = useState<CategoryDto[]>([])
  const [includeArchived, setIncludeArchived] = useState(false)
  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' })
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [busy, setBusy] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragTarget, setDragTarget] = useState<DragTarget>(null)
  const toast = useToast()

  const load = useCallback(async () => {
    const [t, f] = await Promise.all([
      window.api.categories.tree(includeArchived),
      window.api.categories.list(includeArchived)
    ])
    setTree(t)
    setFlat(f)
  }, [includeArchived])

  useEffect(() => {
    load()
  }, [load])

  const expenseTree = useMemo(() => tree.filter((c) => c.kind === 'expense'), [tree])
  const incomeTree = useMemo(() => tree.filter((c) => c.kind === 'income'), [tree])

  async function archive(cat: CategoryDto): Promise<void> {
    setBusy(true)
    try {
      await window.api.categories.update({ id: cat.id, isArchived: true })
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function unarchive(cat: CategoryDto): Promise<void> {
    setBusy(true)
    try {
      await window.api.categories.update({ id: cat.id, isArchived: false })
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function reorder(cat: CategoryDto, dir: -1 | 1): Promise<void> {
    const siblings = flat
      .filter((c) => c.parentId === cat.parentId && c.kind === cat.kind)
      .sort((a, b) => a.displayOrder - b.displayOrder)
    const idx = siblings.findIndex((c) => c.id === cat.id)
    if (idx < 0) return
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= siblings.length) return

    const swapped = [...siblings]
    const [moved] = swapped.splice(idx, 1)
    swapped.splice(newIdx, 0, moved)

    setBusy(true)
    try {
      await window.api.categories.reorder({
        updates: swapped.map((c, i) => ({
          id: c.id,
          parentId: c.parentId,
          displayOrder: i
        }))
      })
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function askDelete(cat: CategoryDto): Promise<void> {
    const directChildCount = flat.filter((c) => c.parentId === cat.id).length
    const txResult = await window.api.transactions.list({ categoryIds: [cat.id], limit: 1 })
    setDeleteTarget({
      category: cat,
      directChildCount,
      transactionCount: txResult.total
    })
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await window.api.categories.delete(deleteTarget.category.id)
      setDeleteTarget(null)
      await load()
    } finally {
      setBusy(false)
    }
  }

  /* ==========================================================================
   * Drag & drop reorder
   * ==========================================================================*/

  function isDescendant(candidateId: string, ancestorId: string): boolean {
    let cur: string | null = candidateId
    const all = flat
    const byId = new Map(all.map((c) => [c.id, c]))
    while (cur) {
      if (cur === ancestorId) return true
      const node = byId.get(cur)
      cur = node?.parentId ?? null
    }
    return false
  }

  async function handleDrop(dragId: string, target: DragTarget): Promise<void> {
    if (!target || dragId === target.id) return
    const dragCat = flat.find((c) => c.id === dragId)
    const tgtCat = flat.find((c) => c.id === target.id)
    if (!dragCat || !tgtCat) return
    if (dragCat.kind !== tgtCat.kind) {
      toast.show({
        tone: 'warning',
        message: '같은 분류(지출/수입) 내에서만 이동할 수 있습니다.'
      })
      return
    }
    if (target.position !== 'inside' && tgtCat.parentId !== dragCat.parentId) {
      // moving across parents ok, but still check descendant
    }
    if (isDescendant(tgtCat.id, dragCat.id)) {
      toast.show({
        tone: 'warning',
        message: '하위 카테고리를 그 상위의 자손 위로 이동할 수 없습니다.'
      })
      return
    }

    // Compute new parent id and sibling list
    const newParent =
      target.position === 'inside' ? tgtCat.id : tgtCat.parentId

    // Check inside-drop kind: children inherit kind, so OK
    if (target.position === 'inside' && dragCat.kind !== tgtCat.kind) return

    // Build new sibling ordering
    const sameGroup = flat
      .filter((c) => c.parentId === newParent && c.kind === dragCat.kind && c.id !== dragId)
      .sort((a, b) => a.displayOrder - b.displayOrder)

    let insertIdx: number
    if (target.position === 'inside') {
      insertIdx = sameGroup.length // append as last child
    } else {
      const tgtIdx = sameGroup.findIndex((s) => s.id === tgtCat.id)
      insertIdx = target.position === 'before' ? tgtIdx : tgtIdx + 1
    }
    const finalList = [...sameGroup]
    finalList.splice(insertIdx, 0, { ...dragCat, parentId: newParent })

    setBusy(true)
    try {
      await window.api.categories.reorder({
        updates: finalList.map((c, i) => ({
          id: c.id,
          parentId: newParent,
          displayOrder: i
        }))
      })
      await load()
    } finally {
      setBusy(false)
      setDraggingId(null)
      setDragTarget(null)
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center text-2xl font-bold text-slate-100">
            카테고리 관리
            <InfoTip side="bottom">
              거래를 분류하는 <b>큰 묶음</b>입니다 (식비·교통·쇼핑 등). 한 거래는 하나의
              카테고리에만 속합니다.
              <br />
              <br />
              <b>부모 → 자식 트리</b>로 구성 가능 (예: 식비 / 외식, 식비 / 카페). 자식 거래는
              부모 합계에 자동 포함되어 예산·통계에 반영됩니다.
              <br />
              <br />
              <b>수입 vs 지출</b>은 분리되어 있습니다 (한 카테고리는 수입용 또는 지출용 중
              하나).
              <br />
              <br />
              <b>보관(아카이브)</b>: 삭제 안 하고 숨김. 과거 거래엔 그대로 남고, 새 거래
              입력에선 안 보입니다.
              <br />
              <br />
              <b>드래그 이동</b>: 다른 카테고리 위에 놓으면 자식으로 이동, 사이에 놓으면 순서
              변경.
            </InfoTip>
          </h1>
          <p className="text-sm text-slate-400">
            드래그로 순서 변경 · 항목 위에 놓으면 하위로 이동 (Alt 불필요)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900"
            />
            보관된 항목 포함
          </label>
          <button
            onClick={() => setEditor({ mode: 'create', kind: 'expense', parentId: null })}
            className="rounded-md border border-rose-500/60 bg-rose-500/15 px-3 py-1.5 text-sm text-rose-200 hover:bg-rose-500/25"
          >
            + 지출 카테고리
          </button>
          <button
            onClick={() => setEditor({ mode: 'create', kind: 'income', parentId: null })}
            className="rounded-md border border-emerald-500/60 bg-emerald-500/15 px-3 py-1.5 text-sm text-emerald-200 hover:bg-emerald-500/25"
          >
            + 수입 카테고리
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CategorySection
          title="지출"
          tone="expense"
          tree={expenseTree}
          onEdit={(c) => setEditor({ mode: 'edit', category: c })}
          onAddChild={(parentId, kind) => setEditor({ mode: 'create', kind, parentId })}
          onArchive={archive}
          onUnarchive={unarchive}
          onDelete={askDelete}
          onReorder={reorder}
          busy={busy}
          draggingId={draggingId}
          dragTarget={dragTarget}
          onDragStart={setDraggingId}
          onDragEnd={() => {
            setDraggingId(null)
            setDragTarget(null)
          }}
          onDragOverRow={setDragTarget}
          onDropRow={(tgt) => {
            if (draggingId) handleDrop(draggingId, tgt)
          }}
        />
        <CategorySection
          title="수입"
          tone="income"
          tree={incomeTree}
          onEdit={(c) => setEditor({ mode: 'edit', category: c })}
          onAddChild={(parentId, kind) => setEditor({ mode: 'create', kind, parentId })}
          onArchive={archive}
          onUnarchive={unarchive}
          onDelete={askDelete}
          onReorder={reorder}
          busy={busy}
          draggingId={draggingId}
          dragTarget={dragTarget}
          onDragStart={setDraggingId}
          onDragEnd={() => {
            setDraggingId(null)
            setDragTarget(null)
          }}
          onDragOverRow={setDragTarget}
          onDropRow={(tgt) => {
            if (draggingId) handleDrop(draggingId, tgt)
          }}
        />
      </div>

      <CategoryForm
        open={editor.mode !== 'closed'}
        onClose={() => setEditor({ mode: 'closed' })}
        onSaved={load}
        initial={editor.mode === 'edit' ? editor.category : null}
        defaultKind={editor.mode === 'create' ? editor.kind : undefined}
        defaultParentId={editor.mode === 'create' ? editor.parentId : undefined}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="카테고리 영구 삭제"
        danger
        confirmLabel="영구 삭제"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        message={
          deleteTarget && (
            <div className="space-y-3">
              <div>
                <span className="font-semibold text-slate-100">
                  {deleteTarget.category.icon ? `${deleteTarget.category.icon} ` : ''}
                  {deleteTarget.category.name}
                </span>{' '}
                을(를) 영구 삭제하면 되돌릴 수 없습니다.
              </div>
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                <div className="font-semibold">영향 범위</div>
                <ul className="mt-1 space-y-0.5">
                  <li>
                    · 하위 카테고리 <b>{formatInteger(deleteTarget.directChildCount)}</b>개가 최상위로 이동됩니다.
                  </li>
                  <li>
                    · 이 카테고리를 참조하는 거래{' '}
                    <b>{formatInteger(deleteTarget.transactionCount)}</b>건이 "미분류"가 됩니다.
                  </li>
                </ul>
              </div>
              <div className="text-xs text-slate-500">
                데이터 이력 보존이 중요한 경우 삭제 대신 <b>보관</b>을 권장합니다.
              </div>
            </div>
          )
        }
      />
    </div>
  )
}

interface SectionProps {
  title: string
  tone: 'expense' | 'income'
  tree: CategoryTreeNode[]
  onEdit: (c: CategoryDto) => void
  onAddChild: (parentId: string | null, kind: CategoryKind) => void
  onArchive: (c: CategoryDto) => void
  onUnarchive: (c: CategoryDto) => void
  onDelete: (c: CategoryDto) => void
  onReorder: (c: CategoryDto, dir: -1 | 1) => void
  busy: boolean
  draggingId: string | null
  dragTarget: DragTarget
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDragOverRow: (t: DragTarget) => void
  onDropRow: (t: DragTarget) => void
}

function CategorySection(props: SectionProps): React.JSX.Element {
  const borderTone =
    props.tone === 'expense' ? 'border-rose-500/30' : 'border-emerald-500/30'
  return (
    <section className={`rounded-xl border ${borderTone} bg-slate-900/50 p-4`}>
      <h2 className="mb-3 text-sm font-semibold text-slate-200">{props.title}</h2>
      <div className="space-y-0.5">
        {props.tree.length === 0 && (
          <div className="py-4 text-center text-xs text-slate-500">카테고리가 없습니다.</div>
        )}
        {props.tree.map((n) => (
          <CategoryNodeRow key={n.id} node={n} {...props} />
        ))}
      </div>
    </section>
  )
}

function CategoryNodeRow({
  node,
  onEdit,
  onAddChild,
  onArchive,
  onUnarchive,
  onDelete,
  onReorder,
  busy,
  draggingId,
  dragTarget,
  onDragStart,
  onDragEnd,
  onDragOverRow,
  onDropRow
}: { node: CategoryTreeNode } & Omit<SectionProps, 'title' | 'tone' | 'tree'>): React.JSX.Element {
  const isBeingDragged = draggingId === node.id
  const target = dragTarget?.id === node.id ? dragTarget : null

  return (
    <>
      {target?.position === 'before' && (
        <div
          style={{ paddingLeft: 8 + node.depth * 20 }}
          className="my-0.5 h-0.5 bg-sky-500"
        />
      )}
      <div
        draggable={!busy}
        onDragStart={(e) => {
          onDragStart(node.id)
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', node.id)
        }}
        onDragEnd={onDragEnd}
        onDragOver={(e) => {
          if (!draggingId || draggingId === node.id) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
          const y = e.clientY - rect.top
          const h = rect.height
          let position: 'before' | 'after' | 'inside'
          if (y < h * 0.25) position = 'before'
          else if (y > h * 0.75) position = 'after'
          else position = 'inside'
          onDragOverRow({ id: node.id, position })
        }}
        onDragLeave={(e) => {
          // only clear if leaving to outside of section
          const related = e.relatedTarget as HTMLElement | null
          if (!related || !related.closest?.('.category-row')) {
            // we leave it; next dragOver will replace
          }
        }}
        onDrop={(e) => {
          e.preventDefault()
          if (!draggingId || draggingId === node.id) return
          onDropRow(target)
        }}
        style={{ paddingLeft: 8 + node.depth * 20 }}
        className={`category-row group flex items-center gap-2 rounded-md px-2 py-1 text-sm transition ${
          node.isArchived ? 'opacity-50' : ''
        } ${isBeingDragged ? 'opacity-40' : ''} ${
          target?.position === 'inside' ? 'bg-sky-500/20 ring-1 ring-sky-500' : 'hover:bg-slate-800/60'
        }`}
      >
        <span className="cursor-grab text-slate-600 group-hover:text-slate-400" title="드래그">
          ⋮⋮
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {node.color && (
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: node.color }}
            />
          )}
          {node.icon && <span>{node.icon}</span>}
          <span className="truncate text-slate-200">{node.name}</span>
          {node.isArchived && (
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">
              보관
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          <IconBtn title="위로" disabled={busy} onClick={() => onReorder(node, -1)}>
            ▲
          </IconBtn>
          <IconBtn title="아래로" disabled={busy} onClick={() => onReorder(node, 1)}>
            ▼
          </IconBtn>
          <IconBtn
            title="하위 카테고리 추가"
            disabled={busy}
            onClick={() => onAddChild(node.id, node.kind)}
          >
            +
          </IconBtn>
          <IconBtn title="편집" disabled={busy} onClick={() => onEdit(node)}>
            ✎
          </IconBtn>
          {node.isArchived ? (
            <>
              <IconBtn
                title="보관 해제"
                disabled={busy}
                onClick={() => onUnarchive(node)}
                tone="emerald"
              >
                ↩
              </IconBtn>
              <IconBtn
                title="영구 삭제"
                disabled={busy}
                onClick={() => onDelete(node)}
                tone="rose"
              >
                🗑
              </IconBtn>
            </>
          ) : (
            <IconBtn title="보관" disabled={busy} onClick={() => onArchive(node)} tone="amber">
              📦
            </IconBtn>
          )}
        </div>
      </div>
      {target?.position === 'after' && (
        <div
          style={{ paddingLeft: 8 + node.depth * 20 }}
          className="my-0.5 h-0.5 bg-sky-500"
        />
      )}
      {node.children.map((c) => (
        <CategoryNodeRow
          key={c.id}
          node={c}
          onEdit={onEdit}
          onAddChild={onAddChild}
          onArchive={onArchive}
          onUnarchive={onUnarchive}
          onDelete={onDelete}
          onReorder={onReorder}
          busy={busy}
          draggingId={draggingId}
          dragTarget={dragTarget}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOverRow={onDragOverRow}
          onDropRow={onDropRow}
        />
      ))}
    </>
  )
}

function IconBtn({
  children,
  title,
  onClick,
  disabled,
  tone
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  disabled?: boolean
  tone?: 'rose' | 'emerald' | 'amber'
}): React.JSX.Element {
  const toneClass =
    tone === 'rose'
      ? 'hover:text-rose-300'
      : tone === 'emerald'
        ? 'hover:text-emerald-300'
        : tone === 'amber'
          ? 'hover:text-amber-300'
          : 'hover:text-slate-200'
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-6 w-6 items-center justify-center rounded text-xs text-slate-500 transition hover:bg-slate-700/60 ${toneClass} disabled:opacity-40`}
    >
      {children}
    </button>
  )
}


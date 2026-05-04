import { useEffect, useMemo, useState } from 'react'
import type { CategoryKind, CategoryTreeNode } from '../../../shared/types'
import Modal from './Modal'

interface Props {
  open: boolean
  kind: CategoryKind
  selectedId: string | null
  onPick: (id: string | null) => void
  onClose: () => void
}

export default function CategoryPicker({
  open,
  kind,
  selectedId,
  onPick,
  onClose
}: Props): React.JSX.Element | null {
  const [tree, setTree] = useState<CategoryTreeNode[]>([])
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (!open) return
    window.api.categories.tree().then(setTree)
  }, [open])

  const filtered = useMemo(() => {
    const roots = tree.filter((c) => c.kind === kind)
    if (!filter.trim()) return roots
    const q = filter.trim().toLowerCase()
    const match = (n: CategoryTreeNode): CategoryTreeNode | null => {
      const hit = n.name.toLowerCase().includes(q) || n.path.toLowerCase().includes(q)
      const children = n.children.map(match).filter(Boolean) as CategoryTreeNode[]
      if (hit || children.length > 0) return { ...n, children }
      return null
    }
    return roots.map(match).filter(Boolean) as CategoryTreeNode[]
  }, [tree, kind, filter])

  if (!open) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${kind === 'income' ? '수입' : '지출'} 카테고리 선택`}
      size="md"
      footer={
        <>
          <button
            onClick={() => {
              onPick(null)
              onClose()
            }}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
          >
            미분류로 두기
          </button>
          <button
            onClick={onClose}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
          >
            닫기
          </button>
        </>
      }
    >
      <input
        autoFocus
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="카테고리 검색"
        className="mb-3 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
      />
      <div className="max-h-[50vh] space-y-0.5 overflow-auto">
        {filtered.length === 0 && (
          <div className="py-6 text-center text-sm text-slate-500">
            일치하는 카테고리가 없습니다.
          </div>
        )}
        {filtered.map((n) => (
          <TreeRow
            key={n.id}
            node={n}
            selectedId={selectedId}
            onPick={(id) => {
              onPick(id)
              onClose()
            }}
          />
        ))}
      </div>
    </Modal>
  )
}

function TreeRow({
  node,
  selectedId,
  onPick
}: {
  node: CategoryTreeNode
  selectedId: string | null
  onPick: (id: string) => void
}): React.JSX.Element {
  return (
    <>
      <button
        onClick={() => onPick(node.id)}
        style={{ paddingLeft: 8 + node.depth * 16 }}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
          selectedId === node.id
            ? 'bg-sky-500/20 text-sky-200'
            : 'text-slate-200 hover:bg-slate-800'
        }`}
      >
        {node.icon && <span>{node.icon}</span>}
        <span className="flex-1 truncate">{node.name}</span>
        {node.depth > 0 && (
          <span className="text-xs text-slate-500">{node.path.split(' › ')[0]}</span>
        )}
      </button>
      {node.children.map((c) => (
        <TreeRow key={c.id} node={c} selectedId={selectedId} onPick={onPick} />
      ))}
    </>
  )
}

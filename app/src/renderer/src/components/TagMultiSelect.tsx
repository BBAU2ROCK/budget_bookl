import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { TagDto } from '../../../shared/types'

interface Props {
  value: string[]
  onChange: (ids: string[]) => void
}

function TagMultiSelect({ value, onChange }: Props): React.JSX.Element {
  const [tags, setTags] = useState<TagDto[]>([])
  const [input, setInput] = useState('')
  const [suggestOpen, setSuggestOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.api.tags.list().then(setTags)
  }, [])

  const selectedTags = useMemo(
    () => value.map((id) => tags.find((t) => t.id === id)).filter((t): t is TagDto => Boolean(t)),
    [tags, value]
  )

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase()
    const already = new Set(value)
    return tags
      .filter((t) => !already.has(t.id))
      .filter((t) => !q || t.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [tags, input, value])

  async function addOrCreate(name: string): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) return
    const existing = tags.find((t) => t.name === trimmed)
    if (existing) {
      if (!value.includes(existing.id)) onChange([...value, existing.id])
    } else {
      const created = await window.api.tags.create({ name: trimmed })
      setTags((prev) => [...prev, created])
      onChange([...value, created.id])
    }
    setInput('')
    setSuggestOpen(false)
  }

  function remove(id: string): void {
    onChange(value.filter((v) => v !== id))
  }

  return (
    <div className="relative">
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex min-h-[38px] cursor-text flex-wrap items-center gap-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm focus-within:border-sky-500"
      >
        {selectedTags.map((t) => (
          <span
            key={t.id}
            className="flex items-center gap-1 rounded bg-slate-700/50 px-2 py-0.5 text-xs text-slate-200"
          >
            {t.color && (
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: t.color }}
              />
            )}
            {t.name}
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="ml-1 text-slate-400 hover:text-slate-100"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setSuggestOpen(true)
          }}
          onFocus={() => setSuggestOpen(true)}
          onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addOrCreate(input)
            } else if (e.key === 'Backspace' && !input && value.length > 0) {
              remove(value[value.length - 1])
            }
          }}
          placeholder={selectedTags.length === 0 ? '태그 입력 후 엔터 (예: #여행)' : ''}
          className="min-w-[120px] flex-1 bg-transparent text-slate-100 placeholder-slate-500 focus:outline-none"
        />
      </div>
      {suggestOpen && suggestions.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-slate-700 bg-slate-900 shadow-lg">
          {suggestions.map((t) => (
            <button
              key={t.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                addOrCreate(t.name)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-800"
            >
              {t.color && (
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: t.color }}
                />
              )}
              {t.name}
            </button>
          ))}
          {input.trim() && !suggestions.find((s) => s.name === input.trim()) && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                addOrCreate(input)
              }}
              className="flex w-full items-center gap-2 border-t border-slate-700 px-3 py-1.5 text-left text-sm text-sky-300 hover:bg-slate-800"
            >
              + 새 태그 만들기: <span className="font-medium">{input.trim()}</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
export default memo(TagMultiSelect)

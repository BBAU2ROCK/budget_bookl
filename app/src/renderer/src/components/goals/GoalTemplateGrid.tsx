import type { CurrencyDto, GoalTemplate } from '../../../../shared/types'
import { GOAL_TEMPLATES } from '../../../../shared/types'
import { formatMoney } from '../../lib/money'

interface Props {
  currencies: CurrencyDto[]
  onSelect: (template: GoalTemplate) => void
  onCreateCustom: () => void
}

export default function GoalTemplateGrid({
  currencies,
  onSelect,
  onCreateCustom
}: Props): React.JSX.Element {
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {GOAL_TEMPLATES.map((tmpl) => (
          <button
            key={tmpl.templateId}
            onClick={() => onSelect(tmpl)}
            className="rounded-lg border border-slate-700/70 bg-slate-900/40 p-4 text-left transition hover:border-sky-500/60 hover:bg-sky-500/5"
          >
            <div className="text-2xl">{tmpl.icon}</div>
            <div className="mt-2 text-sm font-semibold text-slate-100">{tmpl.name}</div>
            <div className="mt-1 text-[10px] text-slate-500">{tmpl.description}</div>
            <div className="mt-2 font-mono text-xs text-sky-300">
              ~ {formatMoney(tmpl.suggestedAmount, 'KRW', currencies)} KRW
            </div>
          </button>
        ))}
      </div>
      <div className="mt-4 text-center">
        <button
          onClick={onCreateCustom}
          className="rounded-md border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700"
        >
          + 직접 만들기
        </button>
      </div>
    </div>
  )
}

import { useState } from 'react'
import Dashboard from './views/Dashboard'
import Transactions from './views/Transactions'
import Categories from './views/Categories'
import Tags from './views/Tags'
import Budgets from './views/Budgets'
import Goals from './views/Goals'
import Accounts from './views/Accounts'
import Recurring from './views/Recurring'
import BackupSettings from './views/BackupSettings'
import DbSmokeTest from './components/DbSmokeTest'
import { ToastProvider } from './components/toast/ToastContext'

type Route =
  | 'dashboard'
  | 'transactions'
  | 'categories'
  | 'tags'
  | 'budgets'
  | 'goals'
  | 'accounts'
  | 'recurring'
  | 'backup'
  | 'dev'

/** Dev-only tools are hidden in production builds (npm run build:*). */
const IS_DEV = import.meta.env.DEV

const BASE_NAV: Array<{ key: Route; label: string; icon: string }> = [
  { key: 'dashboard', label: '대시보드', icon: '📊' },
  { key: 'transactions', label: '거래 내역', icon: '📋' },
  { key: 'categories', label: '카테고리', icon: '🗂️' },
  { key: 'tags', label: '태그', icon: '🏷️' },
  { key: 'budgets', label: '예산', icon: '💰' },
  { key: 'goals', label: '목표', icon: '🎯' },
  { key: 'accounts', label: '계좌', icon: '🏦' },
  { key: 'recurring', label: '반복지출/수입', icon: '🔁' },
  { key: 'backup', label: '설정 / 백업', icon: '⚙️' }
]

const NAV: Array<{ key: Route; label: string; icon: string }> = IS_DEV
  ? [...BASE_NAV, { key: 'dev', label: '개발자', icon: '🧪' }]
  : BASE_NAV

function App(): React.JSX.Element {
  const [route, setRoute] = useState<Route>('dashboard')

  return (
    <ToastProvider>
    <div className="flex min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <Sidebar route={route} setRoute={setRoute} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          {route === 'dashboard' && <Dashboard />}
          {route === 'transactions' && <Transactions />}
          {route === 'categories' && <Categories />}
          {route === 'tags' && <Tags />}
          {route === 'budgets' && <Budgets />}
          {route === 'goals' && <Goals />}
          {route === 'accounts' && <Accounts />}
          {route === 'recurring' && <Recurring />}
          {route === 'backup' && <BackupSettings />}
          {route === 'dev' && IS_DEV && (
            <div className="space-y-4">
              <header>
                <h1 className="text-2xl font-bold text-slate-100">개발자 도구</h1>
                <p className="text-sm text-slate-400">DB 스모크 테스트 · 데이터 수동 생성</p>
              </header>
              <DbSmokeTest />
            </div>
          )}
        </div>
      </main>
    </div>
    </ToastProvider>
  )
}

function Sidebar({
  route,
  setRoute
}: {
  route: Route
  setRoute: (r: Route) => void
}): React.JSX.Element {
  return (
    <aside className="w-56 shrink-0 border-r border-slate-800 bg-slate-950/60 px-4 py-6">
      <div className="mb-8 px-2">
        <div className="bg-gradient-to-br from-sky-400 via-indigo-300 to-fuchsia-300 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
          BudgetBook
        </div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500">
          오프라인 가계부
        </div>
      </div>
      <nav className="space-y-1">
        {NAV.map((n) => (
          <button
            key={n.key}
            onClick={() => setRoute(n.key)}
            className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
              route === n.key
                ? 'bg-sky-500/15 text-sky-200'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            <span className="text-base">{n.icon}</span>
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}

export default App

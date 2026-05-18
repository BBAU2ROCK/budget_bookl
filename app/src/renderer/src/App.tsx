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
import { AuthProvider, useAuth } from './components/auth/AuthContext'
import LoginScreen from './components/auth/LoginScreen'

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
  return (
    <AuthProvider>
      <ToastProvider>
        <AuthGate />
      </ToastProvider>
    </AuthProvider>
  )
}

/**
 * 인증 상태에 따라 LoginScreen / Loading / 메인앱 분기.
 * - loading: 인증 토큰 확인 중 (Firebase 초기화 ~1초)
 * - user === null: 로그인 화면
 * - user !== null: 메인 앱
 */
function AuthGate(): React.JSX.Element {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <LoginScreen />
  return <MainApp />
}

function LoadingScreen(): React.JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-400">
      <div className="text-sm">불러오는 중…</div>
    </div>
  )
}

function MainApp(): React.JSX.Element {
  const [route, setRoute] = useState<Route>('dashboard')

  return (
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
  )
}

function Sidebar({
  route,
  setRoute
}: {
  route: Route
  setRoute: (r: Route) => void
}): React.JSX.Element {
  const { user, signOutUser } = useAuth()
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-800 bg-slate-950/60 px-4 py-6">
      <div className="mb-8 px-2">
        <div className="bg-gradient-to-br from-sky-400 via-indigo-300 to-fuchsia-300 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
          BudgetBook
        </div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500">
          가족 공유 가계부
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
      {user && (
        <div className="mt-auto border-t border-slate-800 px-2 pt-4">
          <div className="mb-2 flex items-center gap-2">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName ?? user.email ?? 'user'}
                className="h-7 w-7 rounded-full border border-slate-700"
              />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-xs text-slate-300">
                {(user.displayName ?? user.email ?? '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs text-slate-200">
                {user.displayName ?? user.email}
              </div>
              {user.displayName && (
                <div className="truncate text-[10px] text-slate-500">{user.email}</div>
              )}
            </div>
          </div>
          <button
            onClick={() => void signOutUser()}
            className="w-full rounded-md px-2 py-1.5 text-left text-xs text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200"
          >
            🚪 로그아웃
          </button>
        </div>
      )}
    </aside>
  )
}

export default App

/**
 * LoginScreen — 미로그인 상태에서 표시되는 게이트 화면.
 *
 * 두 가지 모드:
 * 1. configured === false (Firebase env 키 없음): 설정 안내 화면
 * 2. configured === true && user === null: Google 로그인 버튼
 *
 * 디자인: App.tsx 사이드바의 BudgetBook 로고 그라데이션과 동일 톤 유지.
 */
import { useState } from 'react'
import { useAuth } from './AuthContext'

export default function LoginScreen(): React.JSX.Element {
  const { configured, signInWithGoogle } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!configured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6 text-slate-200">
        <div className="max-w-lg rounded-xl border border-amber-500/40 bg-amber-500/10 p-6">
          <h2 className="mb-3 text-lg font-bold text-amber-200">⚠️ Firebase 설정이 필요합니다</h2>
          <p className="mb-4 text-sm text-amber-100/90">
            클라우드 연결 정보(<code className="rounded bg-amber-500/20 px-1">app/.env</code>)가
            비어 있어요. 다음 절차를 따라주세요:
          </p>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-amber-100/90">
            <li>
              <code className="rounded bg-amber-500/20 px-1">01_docs/v0.2.0-cloud-setup.md</code>{' '}
              가이드를 따라 마님 Google 계정으로 Firebase 프로젝트 생성
            </li>
            <li>웹 앱 등록 후 받은 <code className="rounded bg-amber-500/20 px-1">firebaseConfig</code> 6줄을 채팅에 붙여넣기</li>
            <li>Claude가 <code className="rounded bg-amber-500/20 px-1">app/.env</code> 파일에 자동 주입</li>
            <li>앱 재시작 (<code className="rounded bg-amber-500/20 px-1">npm run dev</code>)</li>
          </ol>
          <div className="mt-4 rounded-md border border-slate-600/40 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
            💡 본 화면은 v0.2.0 클라우드 마이그레이션 브랜치에서만 표시됩니다. 로컬 SQLite로
            계속 쓰려면 <code>main</code> 브랜치(v0.1.15)로 전환하세요.
          </div>
        </div>
      </div>
    )
  }

  const handleSignIn = async (): Promise<void> => {
    setError(null)
    setBusy(true)
    try {
      await signInWithGoogle()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // 사용자가 팝업을 직접 닫은 경우는 에러로 표시하지 않음
      if (msg.includes('popup-closed-by-user') || msg.includes('cancelled-popup')) {
        setError(null)
      } else {
        setError(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6 text-slate-100">
      <div className="w-full max-w-sm rounded-xl border border-slate-700/70 bg-slate-900/60 p-8 text-center shadow-2xl shadow-sky-900/20">
        <div className="mb-1 bg-gradient-to-br from-sky-400 via-indigo-300 to-fuchsia-300 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
          BudgetBook
        </div>
        <div className="mb-8 text-[10px] uppercase tracking-wider text-slate-500">
          가족 공유 가계부
        </div>

        <button
          onClick={handleSignIn}
          disabled={busy}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-600 bg-white px-4 py-3 text-sm font-medium text-slate-800 transition hover:bg-slate-100 disabled:opacity-60"
        >
          {/* Google G 로고 — 색상별 path 4개 */}
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
            />
            <path
              fill="#FBBC05"
              d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"
            />
          </svg>
          {busy ? '로그인 중…' : 'Google 계정으로 로그인'}
        </button>

        {error && (
          <div className="mt-4 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-left text-xs text-rose-200">
            로그인 실패: {error}
          </div>
        )}

        <p className="mt-8 text-[10px] leading-relaxed text-slate-500">
          가족 구성원으로 등록된 Google 계정만 가계부 데이터에 접근할 수 있습니다.
          <br />
          본 앱은 v0.2.0 클라우드 마일스톤(개발 중)입니다.
        </p>
      </div>
    </div>
  )
}

/**
 * AuthContext — Firebase 인증 상태를 React Context로 노출.
 *
 * 사용 흐름:
 * 1. App.tsx 최상단에서 `<AuthProvider>`로 래핑
 * 2. 자식 컴포넌트는 `useAuth()`로 user / loading / signInWithGoogle 접근
 * 3. user === null이면 LoginScreen 표시, 아니면 메인 앱
 *
 * Firebase 미설정 환경 (env 키 없음) 대응:
 * - `configured === false`로 표시 → LoginScreen에서 셋업 안내 화면
 * - 미설정 상태에서는 onAuthStateChanged 호출 자체를 하지 않음 (런타임 에러 방지)
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from 'react'
import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User
} from 'firebase/auth'
import { isFirebaseConfigured, getFirebaseAuth } from '../../lib/firebase'

export interface AuthState {
  /** 로그인된 Firebase User. null이면 미로그인 */
  user: User | null
  /** 초기 인증 상태 결정 전 (Firebase가 캐시된 토큰을 확인 중) */
  loading: boolean
  /** Firebase env 키가 채워져 있는지. false면 LoginScreen이 설정 안내 화면 표시 */
  configured: boolean
  /** Google 팝업 로그인 트리거 */
  signInWithGoogle: () => Promise<void>
  /** 로그아웃 */
  signOutUser: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const configured = isFirebaseConfigured()
  const [user, setUser] = useState<User | null>(null)
  // 미설정 환경에서는 loading 즉시 false (아예 인증 흐름 자체가 없음)
  const [loading, setLoading] = useState<boolean>(configured)

  useEffect(() => {
    if (!configured) return
    const unsub = onAuthStateChanged(getFirebaseAuth(), (u) => {
      setUser(u)
      setLoading(false)
    })
    return unsub
  }, [configured])

  const signInWithGoogle = async (): Promise<void> => {
    if (!configured) throw new Error('Firebase가 설정되지 않았습니다.')
    const provider = new GoogleAuthProvider()
    // 추가 scope 필요 시 여기에 — 가계부는 기본 profile + email로 충분
    await signInWithPopup(getFirebaseAuth(), provider)
  }

  const signOutUser = async (): Promise<void> => {
    if (!configured) return
    await signOut(getFirebaseAuth())
  }

  return (
    <AuthContext.Provider value={{ user, loading, configured, signInWithGoogle, signOutUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth는 <AuthProvider> 안에서만 사용 가능합니다.')
  return ctx
}

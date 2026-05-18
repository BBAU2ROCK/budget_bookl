/**
 * Firebase 초기화 모듈 (v0.2.0 클라우드 마이그레이션).
 *
 * - `app/.env` 파일에서 `VITE_FIREBASE_*` 키 6개를 읽음
 * - 키가 누락되면 `isFirebaseConfigured()`가 false 반환 → LoginScreen에서 설정 안내
 * - App/Auth/Firestore 인스턴스는 lazy singleton (첫 호출 시 생성)
 *
 * 보안 메모:
 * - 클라이언트 apiKey는 공개되어도 안전 (Google 정책)
 * - 실제 데이터 보호는 `firestore.rules`의 가족 이메일 화이트리스트로 처리
 */
import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
}

let appInst: FirebaseApp | null = null
let authInst: Auth | null = null
let dbInst: Firestore | null = null

/** firebaseConfig 6개 키 중 핵심 2개(apiKey, projectId)가 채워져 있으면 true */
export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)
}

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error(
      'Firebase가 설정되지 않았습니다. app/.env 파일에 VITE_FIREBASE_* 6개 키를 채워주세요.'
    )
  }
  if (!appInst) appInst = initializeApp(firebaseConfig)
  return appInst
}

export function getFirebaseAuth(): Auth {
  if (!authInst) authInst = getAuth(getFirebaseApp())
  return authInst
}

export function getFirebaseDb(): Firestore {
  if (!dbInst) dbInst = getFirestore(getFirebaseApp())
  return dbInst
}

/** 디버그용 — Console에서 현재 projectId 등 확인 */
export function getFirebaseConfigSummary(): {
  configured: boolean
  projectId?: string
  authDomain?: string
} {
  return {
    configured: isFirebaseConfigured(),
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain
  }
}

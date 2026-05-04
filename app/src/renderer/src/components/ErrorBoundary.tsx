import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Uncaught error:', error, errorInfo)
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-slate-100">
          <div className="mb-6 text-6xl">⚠️</div>
          <h1 className="mb-2 text-2xl font-bold">오류가 발생했습니다</h1>
          <p className="mb-6 text-center text-slate-400">
            앱 실행 중 예상치 못한 오류가 발생했습니다. <br />
            아래 버튼을 눌러 다시 시작해 보세요.
          </p>
          <div className="w-full max-w-lg overflow-auto rounded-lg bg-slate-900 p-4 font-mono text-xs text-rose-300">
            {this.state.error?.toString()}
          </div>
          <button
            onClick={() => window.api.appControl.relaunch()}
            className="mt-8 rounded-md bg-sky-600 px-6 py-2 font-medium text-white transition hover:bg-sky-500"
          >
            앱 다시 시작
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

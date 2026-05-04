import type { ReactNode } from 'react'

/**
 * 라벨 옆 작은 ⓘ 아이콘. hover 시 의미와 계산 방법을 설명하는 풀이가 떠오름.
 * 가계부를 처음 쓰는 일반 사용자도 이해할 수 있도록 전문 용어 없이 친절하게 풀어 적기.
 *
 * 사용 예:
 *   <span className="text-sm">지출 <InfoTip>이번 달 카드/현금/통장에서 빠져나간 돈입니다.</InfoTip></span>
 *
 * children에는 ReactNode 가능 — 줄바꿈/강조 등 풍부한 마크업 허용.
 */
export default function InfoTip({
  children,
  side = 'top',
  width = 'w-72'
}: {
  children: ReactNode
  /** 풀이 풍선 위치 — 라벨이 화면 위쪽이면 'bottom', 아래쪽이면 'top' (기본) */
  side?: 'top' | 'bottom'
  /** 풀이 풍선 너비 — tailwind 클래스 */
  width?: string
}): React.JSX.Element {
  const positionClass =
    side === 'top'
      ? 'bottom-full mb-1.5'
      : 'top-full mt-1.5'
  const arrowClass =
    side === 'top'
      ? 'top-full -mt-1 border-t-slate-700'
      : 'bottom-full -mb-1 border-b-slate-700'

  return (
    <span className="group relative inline-flex items-center">
      <span
        className="ml-1 inline-flex h-3.5 w-3.5 cursor-help select-none items-center justify-center rounded-full border border-slate-600 text-[9px] font-bold text-slate-500 transition hover:border-sky-400 hover:text-sky-300"
        aria-label="설명"
      >
        ?
      </span>
      <span
        role="tooltip"
        className={`pointer-events-none invisible absolute left-1/2 z-50 ${positionClass} ${width} -translate-x-1/2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-left text-[11px] font-normal leading-relaxed text-slate-200 opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100`}
      >
        {children}
        <span
          className={`absolute left-1/2 -translate-x-1/2 ${arrowClass} h-0 w-0 border-x-4 border-x-transparent border-y-4 border-b-transparent`}
        />
      </span>
    </span>
  )
}

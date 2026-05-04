"""
BudgetBook user manual generator (v4 — flowcharts + glossary).

이전 버전 대비 변경:
- 챕터별 업무 흐름도(Flowchart) 7개 추가 — ReportLab Flowable로 직접 그림
- "자주 나오는 단어"(용어집) 페이지 신설 — 모달/토글/위젯 등 15개
- 본문 외래어 정리 (due, surfacing, FTS5, trigram, 트리거 → 한국어로)
- 첫 등장 시 한국어 병기 ("모달(입력 창)" 식)
- 버전 표기 0.1.7 → 0.1.8

출력: D:/01_project/05_Budget_Book/01_docs/manual/BudgetBook-사용설명서.pdf
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterable

from PIL import Image as PILImage
from PIL import ImageDraw as PILImageDraw
from PIL import ImageFont as PILImageFont
from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Flowable,
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# ────────────────────────────────────────────
# Paths & fonts
# ────────────────────────────────────────────
BASE = Path(r"D:\01_project\05_Budget_Book\01_docs\manual")
SHOTS = BASE / "screenshots"
ANNOT = BASE / "annotated"
ANNOT.mkdir(exist_ok=True)
OUT = BASE / "BudgetBook-사용설명서.pdf"

pdfmetrics.registerFont(TTFont("Malgun", r"C:\Windows\Fonts\malgun.ttf"))
pdfmetrics.registerFont(TTFont("MalgunBold", r"C:\Windows\Fonts\malgunbd.ttf"))


# ────────────────────────────────────────────
# Annotation overlay — 작은 배지로 변경
# ────────────────────────────────────────────
BADGE_FONT = PILImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 28)
BADGE_RADIUS = 26
BADGE_FILL = (234, 88, 12, 245)        # 진한 주황 (orange-600)
BADGE_BORDER_COLOR = (255, 255, 255, 255)
BADGE_BORDER_WIDTH = 3


def annotate(src: Path, points: Iterable[tuple[int, int, int]], dst: Path) -> Path:
    img = PILImage.open(src).convert("RGBA")
    overlay = PILImage.new("RGBA", img.size, (0, 0, 0, 0))
    draw = PILImageDraw.Draw(overlay)

    for x, y, n in points:
        draw.ellipse(
            [x - BADGE_RADIUS - BADGE_BORDER_WIDTH, y - BADGE_RADIUS - BADGE_BORDER_WIDTH,
             x + BADGE_RADIUS + BADGE_BORDER_WIDTH, y + BADGE_RADIUS + BADGE_BORDER_WIDTH],
            fill=BADGE_BORDER_COLOR,
        )
        draw.ellipse(
            [x - BADGE_RADIUS, y - BADGE_RADIUS,
             x + BADGE_RADIUS, y + BADGE_RADIUS],
            fill=BADGE_FILL,
        )
        text = str(n)
        bbox = draw.textbbox((0, 0), text, font=BADGE_FONT)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text(
            (x - tw / 2 - bbox[0], y - th / 2 - bbox[1]),
            text,
            font=BADGE_FONT,
            fill=(255, 255, 255, 255),
        )

    out = PILImage.alpha_composite(img, overlay).convert("RGB")
    out.save(dst, optimize=True)
    return dst


ANNOTATIONS: dict[str, list[tuple[int, int, int]]] = {
    "01_dashboard.png": [
        (185, 95, 1),
        (185, 410, 2),
        (1850, 105, 3),
        (2270, 105, 4),
        (1100, 290, 5),
        (640, 770, 6),
        (1900, 770, 7),
    ],
    "02_transactions.png": [
        (1820, 110, 1),
        (2200, 110, 2),
        (2440, 110, 3),
        (1100, 230, 4),
    ],
    "03_categories.png": [
        (1880, 105, 1),
        (2160, 105, 2),
        (2440, 105, 3),
        (820, 380, 4),
        (1900, 320, 5),
    ],
    "04_tags.png": [
        (1900, 105, 1),
        (2200, 105, 2),
        (2440, 105, 3),
        (640, 285, 4),
        (1700, 285, 5),
        (2280, 285, 6),
    ],
    "05_budgets.png": [
        (2000, 105, 1),
        (2240, 105, 2),
        (2440, 105, 3),
        (1300, 290, 4),
    ],
    "06_goals.png": [
        (1860, 105, 1),
        (2030, 105, 2),
        (2440, 105, 3),
        (700, 530, 4),
        (1280, 1000, 5),
    ],
    "07_accounts.png": [
        (2440, 105, 1),
    ],
    "08_recurring.png": [
        (2440, 105, 1),
    ],
    "09_backup.png": [
        (640, 230, 1),
        (640, 555, 2),
        (1430, 555, 3),
        (640, 740, 4),
        (1430, 740, 5),
        (640, 940, 6),
        (640, 1130, 7),
    ],
    "10_transaction_form.png": [
        (770, 240, 1),
        (770, 340, 2),
        (770, 435, 3),
        (770, 540, 4),
        (770, 635, 5),
        (770, 740, 6),
        (770, 990, 7),
    ],
    "11_tag_form.png": [
        (880, 270, 1),
        (880, 380, 2),
        (880, 580, 3),
    ],
    "12_budget_form.png": [
        (770, 270, 1),
        (770, 400, 2),
        (770, 540, 3),
        (770, 615, 4),
    ],
    "13_goal_form.png": [
        (770, 230, 1),
        (770, 440, 2),
        (770, 560, 3),
        (770, 700, 4),
    ],
    "14_account_form.png": [
        (770, 240, 1),
        (770, 380, 2),
        (770, 540, 3),
        (1340, 540, 4),
    ],
    "15_recurring_form.png": [
        (770, 240, 1),
        (770, 360, 2),
        (770, 480, 3),
        (770, 740, 4),
    ],
}


def build_all_annotated() -> None:
    for fname in ANNOTATIONS:
        src = SHOTS / fname
        dst = ANNOT / fname
        if not src.exists():
            print(f"[skip] {fname} (source missing)")
            continue
        annotate(src, ANNOTATIONS[fname], dst)
        print(f"  annotated: {dst.name}")


# ────────────────────────────────────────────
# Flowchart Flowable — 직선형 박스 흐름도
# ────────────────────────────────────────────
class Flowchart(Flowable):
    """
    수직 박스 시퀀스 흐름도. ReportLab Flowable.

    nodes: list of (kind, text)
      kind:
        'start'  — 시작 박스 (진청 배경, 흰 글씨)
        'step'   — 일반 단계 (흰 배경 + 진청 테두리)
        'choice' — 분기/선택 (노란 배경)
        'end'    — 결과/종료 (초록 배경, 흰 글씨)
      text: '\\n'으로 줄바꿈 가능. 한 줄당 30자 이내 권장.

    박스 사이에는 자동으로 ▼ 화살표가 그려진다.
    """

    BOX_W = 115 * mm
    LINE_H = 4.6 * mm
    BOX_PAD_V = 3.5 * mm   # 박스 위/아래 안쪽 여백
    GAP = 7 * mm           # 박스 사이 간격 (화살표 높이 포함)

    THEMES = {
        "start": dict(fill="#0c4a6e", text="#ffffff", border="#0c4a6e", bold=True),
        "step":  dict(fill="#ffffff", text="#1e293b", border="#0369a1", bold=False),
        "choice": dict(fill="#fef3c7", text="#78350f", border="#d97706", bold=False),
        "end":   dict(fill="#065f46", text="#ffffff", border="#065f46", bold=True),
    }

    def __init__(self, nodes, max_width=None):
        Flowable.__init__(self)
        self.nodes = nodes
        self.max_width = max_width or (PAGE_USABLE_W_MM * mm)
        self._compute_dims()

    def _box_height(self, text: str) -> float:
        lines = text.count("\n") + 1
        return self.BOX_PAD_V * 2 + lines * self.LINE_H

    def _compute_dims(self):
        h = 0.0
        for i, (_kind, text) in enumerate(self.nodes):
            h += self._box_height(text)
            if i < len(self.nodes) - 1:
                h += self.GAP
        # 위/아래 여백
        self._height = h + 4 * mm
        self._width = self.max_width

    def wrap(self, availWidth, availHeight):
        return self._width, self._height

    def draw(self):
        c = self.canv
        cx = self._width / 2.0
        bw = self.BOX_W
        bx = cx - bw / 2.0

        # 위에서부터 그림
        y = self._height - 2 * mm

        for i, (kind, text) in enumerate(self.nodes):
            theme = self.THEMES[kind]
            bh = self._box_height(text)

            # 박스
            c.setFillColor(HexColor(theme["fill"]))
            c.setStrokeColor(HexColor(theme["border"]))
            c.setLineWidth(0.8)
            c.roundRect(bx, y - bh, bw, bh, 2.8 * mm, fill=1, stroke=1)

            # 텍스트 (다중 라인 지원, 세로 중앙 정렬)
            c.setFillColor(HexColor(theme["text"]))
            font = "MalgunBold" if theme["bold"] else "Malgun"
            c.setFont(font, 10)
            lines = text.split("\n")
            n = len(lines)
            # 박스 중앙 y 좌표
            box_center_y = y - bh / 2.0
            # 첫 줄의 baseline (위쪽 라인)
            first_baseline = box_center_y + (n - 1) * self.LINE_H / 2.0 - 1.0 * mm
            for j, line in enumerate(lines):
                ty = first_baseline - j * self.LINE_H
                c.drawCentredString(cx, ty, line)

            y -= bh

            # 화살표
            if i < len(self.nodes) - 1:
                arrow_top_y = y - 1 * mm           # 선의 위쪽 끝
                arrow_bot_y = y - self.GAP + 1.5 * mm  # 선의 아래쪽 끝
                head_tip_y = y - self.GAP + 0.2 * mm   # 화살촉 꼭짓점
                # 선
                c.setStrokeColor(HexColor("#94a3b8"))
                c.setLineWidth(1.4)
                c.line(cx, arrow_top_y, cx, arrow_bot_y + 0.5 * mm)
                # 화살촉 (아래쪽 삼각형)
                c.setFillColor(HexColor("#94a3b8"))
                p = c.beginPath()
                p.moveTo(cx - 1.7 * mm, arrow_bot_y + 1 * mm)
                p.lineTo(cx + 1.7 * mm, arrow_bot_y + 1 * mm)
                p.lineTo(cx, head_tip_y)
                p.close()
                c.drawPath(p, fill=1, stroke=0)

                y -= self.GAP


# ────────────────────────────────────────────
# Flowchart 데이터 — 챕터별 업무 흐름
# ────────────────────────────────────────────
FLOW_QUICKSTART = [
    ("start", "BudgetBook 실행 (빈 대시보드)"),
    ("step",  "왼쪽 메뉴에서\n[거래 내역] 클릭"),
    ("step",  "오른쪽 위 [+ 새 거래] 버튼"),
    ("choice", "거래 종류 고르기\n(지출 · 수입 · 이체)"),
    ("step",  "금액 · 날짜 · 카테고리 입력"),
    ("step",  "[저장] 버튼 클릭"),
    ("end",   "대시보드 요약 박스에 자동 반영됨"),
]

FLOW_TX = [
    ("start",  "[+ 새 거래] → 입력 창이 뜸"),
    ("choice", "거래 종류 선택"),
    ("step",   "지출/수입: 카테고리 + 결제·입금 계좌\n이체: 출금 계좌 + 입금 계좌"),
    ("step",   "(이체에서 통화가 다를 때)\n환율 입력란이 자동으로 나타남"),
    ("step",   "필요시 태그 · 메모 · 할인 정보 추가"),
    ("end",    "[저장] → 거래 목록 · 예산 · 대시보드에 동시 반영"),
]

FLOW_BULK = [
    ("start",  "거래 목록 화면"),
    ("step",   "각 행 왼쪽 체크박스 ✓ 또는\n표 머리에서 전체 선택"),
    ("step",   '화면 아래쪽에 "N건 선택됨" 띠가 나타남'),
    ("step",   "[🗑 일괄 삭제] 클릭 → 확인"),
    ("choice", "삭제 직후 6초간 알림 메시지 표시"),
    ("end",    "[되돌리기]를 누르면 전부 복구됨\n6초가 지나면 백업본에서 복원해야 함"),
]

FLOW_CLASSIFY = [
    ("start",  "거래 한 건 입력"),
    ("step",   "카테고리 1개 선택\n(식비 → 외식 → 회식 같은 트리)"),
    ("step",   "태그 N개 추가 (선택)\n예: #출장 #자녀 #구독"),
    ("end",    "예산/대시보드는 카테고리 단위로 집계\n태그 위젯은 태그 단위로 별도 집계"),
]

FLOW_BUDGET = [
    ("start",  "왼쪽 메뉴 [예산]"),
    ("step",   "[+ 새 예산] → 카테고리 · 금액\n· 잔액 이월 여부 입력"),
    ("step",   "한 달 동안 거래를 입력하면\n사용률이 자동 계산됨"),
    ("choice", "사용률 단계\n🟢 안전 → 🟡 주의 → 🟠 초과 → 🔴 위험"),
    ("step",   "🔴 위험 카테고리가 생기면\n대시보드 위쪽에 빨간 띠가 자동 표시"),
    ("end",    "월말: 잔액 이월이 켜져 있으면\n남은 금액이 다음 달 한도에 더해짐"),
]

FLOW_RECURRING = [
    ("start",  "왼쪽 메뉴 [반복 지출]"),
    ("step",   "[+ 새 반복지출]\n→ 이름 · 금액 · 주기 · 시작일 입력"),
    ("step",   "앱을 켤 때마다 예정일이 된 거래가\n자동으로 새로 만들어짐"),
    ("choice", "잠시 멈추고 싶다면\n[일시 정지 종료일] 지정"),
    ("end",    "지정한 날짜가 지나면 자동으로 재개됨"),
]

FLOW_BACKUP = [
    ("start",  "주기적으로: [설정] → [💾 DB 백업]"),
    ("step",   "저장 위치 선택\n→ .db 파일 1개에 모든 데이터 저장"),
    ("step",   "필요한 시점에 [📂 DB 복원]"),
    ("choice", "⚠ 현재 데이터가 백업본으로\n완전히 교체됨"),
    ("end",    "복원 직전에 한 번 더 백업\n→ 잘못된 복원도 되돌릴 수 있음"),
]


# ────────────────────────────────────────────
# 용어집 데이터
# ────────────────────────────────────────────
GLOSSARY: list[tuple[str, str]] = [
    ("모달", "버튼을 눌렀을 때 화면 위에 떠오르는 입력 창. 닫기 전까지는 뒤쪽 화면을 누를 수 없음. 예: [+ 새 거래] 버튼을 누르면 뜨는 창."),
    ("토글", "두 가지 중 하나로 켜고 끄는 스위치. 예: 월별 ↔ 연별 보기 전환 스위치."),
    ("사이드바", "화면 왼쪽에 세로로 붙어 있는 메뉴 띠. 9개 화면을 클릭으로 전환."),
    ("KPI 카드", "핵심 숫자(수입·지출·순수익)를 한눈에 보여주는 큰 박스. 영어 약어인데, 그냥 \"요약 카드\"로 이해하면 됨."),
    ("위젯", "한 화면 안에 들어 있는 작은 정보 박스. 예: 예산 위젯, 목표 위젯."),
    ("드롭다운", "클릭하면 아래로 펼쳐지는 선택 목록. 예: 카테고리 고르기."),
    ("체크박스", "클릭으로 ✓ 또는 빈칸을 바꾸는 작은 사각형 표시."),
    ("액션 바", "여러 행을 선택했을 때 화면 아래쪽에 나타나는 버튼 띠. 일괄 삭제 같은 동작을 모아서 보여줌."),
    ("토스트", "화면 모서리에 잠깐 떴다가 자동으로 사라지는 알림 메시지. 6초 안에 [되돌리기]를 눌러 취소할 수 있음."),
    ("칩", "작고 둥근 라벨 모양의 표시/버튼. 예: 대시보드의 \"주요 변동 칩\"."),
    ("트리 / 트리 구조", "부모 → 자식 → 손자처럼 들여쓰기로 표현된 계층 목록. 예: 식비 → 외식 → 회식."),
    ("배지", "버튼이나 아이콘 옆에 작게 붙는 색깔 표시. 보통 개수나 상태를 알림. 매뉴얼 화면 캡처의 주황색 동그라미도 배지의 일종."),
    ("아카이브 / 보관", "삭제하지 않고 비활성화로 숨김. 나중에 다시 켤 수 있고, 과거 거래는 그대로 유지됨."),
    ("CSV", "엑셀로 열 수 있는, 콤마로 구분된 표 형식 텍스트 파일. 다른 가계부와 데이터를 주고받을 때 사용."),
    ("DB / 데이터베이스", "모든 데이터(거래·계좌·예산 등)가 들어 있는 한 개의 파일. BudgetBook은 budgetbook.db 한 파일에 전부 저장."),
]


# ────────────────────────────────────────────
# Styles
# ────────────────────────────────────────────
def make_styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "title", parent=base["Title"], fontName="MalgunBold",
            fontSize=36, leading=44, alignment=TA_CENTER,
            textColor=colors.HexColor("#0c4a6e"), spaceAfter=10),
        "subtitle": ParagraphStyle(
            "subtitle", parent=base["Normal"], fontName="Malgun",
            fontSize=14, leading=18, alignment=TA_CENTER,
            textColor=colors.HexColor("#475569"), spaceAfter=20),
        "h1": ParagraphStyle(
            "h1", parent=base["Heading1"], fontName="MalgunBold",
            fontSize=22, leading=28,
            textColor=colors.HexColor("#0c4a6e"),
            spaceBefore=18, spaceAfter=12, keepWithNext=True),
        "h2": ParagraphStyle(
            "h2", parent=base["Heading2"], fontName="MalgunBold",
            fontSize=14, leading=19,
            textColor=colors.HexColor("#0369a1"),
            spaceBefore=14, spaceAfter=6, keepWithNext=True),
        "body": ParagraphStyle(
            "body", parent=base["BodyText"], fontName="Malgun",
            fontSize=11, leading=17,
            textColor=colors.HexColor("#1e293b"), spaceAfter=8),
        "lead": ParagraphStyle(
            "lead", parent=base["BodyText"], fontName="Malgun",
            fontSize=11.5, leading=18,
            textColor=colors.HexColor("#475569"),
            spaceAfter=12),
        "bullet": ParagraphStyle(
            "bullet", parent=base["BodyText"], fontName="Malgun",
            fontSize=11, leading=16, leftIndent=14, bulletIndent=2,
            textColor=colors.HexColor("#1e293b"), spaceAfter=4),
        "tip": ParagraphStyle(
            "tip", parent=base["BodyText"], fontName="Malgun",
            fontSize=10.5, leading=15,
            textColor=colors.HexColor("#065f46"),
            backColor=colors.HexColor("#d1fae5"),
            borderPadding=10, spaceBefore=4, spaceAfter=10),
        "warn": ParagraphStyle(
            "warn", parent=base["BodyText"], fontName="Malgun",
            fontSize=10.5, leading=15,
            textColor=colors.HexColor("#92400e"),
            backColor=colors.HexColor("#fef3c7"),
            borderPadding=10, spaceBefore=4, spaceAfter=10),
        "callout": ParagraphStyle(
            "callout", parent=base["BodyText"], fontName="Malgun",
            fontSize=10.5, leading=15,
            textColor=colors.HexColor("#0c4a6e"),
            backColor=colors.HexColor("#e0f2fe"),
            borderPadding=10, spaceBefore=4, spaceAfter=10),
        "caption": ParagraphStyle(
            "caption", parent=base["BodyText"], fontName="Malgun",
            fontSize=9, leading=12, alignment=TA_CENTER,
            textColor=colors.HexColor("#64748b"),
            spaceBefore=2, spaceAfter=14),
        "step": ParagraphStyle(
            "step", parent=base["BodyText"], fontName="Malgun",
            fontSize=11, leading=16, leftIndent=22, firstLineIndent=-22,
            textColor=colors.HexColor("#1e293b"), spaceAfter=5),
        "flow_caption": ParagraphStyle(
            "flow_caption", parent=base["BodyText"], fontName="MalgunBold",
            fontSize=10, leading=13, alignment=TA_CENTER,
            textColor=colors.HexColor("#0c4a6e"),
            spaceBefore=8, spaceAfter=4),
    }


# ────────────────────────────────────────────
# Layout helpers
# ────────────────────────────────────────────
PAGE_USABLE_W_MM = 170


def fit_image(path: Path, max_w_mm=PAGE_USABLE_W_MM, max_h_mm=180) -> Image:
    img = PILImage.open(path)
    iw, ih = img.size
    max_w = max_w_mm * mm
    max_h = max_h_mm * mm
    scale = min(max_w / iw, max_h / ih)
    return Image(str(path), width=iw * scale, height=ih * scale)


_STYLES_CACHE: dict | None = None


def _styles():
    global _STYLES_CACHE
    if _STYLES_CACHE is None:
        _STYLES_CACHE = make_styles()
    return _STYLES_CACHE


def screen(filename: str, caption: str = "", max_h_mm=170):
    styles = _styles()
    p = ANNOT / filename
    if not p.exists():
        p = SHOTS / filename
    if not p.exists():
        return [Paragraph(f"[화면 캡처 없음: {filename}]", styles["caption"])]
    img = fit_image(p, max_h_mm=max_h_mm)
    flow = [img]
    if caption:
        flow.append(Paragraph(caption, styles["caption"]))
    return [KeepTogether(flow)]


def legend(rows: list[tuple[str, str]]) -> Table:
    styles = _styles()
    data = [[
        Paragraph(f"<b>{num}</b>", styles["body"]),
        Paragraph(desc, styles["body"]),
    ] for num, desc in rows]
    t = Table(data, colWidths=[10 * mm, PAGE_USABLE_W_MM * mm - 10 * mm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Malgun"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#fff7ed")),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#9a3412")),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#e2e8f0")),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#f1f5f9")),
    ]))
    return t


def steps(items: list[str]):
    styles = _styles()
    return [Paragraph(f"<b>{i}.</b>&nbsp;&nbsp;{s}", styles["step"])
            for i, s in enumerate(items, start=1)]


def tip(text: str):
    return Paragraph(f"💡 {text}", _styles()["tip"])


def warn(text: str):
    return Paragraph(f"⚠️ {text}", _styles()["warn"])


def note(text: str):
    return Paragraph(text, _styles()["callout"])


def flowchart_block(caption: str, nodes: list[tuple[str, str]]):
    """흐름도 + 상단 캡션을 한 단위로 묶어 페이지 분리 방지."""
    styles = _styles()
    flow = [
        Paragraph(f"📊 {caption}", styles["flow_caption"]),
        Flowchart(nodes),
        Spacer(1, 6),
    ]
    return [KeepTogether(flow)]


def glossary_table(items: list[tuple[str, str]]) -> Table:
    """용어집 표. 왼쪽=용어, 오른쪽=설명."""
    styles = _styles()
    data = []
    for term, desc in items:
        data.append([
            Paragraph(f"<b>{term}</b>", styles["body"]),
            Paragraph(desc, styles["body"]),
        ])
    t = Table(data, colWidths=[34 * mm, PAGE_USABLE_W_MM * mm - 34 * mm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Malgun"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f0f9ff")),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#0c4a6e")),
        ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        ("LINEBELOW", (0, 0), (-1, -2), 0.3, colors.HexColor("#e2e8f0")),
    ]))
    return t


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Malgun", 8)
    canvas.setFillColor(colors.HexColor("#94a3b8"))
    canvas.drawRightString(
        A4[0] - 2 * cm, 1.2 * cm,
        f"BudgetBook 사용설명서 · {doc.page} 페이지",
    )
    canvas.restoreState()


# ────────────────────────────────────────────
# Build PDF
# ────────────────────────────────────────────
def build():
    print("Step 1: generating annotated screenshots (small badges)...")
    build_all_annotated()

    print("Step 2: composing PDF...")
    s = make_styles()
    doc = SimpleDocTemplate(
        str(OUT), pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
        title="BudgetBook 사용설명서", author="jwchoo",
    )
    story = []

    # ──────────── 표지 ────────────
    story.append(Spacer(1, 5 * cm))
    story.append(Paragraph("💰 BudgetBook", s["title"]))
    story.append(Paragraph("사용 설명서", s["title"]))
    story.append(Spacer(1, 0.6 * cm))
    story.append(Paragraph("내 PC 안에서만 돌아가는 가계부", s["subtitle"]))
    story.append(Spacer(1, 6 * cm))

    cover = Table(
        [
            ["대상", "BudgetBook을 처음 켜본 분"],
            ["읽는 시간", "필요한 부분만 골라보면 5분, 통독은 약 25분"],
            ["사용 환경", "Windows / 인터넷 연결 불필요"],
            ["데이터 저장", "%APPDATA%\\BudgetBook (본인 PC에만)"],
            ["버전 기준", "BudgetBook 0.1.8"],
        ],
        colWidths=[3 * cm, 11 * cm],
    )
    cover.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Malgun"),
        ("FONTSIZE", (0, 0), (-1, -1), 11),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#64748b")),
        ("TEXTCOLOR", (1, 0), (1, -1), colors.HexColor("#1e293b")),
        ("ALIGN", (0, 0), (0, -1), "RIGHT"),
        ("ALIGN", (1, 0), (1, -1), "LEFT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -2), 0.3, colors.HexColor("#e2e8f0")),
    ]))
    story.append(cover)
    story.append(PageBreak())

    # ──────────── 이 매뉴얼 보는 법 ────────────
    story.append(Paragraph("이 매뉴얼 보는 법", s["h1"]))
    story.append(Paragraph(
        "급하게 한 가지 작업이 필요한가요? 아래 목차에서 해당 챕터만 펼쳐 보세요. "
        "처음부터 차근차근 읽고 싶다면 1장부터 순서대로 따라오시면 됩니다.",
        s["lead"]))

    story.append(Paragraph("화면 안의 작은 주황 배지", s["h2"]))
    story.append(Paragraph(
        "화면 캡처에는 ① ② ③ … 같은 <b>주황색 작은 동그라미</b>가 그려져 있습니다. "
        "바로 아래 표가 같은 번호로 무엇을 가리키는지 짧게 알려드립니다. "
        "번호와 표를 짝지어 보면 어디를 클릭해야 하는지 한눈에 들어옵니다.",
        s["body"]))

    story.append(Paragraph("강조 박스 세 가지", s["h2"]))
    story.append(Paragraph("• <b>💡 팁 (초록 박스)</b> — 알아두면 편한 작은 요령", s["bullet"]))
    story.append(Paragraph("• <b>⚠️ 주의 (노랑 박스)</b> — 데이터가 손상될 수 있는 동작", s["bullet"]))
    story.append(Paragraph("• <b>참고 (파랑 박스)</b> — 부가 설명이나 배경 지식", s["bullet"]))

    story.append(Paragraph("업무 흐름도 (📊 표시)", s["h2"]))
    story.append(Paragraph(
        "각 챕터 끝에는 <b>📊</b> 표시가 붙은 <b>업무 흐름도</b>가 들어 있습니다. "
        "박스가 위에서 아래로 이어지며 화살표를 따라가면 그 작업의 처음~끝을 한눈에 볼 수 있습니다.",
        s["body"]))
    story.append(Paragraph(
        "박스 색깔에는 의미가 있습니다:", s["body"]))
    story.append(Paragraph("• <b>진청 박스</b> — 시작 지점", s["bullet"]))
    story.append(Paragraph("• <b>흰 박스</b> — 평범한 단계 (그냥 따라 하면 됨)", s["bullet"]))
    story.append(Paragraph("• <b>노란 박스</b> — 선택지 또는 주의가 필요한 분기점", s["bullet"]))
    story.append(Paragraph("• <b>초록 박스</b> — 결과/완료", s["bullet"]))

    story.append(Paragraph("처음 보는 단어가 있을 때", s["h2"]))
    story.append(Paragraph(
        "본문에 <b>모달</b> · <b>토글</b> · <b>위젯</b> 같은 처음 보는 단어가 나오면, "
        "다음 페이지의 <b>「자주 나오는 단어」</b> 표를 펼쳐 의미를 확인하세요. "
        "본문에서도 첫 등장에는 한국어 풀이를 함께 적어두었습니다.",
        s["body"]))

    story.append(PageBreak())

    # ──────────── 자주 나오는 단어 (용어집) ────────────
    story.append(Paragraph("자주 나오는 단어", s["h1"]))
    story.append(Paragraph(
        "본문에서 별다른 설명 없이 등장하는 화면 부품·동작 이름을 한 번에 정리했습니다. "
        "처음 가계부 앱을 써보시는 분이라면 이 표를 한 번 훑어보고 본문으로 넘어가세요.",
        s["lead"]))
    story.append(glossary_table(GLOSSARY))
    story.append(PageBreak())

    # ──────────── 목차 ────────────
    story.append(Paragraph("목차", s["h1"]))
    toc = [
        ("1장", "5분 안에 시작하기 — 처음 켰을 때 이렇게"),
        ("2장", "거래 입력하기 — 가장 자주 쓰는 화면"),
        ("3장", "거래 찾고 정리하기 — 검색·필터·일괄 삭제"),
        ("4장", "분류 도구 — 카테고리와 태그 쓰는 법"),
        ("5장", "예산과 자산 목표 — 한도 정하고 모으기"),
        ("6장", "계좌·카드·반복 지출 — 자산 관리 자동화"),
        ("7장", "대시보드 보는 법 — 한눈에 흐름 파악"),
        ("8장", "백업과 자주 묻는 질문"),
    ]
    toc_data = [[c, t] for c, t in toc]
    toc_table = Table(toc_data, colWidths=[2.4 * cm, 14 * cm])
    toc_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Malgun"),
        ("FONTNAME", (0, 0), (0, -1), "MalgunBold"),
        ("FONTSIZE", (0, 0), (-1, -1), 11),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#0369a1")),
        ("TEXTCOLOR", (1, 0), (1, -1), colors.HexColor("#1e293b")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 0), (-1, -2), 0.3, colors.HexColor("#e2e8f0")),
    ]))
    story.append(toc_table)
    story.append(PageBreak())

    # ════════════════════════════════════════
    # 1장. 5분 안에 시작하기
    # ════════════════════════════════════════
    story.append(Paragraph("1장. 5분 안에 시작하기", s["h1"]))
    story.append(Paragraph(
        "BudgetBook을 처음 실행하면 빈 대시보드가 보입니다. "
        "이 챕터만 따라 하면 거래 한 건을 기록하고 분류해 보는 데까지 5분이면 충분합니다.",
        s["lead"]))

    story.append(Paragraph("처음 만나는 화면", s["h2"]))
    story.extend(screen(
        "01_dashboard.png",
        "〔화면〕 메인 대시보드 — 사이드바(왼쪽 세로 메뉴), 요약 카드(KPI), 위젯(작은 정보 박스)이 한 페이지에"
    ))
    story.append(legend([
        ("①", "BudgetBook 로고. 항상 좌측 상단에 고정."),
        ("②", "<b>사이드바 메뉴</b>(왼쪽 세로 메뉴 띠). 9개 화면을 클릭으로 전환."),
        ("③", "월별 ↔ 연별 보기 <b>토글</b>(스위치)."),
        ("④", "표시할 월(연) 선택."),
        ("⑤", "수입·지출·순수익 요약 카드(KPI 카드)."),
        ("⑥", "이번 달 예산 진행 <b>위젯</b>(작은 정보 박스)."),
        ("⑦", "활성 자산 목표 진행률."),
    ]))
    story.append(Spacer(1, 6))

    story.append(Paragraph("이 순서대로만 따라 해 보세요", s["h2"]))
    story.extend(steps([
        "사이드바에서 <b>거래 내역</b>을 누릅니다.",
        "우측 상단 <b>+ 새 거래</b> 버튼을 누릅니다. (화면 위에 입력 창이 떠오릅니다 — 이게 <b>모달</b>입니다.)",
        "지출 / 수입 / 이체 중 하나를 고르고 금액과 날짜를 입력합니다.",
        "필요하면 카테고리와 태그를 골라 <b>저장</b>을 누릅니다.",
        "사이드바에서 <b>대시보드</b>로 돌아오면 방금 입력한 거래가 요약 카드에 반영된 것이 보입니다.",
    ]))
    story.append(tip(
        "지금 당장 카테고리·태그를 만들지 않아도 됩니다. "
        "기본 카테고리(식비·교통·급여 등)가 미리 들어 있습니다."))

    story.extend(flowchart_block("처음 켜고 첫 거래까지 — 한눈에", FLOW_QUICKSTART))

    story.append(PageBreak())

    # ════════════════════════════════════════
    # 2장. 거래 입력하기
    # ════════════════════════════════════════
    story.append(Paragraph("2장. 거래 입력하기", s["h1"]))
    story.append(Paragraph(
        "거래는 모든 가계부의 출발점입니다. BudgetBook은 한 번의 입력으로 "
        "지출·수입·계좌 간 이체를 모두 처리합니다.",
        s["lead"]))

    story.append(Paragraph("거래 목록 화면 둘러보기", s["h2"]))
    story.extend(screen("02_transactions.png", "〔화면〕 거래 내역"))
    story.append(legend([
        ("①", "통합 검색 — 지출처·메모·할인사유까지 한 번에 찾기."),
        ("②", "구분(전체/지출/수입/이체) 필터."),
        ("③", "<b>+ 새 거래</b> 버튼 — 입력 창(모달)을 엽니다."),
        ("④", "거래 테이블. 한 행을 클릭하면 편집 창이 열림."),
    ]))
    story.append(Spacer(1, 6))

    story.append(Paragraph("입력 창의 7가지 항목", s["h2"]))
    story.extend(screen("10_transaction_form.png", "〔화면〕 새 거래 입력 창"))
    story.append(legend([
        ("①", "거래 종류 — 지출 / 수입 / 이체. 종류에 따라 아래 항목이 달라집니다."),
        ("②", "발생 날짜. 기본값은 오늘."),
        ("③", "금액과 통화. 통화는 계좌가 정해지면 자동 결정."),
        ("④", "카테고리 — 클릭하면 트리 형태(부모 → 자식 들여쓰기) 선택 창이 열립니다."),
        ("⑤", "연결 계좌 — 선택사항. 지정하면 잔액에 반영됨."),
        ("⑥", "지출처(예: 스타벅스). 자유 텍스트."),
        ("⑦", "🔖 할인 정보 — 원가와 실결제가 다를 때만 펼치세요."),
    ]))
    story.append(tip(
        "<b>할인 정보</b>를 입력하면 카드 분석 화면에서 "
        "이 거래의 절감액과 평균 할인율이 자동 집계됩니다."))

    story.append(PageBreak())

    # 이체 / 할인 시나리오
    story.append(Paragraph("이체는 어떻게 입력하나요?", s["h2"]))
    story.append(Paragraph(
        "이체는 한 거래 안에서 <b>출금 계좌</b>와 <b>입금 계좌</b>를 모두 골라 입력합니다. "
        "두 계좌의 통화가 다른 경우(예: KRW 원화 → USD 달러)에는 환율 입력란이 자동으로 나타납니다. "
        "비워두면 환율 테이블 기준으로 자동 환산됩니다.",
        s["body"]))

    story.append(Paragraph("할인 정보는 어떻게 활용되나요?", s["h2"]))
    story.append(Paragraph(
        "예: 카페에서 5,000원짜리 음료를 통신사 제휴 10% 할인받아 4,500원에 결제했다면 "
        "<b>실결제 = 4,500</b>, <b>할인 전 금액 = 5,000</b>, <b>할인 사유 = 통신사 10%</b>로 입력합니다. "
        "월말이 되면 \"카드 분석\" 카드에서 이 거래가 \"카페 카테고리에서 절감한 500원\"으로 자동 집계됩니다.",
        s["body"]))

    story.extend(flowchart_block("거래 한 건 입력 — 한눈에", FLOW_TX))

    story.append(PageBreak())

    # ════════════════════════════════════════
    # 3장. 거래 찾고 정리하기
    # ════════════════════════════════════════
    story.append(Paragraph("3장. 거래 찾고 정리하기", s["h1"]))
    story.append(Paragraph(
        "건수가 많아지면 필요한 거래만 추리거나, 잘못 입력한 거래를 한 번에 정리해야 합니다.",
        s["lead"]))

    story.append(Paragraph("필터 패널 펼치기", s["h2"]))
    story.append(Paragraph(
        "거래 내역 화면 우상단의 <b>🔍 필터</b> 버튼을 누르면 패널이 펼쳐집니다. "
        "날짜 범위·금액 범위·카테고리·계좌·태그를 동시에 적용할 수 있고, "
        "활성 필터 개수가 버튼에 작은 표시(배지)로 붙습니다.",
        s["body"]))
    story.append(tip(
        "한국어 부분 일치 검색이 가능합니다. "
        "예: \"스타벅\"만 입력해도 \"스타벅스\"가 검색됩니다."))

    story.append(Paragraph("일괄 선택과 삭제", s["h2"]))
    story.extend(steps([
        "각 행 좌측의 체크박스(클릭으로 ✓/공란을 토글)를 누르거나, 표 머리 체크박스로 전체 선택.",
        "화면 하단에 <b>액션 바</b>(\"N건 선택됨\" 버튼 띠)가 나타납니다.",
        "<b>🗑 일괄 삭제</b>를 누르면 확인 후 모두 삭제.",
        "삭제 직후 화면 하단에 <b>토스트</b>(잠깐 떴다가 사라지는 알림)가 6초간 떠 있고, "
        "<b>되돌리기</b>를 누르면 모두 복구됩니다.",
    ]))
    story.append(warn(
        "\"되돌리기\"는 새 ID로 거래를 재생성하는 방식이라, 다른 화면(보고서·차트)에서 보던 "
        "원래 거래 ID를 참조하던 링크는 복구되지 않습니다. 거래 데이터 자체는 100% 동일하게 살아납니다."))

    story.extend(flowchart_block("일괄 삭제 → 6초 안에 되돌리기", FLOW_BULK))

    story.append(PageBreak())

    # ════════════════════════════════════════
    # 4장. 분류 도구
    # ════════════════════════════════════════
    story.append(Paragraph("4장. 카테고리와 태그", s["h1"]))
    story.append(Paragraph(
        "BudgetBook은 거래를 두 축으로 분류합니다. "
        "<b>카테고리</b>는 \"이 돈이 어디로 갔는가\"를 트리(부모 → 자식 들여쓰기)로(식비 → 외식 → 회식), "
        "<b>태그</b>는 \"이 거래의 다른 특성\"을 자유롭게(예: #출장, #자녀, #구독). "
        "두 가지를 같이 쓰면 같은 지출도 여러 각도에서 분석할 수 있습니다.",
        s["lead"]))

    story.append(Paragraph("카테고리 관리", s["h2"]))
    story.extend(screen("03_categories.png", "〔화면〕 카테고리 관리"))
    story.append(legend([
        ("①", "<b>보관(아카이브)</b> 정책 보기 — 사용 중지한 카테고리도 표시. "
              "보관은 삭제하지 않고 비활성화로 숨김."),
        ("②", "<b>+ 지출 카테고리</b> 버튼 — 지출용 새 항목 추가."),
        ("③", "<b>+ 수입 카테고리</b> 버튼 — 급여·이자 등 수입 항목 추가."),
        ("④", "자식 카테고리 — 부모 아래 들여쓰기로 표시."),
        ("⑤", "수입 분류는 별도 영역에 표시."),
    ]))
    story.append(tip(
        "예산 화면의 카테고리 펼침 메뉴(드롭다운)에는 <b>└ </b> 트리 마크가 붙어 깊이가 한눈에 보입니다."))

    story.append(PageBreak())

    story.append(Paragraph("태그 관리", s["h2"]))
    story.extend(screen("04_tags.png", "〔화면〕 태그 목록"))
    story.append(legend([
        ("①", "태그 검색."),
        ("②", "보관 태그 포함 토글(스위치)."),
        ("③", "<b>+ 새 태그</b> — 입력 창이 열립니다."),
        ("④", "태그 이름 + 좌측 색 점."),
        ("⑤", "이 태그가 붙은 거래 건수."),
        ("⑥", "행마다 ✎(편집) ⇆(병합) 📦(보관) 🗑(삭제) 동작."),
    ]))

    story.append(Paragraph("태그를 잘 쓰는 5가지 시나리오", s["h2"]))
    story.append(Paragraph(
        "1) <b>#출장</b> — 출장 비용 모아 회사에 청구할 때 한 번에 추출.<br/>"
        "2) <b>#자녀</b> — 양육 관련 지출만 별도 추적.<br/>"
        "3) <b>#구독</b> — 매월 빠져나가는 구독 서비스 합계.<br/>"
        "4) <b>#모임</b> — 특정 모임에서 쓴 비용을 정산.<br/>"
        "5) <b>#비상</b> — 갑작스러운 의료비·수리비 등 비정기 지출 추적.",
        s["body"]))

    story.append(Paragraph("같은 의미의 태그가 여러 개 생겼을 때 — 병합", s["h2"]))
    story.append(Paragraph(
        "예: \"#출장\"과 \"#비즈니스\"가 같은 의미라면, 한 행의 ⇆ 버튼 → "
        "타깃 태그 선택 → 모든 거래의 태그가 타깃으로 이동하고 원본은 자동 삭제됩니다. "
        "병합 후엔 보고서 단위의 일관성이 유지됩니다.",
        s["body"]))

    story.extend(flowchart_block("카테고리 vs 태그 — 두 축으로 분류", FLOW_CLASSIFY))

    story.append(PageBreak())

    # ════════════════════════════════════════
    # 5장. 예산과 자산 목표
    # ════════════════════════════════════════
    story.append(Paragraph("5장. 예산과 자산 목표", s["h1"]))
    story.append(Paragraph(
        "예산은 \"이 카테고리에 이번 달 N원 안에서 쓰자\"라는 한도를, "
        "자산 목표는 \"언제까지 N원 모으자\"라는 큰 그림을 다룹니다.",
        s["lead"]))

    story.append(Paragraph("예산 만들기", s["h2"]))
    story.extend(screen("05_budgets.png", "〔화면〕 예산 (빈 상태)"))
    story.append(legend([
        ("①", "표시할 월 선택."),
        ("②", "다른 달의 예산을 그대로 복사."),
        ("③", "<b>+ 새 예산</b> 버튼."),
        ("④", "예산이 없는 달 안내 — 두 가지 시작 방법 제공."),
    ]))

    story.append(Paragraph("예산 입력 창", s["h2"]))
    story.extend(screen("12_budget_form.png", "〔화면〕 새 예산 입력 창"))
    story.append(legend([
        ("①", "카테고리 선택. 미선택 시 \"전체 예산\"(월 합계 한도)."),
        ("②", "적용 연/월."),
        ("③", "예산 금액과 통화."),
        ("④", "잔액 이월 옵션 — 이번 달 남은 금액을 다음 달에 더해 쓰기."),
    ]))
    story.append(tip(
        "잔액 이월 기능은 매달 같은 한도가 아니라 \"평균적으로 N원 안에서\"라는 개념입니다. "
        "예: 9월 예산 50만원 중 10만원만 썼으면, 10월에 60만원까지 가능."))

    story.append(PageBreak())

    story.append(Paragraph("예산 진행 추적과 알림", s["h2"]))
    story.append(Paragraph(
        "예산 화면에서는 카테고리별 사용률을 🟢 안전(75% 이하), 🟡 주의(75~100%), 🟠 초과(100~125%), "
        "🔴 위험(125% 이상)으로 자동 분류해 보여줍니다. <b>현재 속도 분석</b>으로 "
        "\"이 속도면 월말에 N원 초과 예상\"까지 계산합니다.",
        s["body"]))
    story.append(Paragraph(
        "<b>대시보드</b>에는 🔴 위험 카테고리가 있을 때 자동으로 빨간 띠가 뜹니다. "
        "예산 탭을 매번 들어가지 않아도 한 번에 확인할 수 있습니다.",
        s["body"]))

    story.extend(flowchart_block("예산 만들고 한 달 진행하기", FLOW_BUDGET))

    story.append(PageBreak())

    story.append(Paragraph("자산 목표 만들기", s["h2"]))
    story.extend(screen("06_goals.png", "〔화면〕 목표 (빈 상태 — 템플릿 카드)"))
    story.append(legend([
        ("①", "전체 목표 보기."),
        ("②", "상태별 필터(진행중/달성/취소)."),
        ("③", "<b>+ 새 목표</b> — 직접 만들기."),
        ("④", "여행·비상금·결혼 등 자주 쓰는 목표 템플릿."),
        ("⑤", "처음부터 직접 만들기."),
    ]))

    story.append(Paragraph("목표 입력 창", s["h2"]))
    story.extend(screen("13_goal_form.png", "〔화면〕 새 목표 입력 창"))
    story.append(legend([
        ("①", "이름과 아이콘(이모지 — 😀 같은 그림 문자)."),
        ("②", "목표 금액과 통화."),
        ("③", "시작일과 마감일(선택)."),
        ("④", "진행 측정 방식 — 연결 계좌 잔액 / 특정 태그 합계 / 직접 입력."),
    ]))
    story.append(PageBreak())

    # ════════════════════════════════════════
    # 6장. 계좌·카드·반복
    # ════════════════════════════════════════
    story.append(Paragraph("6장. 계좌 · 카드 · 반복 지출", s["h1"]))
    story.append(Paragraph(
        "계좌와 카드는 자산을 추적하는 단위, 반복 지출은 매월 빠지는 고정비를 자동으로 기록하는 기능입니다.",
        s["lead"]))

    story.append(Paragraph("계좌 만들기", s["h2"]))
    story.extend(screen("14_account_form.png", "〔화면〕 새 계좌 입력 창"))
    story.append(legend([
        ("①", "계좌 이름 (활성 계좌 중복은 자동 차단)."),
        ("②", "계좌 종류 — 입출금 / 예적금 / 신용카드 / 현금 / 투자 / 대출 / 기타."),
        ("③", "통화."),
        ("④", "초기 잔액 — 가계부 시작 시점의 잔액."),
    ]))
    story.append(tip(
        "<b>신용카드</b>를 선택하면 발급사·결제일·월 한도·연회비 등 카드 전용 항목이 추가로 나타납니다. "
        "월 한도를 입력해두면 대시보드 카드 분석에서 \"한도 사용률\" 진행 바를 볼 수 있습니다."))

    story.append(Paragraph("반복 지출/수입 만들기", s["h2"]))
    story.extend(screen("15_recurring_form.png", "〔화면〕 새 반복지출 입력 창"))
    story.append(legend([
        ("①", "이름 (예: 넷플릭스 구독)."),
        ("②", "고정 금액과 통화."),
        ("③", "반복 주기 — 매일 / 매주 / 매월 / 매년."),
        ("④", "시작일과 종료일."),
    ]))
    story.append(Paragraph(
        "앱을 켤 때마다 예정일이 된 거래가 자동으로 생성됩니다. "
        "잠시 멈추고 싶다면 \"일시 정지\" 종료일을 지정하세요. 지정한 날짜가 지나면 자동으로 재개됩니다.",
        s["body"]))
    story.append(warn(
        "반복 지출에서 만들어진 거래는 일반 거래와 동일하게 편집·삭제할 수 있습니다. "
        "하지만 <b>시리즈 자체</b>를 삭제해도 이미 만들어진 과거 거래는 그대로 남아 있습니다."))

    story.extend(flowchart_block("반복 지출 등록 → 자동 생성", FLOW_RECURRING))

    story.append(PageBreak())

    # ════════════════════════════════════════
    # 7장. 대시보드
    # ════════════════════════════════════════
    story.append(Paragraph("7장. 대시보드 — 한눈에 흐름 보기", s["h1"]))
    story.append(Paragraph(
        "대시보드는 \"지난 한 달 동안 무슨 일이 있었나\"를 한 페이지에 압축한 뷰입니다. "
        "주요 변동·예산 경고·태그별 지출 등 평소에 놓치기 쉬운 정보를 자동으로 위로 끌어올려 보여줍니다.",
        s["lead"]))

    story.append(Paragraph("위에서 아래로 보는 순서", s["h2"]))
    story.extend(steps([
        "<b>예산 초과 알림 띠</b> — 🔴 위험 카테고리가 있으면 자동 표시. 정상 월엔 침묵.",
        "<b>주요 변동 칩</b>(둥근 라벨) — 전월/전년 대비 ±15% 이상 큰 변동만 강조.",
        "<b>요약 카드 3개(KPI)</b> — 수입·지출·순수익. 전월 대비 ▲▼ 표기.",
        "<b>예산 위젯 / 목표 위젯</b> — 이번 달 진행률, 활성 목표 3개.",
        "<b>월별 트렌드 / 카테고리 도넛</b> — 일자별 누적 지출, 카테고리 비중.",
        "<b>지출처 Top 10 / 거래 Top 10 / 태그 Top 8</b> — 어디에 많이 썼는지 한눈에.",
    ]))
    story.append(tip(
        "월별 ↔ 연별 토글로 같은 정보를 연 단위로도 볼 수 있습니다. "
        "연별 모드에선 월별 막대그래프와 5년 비교 차트가 추가됩니다."))

    story.append(PageBreak())

    # ════════════════════════════════════════
    # 8장. 백업과 FAQ
    # ════════════════════════════════════════
    story.append(Paragraph("8장. 백업과 자주 묻는 질문", s["h1"]))

    story.append(Paragraph("백업 만들기", s["h2"]))
    story.extend(screen("09_backup.png", "〔화면〕 설정 / 백업"))
    story.append(legend([
        ("①", "앱 정보 — 버전, DB 파일 경로, 데이터 폴더 위치."),
        ("②", "DB 백업 — 모든 데이터를 .db 파일 한 개로 내보내기."),
        ("③", "DB 복원 — 위에서 만든 .db 파일을 가져와 통째로 교체."),
        ("④", "거래 CSV 내보내기 — 외부 도구(엑셀 등)로 분석할 때."),
        ("⑤", "거래 CSV 가져오기 — 다른 가계부에서 이전할 때."),
        ("⑥", "반복 지출 수동 실행 — \"지금 즉시\" 한 번 만들어 보기."),
        ("⑦", "환율 관리 — 다통화 사용 시."),
    ]))
    story.append(warn(
        "<b>DB 복원</b>은 현재 데이터를 통째로 교체합니다. 복원 직전에 한 번 더 백업해두는 것을 권장합니다."))

    story.extend(flowchart_block("백업과 복원", FLOW_BACKUP))

    story.append(PageBreak())

    story.append(Paragraph("자주 묻는 질문", s["h1"]))
    faqs = [
        ("이전 가계부에서 데이터를 옮길 수 있나요?",
         "네. 거래를 CSV로 내보내고 BudgetBook에서 \"거래 CSV 가져오기\"로 일괄 등록하세요. "
         "헤더가 맞지 않으면 가져오기 전에 단순한 컬럼명(date / amount / payee / category 등)으로 정리해주세요."),
        ("앱이 데이터를 어디 저장하나요?",
         "Windows 기준 <b>%APPDATA%\\BudgetBook\\budgetbook.db</b> 한 파일. "
         "이 파일만 백업하면 모든 데이터가 보존됩니다."),
        ("실수로 거래를 지웠어요. 복구할 수 있나요?",
         "일괄 삭제 직후 6초 안에 화면 아래쪽 알림(토스트)의 \"되돌리기\"를 누르면 복구됩니다. "
         "그 시간이 지났다면 직전에 만든 DB 백업을 복원해야 합니다."),
        ("환율이 자동으로 갱신되나요?",
         "0.1.8부터 옵션으로 자동 갱신을 켤 수 있습니다(설정 → 환율 관리 → 자동 갱신 토글). "
         "기본은 꺼져 있으며, 켜면 앱 시작 후 24시간 간격으로 한 번씩만 외부 API에 시세를 받아 옵니다. "
         "끄면 완전 오프라인으로 동작합니다."),
        ("여러 통화 거래를 합산하면 어떻게 보여지나요?",
         "기준 통화(기본 KRW)로 환산되어 합산됩니다. "
         "환율 정보가 없는 통화는 1:1로 임시 합산되며, 예산 화면 상단에 ⚠️ 경고가 표시됩니다."),
        ("앱이 인터넷에 연결되나요?",
         "기본적으로 외부 통신을 하지 않습니다. 모든 데이터는 본인 PC에만 저장됩니다. "
         "환율 자동 갱신을 켰을 때만 앱 시작 시 한 번 외부 API를 호출합니다."),
        ("화면의 단어가 어렵게 느껴져요. 모달, 토글이 뭔가요?",
         "이 매뉴얼 앞쪽 \"자주 나오는 단어\" 페이지에 한 번에 정리되어 있습니다. "
         "본문에서도 첫 등장에는 \"모달(입력 창)\"처럼 풀이를 함께 적었습니다."),
    ]
    for q, a in faqs:
        story.append(Paragraph(f"<b>Q. {q}</b>", s["body"]))
        story.append(Paragraph(f"A. {a}", s["body"]))
        story.append(Spacer(1, 4))

    # 끝맺음
    story.append(Spacer(1, 12))
    story.append(note(
        "이 매뉴얼은 BudgetBook 0.1.8 기준입니다. 화면 구성은 향후 버전에서 조금씩 달라질 수 있으나, "
        "기본 동선과 데이터 구조는 동일하게 유지됩니다."))

    # ──────────── Build ────────────
    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    print(f"\nPDF 생성 완료: {OUT}")
    print(f"  파일 크기: {OUT.stat().st_size / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    build()

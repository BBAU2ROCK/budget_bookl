"""
Find sidebar tab Y positions more precisely.
- Active button has bg-sky-500/15 over slate-950: roughly RGB(11, 37, 58)
- Active text is text-sky-200: roughly RGB(186, 230, 253)
- We look for blue-tinted text glyphs (high B, high G, lower R) in a column inside
  the sidebar, but only AFTER the logo header (y > 150 to skip the gradient title).
"""
from pathlib import Path
from PIL import Image

SHOTS = Path(r"D:\01_project\05_Budget_Book\01_docs\manual\screenshots")

def find_active_text_band(path: Path):
    img = Image.open(path).convert("RGB")
    W, H = img.size
    px = img.load()

    # Sidebar text column starts after the icon (~x=60). Sidebar width is 224 → text in 60..200
    X_FROM, X_TO = 60, 200

    def row_score(y):
        count = 0
        for x in range(X_FROM, min(X_TO, W)):
            r, g, b = px[x, y]
            # text-sky-200 highlight: high blue+green, lower red
            if b > 200 and g > 200 and r < 220 and b - r > 20:
                count += 1
        return count

    # Skip top 150px (logo gradient area)
    rows = [(y, row_score(y)) for y in range(150, 700)]
    rows = [r for r in rows if r[1] > 5]

    if not rows:
        return None

    # Group contiguous rows
    bands = []
    start = rows[0][0]
    prev = start
    for y, _ in rows[1:]:
        if y - prev > 4:
            bands.append((start, prev))
            start = y
        prev = y
    bands.append((start, prev))

    # Largest contiguous band = highlighted text glyphs
    best = max(bands, key=lambda b: b[1] - b[0])
    return best[0], best[1], (best[0] + best[1]) // 2


# Also produce ALL band info (every visible button) by detecting any glyph in sidebar,
# regardless of color, on the dashboard (where Dashboard is active).
def find_all_button_centers(path: Path):
    img = Image.open(path).convert("RGB")
    W, H = img.size
    px = img.load()

    X_FROM, X_TO = 60, 200

    def row_score(y):
        # any non-dark pixel = a glyph row
        count = 0
        for x in range(X_FROM, min(X_TO, W)):
            r, g, b = px[x, y]
            if max(r, g, b) > 90:
                count += 1
        return count

    rows = [(y, row_score(y)) for y in range(150, 700)]
    rows = [r for r in rows if r[1] > 2]

    if not rows:
        return []

    bands = []
    start = rows[0][0]
    prev = start
    for y, _ in rows[1:]:
        if y - prev > 6:
            bands.append((start, prev))
            start = y
        prev = y
    bands.append((start, prev))
    return [(b[0] + b[1]) // 2 for b in bands]


for f in sorted(SHOTS.glob("0*_*.png")):
    band = find_active_text_band(f)
    if band:
        top, bot, center = band
        print(f"{f.name}: active text band y={top}..{bot} center={center}")

print("\n--- All button centers on Dashboard ---")
centers = find_all_button_centers(SHOTS / "01_dashboard.png")
for i, c in enumerate(centers, start=1):
    print(f"  Button {i}: y={c}")

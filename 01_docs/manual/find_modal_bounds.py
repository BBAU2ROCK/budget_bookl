"""Find the bounding box of the modal in each *_form.png screenshot."""
from pathlib import Path
from PIL import Image

SHOTS = Path(r"D:\01_project\05_Budget_Book\01_docs\manual\screenshots")

# The modal sits over a dimmed overlay. The modal background is brighter than
# its surroundings. We scan rows/cols for "bright enough" pixels (slate-900 ≈ 30,41,59).
def find_modal(path: Path):
    img = Image.open(path).convert("RGB")
    W, H = img.size
    px = img.load()

    def is_bright(r, g, b):
        # Modal bg is roughly slate-900 (#0f172a → 15,23,42) over dimmed scene
        # Pixels >= ~25 brightness suggest non-blacked content
        return max(r, g, b) > 28 and (r + g + b) > 60

    # Find columns with substantial bright pixels
    col_bright = [0] * W
    for x in range(W):
        c = 0
        for y in range(150, H - 150, 4):
            r, g, b = px[x, y]
            if is_bright(r, g, b):
                c += 1
        col_bright[x] = c

    # Mostly the columns inside the modal will have many bright rows
    # Filter: top 30% threshold
    threshold = max(col_bright) * 0.55
    bright_cols = [x for x, c in enumerate(col_bright) if c > threshold]
    if not bright_cols:
        return None
    # Take central cluster (skip thin sidebar that may also be bright)
    # The modal column range should be a contiguous middle segment
    # Find the longest gap-free run
    bright_cols.sort()
    runs = []
    s = bright_cols[0]
    p = s
    for c in bright_cols[1:]:
        if c - p > 30:
            runs.append((s, p))
            s = c
        p = c
    runs.append((s, p))
    # Pick the run whose center is closest to W/2
    runs.sort(key=lambda r: abs((r[0] + r[1]) // 2 - W // 2))
    left, right = runs[0]

    # Find vertical extent within those columns
    row_bright = [0] * H
    for y in range(H):
        c = 0
        for x in range(left, right + 1, 4):
            r, g, b = px[x, y]
            if is_bright(r, g, b):
                c += 1
        row_bright[y] = c
    threshold = max(row_bright) * 0.55
    bright_rows = [y for y, c in enumerate(row_bright) if c > threshold]
    if not bright_rows:
        return None
    top = min(bright_rows)
    bot = max(bright_rows)

    return left, top, right, bot


for f in sorted(SHOTS.glob("1*_*form.png")):
    box = find_modal(f)
    if box:
        l, t, r, b = box
        print(f"{f.name}: modal box L={l} T={t} R={r} B={b} (w={r-l}, h={b-t})")
        print(f"   center=({(l+r)//2}, {(t+b)//2})  |  left-edge={l}")
    else:
        print(f"{f.name}: not found")

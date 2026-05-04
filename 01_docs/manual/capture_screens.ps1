# Capture BudgetBook screens — full-size, DPI-aware
# Usage: powershell -ExecutionPolicy Bypass -File capture_screens.ps1

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Win32 API for window manipulation + DPI awareness + PrintWindow
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")]
    public static extern bool GetClientRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")]
    public static extern bool ClientToScreen(IntPtr hWnd, ref POINT pt);
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int SendMessage(IntPtr hWnd, int wMsg, int wParam, int lParam);
    [DllImport("user32.dll")]
    public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")]
    public static extern int GetDpiForWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
}
[StructLayout(LayoutKind.Sequential)]
public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
}
[StructLayout(LayoutKind.Sequential)]
public struct POINT {
    public int X;
    public int Y;
}
public class Mouse {
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);
}
"@

# Make THIS PowerShell process DPI-aware so GetWindowRect returns physical pixels.
[void][Win32]::SetProcessDPIAware()

$outDir = "D:\01_project\05_Budget_Book\01_docs\manual\screenshots"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────
function Activate-BudgetBook {
    $proc = Get-Process -Name BudgetBook -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -First 1
    if (-not $proc) { throw "BudgetBook is not running" }
    [void][Win32]::ShowWindow($proc.MainWindowHandle, 3)  # SW_MAXIMIZE
    Start-Sleep -Milliseconds 400
    [void][Win32]::SetForegroundWindow($proc.MainWindowHandle)
    Start-Sleep -Milliseconds 600
    return $proc
}

function Get-ClientScreenRect {
    param($hWnd)
    $cr = New-Object RECT
    [void][Win32]::GetClientRect($hWnd, [ref]$cr)
    $pt = New-Object POINT
    $pt.X = 0; $pt.Y = 0
    [void][Win32]::ClientToScreen($hWnd, [ref]$pt)
    return @{
        X = $pt.X
        Y = $pt.Y
        Width  = $cr.Right - $cr.Left
        Height = $cr.Bottom - $cr.Top
    }
}

function Capture-ClientArea {
    # Capture only the renderer area (no title bar), at physical pixels.
    param($hWnd, $filename)
    $r = Get-ClientScreenRect $hWnd
    if ($r.Width -le 0 -or $r.Height -le 0) { throw "Invalid client rect" }
    $bmp = New-Object System.Drawing.Bitmap $r.Width, $r.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($r.X, $r.Y, 0, 0, (New-Object System.Drawing.Size $r.Width, $r.Height))
    $bmp.Save($filename, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host ("  Saved: {0} ({1}x{2})" -f $filename, $r.Width, $r.Height)
}

function Click-Position {
    # rel coords are in CLIENT-area pixels (logical), converted to screen via ClientToScreen.
    param($hWnd, $relX, $relY)
    $r = Get-ClientScreenRect $hWnd
    $x = $r.X + $relX
    $y = $r.Y + $relY
    # Park cursor far away first so the next move is recognised as a fresh enter
    [void][Mouse]::SetCursorPos(($r.X + $r.Width - 50), ($r.Y + $r.Height - 50))
    Start-Sleep -Milliseconds 80
    [void][Mouse]::SetCursorPos($x, $y)
    Start-Sleep -Milliseconds 250
    [Mouse]::mouse_event(0x02, 0, 0, 0, 0)  # LEFT DOWN
    Start-Sleep -Milliseconds 80
    [Mouse]::mouse_event(0x04, 0, 0, 0, 0)  # LEFT UP
    Start-Sleep -Milliseconds 900
}

# ─────────────────────────────────────────────
# Main: maximize window, then click each tab
# ─────────────────────────────────────────────
Write-Host "Activating BudgetBook (maximized)..."
$proc = Activate-BudgetBook
$hWnd = $proc.MainWindowHandle

# Wait for the renderer to settle after maximize
Start-Sleep -Milliseconds 1200

$cr = Get-ClientScreenRect $hWnd
Write-Host ("Client area: {0}x{1} at screen ({2},{3})" -f $cr.Width, $cr.Height, $cr.X, $cr.Y)

# Sidebar metrics — measured from the actual rendered screenshot at this monitor's DPI.
# Sidebar width is bigger than logical 224px because Windows scales (here ~178%).
# Button centers measured at: 198, 269, 340, 409, 481, 552, 622, 689, 760
# X = 200 is well inside the sidebar (avoiding icon column at ~50-80).
$tabX = 200

$tabs = @(
    @{ Name = "01_dashboard";    Y = 198; Label = "Dashboard" }
    @{ Name = "02_transactions"; Y = 269; Label = "Transactions" }
    @{ Name = "03_categories";   Y = 340; Label = "Categories" }
    @{ Name = "04_tags";         Y = 409; Label = "Tags" }
    @{ Name = "05_budgets";      Y = 481; Label = "Budgets" }
    @{ Name = "06_goals";        Y = 552; Label = "Goals" }
    @{ Name = "07_accounts";     Y = 622; Label = "Accounts" }
    @{ Name = "08_recurring";    Y = 689; Label = "Recurring" }
    @{ Name = "09_backup";       Y = 760; Label = "Backup" }
)

foreach ($tab in $tabs) {
    # Make sure window is foreground (no minimize / no maximize re-trigger)
    [void][Win32]::SetForegroundWindow($proc.MainWindowHandle)
    Start-Sleep -Milliseconds 200

    $r = Get-ClientScreenRect $hWnd
    $absX = $r.X + $tabX
    $absY = $r.Y + $tab.Y
    Write-Host ("Clicking {0} → rel ({1},{2}) abs ({3},{4})" -f $tab.Label, $tabX, $tab.Y, $absX, $absY)

    Click-Position $hWnd $tabX $tab.Y
    Start-Sleep -Milliseconds 1100

    try {
        Capture-ClientArea $hWnd "$outDir\$($tab.Name).png"
    } catch {
        Write-Host ("  Skip {0}: {1}" -f $tab.Name, $_.Exception.Message)
    }
}

Write-Host ""
Write-Host ("Done! Captured {0} main screens." -f $tabs.Count)

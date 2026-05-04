# Capture modal/form dialogs by clicking the "new" buttons inside each tab
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT pt);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
[StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
public class Mouse {
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
}
"@
[void][Win32]::SetProcessDPIAware()

$outDir = "D:\01_project\05_Budget_Book\01_docs\manual\screenshots"

function Get-ClientScreenRect {
    param($hWnd)
    $cr = New-Object RECT
    [void][Win32]::GetClientRect($hWnd, [ref]$cr)
    $pt = New-Object POINT; $pt.X=0; $pt.Y=0
    [void][Win32]::ClientToScreen($hWnd, [ref]$pt)
    return @{ X=$pt.X; Y=$pt.Y; Width=$cr.Right-$cr.Left; Height=$cr.Bottom-$cr.Top }
}
function Capture-ClientArea {
    param($hWnd, $filename)
    $r = Get-ClientScreenRect $hWnd
    $bmp = New-Object System.Drawing.Bitmap $r.Width, $r.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($r.X, $r.Y, 0, 0, (New-Object System.Drawing.Size $r.Width, $r.Height))
    $bmp.Save($filename, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Write-Host "  Saved: $filename"
}
function Click-Position {
    param($hWnd, $relX, $relY)
    $r = Get-ClientScreenRect $hWnd
    [void][Mouse]::SetCursorPos(($r.X + $r.Width - 50), ($r.Y + $r.Height - 50))
    Start-Sleep -Milliseconds 80
    [void][Mouse]::SetCursorPos($r.X + $relX, $r.Y + $relY)
    Start-Sleep -Milliseconds 250
    [Mouse]::mouse_event(0x02, 0, 0, 0, 0)
    Start-Sleep -Milliseconds 80
    [Mouse]::mouse_event(0x04, 0, 0, 0, 0)
    Start-Sleep -Milliseconds 900
}
function Send-Escape {
    [System.Windows.Forms.SendKeys]::SendWait("{ESC}")
    Start-Sleep -Milliseconds 800
}

$proc = Get-Process -Name BudgetBook -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -First 1
if (-not $proc) { throw "BudgetBook not running" }
$hWnd = $proc.MainWindowHandle
[void][Win32]::ShowWindow($hWnd, 3)
Start-Sleep -Milliseconds 500
[void][Win32]::SetForegroundWindow($hWnd)
Start-Sleep -Milliseconds 600

$rect = Get-ClientScreenRect $hWnd
Write-Host ("Client area: {0}x{1} at ({2},{3})" -f $rect.Width, $rect.Height, $rect.X, $rect.Y)

# Sidebar tab Y centers (measured)
$sidebarX = 200
$tabsY = @{
    Transactions = 269
    Tags         = 409
    Budgets      = 481
    Goals        = 552
    Accounts     = 622
    Recurring    = 689
}

# "+ New" buttons appear in the top-right of each tab's header. Coordinates relative to client.
# Header padding: max-w-6xl + px-8 + py-8 puts the header roughly at top y~80-110.
# The "new" button sits near the right edge of the centered max-w-6xl container.
# At 2560 wide, max-w-6xl (1152 logical = ~2050 physical at 178%) + the px-8 gives an inner area
# spanning roughly x=255..2305. The "+ 새 X" button is the rightmost — pick x=2240, y=110.
$newBtnRel = @{ X = 2240; Y = 110 }

function Goto-Tab {
    param($yCenter)
    [void][Win32]::SetForegroundWindow($hWnd)
    Start-Sleep -Milliseconds 200
    Click-Position $hWnd $sidebarX $yCenter
    Start-Sleep -Milliseconds 1100
}

# 1) Transaction form
Write-Host "Opening Transaction form..."
Goto-Tab $tabsY.Transactions
Click-Position $hWnd $newBtnRel.X $newBtnRel.Y
Start-Sleep -Milliseconds 1200
Capture-ClientArea $hWnd "$outDir\10_transaction_form.png"
Send-Escape

# 2) Tag form
Write-Host "Opening Tag form..."
Goto-Tab $tabsY.Tags
Click-Position $hWnd $newBtnRel.X $newBtnRel.Y
Start-Sleep -Milliseconds 1200
Capture-ClientArea $hWnd "$outDir\11_tag_form.png"
Send-Escape

# 3) Budget form
Write-Host "Opening Budget form..."
Goto-Tab $tabsY.Budgets
Click-Position $hWnd $newBtnRel.X $newBtnRel.Y
Start-Sleep -Milliseconds 1200
Capture-ClientArea $hWnd "$outDir\12_budget_form.png"
Send-Escape

# 4) Goal form
Write-Host "Opening Goal form..."
Goto-Tab $tabsY.Goals
Click-Position $hWnd $newBtnRel.X $newBtnRel.Y
Start-Sleep -Milliseconds 1200
Capture-ClientArea $hWnd "$outDir\13_goal_form.png"
Send-Escape

# 5) Account form
Write-Host "Opening Account form..."
Goto-Tab $tabsY.Accounts
Click-Position $hWnd $newBtnRel.X $newBtnRel.Y
Start-Sleep -Milliseconds 1200
Capture-ClientArea $hWnd "$outDir\14_account_form.png"
Send-Escape

# 6) Recurring form
Write-Host "Opening Recurring form..."
Goto-Tab $tabsY.Recurring
Click-Position $hWnd $newBtnRel.X $newBtnRel.Y
Start-Sleep -Milliseconds 1200
Capture-ClientArea $hWnd "$outDir\15_recurring_form.png"
Send-Escape

Write-Host "Done capturing modals."

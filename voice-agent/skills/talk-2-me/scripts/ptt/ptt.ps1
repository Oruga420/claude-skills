# ptt.ps1 - push to talk edge detector. Spawned by Node, killed by Node.
# Emits one line per edge on stdout:  READY / DOWN <ms> / UP <ms> <heldMs> / ERR <code>
# -Mode hold   : DOWN on press, UP on physical release  (walkie talkie)
# -Mode toggle : DOWN on press N, UP on press N+1       (latching)
param(
  [Parameter(Mandatory=$true)][int]$Vk,
  [int]$Mods = 0,
  [ValidateSet('hold','toggle')][string]$Mode = 'hold',
  [int]$MaxSeconds = 0
)
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System; using System.Diagnostics; using System.Threading; using System.Runtime.InteropServices;
public class Ptt {
  [DllImport("user32.dll", SetLastError=true)] static extern bool RegisterHotKey(IntPtr h,int id,uint m,uint vk);
  [DllImport("user32.dll", SetLastError=true)] static extern bool UnregisterHotKey(IntPtr h,int id);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
  [StructLayout(LayoutKind.Sequential)]
  public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; }
  [DllImport("user32.dll")] static extern bool PeekMessage(out MSG m, IntPtr h, uint a, uint b, uint r);
  public static int Reg(int id,uint m,uint vk){ if(RegisterHotKey(IntPtr.Zero,id,m,vk)) return 0; return Marshal.GetLastWin32Error(); }
  public static int Unreg(int id){ if(UnregisterHotKey(IntPtr.Zero,id)) return 0; return Marshal.GetLastWin32Error(); }
  public static bool Down(int vk){ return (GetAsyncKeyState(vk) & 0x8000) != 0; }
  // drains the queue, returns true if WM_HOTKEY for our id arrived
  public static bool PollHotkey(int id){
    MSG m; bool hit = false;
    while (PeekMessage(out m, IntPtr.Zero, 0, 0, 1)) { if (m.message == 0x0312 && (int)m.wParam == id) hit = true; }
    return hit;
  }
}
'@

$ID = 0xB17
function Emit([string]$s) { [Console]::Out.WriteLine($s); [Console]::Out.Flush() }
function NowMs { [long][Math]::Floor((Get-Date).ToUniversalTime().Subtract([datetime]'1970-01-01').TotalMilliseconds) }

# MOD_NOREPEAT (0x4000) stops key autorepeat from spamming WM_HOTKEY while held
$effMods = $Mods -bor 0x4000
$err = [Ptt]::Reg($ID, [uint32]$effMods, [uint32]$Vk)
if ($err -ne 0) {
  Emit "ERR $err  (1409 = that key combo is already claimed by another app)"
  exit 2
}
Emit ("READY vk=0x{0:X2} mods=0x{1:X4} mode={2} pid={3}" -f $Vk, $effMods, $Mode, $PID)

$talking = $false
$startMs = 0
$deadline = if ($MaxSeconds -gt 0) { (Get-Date).AddSeconds($MaxSeconds) } else { [datetime]::MaxValue }

try {
  while ((Get-Date) -lt $deadline) {
    if ([Ptt]::PollHotkey($ID)) {
      if ($Mode -eq 'toggle') {
        if ($talking) { $t = NowMs; Emit "UP $t $($t - $startMs)"; $talking = $false }
        else { $startMs = NowMs; Emit "DOWN $startMs"; $talking = $true }
      } else {
        if (-not $talking) { $startMs = NowMs; Emit "DOWN $startMs"; $talking = $true }
      }
    }
    # hold mode: the hotkey gives us the press, GetAsyncKeyState gives us the release
    if ($Mode -eq 'hold' -and $talking -and -not [Ptt]::Down($Vk)) {
      $t = NowMs; Emit "UP $t $($t - $startMs)"; $talking = $false
    }
    Start-Sleep -Milliseconds 8
  }
} finally {
  [void][Ptt]::Unreg($ID)
}

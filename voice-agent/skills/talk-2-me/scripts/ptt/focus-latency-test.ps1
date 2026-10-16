# Listener: reports WHO had focus when the hotkey fired, and the exact ms it fired.
param([int]$Vk = 0x87, [int]$Seconds = 12)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System; using System.Text; using System.Threading; using System.Runtime.InteropServices;
public class F {
  [DllImport("user32.dll", SetLastError=true)] static extern bool RegisterHotKey(IntPtr h,int id,uint m,uint vk);
  [DllImport("user32.dll", SetLastError=true)] static extern bool UnregisterHotKey(IntPtr h,int id);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [StructLayout(LayoutKind.Sequential)]
  public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; }
  [DllImport("user32.dll")] static extern bool PeekMessage(out MSG m, IntPtr h, uint a, uint b, uint r);
  public static int Reg(int id,uint m,uint vk){ if(RegisterHotKey(IntPtr.Zero,id,m,vk)) return 0; return Marshal.GetLastWin32Error(); }
  public static int Unreg(int id){ if(UnregisterHotKey(IntPtr.Zero,id)) return 0; return Marshal.GetLastWin32Error(); }
  public static bool Poll(int id){ MSG m; bool hit=false;
    while (PeekMessage(out m, IntPtr.Zero, 0,0,1)) { if (m.message==0x0312 && (int)m.wParam==id) hit=true; } return hit; }
  public static string FgTitle(){ IntPtr h=GetForegroundWindow(); StringBuilder sb=new StringBuilder(512);
    GetWindowText(h,sb,512); uint pid; GetWindowThreadProcessId(h, out pid);
    return "hwnd=" + h + " pid=" + pid + " title=[" + sb.ToString() + "]"; }
}
'@
function NowMs { [long][Math]::Floor((Get-Date).ToUniversalTime().Subtract([datetime]'1970-01-01').TotalMilliseconds) }
$ID=0xF0C
$e=[F]::Reg($ID,0x4000,[uint32]$Vk)
if ($e -ne 0) { "ERR $e"; exit 2 }
$me = Get-Process -Id $PID
[Console]::Out.WriteLine("READY listenerPid=$PID listenerMainWindowHandle=$($me.MainWindowHandle) foregroundAtStart: $([F]::FgTitle())")
[Console]::Out.Flush()
$deadline=(Get-Date).AddSeconds($Seconds)
try {
  while ((Get-Date) -lt $deadline) {
    if ([F]::Poll($ID)) {
      [Console]::Out.WriteLine("HOTKEY firedAtMs=$(NowMs) foregroundWas: $([F]::FgTitle())")
      [Console]::Out.Flush()
    }
    Start-Sleep -Milliseconds 8
  }
} finally { [void][F]::Unreg($ID) }

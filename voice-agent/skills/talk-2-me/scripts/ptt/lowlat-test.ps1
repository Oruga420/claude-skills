# Same hotkey, but the thread BLOCKS in MsgWaitForMultipleObjects instead of Start-Sleep polling.
param([int]$Vk = 0x87, [int]$Seconds = 14)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class LL {
  [DllImport("user32.dll", SetLastError=true)] static extern bool RegisterHotKey(IntPtr h,int id,uint m,uint vk);
  [DllImport("user32.dll", SetLastError=true)] static extern bool UnregisterHotKey(IntPtr h,int id);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
  [StructLayout(LayoutKind.Sequential)]
  public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; }
  [DllImport("user32.dll")] static extern bool PeekMessage(out MSG m, IntPtr h, uint a, uint b, uint r);
  [DllImport("user32.dll")] static extern uint MsgWaitForMultipleObjects(uint n, IntPtr[] h, bool all, uint ms, uint mask);
  public static int Reg(int id,uint m,uint vk){ if(RegisterHotKey(IntPtr.Zero,id,m,vk)) return 0; return Marshal.GetLastWin32Error(); }
  public static int Unreg(int id){ if(UnregisterHotKey(IntPtr.Zero,id)) return 0; return Marshal.GetLastWin32Error(); }
  public static bool Down(int vk){ return (GetAsyncKeyState(vk) & 0x8000) != 0; }
  // blocks up to ms, wakes the instant a message lands. returns true if our hotkey fired.
  public static bool WaitHotkey(int id, uint ms){
    MsgWaitForMultipleObjects(0, null, false, ms, 0x04FF /* QS_ALLINPUT */);
    MSG m; bool hit=false;
    while (PeekMessage(out m, IntPtr.Zero, 0,0,1)) { if (m.message==0x0312 && (int)m.wParam==id) hit=true; }
    return hit;
  }
}
'@
function NowMs { [long][Math]::Floor((Get-Date).ToUniversalTime().Subtract([datetime]'1970-01-01').TotalMilliseconds) }
$ID=0xA0B
$e=[LL]::Reg($ID,0x4000,[uint32]$Vk)
if ($e -ne 0) { "ERR $e"; exit 2 }
[Console]::Out.WriteLine("READY pid=$PID"); [Console]::Out.Flush()
$deadline=(Get-Date).AddSeconds($Seconds)
try {
  while ((Get-Date) -lt $deadline) {
    if ([LL]::WaitHotkey($ID, 200)) {
      [Console]::Out.WriteLine("HOTKEY firedAtMs=$(NowMs)"); [Console]::Out.Flush()
      while ([LL]::Down($Vk)) { [void][LL]::WaitHotkey($ID, 5) }
      [Console]::Out.WriteLine("RELEASE atMs=$(NowMs)"); [Console]::Out.Flush()
    }
  }
} finally { [void][LL]::Unreg($ID) }

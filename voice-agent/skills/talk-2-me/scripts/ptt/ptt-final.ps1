# ptt-final.ps1 - the production listener. Whole loop lives in C#, so idle CPU is ~0.
# stdout protocol, one line per event:  READY ... | DOWN <unixMs> | UP <unixMs> <heldMs> | ERR <code>
# Exits by itself if the parent process (the voice engine) disappears.
param(
  [Parameter(Mandatory=$true)][int]$Vk,
  [int]$Mods = 0,
  [ValidateSet('hold','toggle')][string]$Mode = 'hold',
  [int]$ParentPid = 0
)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System; using System.Diagnostics; using System.Runtime.InteropServices;
public class PttCore {
  [DllImport("user32.dll", SetLastError=true)] static extern bool RegisterHotKey(IntPtr h,int id,uint m,uint vk);
  [DllImport("user32.dll", SetLastError=true)] static extern bool UnregisterHotKey(IntPtr h,int id);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vKey);
  [StructLayout(LayoutKind.Sequential)]
  struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; }
  [DllImport("user32.dll")] static extern bool PeekMessage(out MSG m, IntPtr h, uint a, uint b, uint r);
  [DllImport("user32.dll")] static extern uint MsgWaitForMultipleObjects(uint n, IntPtr[] h, bool all, uint ms, uint mask);

  const int ID = 0xB17;
  static bool Down(int vk){ return (GetAsyncKeyState(vk) & 0x8000) != 0; }
  static long Now(){ return (long)(DateTime.UtcNow - new DateTime(1970,1,1)).TotalMilliseconds; }
  static void Say(string s){ Console.Out.WriteLine(s); Console.Out.Flush(); }

  public static int Run(int vk, uint mods, bool holdMode, int parentPid) {
    uint eff = mods | 0x4000;                        // MOD_NOREPEAT
    if (!RegisterHotKey(IntPtr.Zero, ID, eff, (uint)vk)) {
      Say("ERR " + Marshal.GetLastWin32Error() + "  (1409 = combo already claimed by another app)");
      return 2;
    }
    Process parent = null;
    // A -ParentPid already gone means nobody is reading this. Swallowing the failure left
    // `parent` null, which disables the exit check below and leaves this process holding the
    // hotkey forever, registered and unreachable. Leave instead.
    if (parentPid > 0) {
      try { parent = Process.GetProcessById(parentPid); }
      catch { Say("ERR 1058  (parent " + parentPid + " is already gone)"); return 0; }
    }
    Say("READY vk=0x" + vk.ToString("X2") + " mods=0x" + eff.ToString("X4") +
        " mode=" + (holdMode ? "hold" : "toggle") + " pid=" + Process.GetCurrentProcess().Id);
    bool talking = false; long start = 0;
    try {
      while (true) {
        if (parent != null && parent.HasExited) return 0;   // engine died, do not linger
        // block until a message arrives; 250 ms idle wake only to re-check the parent
        MsgWaitForMultipleObjects(0, null, false, talking ? 8u : 250u, 0x04FF);
        MSG m; bool fired = false;
        while (PeekMessage(out m, IntPtr.Zero, 0, 0, 1))
          if (m.message == 0x0312 && (int)m.wParam == ID) fired = true;
        if (fired) {
          if (holdMode) { if (!talking) { start = Now(); talking = true; Say("DOWN " + start); } }
          else if (talking) { long t = Now(); talking = false; Say("UP " + t + " " + (t - start)); }
          else { start = Now(); talking = true; Say("DOWN " + start); }
        }
        if (holdMode && talking && !Down(vk)) { long t = Now(); talking = false; Say("UP " + t + " " + (t - start)); }
      }
    } finally { UnregisterHotKey(IntPtr.Zero, ID); }
  }
}
'@
exit ([PttCore]::Run($Vk, [uint32]$Mods, ($Mode -eq 'hold'), $ParentPid))

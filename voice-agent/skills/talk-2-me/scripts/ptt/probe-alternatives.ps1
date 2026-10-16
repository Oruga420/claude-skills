$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class P {
  [DllImport("user32.dll", SetLastError=true)] static extern bool RegisterHotKey(IntPtr h,int id,uint m,uint vk);
  [DllImport("user32.dll", SetLastError=true)] static extern bool UnregisterHotKey(IntPtr h,int id);
  public static int Reg(int id,uint m,uint vk){ if(RegisterHotKey(IntPtr.Zero,id,m,vk)) return 0; return Marshal.GetLastWin32Error(); }
  public static int Unreg(int id){ if(UnregisterHotKey(IntPtr.Zero,id)) return 0; return Marshal.GetLastWin32Error(); }

  public delegate IntPtr HookProc(int code, IntPtr w, IntPtr l);
  [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SetWindowsHookEx(int idHook, HookProc cb, IntPtr hMod, uint tid);
  [DllImport("user32.dll", SetLastError=true)] static extern bool UnhookWindowsHookEx(IntPtr hhk);
  [DllImport("user32.dll")] public static extern IntPtr CallNextHookEx(IntPtr hhk,int c,IntPtr w,IntPtr l);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string n);
  static HookProc _keep;
  public static IntPtr hook = IntPtr.Zero;
  public static int lastErr = 0;
  public static int hitCount = 0;
  public static bool InstallLL() {
    _keep = new HookProc(Cb);
    hook = SetWindowsHookEx(13, _keep, GetModuleHandle(null), 0);
    lastErr = Marshal.GetLastWin32Error();
    return hook != IntPtr.Zero;
  }
  static IntPtr Cb(int code, IntPtr w, IntPtr l){ if(code>=0) hitCount++; return CallNextHookEx(IntPtr.Zero,code,w,l); }
  public static bool Remove(){ bool r = UnhookWindowsHookEx(hook); hook = IntPtr.Zero; return r; }
}
'@
"elevated: " + ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
""
"A) bare media keys as global hotkeys (mods=0):"
foreach ($t in @(@(0xAD,'VK_VOLUME_MUTE'),@(0xAE,'VK_VOLUME_DOWN'),@(0xAF,'VK_VOLUME_UP'),@(0xB3,'VK_MEDIA_PLAY_PAUSE'))) {
  $vk=$t[0]; $nm=$t[1]
  $e = [P]::Reg(7000+$vk, 0, $vk)
  $verd = if($e -eq 0){'CLAIMED'}else{'refused'}
  "   RegisterHotKey {0} (0x{1:X2}) -> errcode {2} ({3})" -f $nm, $vk, $e, $verd
  if ($e -eq 0) { [void][P]::Unreg(7000+$vk) }
}
""
"A2) media key WITH modifiers (Ctrl+Shift+VolumeUp):"
$e = [P]::Reg(7999, (0x2 -bor 0x4 -bor 0x4000), 0xAF)
$verd = if($e -eq 0){'CLAIMED'}else{'refused'}
"   -> errcode {0} ({1})" -f $e, $verd
if ($e -eq 0) { [void][P]::Unreg(7999) }
""
"B) WH_KEYBOARD_LL low level hook, no admin:"
$ok = [P]::InstallLL()
"   SetWindowsHookEx(WH_KEYBOARD_LL) -> handle={0} installed={1} lastErr={2}" -f [P]::hook, $ok, [P]::lastErr
if ($ok) {
  Start-Sleep -Milliseconds 500
  "   callbacks fired while this thread does NOT pump messages: {0}" -f [P]::hitCount
  "   UnhookWindowsHookEx -> {0}" -f [P]::Remove()
}

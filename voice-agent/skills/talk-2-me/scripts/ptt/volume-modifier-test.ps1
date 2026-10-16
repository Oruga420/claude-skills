# Does claiming VK_VOLUME_UP with RegisterHotKey swallow it, breaking real volume control?
# Control run first, experiment second, original volume restored either way.
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr p); int UnregisterControlChangeNotify(IntPtr p);
  int GetChannelCount(out int c);
  int SetMasterVolumeLevel(float l, ref Guid g);
  int SetMasterVolumeLevelScalar(float l, ref Guid g);
  int GetMasterVolumeLevel(out float l);
  int GetMasterVolumeLevelScalar(out float l);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDevice { int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator { int NotImpl1(); int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice ep); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] public class MMDeviceEnumeratorComObject { }

public class Vol {
  static IAudioEndpointVolume v;
  static void Init(){
    if (v != null) return;
    IMMDeviceEnumerator e = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    IMMDevice dev; e.GetDefaultAudioEndpoint(0, 1, out dev);
    Guid iid = typeof(IAudioEndpointVolume).GUID;
    object o; dev.Activate(ref iid, 23, IntPtr.Zero, out o);
    v = (IAudioEndpointVolume)o;
  }
  public static float Read(){ Init(); float f; v.GetMasterVolumeLevelScalar(out f); return f; }
  public static void Write(float f){ Init(); Guid g = Guid.Empty; v.SetMasterVolumeLevelScalar(f, ref g); }

  [DllImport("user32.dll")] static extern void keybd_event(byte b, byte s, uint f, UIntPtr e);
  [DllImport("user32.dll", SetLastError=true)] static extern bool RegisterHotKey(IntPtr h,int id,uint m,uint vk);
  [DllImport("user32.dll", SetLastError=true)] static extern bool UnregisterHotKey(IntPtr h,int id);
  public static int Reg(int id,uint m,uint vk){ if(RegisterHotKey(IntPtr.Zero,id,m,vk)) return 0; return Marshal.GetLastWin32Error(); }
  public static int Unreg(int id){ if(UnregisterHotKey(IntPtr.Zero,id)) return 0; return Marshal.GetLastWin32Error(); }
  public static void TapVolUp(int times){
    for (int i=0;i<times;i++){
      keybd_event(0xAF,0,0,UIntPtr.Zero); System.Threading.Thread.Sleep(30);
      keybd_event(0xAF,0,2,UIntPtr.Zero); System.Threading.Thread.Sleep(120);
    }
  }
}
'@

$orig = [Vol]::Read()
"original master volume scalar: {0:N4}" -f $orig
try {
  [Vol]::Write(0.30); Start-Sleep -Milliseconds 400
  $base = [Vol]::Read()
  # claim VolumeUp only WHEN Ctrl+Shift are held (MOD_CONTROL|MOD_SHIFT|MOD_NOREPEAT)
  $e = [Vol]::Reg(4343, (0x2 -bor 0x4 -bor 0x4000), 0xAF)
  "RegisterHotKey(Ctrl+Shift+VolumeUp) errcode=$e"
  # now press the BARE VolumeUp key, no modifiers
  [Vol]::TapVolUp(4); Start-Sleep -Milliseconds 500
  $a = [Vol]::Read()
  "BARE VolumeUp x4 while Ctrl+Shift+VolumeUp is claimed: {0:N4} -> {1:N4}  delta {2:N4}" -f $base,$a,($a-$base)
  [void][Vol]::Unreg(4343)
  ""
  if (($a-$base) -gt 0.001) { "VERDICT: bare VolumeUp STILL WORKS. Claiming the modified combo does not break plain volume." }
  else { "VERDICT: bare VolumeUp was swallowed too. A modifier does not protect the key." }
} finally {
  [Vol]::Write($orig); Start-Sleep -Milliseconds 300
  "restored master volume scalar: {0:N4}" -f ([Vol]::Read())
}

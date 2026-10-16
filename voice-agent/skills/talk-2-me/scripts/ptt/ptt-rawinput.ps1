# ptt-rawinput.ps1 - per-DEVICE key listener built on the Windows Raw Input API.
#
# Why this exists: RegisterHotKey (ptt-final.ps1) claims a combo machine-wide and cannot tell
# WHICH physical keyboard sent it. A 6-key macro pad that emits ordinary combos (Alt+R, Alt+X,
# Alt+S) would therefore steal those combos from every app AND fire from the main keyboard too.
# Raw Input tags every keyboard event with the source device handle, so the pad can be told
# apart from the main keyboard, and registering WITHOUT RIDEV_NOLEGACY leaves the keystroke
# alone: it still reaches whatever app has focus.
#
# stdout protocol (same contract as ptt-final.ps1, a Node parent reads it with readline):
#   READY ... | DOWN <unixMs> | UP <unixMs> <heldMs> | ERR <code>
# Exits by itself if -ParentPid disappears.
#
# Modes:
#   -ListDevices   enumerate every raw input device (handle + \\?\HID#VID_xxxx&PID_yyyy path)
#   -Watch         print one RAW line per key edge, with its source device. Discovery mode.
#   (default)      protocol mode: needs -Vk, emits READY/DOWN/UP
#
# Examples:
#   powershell -NoProfile -ExecutionPolicy Bypass -File ptt-rawinput.ps1 -ListDevices
#   ... -File ptt-rawinput.ps1 -Watch -Device "VID_XXXX&PID_YYYY" -Seconds 20
#   ... -File ptt-rawinput.ps1 -Vk 0x52 -Mods 1 -Device "VID_XXXX&PID_YYYY" -Mode hold -ParentPid 1234
param(
  [int]$Vk = 0,                                        # target virtual key, e.g. 0x52 = R
  [int]$Mods = 0,                                      # 1=ALT 2=CTRL 4=SHIFT, same bits as ptt-final.ps1
  [ValidateSet('hold','toggle')][string]$Mode = 'hold',
  [int]$ParentPid = 0,
  [string]$Device = '',                                # substring of the device path, e.g. VID_XXXX&PID_YYYY
  [switch]$ListDevices,
  [switch]$Watch,
  [switch]$Probe,
  [int]$Seconds = 0                                    # 0 = run forever
)
$ErrorActionPreference='Stop'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public class RawPtt {
  // ---- window -------------------------------------------------------------
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  static extern IntPtr CreateWindowExW(int ex, string cls, string name, int style,
      int x, int y, int w, int h, IntPtr parent, IntPtr menu, IntPtr inst, IntPtr p);
  [DllImport("user32.dll")] static extern bool DestroyWindow(IntPtr h);

  // ---- raw input ----------------------------------------------------------
  [StructLayout(LayoutKind.Sequential)]
  struct RAWINPUTDEVICE { public ushort UsagePage; public ushort Usage; public uint Flags; public IntPtr Target; }
  [DllImport("user32.dll", SetLastError=true)]
  static extern bool RegisterRawInputDevices(RAWINPUTDEVICE[] d, uint num, uint size);

  [StructLayout(LayoutKind.Sequential)]
  struct RAWINPUTDEVICELIST { public IntPtr hDevice; public uint dwType; }
  [DllImport("user32.dll", SetLastError=true)]
  static extern uint GetRawInputDeviceList(IntPtr list, ref uint count, uint size);

  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  static extern uint GetRawInputDeviceInfoW(IntPtr dev, uint cmd, IntPtr data, ref uint size);
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  static extern uint GetRawInputDeviceInfoW(IntPtr dev, uint cmd, StringBuilder data, ref uint size);

  [DllImport("user32.dll", SetLastError=true)]
  static extern uint GetRawInputData(IntPtr raw, uint cmd, IntPtr data, ref uint size, uint hdr);

  // ---- message pump -------------------------------------------------------
  [StructLayout(LayoutKind.Sequential)]
  struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; }
  [DllImport("user32.dll")] static extern bool PeekMessageW(out MSG m, IntPtr h, uint a, uint b, uint r);
  [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG m);
  [DllImport("user32.dll")] static extern IntPtr DispatchMessageW(ref MSG m);
  [DllImport("user32.dll")] static extern uint MsgWaitForMultipleObjects(uint n, IntPtr[] h, bool all, uint ms, uint mask);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);

  const int  HWND_MESSAGE     = -3;
  const uint WM_INPUT         = 0x00FF;
  const uint WM_INPUT_DEVICE_CHANGE = 0x00FE;
  const uint RIDEV_INPUTSINK  = 0x00000100;   // deliver even when we are NOT the foreground window
  const uint RIDEV_DEVNOTIFY  = 0x00002000;   // tell us when a keyboard is plugged in or pulled out
  const uint RID_INPUT        = 0x10000003;
  const uint RIDI_DEVICENAME  = 0x20000007;
  const uint RIDI_DEVICEINFO  = 0x2000000B;
  const uint QS_ALLINPUT      = 0x04FF;

  static Dictionary<IntPtr,string> _names = new Dictionary<IntPtr,string>();
  static HashSet<int> _down = new HashSet<int>();      // vks currently down ON THE MATCHED DEVICE
  static IntPtr _hwnd = IntPtr.Zero;
  static IntPtr _buf  = IntPtr.Zero;
  static uint   _bufLen = 0;
  static int    _hdrSize = 0;

  static long Now(){ return (long)(DateTime.UtcNow - new DateTime(1970,1,1)).TotalMilliseconds; }
  static void Say(string s){ Console.Out.WriteLine(s); Console.Out.Flush(); }

  public static string DeviceName(IntPtr h) {
    if (h == IntPtr.Zero) return "(injected / no device)";
    string cached;
    if (_names.TryGetValue(h, out cached)) return cached;
    uint chars = 0;
    GetRawInputDeviceInfoW(h, RIDI_DEVICENAME, IntPtr.Zero, ref chars);
    string name = "(unnamed)";
    if (chars > 0 && chars < 8192) {
      StringBuilder sb = new StringBuilder((int)chars + 2);
      uint got = GetRawInputDeviceInfoW(h, RIDI_DEVICENAME, sb, ref chars);
      if (got != 0xFFFFFFFF) name = sb.ToString();
    }
    _names[h] = name;
    return name;
  }

  static string TypeName(uint t){ return t==0 ? "mouse" : (t==1 ? "keyboard" : "hid"); }

  // RID_DEVICE_INFO: cbSize, dwType, then a union. keyboard union = type, subtype, mode,
  // numFunctionKeys, numIndicators, numKeysTotal. hid union = vid, pid, version, usagePage, usage.
  static string DeviceInfo(IntPtr h) {
    uint bytes = 0;
    GetRawInputDeviceInfoW(h, RIDI_DEVICEINFO, IntPtr.Zero, ref bytes);
    if (bytes == 0 || bytes > 4096) return "";
    IntPtr p = Marshal.AllocHGlobal((int)bytes);
    try {
      Marshal.WriteInt32(p, 0, (int)bytes);          // cbSize
      uint got = GetRawInputDeviceInfoW(h, RIDI_DEVICEINFO, p, ref bytes);
      if (got == 0xFFFFFFFF) return "";
      uint t = (uint)Marshal.ReadInt32(p, 4);
      if (t == 1) {
        return "keys=" + Marshal.ReadInt32(p, 28) + " fkeys=" + Marshal.ReadInt32(p, 20) +
               " kbdType=" + Marshal.ReadInt32(p, 8) + " sub=" + Marshal.ReadInt32(p, 12);
      }
      if (t == 2) {
        return "vid=0x" + Marshal.ReadInt32(p, 8).ToString("X4") +
               " pid=0x" + Marshal.ReadInt32(p, 12).ToString("X4") +
               " usagePage=0x" + ((ushort)Marshal.ReadInt16(p, 20)).ToString("X2") +
               " usage=0x" + ((ushort)Marshal.ReadInt16(p, 22)).ToString("X2");
      }
      return "buttons=" + Marshal.ReadInt32(p, 12);
    } finally { Marshal.FreeHGlobal(p); }
  }

  // ---- enumeration --------------------------------------------------------
  public static int List() {
    uint count = 0;
    int one = Marshal.SizeOf(typeof(RAWINPUTDEVICELIST));
    uint r = GetRawInputDeviceList(IntPtr.Zero, ref count, (uint)one);
    if (r == 0xFFFFFFFF) { Say("ERR " + Marshal.GetLastWin32Error()); return 2; }
    IntPtr p = Marshal.AllocHGlobal((int)(count * one));
    try {
      uint n = GetRawInputDeviceList(p, ref count, (uint)one);
      if (n == 0xFFFFFFFF) { Say("ERR " + Marshal.GetLastWin32Error()); return 2; }
      Say("DEVICES " + n);
      for (int i = 0; i < n; i++) {
        IntPtr entry = new IntPtr(p.ToInt64() + i * one);
        RAWINPUTDEVICELIST d = (RAWINPUTDEVICELIST)Marshal.PtrToStructure(entry, typeof(RAWINPUTDEVICELIST));
        string info = DeviceInfo(d.hDevice);
        Say("  handle=0x" + d.hDevice.ToInt64().ToString("X8") +
            "  type=" + TypeName(d.dwType) +
            (info.Length > 0 ? "  " + info : "") +
            "\n      name=" + DeviceName(d.hDevice));
      }
    } finally { Marshal.FreeHGlobal(p); }
    return 0;
  }

  // ---- setup --------------------------------------------------------------
  static bool Setup(out int err) {
    err = 0;
    _hwnd = CreateWindowExW(0, "STATIC", "ptt-rawinput", 0, 0, 0, 0, 0,
                            new IntPtr(HWND_MESSAGE), IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
    if (_hwnd == IntPtr.Zero) { err = Marshal.GetLastWin32Error(); return false; }
    RAWINPUTDEVICE[] rid = new RAWINPUTDEVICE[1];
    rid[0].UsagePage = 0x01;                 // generic desktop
    rid[0].Usage     = 0x06;                 // keyboard
    // background delivery + hotplug notices. NO RIDEV_NOLEGACY: the key still reaches the focused app.
    rid[0].Flags     = RIDEV_INPUTSINK | RIDEV_DEVNOTIFY;
    rid[0].Target    = _hwnd;
    if (!RegisterRawInputDevices(rid, 1, (uint)Marshal.SizeOf(typeof(RAWINPUTDEVICE)))) {
      err = Marshal.GetLastWin32Error(); return false;
    }
    _hdrSize = 4 + 4 + IntPtr.Size + IntPtr.Size;   // RAWINPUTHEADER: dwType,dwSize,hDevice,wParam
    _bufLen = 256;
    _buf = Marshal.AllocHGlobal((int)_bufLen);
    return true;
  }

  // Self-test hook: prove the window + registration work without pressing anything.
  public static int ProbeRun() {
    int err;
    if (!Setup(out err)) { Say("ERR " + err); return 2; }
    Say("PROBE hwnd=0x" + _hwnd.ToInt64().ToString("X8") +
        " messageOnly=yes registerRawInputDevices=true headerSize=" + _hdrSize +
        " flags=RIDEV_INPUTSINK|RIDEV_DEVNOTIFY noLegacy=false");
    DestroyWindow(_hwnd);
    return 0;
  }

  // ---- one WM_INPUT -------------------------------------------------------
  struct KeyEvt { public IntPtr Dev; public int Vk; public int Scan; public int Flags; public uint Msg; public bool Break; }

  static bool Read(IntPtr hRaw, out KeyEvt e) {
    e = new KeyEvt();
    uint size = _bufLen;
    uint got = GetRawInputData(hRaw, RID_INPUT, _buf, ref size, (uint)_hdrSize);
    if (got == 0xFFFFFFFF || got == 0) return false;
    if ((uint)Marshal.ReadInt32(_buf, 0) != 1) return false;      // RIM_TYPEKEYBOARD
    e.Dev   = Marshal.ReadIntPtr(_buf, 8);
    e.Scan  = (ushort)Marshal.ReadInt16(_buf, _hdrSize + 0);
    e.Flags = (ushort)Marshal.ReadInt16(_buf, _hdrSize + 2);
    e.Vk    = (ushort)Marshal.ReadInt16(_buf, _hdrSize + 6);
    e.Msg   = (uint)Marshal.ReadInt32(_buf, _hdrSize + 8);
    e.Break = (e.Flags & 0x01) != 0;                              // RI_KEY_BREAK
    return e.Vk != 0xFF;                                          // 0xFF = filler key from a multimedia overlay
  }

  static int ModBit(int vk) {
    if (vk == 0x12 || vk == 0xA4 || vk == 0xA5) return 1;   // ALT
    if (vk == 0x11 || vk == 0xA2 || vk == 0xA3) return 2;   // CTRL
    if (vk == 0x10 || vk == 0xA0 || vk == 0xA1) return 4;   // SHIFT
    return 0;
  }
  static int ModsNow() {
    int m = 0;
    foreach (int vk in _down) m |= ModBit(vk);
    return m;
  }
  // A handle is only valid while the device is attached, and Windows may hand the same numeric
  // handle to a different device after a replug. Drop the cached name the moment it changes.
  static string Forget(IntPtr dev) {
    string old = null;
    if (_names.TryGetValue(dev, out old)) _names.Remove(dev);
    return old == null ? "(unknown)" : old;
  }

  static bool Matches(string devName, string filter) {
    if (filter == null || filter.Length == 0) return true;
    return devName.IndexOf(filter, StringComparison.OrdinalIgnoreCase) >= 0;
  }

  // ---- watch mode ---------------------------------------------------------
  public static int WatchRun(string filter, int seconds, int parentPid) {
    int err;
    if (!Setup(out err)) { Say("ERR " + err); return 2; }
    Say("READY watch device=" + (filter.Length == 0 ? "(any)" : filter) + " pid=" + Process.GetCurrentProcess().Id);
    Process parent = null;
    // A -ParentPid that is ALREADY gone means nobody is reading this. Swallowing the lookup
    // failure used to leave `parent` null, which disables the exit check below and leaves this
    // process holding the keyboard forever with no one to stop it. Leave instead.
    if (parentPid > 0) {
      try { parent = Process.GetProcessById(parentPid); }
      catch { Say("ERR 1058  (parent " + parentPid + " is already gone)"); return 0; }
    }
    long deadline = seconds > 0 ? Now() + seconds * 1000L : 0;
    try {
      while (true) {
        if (parent != null && parent.HasExited) return 0;
        if (deadline > 0 && Now() > deadline) return 0;
        MsgWaitForMultipleObjects(0, null, false, 250, QS_ALLINPUT);
        MSG m;
        while (PeekMessageW(out m, IntPtr.Zero, 0, 0, 1)) {
          if (m.message == WM_INPUT_DEVICE_CHANGE) {
            int what = m.wParam.ToInt32();                       // 1 = GIDC_ARRIVAL, 2 = GIDC_REMOVAL
            string was = Forget(m.lParam);
            Say("DEV " + Now() + " " + (what == 1 ? "arrival" : "removal") +
                " handle=0x" + m.lParam.ToInt64().ToString("X8") +
                " name=" + (what == 1 ? DeviceName(m.lParam) : was));
          }
          if (m.message == WM_INPUT) {
            KeyEvt e;
            if (Read(m.lParam, out e)) {
              string dn = DeviceName(e.Dev);
              if (Matches(dn, filter))
                Say("RAW " + Now() + " dev=0x" + e.Dev.ToInt64().ToString("X8") +
                    " vk=0x" + e.Vk.ToString("X2") + " scan=0x" + e.Scan.ToString("X2") +
                    " " + (e.Break ? "UP  " : "DOWN") + " msg=0x" + e.Msg.ToString("X3") +
                    " name=" + dn);
            }
          }
          TranslateMessage(ref m); DispatchMessageW(ref m);   // let DefWindowProc clean the raw input up
        }
      }
    } finally { DestroyWindow(_hwnd); }
  }

  // ---- protocol mode ------------------------------------------------------
  public static int Run(int vk, int needMods, bool holdMode, string filter, int parentPid, int seconds) {
    int err;
    if (!Setup(out err)) { Say("ERR " + err); return 2; }
    Process parent = null;
    // Same guard as watch mode: a parent that died before this line means no reader exists.
    if (parentPid > 0) {
      try { parent = Process.GetProcessById(parentPid); }
      catch { Say("ERR 1058  (parent " + parentPid + " is already gone)"); return 0; }
    }
    Say("READY vk=0x" + vk.ToString("X2") + " mods=0x" + needMods.ToString("X2") +
        " mode=" + (holdMode ? "hold" : "toggle") +
        " device=" + (filter.Length == 0 ? "(any)" : filter) +
        " pid=" + Process.GetCurrentProcess().Id);
    bool talking = false; long start = 0;
    long deadline = seconds > 0 ? Now() + seconds * 1000L : 0;
    try {
      while (true) {
        if (parent != null && parent.HasExited) return 0;
        if (deadline > 0 && Now() > deadline) return 0;
        MsgWaitForMultipleObjects(0, null, false, talking ? 8u : 250u, QS_ALLINPUT);
        MSG m;
        while (PeekMessageW(out m, IntPtr.Zero, 0, 0, 1)) {
          if (m.message == WM_INPUT_DEVICE_CHANGE) {
            // Hotplug. Registration is per usage page, not per device, so a replugged pad is
            // picked up with no re-registration: only the cached handle->name map has to go.
            // No DEV line here on purpose, protocol mode speaks only READY/DOWN/UP/ERR.
            string was = Forget(m.lParam);
            if (m.wParam.ToInt32() == 2 && talking && Matches(was, filter)) {
              long t = Now(); talking = false; _down.Clear(); Say("UP " + t + " " + (t - start));
            }
          }
          if (m.message == WM_INPUT) {
            KeyEvt e;
            if (Read(m.lParam, out e) && Matches(DeviceName(e.Dev), filter)) {
              if (e.Break) {
                _down.Remove(e.Vk);
                if (e.Vk == vk && holdMode && talking) {
                  long t = Now(); talking = false; Say("UP " + t + " " + (t - start));
                }
              } else {
                bool wasDown = _down.Contains(e.Vk);
                if (!wasDown) _down.Add(e.Vk);
                if (e.Vk == vk && !wasDown && (ModsNow() & needMods) == needMods) {
                  if (holdMode) { start = Now(); talking = true; Say("DOWN " + start); }
                  else if (talking) { long t = Now(); talking = false; Say("UP " + t + " " + (t - start)); }
                  else { start = Now(); talking = true; Say("DOWN " + start); }
                }
              }
            }
          }
          TranslateMessage(ref m); DispatchMessageW(ref m);
        }
        // safety net: if the device vanished mid-hold, do not leave the parent stuck in DOWN
        if (holdMode && talking && (GetAsyncKeyState(vk) & 0x8000) == 0 && !_down.Contains(vk)) {
          long t = Now(); talking = false; Say("UP " + t + " " + (t - start));
        }
      }
    } finally { DestroyWindow(_hwnd); }
  }
}
'@

if ($ListDevices) { exit ([RawPtt]::List()) }
if ($Probe)       { exit ([RawPtt]::ProbeRun()) }
if ($Watch)       { exit ([RawPtt]::WatchRun($Device, $Seconds, $ParentPid)) }
if ($Vk -le 0)    { Write-Output "ERR 87  (-Vk is required in protocol mode; use -ListDevices or -Watch to discover)"; exit 2 }
exit ([RawPtt]::Run($Vk, $Mods, ($Mode -eq 'hold'), $Device, $ParentPid, $Seconds))

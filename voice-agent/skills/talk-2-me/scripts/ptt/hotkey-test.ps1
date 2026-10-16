# Verifies RegisterHotKey end to end from PowerShell 5.1 with no admin and no modules.
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Threading;
using System.Runtime.InteropServices;

public class Hk {
    [DllImport("user32.dll", SetLastError=true)]
    static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
    [DllImport("user32.dll", SetLastError=true)]
    static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    [DllImport("user32.dll")]
    static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);

    [StructLayout(LayoutKind.Sequential)]
    public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam;
                        public IntPtr lParam; public uint time; public int x; public int y; }
    [DllImport("user32.dll")]
    static extern bool PeekMessage(out MSG m, IntPtr hWnd, uint min, uint max, uint remove);

    const uint WM_HOTKEY = 0x0312;
    const uint PM_REMOVE = 0x0001;

    // 0 = registered, otherwise the real Win32 error code
    public static int TryRegister(int id, uint mods, uint vk) {
        if (RegisterHotKey(IntPtr.Zero, id, mods, vk)) return 0;
        return Marshal.GetLastWin32Error();
    }
    public static int TryUnregister(int id) {
        if (UnregisterHotKey(IntPtr.Zero, id)) return 0;
        return Marshal.GetLastWin32Error();
    }
    // returns the hotkey id that fired, or -1 on timeout
    public static int PumpFor(int ms) {
        MSG m;
        Stopwatch sw = Stopwatch.StartNew();
        while (sw.ElapsedMilliseconds < ms) {
            while (PeekMessage(out m, IntPtr.Zero, 0, 0, PM_REMOVE)) {
                if (m.message == WM_HOTKEY) return (int)m.wParam;
            }
            Thread.Sleep(5);
        }
        return -1;
    }
    public static void SynthCtrlAltShift(byte vk) {
        keybd_event(0x11,0,0,UIntPtr.Zero);   // CTRL down
        keybd_event(0x12,0,0,UIntPtr.Zero);   // ALT  down
        keybd_event(0x10,0,0,UIntPtr.Zero);   // SHIFT down
        keybd_event(vk,  0,0,UIntPtr.Zero);   // key  down
        Thread.Sleep(40);
        keybd_event(vk,  0,2,UIntPtr.Zero);
        keybd_event(0x10,0,2,UIntPtr.Zero);
        keybd_event(0x12,0,2,UIntPtr.Zero);
        keybd_event(0x11,0,2,UIntPtr.Zero);
    }
}
'@

$MOD_ALT=0x1; $MOD_CONTROL=0x2; $MOD_SHIFT=0x4; $MOD_NOREPEAT=0x4000
$VK_F24 = 0x87
$mods = $MOD_ALT -bor $MOD_CONTROL -bor $MOD_SHIFT -bor $MOD_NOREPEAT

"PID of this process: $PID"
"elevated: " + ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

$r1 = [Hk]::TryRegister(9001, $mods, $VK_F24)
"TEST 1 register Ctrl+Alt+Shift+F24 -> errcode $r1 ($(if($r1 -eq 0){'REGISTERED'}else{'FAILED'}))"

$r2 = [Hk]::TryRegister(9001, $mods, $VK_F24)
"TEST 2 register the SAME id again -> errcode $r2 (expect 1409 ERROR_HOTKEY_ALREADY_REGISTERED)"

$r3 = [Hk]::TryRegister(9002, $mods, $VK_F24)
"TEST 3 register same combo under a NEW id -> errcode $r3 (expect 1409, proves the combo is really claimed system wide)"

"TEST 4 synthesizing the keystroke and pumping for 3000 ms ..."
Start-Sleep -Milliseconds 200
[Hk]::SynthCtrlAltShift($VK_F24)
$got = [Hk]::PumpFor(3000)
"TEST 4 PumpFor returned hotkey id $got (expect 9001; -1 means WM_HOTKEY never arrived)"

$r4 = [Hk]::TryUnregister(9001)
"TEST 5 unregister -> errcode $r4 (expect 0)"

$r5 = [Hk]::TryRegister(9003, $mods, $VK_F24)
"TEST 6 re-register after unregister -> errcode $r5 (expect 0, proves clean teardown)"
[void][Hk]::TryUnregister(9003)
"done"

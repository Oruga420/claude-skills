# keyscan.ps1 - discovers WHAT a key actually sends. Press keys, it names them.
param([switch]$SelfTest, [int]$Seconds = 30)
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class K {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
  [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint uCode, uint uMapType);
  [DllImport("user32.dll")] static extern void keybd_event(byte v, byte s, uint f, UIntPtr e);
  public static bool Down(int vk){ return (GetAsyncKeyState(vk) & 0x8000) != 0; }
  public static void Tap(byte vk){ keybd_event(vk,0,0,UIntPtr.Zero); System.Threading.Thread.Sleep(60); keybd_event(vk,0,2,UIntPtr.Zero); }
}
'@

$names = @{}
0x70..0x87 | ForEach-Object { $names[$_] = "F$($_ - 0x6F)" }
0x30..0x39 | ForEach-Object { $names[$_] = [string][char]$_ }
0x41..0x5A | ForEach-Object { $names[$_] = [string][char]$_ }
$names[0xAD]='VOLUME_MUTE'; $names[0xAE]='VOLUME_DOWN'; $names[0xAF]='VOLUME_UP'
$names[0xB0]='MEDIA_NEXT'; $names[0xB1]='MEDIA_PREV'; $names[0xB2]='MEDIA_STOP'; $names[0xB3]='MEDIA_PLAY_PAUSE'
$names[0xB4]='LAUNCH_MAIL'; $names[0xB5]='LAUNCH_MEDIA_SELECT'; $names[0xB6]='LAUNCH_APP1'; $names[0xB7]='LAUNCH_APP2'
$names[0xA6]='BROWSER_BACK'; $names[0xA7]='BROWSER_FORWARD'; $names[0xA8]='BROWSER_REFRESH'
$names[0xA9]='BROWSER_STOP'; $names[0xAA]='BROWSER_SEARCH'; $names[0xAB]='BROWSER_FAVORITES'; $names[0xAC]='BROWSER_HOME'
$names[0xA0]='LSHIFT'; $names[0xA1]='RSHIFT'; $names[0xA2]='LCTRL'; $names[0xA3]='RCTRL'
$names[0xA4]='LALT'; $names[0xA5]='RALT'; $names[0x5B]='LWIN'; $names[0x5C]='RWIN'; $names[0x5D]='APPS'
$names[0x1B]='ESC'; $names[0x20]='SPACE'; $names[0x0D]='ENTER'; $names[0x09]='TAB'; $names[0x08]='BACKSPACE'
$names[0x2D]='INSERT'; $names[0x2E]='DELETE'; $names[0x24]='HOME'; $names[0x23]='END'
$names[0x21]='PAGEUP'; $names[0x22]='PAGEDOWN'; $names[0x2C]='PRINTSCREEN'; $names[0x91]='SCROLLLOCK'; $names[0x13]='PAUSE'
$names[0xBA]='OEM_1'; $names[0xBB]='OEM_PLUS'; $names[0xBC]='OEM_COMMA'; $names[0xBD]='OEM_MINUS'
$names[0xBE]='OEM_PERIOD'; $names[0xBF]='OEM_2'; $names[0xC0]='OEM_3'
$names[0xDB]='OEM_4'; $names[0xDC]='OEM_5'; $names[0xDD]='OEM_6'; $names[0xDE]='OEM_7'
0x60..0x69 | ForEach-Object { $names[$_] = "NUMPAD$($_ - 0x60)" }
$names[0x6A]='NUM_MULT'; $names[0x6B]='NUM_PLUS'; $names[0x6D]='NUM_MINUS'; $names[0x6E]='NUM_DOT'; $names[0x6F]='NUM_DIV'

$skip = @(0x01,0x02,0x04,0x05,0x06)

Write-Host "keyscan running for $Seconds s. Press each key on the macro pad ONE AT A TIME."
Write-Host "Anything reported is a normal virtual key Windows can see."
Write-Host "Total silence means the pad sends a vendor-defined HID report no hotkey can reach."
Write-Host ""

$prev = @{}
1..254 | ForEach-Object { $prev[$_] = [K]::Down($_) }

if ($SelfTest) {
  Write-Host "[selftest] launching a SEPARATE process to hold VK_F24 (0x87) for 700 ms"
  Start-Process -WindowStyle Hidden powershell -ArgumentList @(
    '-NoProfile','-ExecutionPolicy','Bypass','-File',
    (Join-Path $PSScriptRoot 'synth.ps1'),'-Vk','135','-HoldMs','700')
}

# how fast is one full 254 key pass, really?
$sw = [Diagnostics.Stopwatch]::StartNew()
foreach ($vk in 1..254) { [void][K]::Down($vk) }
$sw.Stop()
Write-Host ("[timing] one full 254-key pass = {0:N2} ms" -f $sw.Elapsed.TotalMilliseconds)

$found = @{}
$deadline = (Get-Date).AddSeconds($Seconds)
while ((Get-Date) -lt $deadline) {
  foreach ($vk in 1..254) {
    if ($skip -contains $vk) { continue }
    $now = [K]::Down($vk)
    if ($now -ne $prev[$vk]) {
      $prev[$vk] = $now
      if ($now) {
        $n  = if ($names.ContainsKey($vk)) { $names[$vk] } else { "VK_" + ('{0:X2}' -f $vk) }
        $sc = [K]::MapVirtualKey([uint32]$vk, 0)
        Write-Host ("DOWN  vk=0x{0:X2} ({0,3})  scancode=0x{1:X2}  name={2}" -f $vk, $sc, $n)
        $found[$vk] = $n
      } else {
        Write-Host ("  UP  vk=0x{0:X2}" -f $vk)
      }
    }
  }
  Start-Sleep -Milliseconds 8
}
Write-Host ""
Write-Host "--- summary: distinct keys seen ---"
if ($found.Count -eq 0) { Write-Host "NOTHING. The pad emits no standard virtual key." }
else { $found.Keys | Sort-Object | ForEach-Object { "  0x{0:X2}  {1}" -f $_, $found[$_] } }

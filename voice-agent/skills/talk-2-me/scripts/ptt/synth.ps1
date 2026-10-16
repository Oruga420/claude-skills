# presses and holds a virtual key from a SEPARATE process, to test the listener
param([int]$Vk = 0x87, [int]$HoldMs = 600, [int]$Mods = 0)
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class S { [DllImport("user32.dll")] public static extern void keybd_event(byte v, byte s, uint f, UIntPtr e); }
'@
$modKeys = @()
if ($Mods -band 0x2) { $modKeys += 0x11 }
if ($Mods -band 0x1) { $modKeys += 0x12 }
if ($Mods -band 0x4) { $modKeys += 0x10 }
foreach ($m in $modKeys) { [S]::keybd_event($m,0,0,[UIntPtr]::Zero) }
[S]::keybd_event($Vk,0,0,[UIntPtr]::Zero)
Start-Sleep -Milliseconds $HoldMs
[S]::keybd_event($Vk,0,2,[UIntPtr]::Zero)
foreach ($m in $modKeys) { [S]::keybd_event($m,0,2,[UIntPtr]::Zero) }
"synth: held vk=0x{0:X2} for {1} ms" -f $Vk, $HoldMs

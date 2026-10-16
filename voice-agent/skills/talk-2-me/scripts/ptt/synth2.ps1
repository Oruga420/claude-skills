param([int]$Vk = 0x87)
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class S2 { [DllImport("user32.dll")] public static extern void keybd_event(byte v, byte s, uint f, UIntPtr e); }
'@
function NowMs { [long][Math]::Floor((Get-Date).ToUniversalTime().Subtract([datetime]'1970-01-01').TotalMilliseconds) }
$t = NowMs
[S2]::keybd_event($Vk,0,0,[UIntPtr]::Zero)
Start-Sleep -Milliseconds 120
[S2]::keybd_event($Vk,0,2,[UIntPtr]::Zero)
"pressedAtMs=$t"

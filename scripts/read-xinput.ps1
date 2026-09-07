param([int]$Seconds = 0)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DemoXInput {
    [StructLayout(LayoutKind.Sequential)] public struct Pad {
        public ushort Buttons; public byte LeftTrigger; public byte RightTrigger;
        public short LeftX; public short LeftY; public short RightX; public short RightY;
    }
    [StructLayout(LayoutKind.Sequential)] public struct State { public uint Packet; public Pad Gamepad; }
    [DllImport("xinput1_4.dll", EntryPoint="XInputGetState")] public static extern uint GetState(uint index, out State state);
}
'@
$demoUntil = [DateTime]::UtcNow.AddSeconds($Seconds)
do {
    $demoPads = @()
    for ($demoSlot = 0; $demoSlot -lt 4; $demoSlot++) {
        $demoState = New-Object DemoXInput+State
        $demoResult = [DemoXInput]::GetState([uint32]$demoSlot, [ref]$demoState)
        if ($demoResult -eq 0) { $demoPads += [pscustomobject]@{slot=$demoSlot;packet=$demoState.Packet;buttons=$demoState.Gamepad.Buttons;lt=$demoState.Gamepad.LeftTrigger;rt=$demoState.Gamepad.RightTrigger;lx=$demoState.Gamepad.LeftX;ly=$demoState.Gamepad.LeftY} }
    }
    [pscustomobject]@{time=[DateTime]::UtcNow.ToString('o');pads=$demoPads} | ConvertTo-Json -Compress -Depth 4
    if ($Seconds -gt 0) { Start-Sleep -Milliseconds 100 }
} while ([DateTime]::UtcNow -lt $demoUntil)

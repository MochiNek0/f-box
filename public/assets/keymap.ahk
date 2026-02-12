#Requires AutoHotkey v2.0
#SingleInstance Force
#NoTrayIcon

; =================================================================
; 1. 参数获取与基础初始化
; =================================================================
if (A_Args.Length < 2) {
    ExitApp()
}

configFile := A_Args[1]
parentPid  := A_Args[2]

if !FileExist(configFile)
    ExitApp()

global debugLog := A_ScriptDir "\ahk_debug.log"

LogError(msg) {
    try FileAppend(FormatTime(, "HH:mm:ss") " [ERROR] " msg "`n", debugLog)
}

try FileDelete(debugLog)

; 初始化 XInput
try {
    XInput_Init()
} catch as err {
    LogError("XInput Init Error: " err.Message)
    ExitApp()
}

; =================================================================
; 2. 读取配置并分类映射
; =================================================================
try {
    enabled := IniRead(configFile, "Settings", "enabled", "1")
} catch {
    enabled := "1"
}

if (enabled != "1")
    ExitApp()

keyboardMappings := Map()
keyboardMappings.CaseSense := "Off"
joyMappings := []
joyState := Map()
joyState.CaseSense := "Off"

try {
    mappingsSection := IniRead(configFile, "Mappings")
    
    Loop Parse, mappingsSection, "`n", "`r" {
        line := Trim(A_LoopField)
        
        if (line = "" || SubStr(line, 1, 1) = ";") {
            continue
        }
            
        if InStr(line, "=") {
            parts := StrSplit(line, "=", , 2)
            src := Trim(parts[1])
            tar := Trim(parts[2])
            
            if (src = "" || tar = "") {
                continue
            }

            ; 判断是否是手柄映射 (保留对 1Joy 格式的匹配)
            if RegExMatch(src, "i)^(\d+)Joy(.+)$", &match) {
                playerIdx := Integer(match[1]) - 1 ; XInput 索引为 0 到 3
                rawBtn := match[2]
                
                ; 转换旧的 DirectInput 名称为 XInput 名称
                btnName := TranslateLegacyJoy(rawBtn)
                
                joyMappings.Push({src: src, tar: tar, pIdx: playerIdx, btn: btnName})
                joyState[src] := 0 ; 初始化状态为弹起
            } else {
                keyboardMappings[src] := tar
            }
        }
    }
} catch as err {
    LogError("Error reading INI: " err.Message)
    ExitApp()
}

; =================================================================
; 3. 注册键盘热键
; =================================================================
#HotIf WinActive("ahk_pid " . parentPid)

for source, target in keyboardMappings {
    try {
        Hotkey(source, SendTargetDown.Bind(target))
        Hotkey(source . " up", SendTargetUp.Bind(target))
    } catch as err {
        LogError("Invalid hotkey: " source " - " err.Message)
    }
}

#HotIf

; =================================================================
; 4. XInput 手柄轮询逻辑
; =================================================================
SetTimer(PollJoysticks, 10)
SetTimer(CheckParentProcess, 5000)

PollJoysticks() {
    ; 一次性获取 4 个手柄的状态
    states := []
    Loop 4 {
        states.Push(XInput_GetState(A_Index - 1))
    }

    for item in joyMappings {
        src := item.src
        tar := item.tar
        pIdx := item.pIdx
        btn := item.btn
        
        ; 获取当前绑定的手柄状态，如果指定的断开，则回退到第一个已连接的手柄
        state := GetActiveState(pIdx, states)
        isPressed := GetXInputButtonState(state, btn)

        try {
            ; 状态切换检测
            if (isPressed && joyState[src] == 0) {
                SendTargetDown(tar)
                joyState[src] := 1
            }
            else if (!isPressed && joyState[src] == 1) {
                SendTargetUp(tar)
                joyState[src] := 0
            }
        } catch as err {
            LogError("Send failed: " err.Message)
        }
    }
}

; =================================================================
; 5. 辅助与转换函数
; =================================================================

; 将传统的 DirectInput (例如 "1" 或 "X+") 转换为 XInput 易读格式
TranslateLegacyJoy(rawBtn) {
    if IsInteger(rawBtn) {
        btns := ["A", "B", "X", "Y", "LB", "RB", "BACK", "START", "LS", "RS"]
        val := Integer(rawBtn)
        if (val >= 1 && val <= 10)
            return btns[val]
    } else {
        switch StrUpper(rawBtn) {
            case "X+": return "LX+"
            case "X-": return "LX-"
            case "Y+": return "LY-" ; DirectInput Y+ 是物理向下，对应 XInput LY-
            case "Y-": return "LY+" ; DirectInput Y- 是物理向上，对应 XInput LY+
            case "U+": return "RX+"
            case "U-": return "RX-"
            case "V+": return "RY-"
            case "V-": return "RY+"
            case "Z+": return "LT"  ; 通常 Z轴 大于阈值 是 LT
            case "Z-": return "RT"  ; 通常 Z轴 小于阈值 是 RT
        }
    }
    return StrUpper(rawBtn) ; 允许配置文件直接写 "A", "LT", "DPAD_UP" 等
}

; 智能获取手柄状态（指定的手柄掉线则寻找第一个可用手柄）
GetActiveState(requestedIdx, states) {
    if (requestedIdx >= 0 && requestedIdx <= 3 && states[requestedIdx + 1] != 0)
        return states[requestedIdx + 1]
    
    ; Fallback: 寻找任意一个已连接的手柄
    Loop 4 {
        if (states[A_Index] != 0)
            return states[A_Index]
    }
    return 0 ; 无手柄连接
}

; 解析 XInput 状态，判断指定按键/轴是否按下
GetXInputButtonState(state, btn) {
    if (state == 0)
        return false ; 手柄未连接，视为未按下

    wBtn := state.wButtons
    
    switch btn {
        ; 基础按键
        case "A": return (wBtn & 0x1000) != 0
        case "B": return (wBtn & 0x2000) != 0
        case "X": return (wBtn & 0x4000) != 0
        case "Y": return (wBtn & 0x8000) != 0
        case "UP", "DPAD_UP": return (wBtn & 0x0001) != 0
        case "DOWN", "DPAD_DOWN": return (wBtn & 0x0002) != 0
        case "LEFT", "DPAD_LEFT": return (wBtn & 0x0004) != 0
        case "RIGHT", "DPAD_RIGHT": return (wBtn & 0x0008) != 0
        case "START": return (wBtn & 0x0010) != 0
        case "BACK", "SELECT": return (wBtn & 0x0020) != 0
        case "LS", "L3": return (wBtn & 0x0040) != 0
        case "RS", "R3": return (wBtn & 0x0080) != 0
        case "LB", "L1": return (wBtn & 0x0100) != 0
        case "RB", "R1": return (wBtn & 0x0200) != 0
        
        ; 扳机键 (阈值设定为 30，范围 0~255)
        case "LT", "L2": return state.bLeftTrigger > 30
        case "RT", "R2": return state.bRightTrigger > 30
        
        ; 摇杆 (阈值设定为 16000，约 50% 推拉幅度，范围 -32768~32767)
        case "LX+": return state.sThumbLX > 16000
        case "LX-": return state.sThumbLX < -16000
        case "LY+": return state.sThumbLY > 16000  ; XInput中 Y+ 是物理向上
        case "LY-": return state.sThumbLY < -16000 ; XInput中 Y- 是物理向下
        case "RX+": return state.sThumbRX > 16000
        case "RX-": return state.sThumbRX < -16000
        case "RY+": return state.sThumbRY > 16000
        case "RY-": return state.sThumbRY < -16000
        
        default: return false
    }
}

SendTargetDown(target, *) {
    try {
        if !GetKeyState(target) { 
            Send("{" . target . " down}")
        }
    } catch as err {
        LogError("SendTargetDown Error: " err.Message)
    }
}

SendTargetUp(target, *) {
    try {
        Send("{" . target . " up}")
    } catch as err {
        LogError("SendTargetUp Error: " err.Message)
    }
}

CheckParentProcess() {
    if !ProcessExist(parentPid) {
        ExitApp()
    }
}

; =================================================================
; 6. XInput 核心库 (Lexikos)
; =================================================================

XInput_Init(dll:="")
{
    global
    if _XInput_hm ?? 0
        return
    
    if (dll = "")
        Loop Files A_WinDir "\System32\XInput1_*.dll"
            dll := A_LoopFileName
    if (dll = "")
        dll := "XInput1_3.dll"
    
    _XInput_hm := DllCall("LoadLibrary" ,"str",dll ,"ptr")
    
    if !_XInput_hm
        throw Error("Failed to initialize XInput: " dll " not found.")
    
   (_XInput_GetState        := DllCall("GetProcAddress" ,"ptr",_XInput_hm ,"ptr",100 ,"ptr"))
|| (_XInput_GetState        := DllCall("GetProcAddress" ,"ptr",_XInput_hm ,"astr","XInputGetState" ,"ptr"))
    _XInput_SetState        := DllCall("GetProcAddress" ,"ptr",_XInput_hm ,"astr","XInputSetState" ,"ptr")
    _XInput_GetCapabilities := DllCall("GetProcAddress" ,"ptr",_XInput_hm ,"astr","XInputGetCapabilities" ,"ptr")
    
    if !(_XInput_GetState && _XInput_SetState && _XInput_GetCapabilities) {
        XInput_Term()
        throw Error("Failed to initialize XInput: function not found.")
    }
}

XInput_GetState(UserIndex)
{
    global _XInput_GetState
    
    xiState := Buffer(16)

    if err := DllCall(_XInput_GetState ,"uint",UserIndex ,"ptr",xiState) {
        if err = 1167 ; ERROR_DEVICE_NOT_CONNECTED
            return 0
        throw OSError(err, -1)
    }
    
    return {
        dwPacketNumber: NumGet(xiState,  0, "UInt"),
        wButtons:       NumGet(xiState,  4, "UShort"),
        bLeftTrigger:   NumGet(xiState,  6, "UChar"),
        bRightTrigger:  NumGet(xiState,  7, "UChar"),
        sThumbLX:       NumGet(xiState,  8, "Short"),
        sThumbLY:       NumGet(xiState, 10, "Short"),
        sThumbRX:       NumGet(xiState, 12, "Short"),
        sThumbRY:       NumGet(xiState, 14, "Short"),
    }
}

XInput_SetState(UserIndex, LeftMotorSpeed, RightMotorSpeed)
{
    global _XInput_SetState
    if err := DllCall(_XInput_SetState ,"uint",UserIndex ,"uint*",LeftMotorSpeed|RightMotorSpeed<<16)
        throw OSError(err, -1)
}

XInput_GetCapabilities(UserIndex, Flags)
{
    global _XInput_GetCapabilities
    
    xiCaps := Buffer(20)
    
    if err := DllCall(_XInput_GetCapabilities ,"uint",UserIndex ,"uint",Flags ,"ptr",xiCaps) {
        if err = 1167 ; ERROR_DEVICE_NOT_CONNECTED
            return 0
        throw OSError(err, -1)
    }
    
    return {
        Type:                   NumGet(xiCaps,  0, "UChar"),
        SubType:                NumGet(xiCaps,  1, "UChar"),
        Flags:                  NumGet(xiCaps,  2, "UShort"),
        Gamepad: {
            wButtons:           NumGet(xiCaps,  4, "UShort"),
            bLeftTrigger:       NumGet(xiCaps,  6, "UChar"),
            bRightTrigger:      NumGet(xiCaps,  7, "UChar"),
            sThumbLX:           NumGet(xiCaps,  8, "Short"),
            sThumbLY:           NumGet(xiCaps, 10, "Short"),
            sThumbRX:           NumGet(xiCaps, 12, "Short"),
            sThumbRY:           NumGet(xiCaps, 14, "Short")
        },
        Vibration: {
            wLeftMotorSpeed:    NumGet(xiCaps, 16, "UShort"),
            wRightMotorSpeed:   NumGet(xiCaps, 18, "UShort")
        }
    }
}

XInput_Term() {
    global
    if _XInput_hm
        DllCall("FreeLibrary","uint",_XInput_hm), _XInput_hm :=_XInput_GetState :=_XInput_SetState :=_XInput_GetCapabilities :=0
}
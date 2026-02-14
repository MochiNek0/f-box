#Requires AutoHotkey v2.0
#SingleInstance Force
#NoTrayIcon

; =================================================================
; 操作自动化引擎
; 模式: record <output_file> | play <script_file> <config_file> | pick
; =================================================================

global shouldStop := false

; 参数解析
if (A_Args.Length < 1) {
    FileAppend("ERROR|Missing mode argument`n", "*")
    ExitApp(1)
}

mode := A_Args[1]

if (mode = "record") {
    if (A_Args.Length < 2) {
        FileAppend("ERROR|Missing output file`n", "*")
        ExitApp(1)
    }
    RunRecord(A_Args[2])
}
else if (mode = "play") {
    if (A_Args.Length < 3) {
        FileAppend("ERROR|Missing script or config file`n", "*")
        ExitApp(1)
    }
    maxLoops := (A_Args.Length >= 4) ? Integer(A_Args[4]) : 0
    RunPlay(A_Args[2], A_Args[3], maxLoops)
}
else if (mode = "pick") {
    RunPick()
}
else {
    FileAppend("ERROR|Unknown mode: " mode "`n", "*")
    ExitApp(1)
}

ExitApp(0)

; =================================================================
; Record Mode
; =================================================================
RunRecord(outputFile) {
    global shouldStop

    events := []
    startTime := QPC()

    ; F10 停止录制
    Hotkey("F10", StopAutomation)

    FileAppend("STATUS|RECORDING`n", "*")

    ; 安装鼠标钩子
    mouseHook := InstallMouseHook(events, startTime)

    ; 安装键盘钩子 (InputHook)
    ih := InputHook("L0 V I1")  ; V=可见, I1=检测每个按键
    ih.KeyOpt("{All}", "N")  ; 通知所有按键
    ih.NotifyNonText := true

    ih.OnKeyDown := (ih, vk, sc) => RecordKeyEvent(events, startTime, vk, sc, "keydown")
    ih.OnKeyUp := (ih, vk, sc) => RecordKeyEvent(events, startTime, vk, sc, "keyup")

    ih.Start()

    ; 主循环
    stopFile := outputFile ".stop"
    while (!shouldStop) {
        if FileExist(stopFile) {
            try FileDelete(stopFile)
            shouldStop := true
        }
        Sleep(10)
    }

    ih.Stop()
    UnhookWindowsHookEx(mouseHook)

    ; 保存到 JSON
    SaveEventsJSON(events, outputFile)

    FileAppend("STATUS|RECORD_DONE`n", "*")
}

RecordKeyEvent(events, startTime, vk, sc, type) {
    elapsed := QPC() - startTime
    keyName := GetKeyName(Format("vk{:X}sc{:X}", vk, sc))
    if (keyName = "")
        keyName := Format("vk{:X}", vk)

    events.Push({
        t: elapsed,
        type: type,
        key: keyName,
        vk: vk,
        sc: sc
    })
}

; 低级鼠标钩子
InstallMouseHook(events, startTime) {
    global mouseHookCallback
    ; 创建回调
    mouseHookCallback := CallbackCreate(MouseHookProc.Bind(events, startTime), , 3)
    hHook := DllCall("SetWindowsHookEx", "int", 14, "ptr", mouseHookCallback, "ptr", 0, "uint", 0, "ptr")  ; WH_MOUSE_LL = 14
    return hHook
}

MouseHookProc(events, startTime, nCode, wParam, lParam) {
    if (nCode >= 0) {
        x := NumGet(lParam, 0, "Int")
        y := NumGet(lParam, 4, "Int")
        elapsed := QPC() - startTime

        type := ""
        button := ""

        if (wParam = 0x0200) {  ; WM_MOUSEMOVE
            type := "mousemove"
        }
        else if (wParam = 0x0201) {  ; WM_LBUTTONDOWN
            type := "mousedown"
            button := "left"
        }
        else if (wParam = 0x0202) {  ; WM_LBUTTONUP
            type := "mouseup"
            button := "left"
        }
        else if (wParam = 0x0204) {  ; WM_RBUTTONDOWN
            type := "mousedown"
            button := "right"
        }
        else if (wParam = 0x0205) {  ; WM_RBUTTONUP
            type := "mouseup"
            button := "right"
        }
        else if (wParam = 0x0207) {  ; WM_MBUTTONDOWN
            type := "mousedown"
            button := "middle"
        }
        else if (wParam = 0x0208) {  ; WM_MBUTTONUP
            type := "mouseup"
            button := "middle"
        }
        else if (wParam = 0x020A) {  ; WM_MOUSEWHEEL
            delta := NumGet(lParam, 10, "Short")
            type := "mousewheel"
            button := (delta > 0) ? "up" : "down"
        }

        if (type != "") {
            ; 对 mousemove 进行采样，避免事件过多
            if (type = "mousemove") {
                if (events.Length > 0) {
                    last := events[events.Length]
                    if (last.type = "mousemove" && (elapsed - last.t) < 16) {
                        ; 距上次 move 不足 16ms，更新坐标而不新增事件
                        last.x := x
                        last.y := y
                        last.t := elapsed
                        return DllCall("CallNextHookEx", "ptr", 0, "int", nCode, "ptr", wParam, "ptr", lParam, "ptr")
                    }
                }
            }

            evt := {t: elapsed, type: type, x: x, y: y}
            if (button != "")
                evt.button := button
            events.Push(evt)
        }
    }
    return DllCall("CallNextHookEx", "ptr", 0, "int", nCode, "ptr", wParam, "ptr", lParam, "ptr")
}

UnhookWindowsHookEx(hHook) {
    DllCall("UnhookWindowsHookEx", "ptr", hHook)
}

; =================================================================
; Play Mode
; =================================================================
RunPlay(scriptFile, configFile, maxLoops := 0) {
    global shouldStop := false

    ; F10 停止播放
    Hotkey("F10", StopAutomation)

    ; 读取脚本
    events := LoadEventsJSON(scriptFile)
    if (events.Length = 0) {
        FileAppend("ERROR|No events in script`n", "*")
        return
    }

    FileAppend("STATUS|PLAYING|v2.1`n", "*")

    loopCount := 0

    while (!shouldStop) {
        loopCount++
        
        ; 如果设置了最大循环次数且达到，则停止
        if (maxLoops > 0 && loopCount > maxLoops) {
            FileAppend("STATUS|MAX_LOOPS_REACHED|Target:" maxLoops "|Current:" (loopCount-1) "`n", "*")
            break
        }

        FileAppend("STATUS|LOOP_START|" loopCount "`n", "*")

        ; 重放所有事件
        playStart := QPC()
        for i, evt in events {
            if (shouldStop)
                break

            ; 等待到正确时间点
            targetTime := playStart + evt.t
            while (QPC() < targetTime && !shouldStop) {
                Sleep(1)
            }

            if (shouldStop)
                break

            ; 执行事件
            ExecuteEvent(evt)
        }

        if (shouldStop)
            break

        FileAppend("STATUS|LOOP_END|" loopCount "`n", "*")

        ; 等待一小段时间让画面稳定
        Sleep(500)

        ; 检查停止条件
        if (CheckStopCondition(configFile)) {
            FileAppend("STATUS|CONDITION_MET|" loopCount "`n", "*")
            break
        }
    }

    FileAppend("STATUS|STOPPED|" (shouldStop ? loopCount : loopCount-1) "`n", "*")
}

ExecuteEvent(evt) {
    if (evt.type = "mousemove") {
        DllCall("SetCursorPos", "int", evt.x, "int", evt.y)
    }
    else if (evt.type = "mousedown") {
        DllCall("SetCursorPos", "int", evt.x, "int", evt.y)
        Sleep(5)
        if (evt.button = "left")
            Click("Down Left")
        else if (evt.button = "right")
            Click("Down Right")
        else if (evt.button = "middle")
            Click("Down Middle")
    }
    else if (evt.type = "mouseup") {
        DllCall("SetCursorPos", "int", evt.x, "int", evt.y)
        Sleep(5)
        if (evt.button = "left")
            Click("Up Left")
        else if (evt.button = "right")
            Click("Up Right")
        else if (evt.button = "middle")
            Click("Up Middle")
    }
    else if (evt.type = "mousewheel") {
        DllCall("SetCursorPos", "int", evt.x, "int", evt.y)
        Sleep(5)
        if (evt.button = "up")
            Click("WheelUp")
        else
            Click("WheelDown")
    }
    else if (evt.type = "keydown") {
        key := evt.key
        try {
            Send("{" key " down}")
        }
    }
    else if (evt.type = "keyup") {
        key := evt.key
        try {
            Send("{" key " up}")
        }
    }
}

CheckStopCondition(configFile) {
    if !FileExist(configFile)
        return false

    try {
        content := FileRead(configFile, "UTF-8")
        ; 简单 JSON 解析（只需 x, y, color, enabled 字段）
        if !RegExMatch(content, '"enabled"\s*:\s*true')
            return false

        x := 0, y := 0, targetColor := ""

        if RegExMatch(content, '"x"\s*:\s*(\d+)', &m)
            x := Integer(m[1])
        if RegExMatch(content, '"y"\s*:\s*(\d+)', &m)
            y := Integer(m[1])
        if RegExMatch(content, '"color"\s*:\s*"(#[0-9A-Fa-f]{6})"', &m)
            targetColor := m[1]

        if (targetColor = "")
            return false

        ; 获取屏幕像素颜色
        pixelColor := GetPixelColor(x, y)

        return (StrUpper(pixelColor) = StrUpper(targetColor))
    } catch {
        return false
    }
}

GetPixelColor(x, y) {
    ; 使用 GDI 获取屏幕像素颜色
    hdc := DllCall("GetDC", "ptr", 0, "ptr")
    color := DllCall("GetPixel", "ptr", hdc, "int", x, "int", y, "uint")
    DllCall("ReleaseDC", "ptr", 0, "ptr", hdc)

    ; GetPixel 返回 BGR，转为 RGB
    r := color & 0xFF
    g := (color >> 8) & 0xFF
    b := (color >> 16) & 0xFF

    return Format("#{:02X}{:02X}{:02X}", r, g, b)
}

; =================================================================
; Pick Mode
; =================================================================
RunPick() {
    global shouldStop := false

    FileAppend("STATUS|PICKING`n", "*")

    Hotkey("Space", (*) => PickConfirm())
    Hotkey("Escape", StopAutomation)

    while (!shouldStop) {
        CoordMode("Mouse", "Screen")
        MouseGetPos(&mx, &my)
        color := GetPixelColor(mx, my)
        ToolTip("位置: " mx ", " my "`n颜色: " color "`n`n按 Space 确认 | Esc 取消")
        Sleep(50)
    }

    ToolTip()
}

PickConfirm() {
    global shouldStop
    CoordMode("Mouse", "Screen")
    MouseGetPos(&mx, &my)
    color := GetPixelColor(mx, my)
    FileAppend("PICKED|" mx "|" my "|" color "`n", "*")
    shouldStop := true
}

; =================================================================
; JSON 序列化/反序列化 (简易实现)
; =================================================================

SaveEventsJSON(events, filePath) {
    json := "["

    for i, evt in events {
        if (i > 1)
            json .= ","
        json .= "`n  {"
        json .= '"t":' Format("{:.3f}", evt.t)
        json .= ',"type":"' evt.type '"'

        if evt.HasProp("x")
            json .= ',"x":' evt.x
        if evt.HasProp("y")
            json .= ',"y":' evt.y
        if evt.HasProp("key")
            json .= ',"key":"' EscapeJSON(evt.key) '"'
        if evt.HasProp("vk")
            json .= ',"vk":' evt.vk
        if evt.HasProp("sc")
            json .= ',"sc":' evt.sc
        if evt.HasProp("button")
            json .= ',"button":"' evt.button '"'

        json .= "}"
    }

    json .= "`n]"

    try FileDelete(filePath)
    FileAppend(json, filePath, "UTF-8")
}

LoadEventsJSON(filePath) {
    events := []

    if !FileExist(filePath)
        return events

    content := FileRead(filePath, "UTF-8")

    ; 按对象拆分
    pos := 1
    while (pos := RegExMatch(content, "\{([^}]+)\}", &m, pos)) {
        obj := m[1]
        evt := {}

        ; 解析数值字段
        if RegExMatch(obj, '"t"\s*:\s*([\d.]+)', &v)
            evt.t := Float(v[1])
        if RegExMatch(obj, '"type"\s*:\s*"([^"]+)"', &v)
            evt.type := v[1]
        if RegExMatch(obj, '"x"\s*:\s*(-?\d+)', &v)
            evt.x := Integer(v[1])
        if RegExMatch(obj, '"y"\s*:\s*(-?\d+)', &v)
            evt.y := Integer(v[1])
        if RegExMatch(obj, '"key"\s*:\s*"([^"]*)"', &v)
            evt.key := UnescapeJSON(v[1])
        if RegExMatch(obj, '"vk"\s*:\s*(\d+)', &v)
            evt.vk := Integer(v[1])
        if RegExMatch(obj, '"sc"\s*:\s*(\d+)', &v)
            evt.sc := Integer(v[1])
        if RegExMatch(obj, '"button"\s*:\s*"([^"]*)"', &v)
            evt.button := v[1]

        if evt.HasProp("t") && evt.HasProp("type")
            events.Push(evt)

        pos += m.Len
    }

    return events
}

EscapeJSON(s) {
    s := StrReplace(s, "\", "\\")
    s := StrReplace(s, '"', '\"')
    s := StrReplace(s, "`n", "\n")
    s := StrReplace(s, "`r", "\r")
    s := StrReplace(s, "`t", "\t")
    return s
}

UnescapeJSON(s) {
    s := StrReplace(s, "\n", "`n")
    s := StrReplace(s, "\r", "`r")
    s := StrReplace(s, "\t", "`t")
    s := StrReplace(s, '\"', '"')
    s := StrReplace(s, "\\", "\")
    return s
}

; =================================================================
; 高精度计时 (QPC)
; =================================================================
QPC() {
    static freq := 0
    if (freq = 0) {
        DllCall("QueryPerformanceFrequency", "Int64*", &f := 0)
        freq := f
    }
    DllCall("QueryPerformanceCounter", "Int64*", &count := 0)
    return (count / freq) * 1000  ; 返回毫秒
}

StopAutomation(*) {
    global shouldStop := true
}


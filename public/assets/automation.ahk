#Requires AutoHotkey v2.0
#SingleInstance Force
#NoTrayIcon

; =================================================================
; 操作自动化引擎 (精简版)
; 模式: record <output_file> | play <script_file> [max_loops]
; =================================================================

global shouldStop := false
global isPaused := false
global startTime := 0
global events := []

; 基础配置
FileEncoding "UTF-8"

global debugLog := A_ScriptDir "\automation_debug.log"

LogDebug(msg) {
    try FileAppend(FormatTime(, "HH:mm:ss") " [DEBUG] " msg "`n", debugLog)
}

LogError(msg) {
    try FileAppend(FormatTime(, "HH:mm:ss") " [ERROR] " msg "`n", debugLog)
}

try FileDelete(debugLog)

; 参数解析
if (A_Args.Length < 1) {
    FileAppend("ERROR|Missing mode argument`n", "*", "UTF-8")
    ExitApp(1)
}

mode := A_Args[1]

if (mode = "record") {
    if (A_Args.Length < 2) {
        FileAppend("ERROR|Missing output file`n", "*", "UTF-8")
        ExitApp(1)
    }
    RunRecord(A_Args[2])
}
else if (mode = "play") {
    if (A_Args.Length < 2) {
        FileAppend("ERROR|Missing script file`n", "*")
        ExitApp(1)
    }
    maxLoops := (A_Args.Length >= 3) ? Integer(A_Args[3]) : 0
    RunPlay(A_Args[2], maxLoops)
}
else {
    FileAppend("ERROR|Unknown mode: " mode "`n", "*", "UTF-8")
    ExitApp(1)
}

ExitApp(0)

; =================================================================
; Record Mode
; =================================================================
RunRecord(outputFile) {
    global shouldStop, startTime, events, isPaused

    events := []
    startTime := QPC()

    ; F10 停止录制
    Hotkey("F10", StopAutomation)
    ; F9 设置断点
    Hotkey("F9", RequestBreakpoint)

    FileAppend("STATUS|RECORDING`n", "*", "UTF-8")

    ; 安装鼠标钩子
    mouseHook := InstallMouseHook(events, startTime)

    ; 安装键盘钩子 (InputHook)
    ih := InputHook("L0 V I1")
    ih.KeyOpt("{All}", "N")
    ih.NotifyNonText := true

    ih.OnKeyDown := (ih, vk, sc) => RecordKeyEvent(events, startTime, vk, sc, "keydown")
    ih.OnKeyUp := (ih, vk, sc) => RecordKeyEvent(events, startTime, vk, sc, "keyup")

    ih.Start()

    ; 主循环
    stopFile := outputFile ".stop"
    resumeFile := outputFile ".resume"
    while (!shouldStop) {
        if FileExist(stopFile) {
            try FileDelete(stopFile)
            shouldStop := true
        }
        if (isPaused && FileExist(resumeFile)) {
            try {
                content := FileRead(resumeFile, "UTF-8")
                FileDelete(resumeFile)
                ; Parse JSON: {"x":0, "y":0, "w":0, "h":0, "text":""}
                if (RegExMatch(content, '"x":(-?\d+)', &mx) && RegExMatch(content, '"y":(-?\d+)', &my) 
                    && RegExMatch(content, '"w":(\d+)', &mw) && RegExMatch(content, '"h":(\d+)', &mh)
                    && RegExMatch(content, '"text":"([^"]*)"', &mt)) {
                    ResumeFromBreakpoint(Integer(mx[1]), Integer(my[1]), Integer(mw[1]), Integer(mh[1]), mt[1])
                } else {
                    isPaused := false ; Fallback
                }
            } catch {
                isPaused := false
            }
        }
        Sleep(10)
    }

    ih.Stop()
    UnhookWindowsHookEx(mouseHook)

    ; 保存到 JSON
    SaveEventsJSON(events, outputFile)

    FileAppend("STATUS|RECORD_DONE`n", "*", "UTF-8")
}

RecordKeyEvent(events, startTime, vk, sc, type) {
    global isPaused
    ; F10 (Stop hotkey) should not be recorded
    ; F9 (Stop hotkey) should not be recorded
    if (vk = 0x79 || vk = 0x78)  ; 0x79=F10, 0x78=F9
        return

    if (isPaused)
        return

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

InstallMouseHook(events, startTime) {
    global mouseHookCallback
    mouseHookCallback := CallbackCreate(MouseHookProc.Bind(events, startTime), , 3)
    hHook := DllCall("SetWindowsHookEx", "int", 14, "ptr", mouseHookCallback, "ptr", 0, "uint", 0, "ptr")
    return hHook
}

MouseHookProc(events, startTime, nCode, wParam, lParam) {
    global isPaused
    if (nCode >= 0) {
        x := NumGet(lParam, 0, "Int")
        y := NumGet(lParam, 4, "Int")
        elapsed := QPC() - startTime

        type := ""
        button := ""

        if (isPaused)
            return DllCall("CallNextHookEx", "ptr", 0, "int", nCode, "ptr", wParam, "ptr", lParam, "ptr")

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
            if (type = "mousemove") {
                if (events.Length > 0) {
                    last := events[events.Length]
                    if (last.type = "mousemove" && (elapsed - last.t) < 16) {
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
RunPlay(scriptFile, maxLoops := 0) {
    global shouldStop := false

    ; F10 停止播放
    Hotkey("F10", StopAutomation)

    ; 读取脚本
    events := LoadEventsJSON(scriptFile)
    if (events.Length = 0) {
        FileAppend("ERROR|No events in script`n", "*", "UTF-8")
        return
    }

    FileAppend("STATUS|PLAYING`n", "*", "UTF-8")
    LogDebug("Starting playback: " scriptFile)

    ; 清理旧的信号文件
    Loop Files, scriptFile ".*" {
        if (InStr(A_LoopFileName, ".continue") || InStr(A_LoopFileName, ".stop_script")) {
            try FileDelete(A_LoopFileFullPath)
        }
    }

    loopCount := 0
    ocrRequestId := 0
    while (!shouldStop) {
        loopCount++
        
        ; 如果设置了最大循环次数且达到,则停止
        if (maxLoops > 0 && loopCount > maxLoops) {
            FileAppend("STATUS|MAX_LOOPS_REACHED|Target:" maxLoops "|Current:" (loopCount-1) "`n", "*", "UTF-8")
            break
        }

        FileAppend("STATUS|LOOP_START|" loopCount "`n", "*", "UTF-8")

        playStart := QPC()
        for i, evt in events {
            if (shouldStop)
                break

            targetTime := playStart + evt.t
            while (QPC() < targetTime && !shouldStop) {
                Sleep(1)
            }

            if (shouldStop)
                break

            if (evt.type = "breakpoint") {
                ocrRequestId++
                waitStart := QPC()
                FileAppend("REQ|OCR|" ocrRequestId "|" i "|" evt.x "|" evt.y "|" evt.w "|" evt.h "|" evt.text "`n", "*", "UTF-8")
                LogDebug("OCR Request " ocrRequestId " sent for event " i)
                
                ; 等待回应
                resolved := false
                continueFile := scriptFile ".continue_" ocrRequestId
                stopScriptFile := scriptFile ".stop_script_" ocrRequestId
                
                while (!resolved && !shouldStop) {
                    if FileExist(continueFile) {
                        try FileDelete(continueFile)
                        resolved := true
                        LogDebug("OCR " ocrRequestId " resolved: CONTINUE")
                    }
                    if FileExist(stopScriptFile) {
                        try FileDelete(stopScriptFile)
                        shouldStop := true
                        resolved := true
                        LogDebug("OCR " ocrRequestId " resolved: STOP_SCRIPT")
                    }
                    Sleep(100)
                }
                ; 补偿 OCR 等待时间，防止后续动作瞬间执行（时间偏移纠正）
                playStart += (QPC() - waitStart)
                continue
            }

            ExecuteEvent(evt)
        }

        if (shouldStop) {
            break
        }

        FileAppend("STATUS|LOOP_END|" loopCount "`n", "*", "UTF-8")
        Sleep(500)
    }

    FileAppend("STATUS|STOPPED|" (shouldStop ? loopCount : loopCount-1) "`n", "*", "UTF-8")
    LogDebug("Playback stopped at loop " loopCount ". shouldStop: " (shouldStop?"true":"false"))
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

; =================================================================
; JSON 序列化/反序列化
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
        if (evt.type = "breakpoint") {
            json .= ',"x":' evt.x
            json .= ',"y":' evt.y
            json .= ',"w":' evt.w
            json .= ',"h":' evt.h
            json .= ',"text":"' EscapeJSON(evt.text) '"'
        }
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
    pos := 1
    while (pos := RegExMatch(content, "\{([^}]+)\}", &m, pos)) {
        obj := m[1]
        evt := {}
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
        
        if (evt.type = "breakpoint") {
            if RegExMatch(obj, '"w"\s*:\s*(\d+)', &v)
                evt.w := Integer(v[1])
            if RegExMatch(obj, '"h"\s*:\s*(\d+)', &v)
                evt.h := Integer(v[1])
            if RegExMatch(obj, '"text"\s*:\s*"([^"]*)"', &v)
                evt.text := UnescapeJSON(v[1])
        }

        if evt.HasProp("t") && evt.HasProp("type")
            events.Push(evt)
        pos += m.Len
    }
    return events
}

EscapeJSON(s) {
    s := StrReplace(s, "\", "\\"), s := StrReplace(s, '"', '\"')
    s := StrReplace(s, "`n", "\n"), s := StrReplace(s, "`r", "\r"), s := StrReplace(s, "`t", "\t")
    return s
}

UnescapeJSON(s) {
    s := StrReplace(s, "\n", "`n"), s := StrReplace(s, "\r", "`r"), s := StrReplace(s, "\t", "`t")
    s := StrReplace(s, '\"', '"'), s := StrReplace(s, "\\", "\")
    return s
}

QPC() {
    static freq := 0
    if (freq = 0)
        DllCall("QueryPerformanceFrequency", "Int64*", &f := 0), freq := f
    DllCall("QueryPerformanceCounter", "Int64*", &count := 0)
    return (count / freq) * 1000
}

StopAutomation(*) {
    global shouldStop := true
}

RequestBreakpoint(*) {
    global isPaused := true
    FileAppend("SIGNAL|BREAKPOINT_REQ`n", "*", "UTF-8")
}

ResumeFromBreakpoint(x, y, w, h, text) {
    global events, startTime, isPaused
    elapsed := QPC() - startTime
    events.Push({
        t: elapsed,
        type: "breakpoint",
        x: x,
        y: y,
        w: w,
        h: h,
        text: text
    })
    isPaused := false
    FileAppend("STATUS|RECORDING_RESUMED`n", "*", "UTF-8")
}
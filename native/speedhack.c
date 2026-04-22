/**
 * Speedhack DLL - Native C with SRWLock & Robust Timing
 * MinHook Inline Hook Version
 */
#include <windows.h>
#include <stdio.h>
#include "MinHook.h"

#define SPEED_MAGIC 0x50454544 // 'SPEED'

typedef HMODULE(WINAPI* pLoadLibraryA)(LPCSTR);
typedef FARPROC(WINAPI* pGetProcAddress)(HMODULE, LPCSTR);

typedef struct _MANUAL_MAPPING_DATA {
    DWORD            magic;
    DWORD            status;
    pLoadLibraryA    fnLoadLibraryA;
    pGetProcAddress  fnGetProcAddress;
    BYTE*            baseAddress;
    double           speedMultiplier;
} MANUAL_MAPPING_DATA;

static volatile MANUAL_MAPPING_DATA* g_mappingData = NULL;
static volatile double g_speedMultiplier = 1.0;
static volatile BOOL g_running = TRUE;

// Thread-safe state
static SRWLOCK g_lock = SRWLOCK_INIT;
typedef struct {
    LARGE_INTEGER baseReal;
    LARGE_INTEGER baseFake;
    double multiplier;
} TimeBase;

static TimeBase g_qpcBase = {0};
static TimeBase g_tickBase = {0};
static TimeBase g_fileTimeBase = {0};

// Original Functions (filled by MinHook)
typedef BOOL(WINAPI *pfnQPC)(LARGE_INTEGER *);
typedef DWORD(WINAPI *pfnGTC)(void);
typedef ULONGLONG(WINAPI *pfnGTC64)(void);
typedef UINT(WINAPI *pfnTGT)(void);
typedef VOID(WINAPI *pfnGSTAFT)(LPFILETIME);
typedef VOID(WINAPI *pfnGSTPAFT)(LPFILETIME);
typedef VOID(WINAPI *pfnSleep)(DWORD);
typedef LONG(WINAPI *pfnNtDelayExecution)(BOOLEAN, PLARGE_INTEGER);
typedef DWORD(WINAPI *pfnWFSO)(HANDLE, DWORD);
typedef DWORD(WINAPI *pfnWFSOEx)(HANDLE, DWORD, BOOL);
typedef DWORD(WINAPI *pfnWFMO)(DWORD, const HANDLE*, BOOL, DWORD);
typedef DWORD(WINAPI *pfnWFMOEx)(DWORD, const HANDLE*, BOOL, DWORD, BOOL);
typedef UINT_PTR(WINAPI *pfnSetTimer)(HWND, UINT_PTR, UINT, TIMERPROC);
typedef VOID(WINAPI *pfnGLT)(LPSYSTEMTIME);
typedef VOID(WINAPI *pfnGST)(LPSYSTEMTIME);
typedef MMRESULT(WINAPI *pfnTSE)(UINT, UINT, LPTIMECALLBACK, DWORD_PTR, UINT);
typedef DWORD(WINAPI *pfnMWFMO)(DWORD, const HANDLE*, BOOL, DWORD, DWORD);
typedef DWORD(WINAPI *pfnMWFMOEx)(DWORD, const HANDLE*, DWORD, DWORD, DWORD);

static pfnQPC g_origQPC = NULL;
static pfnGTC g_origGTC = NULL;
static pfnGTC64 g_origGTC64 = NULL;
static pfnTGT g_origTGT = NULL;
static pfnGSTAFT g_origGSTAFT = NULL;
static pfnGSTPAFT g_origGSTPAFT = NULL;
static pfnSleep g_origSleep = NULL;
static pfnNtDelayExecution g_origNtDelayExecution = NULL;
static pfnWFSO g_origWFSO = NULL;
static pfnWFSOEx g_origWFSOEx = NULL;
static pfnWFMO g_origWFMO = NULL;
static pfnWFMOEx g_origWFMOEx = NULL;
static pfnSetTimer g_origSetTimer = NULL;
static pfnGLT g_origGLT = NULL;
static pfnGST g_origGST = NULL;
static pfnTSE g_origTSE = NULL;
static pfnMWFMO g_origMWFMO = NULL;
static pfnMWFMOEx g_origMWFMOEx = NULL;

void UpdateBases(double newMultiplier) {
    if (newMultiplier <= 0.001) newMultiplier = 0.001;
    AcquireSRWLockExclusive(&g_lock);
    
    // Update QPC
    LARGE_INTEGER curQPC;
    if (g_origQPC && g_origQPC(&curQPC)) {
        g_qpcBase.baseFake.QuadPart += (LONGLONG)((curQPC.QuadPart - g_qpcBase.baseReal.QuadPart) * g_qpcBase.multiplier);
        g_qpcBase.baseReal = curQPC;
        g_qpcBase.multiplier = newMultiplier;
    }
    
    // Update Tick (ms)
    ULONGLONG curTick = g_origGTC64 ? g_origGTC64() : GetTickCount64();
    g_tickBase.baseFake.QuadPart += (LONGLONG)((curTick - g_tickBase.baseReal.QuadPart) * g_tickBase.multiplier);
    g_tickBase.baseReal.QuadPart = curTick;
    g_tickBase.multiplier = newMultiplier;

    // Update FileTime
    FILETIME ft;
    if (g_origGSTAFT) g_origGSTAFT(&ft); else GetSystemTimeAsFileTime(&ft);
    ULARGE_INTEGER curFT;
    curFT.LowPart = ft.dwLowDateTime; curFT.HighPart = ft.dwHighDateTime;
    g_fileTimeBase.baseFake.QuadPart += (LONGLONG)((curFT.QuadPart - g_fileTimeBase.baseReal.QuadPart) * g_fileTimeBase.multiplier);
    g_fileTimeBase.baseReal.QuadPart = curFT.QuadPart;
    g_fileTimeBase.multiplier = newMultiplier;

    g_speedMultiplier = newMultiplier;
    ReleaseSRWLockExclusive(&g_lock);
}

// Hooks
BOOL WINAPI HookedQPC(LARGE_INTEGER *lpPerformanceCount) {
    AcquireSRWLockShared(&g_lock);
    LARGE_INTEGER cur; if (!g_origQPC(&cur)) { ReleaseSRWLockShared(&g_lock); return FALSE; }
    lpPerformanceCount->QuadPart = g_qpcBase.baseFake.QuadPart + (LONGLONG)((cur.QuadPart - g_qpcBase.baseReal.QuadPart) * g_qpcBase.multiplier);
    ReleaseSRWLockShared(&g_lock);
    return TRUE;
}

DWORD WINAPI HookedGTC(void) {
    AcquireSRWLockShared(&g_lock);
    ULONGLONG cur = g_origGTC64 ? g_origGTC64() : GetTickCount64();
    DWORD res = (DWORD)(g_tickBase.baseFake.QuadPart + (LONGLONG)((cur - g_tickBase.baseReal.QuadPart) * g_tickBase.multiplier));
    ReleaseSRWLockShared(&g_lock);
    return res;
}

ULONGLONG WINAPI HookedGTC64(void) {
    AcquireSRWLockShared(&g_lock);
    ULONGLONG cur = g_origGTC64();
    ULONGLONG res = (ULONGLONG)(g_tickBase.baseFake.QuadPart + (LONGLONG)((cur - g_tickBase.baseReal.QuadPart) * g_tickBase.multiplier));
    ReleaseSRWLockShared(&g_lock);
    return res;
}

UINT WINAPI HookedTGT(void) {
    AcquireSRWLockShared(&g_lock);
    UINT cur = g_origTGT();
    UINT res = (UINT)(g_tickBase.baseFake.QuadPart + (LONGLONG)((cur - (UINT)g_tickBase.baseReal.QuadPart) * g_tickBase.multiplier));
    ReleaseSRWLockShared(&g_lock);
    return res;
}

VOID WINAPI HookedGSTAFT(LPFILETIME lpFT) {
    AcquireSRWLockShared(&g_lock);
    FILETIME ft; g_origGSTAFT(&ft);
    ULARGE_INTEGER cur; cur.LowPart = ft.dwLowDateTime; cur.HighPart = ft.dwHighDateTime;
    ULARGE_INTEGER res; res.QuadPart = g_fileTimeBase.baseFake.QuadPart + (LONGLONG)((cur.QuadPart - g_fileTimeBase.baseReal.QuadPart) * g_fileTimeBase.multiplier);
    lpFT->dwLowDateTime = res.LowPart; lpFT->dwHighDateTime = res.HighPart;
    ReleaseSRWLockShared(&g_lock);
}

VOID WINAPI HookedGSTPAFT(LPFILETIME lpFT) {
    AcquireSRWLockShared(&g_lock);
    FILETIME ft; g_origGSTPAFT(&ft);
    ULARGE_INTEGER cur; cur.LowPart = ft.dwLowDateTime; cur.HighPart = ft.dwHighDateTime;
    ULARGE_INTEGER res; res.QuadPart = g_fileTimeBase.baseFake.QuadPart + (LONGLONG)((cur.QuadPart - g_fileTimeBase.baseReal.QuadPart) * g_fileTimeBase.multiplier);
    lpFT->dwLowDateTime = res.LowPart; lpFT->dwHighDateTime = res.HighPart;
    ReleaseSRWLockShared(&g_lock);
}

DWORD AdjustTimeout(DWORD ms) {
    if (ms == 0 || ms == INFINITE) return ms;
    double m = g_speedMultiplier;
    DWORD res = (DWORD)(ms / m);
    return (res == 0) ? 1 : res;
}

VOID WINAPI HookedSleep(DWORD ms) { if (g_origSleep) g_origSleep(AdjustTimeout(ms)); }

LONG WINAPI HookedNtDelayExecution(BOOLEAN alertable, PLARGE_INTEGER interval) {
    if (interval && interval->QuadPart < 0) {
        LARGE_INTEGER adj; double m = g_speedMultiplier;
        adj.QuadPart = (LONGLONG)(interval->QuadPart / m);
        return g_origNtDelayExecution(alertable, &adj);
    }
    return g_origNtDelayExecution(alertable, interval);
}

DWORD WINAPI HookedWFSO(HANDLE h, DWORD ms) { return g_origWFSO(h, AdjustTimeout(ms)); }
DWORD WINAPI HookedWFSOEx(HANDLE h, DWORD ms, BOOL b) { return g_origWFSOEx(h, AdjustTimeout(ms), b); }
DWORD WINAPI HookedWFMO(DWORD c, const HANDLE* h, BOOL a, DWORD ms) { return g_origWFMO(c, h, a, AdjustTimeout(ms)); }
DWORD WINAPI HookedWFMOEx(DWORD c, const HANDLE* h, BOOL a, DWORD ms, BOOL b) { return g_origWFMOEx(c, h, a, AdjustTimeout(ms), b); }

UINT_PTR WINAPI HookedSetTimer(HWND hWnd, UINT_PTR nIDEvent, UINT uElapse, TIMERPROC lpTimerFunc) {
    return g_origSetTimer(hWnd, nIDEvent, AdjustTimeout(uElapse), lpTimerFunc);
}

VOID WINAPI HookedGLT(LPSYSTEMTIME lpST) {
    FILETIME ft; HookedGSTAFT(&ft);
    SYSTEMTIME st; FileTimeToSystemTime(&ft, &st);
    SystemTimeToTzSpecificLocalTime(NULL, &st, lpST);
}

VOID WINAPI HookedGST(LPSYSTEMTIME lpST) {
    FILETIME ft; HookedGSTAFT(&ft);
    FileTimeToSystemTime(&ft, lpST);
}

MMRESULT WINAPI HookedTSE(UINT uD, UINT uR, LPTIMECALLBACK lpTP, DWORD_PTR dwU, UINT fuE) {
    return g_origTSE(AdjustTimeout(uD), uR, lpTP, dwU, fuE);
}

DWORD WINAPI HookedMWFMO(DWORD nCount, const HANDLE* lpH, BOOL bWaitAll, DWORD ms, DWORD dwWakeMask) {
    return g_origMWFMO(nCount, lpH, bWaitAll, AdjustTimeout(ms), dwWakeMask);
}

DWORD WINAPI HookedMWFMOEx(DWORD nCount, const HANDLE* lpH, DWORD ms, DWORD dwWakeMask, DWORD dwFlags) {
    return g_origMWFMOEx(nCount, lpH, AdjustTimeout(ms), dwWakeMask, dwFlags);
}

static DWORD WINAPI SpeedPollThread(LPVOID lp) {
    while (g_running) {
        if (g_mappingData && g_mappingData->magic == SPEED_MAGIC) {
            double ns = *(volatile double*)&g_mappingData->speedMultiplier;
            if (ns != g_speedMultiplier) UpdateBases(ns);
        }
        Sleep(50);
    }
    return 0;
}

BOOL APIENTRY DllMain(HMODULE hMod, DWORD reason, LPVOID lpRes) {
    if (reason == DLL_PROCESS_ATTACH) {
        if (lpRes) {
            g_mappingData = (volatile MANUAL_MAPPING_DATA*)lpRes;
            g_speedMultiplier = g_mappingData->speedMultiplier;
        }
        DisableThreadLibraryCalls(hMod);

        if (MH_Initialize() == MH_OK) {
            MH_CreateHookApi(L"kernel32", "QueryPerformanceCounter", &HookedQPC, (LPVOID*)&g_origQPC);
            MH_CreateHookApi(L"kernel32", "GetTickCount", &HookedGTC, (LPVOID*)&g_origGTC);
            MH_CreateHookApi(L"kernel32", "GetTickCount64", &HookedGTC64, (LPVOID*)&g_origGTC64);
            MH_CreateHookApi(L"kernel32", "GetSystemTimeAsFileTime", &HookedGSTAFT, (LPVOID*)&g_origGSTAFT);
            MH_CreateHookApi(L"kernel32", "GetSystemTimePreciseAsFileTime", &HookedGSTPAFT, (LPVOID*)&g_origGSTPAFT);
            MH_CreateHookApi(L"kernel32", "Sleep", &HookedSleep, (LPVOID*)&g_origSleep);
            MH_CreateHookApi(L"kernel32", "WaitForSingleObject", &HookedWFSO, (LPVOID*)&g_origWFSO);
            MH_CreateHookApi(L"kernel32", "WaitForSingleObjectEx", &HookedWFSOEx, (LPVOID*)&g_origWFSOEx);
            MH_CreateHookApi(L"kernel32", "WaitForMultipleObjects", &HookedWFMO, (LPVOID*)&g_origWFMO);
            MH_CreateHookApi(L"kernel32", "WaitForMultipleObjectsEx", &HookedWFMOEx, (LPVOID*)&g_origWFMOEx);
            MH_CreateHookApi(L"winmm", "timeGetTime", &HookedTGT, (LPVOID*)&g_origTGT);
            MH_CreateHookApi(L"ntdll", "NtDelayExecution", &HookedNtDelayExecution, (LPVOID*)&g_origNtDelayExecution);
            MH_CreateHookApi(L"user32", "SetTimer", &HookedSetTimer, (LPVOID*)&g_origSetTimer);
            MH_CreateHookApi(L"kernel32", "GetLocalTime", &HookedGLT, (LPVOID*)&g_origGLT);
            MH_CreateHookApi(L"kernel32", "GetSystemTime", &HookedGST, (LPVOID*)&g_origGST);
            MH_CreateHookApi(L"winmm", "timeSetEvent", &HookedTSE, (LPVOID*)&g_origTSE);
            MH_CreateHookApi(L"user32", "MsgWaitForMultipleObjects", &HookedMWFMO, (LPVOID*)&g_origMWFMO);
            MH_CreateHookApi(L"user32", "MsgWaitForMultipleObjectsEx", &HookedMWFMOEx, (LPVOID*)&g_origMWFMOEx);

            MH_EnableHook(MH_ALL_HOOKS);
        }

        // Initialize Bases
        if (g_origQPC) g_origQPC(&g_qpcBase.baseReal); g_qpcBase.baseFake = g_qpcBase.baseReal; g_qpcBase.multiplier = g_speedMultiplier;
        ULONGLONG t = g_origGTC64 ? g_origGTC64() : GetTickCount64();
        g_tickBase.baseReal.QuadPart = t; g_tickBase.baseFake.QuadPart = t; g_tickBase.multiplier = g_speedMultiplier;
        FILETIME ft; if (g_origGSTAFT) g_origGSTAFT(&ft); else GetSystemTimeAsFileTime(&ft);
        ULARGE_INTEGER uft; uft.LowPart = ft.dwLowDateTime; uft.HighPart = ft.dwHighDateTime;
        g_fileTimeBase.baseReal.QuadPart = uft.QuadPart; g_fileTimeBase.baseFake.QuadPart = uft.QuadPart; g_fileTimeBase.multiplier = g_speedMultiplier;

        g_running = TRUE; CreateThread(NULL, 0, SpeedPollThread, NULL, 0, NULL);
    } else if (reason == DLL_PROCESS_DETACH) { 
        g_running = FALSE; 
        MH_DisableHook(MH_ALL_HOOKS);
        MH_Uninitialize();
    }
    return TRUE;
}
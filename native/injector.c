/**
 * Speedhack Injector - Native C Manual Mapping with Memory IPC & Verification
 * Final Optimized Version
 */
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <tlhelp32.h>
#include <string.h>
#include <stddef.h>

#define SPEED_MAGIC 0x50454544 // 'SPEED'

typedef HMODULE(WINAPI* pLoadLibraryA)(LPCSTR);
typedef FARPROC(WINAPI* pGetProcAddress)(HMODULE, LPCSTR);
typedef BOOL(WINAPI* pDllMain)(HMODULE, DWORD, LPVOID);

typedef struct _MANUAL_MAPPING_DATA {
    DWORD            magic;            // [0] Verification Magic
    DWORD            status;           // [4] Success/Error status
    pLoadLibraryA    fnLoadLibraryA;   // [8] 
    pGetProcAddress  fnGetProcAddress; // [16]
    BYTE*            baseAddress;      // [24]
    double           speedMultiplier;  // [32] (8-byte aligned)
} MANUAL_MAPPING_DATA;

#pragma runtime_checks("", off)
static DWORD __stdcall Shellcode(MANUAL_MAPPING_DATA* data) {
    if (!data) return 0x11111111;

    BYTE* base = data->baseAddress;
    PIMAGE_DOS_HEADER pDosHeader = (PIMAGE_DOS_HEADER)base;
    PIMAGE_NT_HEADERS pNtHeaders = (PIMAGE_NT_HEADERS)(base + pDosHeader->e_lfanew);
    PIMAGE_OPTIONAL_HEADER pOptionalHeader = &pNtHeaders->OptionalHeader;

    // Relocations
    PIMAGE_DATA_DIRECTORY pRelocDir = &pOptionalHeader->DataDirectory[IMAGE_DIRECTORY_ENTRY_BASERELOC];
    if (pRelocDir->Size) {
        PIMAGE_BASE_RELOCATION pRelocBlock = (PIMAGE_BASE_RELOCATION)(base + pRelocDir->VirtualAddress);
        UINT_PTR delta = (UINT_PTR)(base - pOptionalHeader->ImageBase);
        while (pRelocBlock->VirtualAddress) {
            DWORD count = (pRelocBlock->SizeOfBlock - sizeof(IMAGE_BASE_RELOCATION)) / sizeof(WORD);
            WORD* pRelocEntry = (WORD*)(pRelocBlock + 1);
            for (DWORD i = 0; i < count; ++i) {
                if (((pRelocEntry[i] >> 12) & 0x0F) == IMAGE_REL_BASED_DIR64) {
                    *(UINT_PTR*)(base + pRelocBlock->VirtualAddress + (pRelocEntry[i] & 0xFFF)) += delta;
                }
#ifndef _WIN64
                else if (((pRelocEntry[i] >> 12) & 0x0F) == IMAGE_REL_BASED_HIGHLOW) {
                    *(DWORD*)(base + pRelocBlock->VirtualAddress + (pRelocEntry[i] & 0xFFF)) += (DWORD)delta;
                }
#endif
            }
            pRelocBlock = (PIMAGE_BASE_RELOCATION)((BYTE*)pRelocBlock + pRelocBlock->SizeOfBlock);
        }
    }

    // Imports
    PIMAGE_DATA_DIRECTORY pImportDir = &pOptionalHeader->DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT];
    if (pImportDir->Size) {
        PIMAGE_IMPORT_DESCRIPTOR pImportDesc = (PIMAGE_IMPORT_DESCRIPTOR)(base + pImportDir->VirtualAddress);
        while (pImportDesc->Name) {
            HMODULE hMod = data->fnLoadLibraryA((char*)(base + pImportDesc->Name));
            if (!hMod) { data->status = 3; return 0x33333333; }
            PIMAGE_THUNK_DATA pThunk = (PIMAGE_THUNK_DATA)(base + pImportDesc->FirstThunk);
            PIMAGE_THUNK_DATA pOriginalThunk = (PIMAGE_THUNK_DATA)(base + pImportDesc->OriginalFirstThunk);
            while (pOriginalThunk->u1.AddressOfData) {
                if (IMAGE_SNAP_BY_ORDINAL(pOriginalThunk->u1.Ordinal)) {
                    pThunk->u1.Function = (UINT_PTR)data->fnGetProcAddress(hMod, (LPCSTR)IMAGE_ORDINAL(pOriginalThunk->u1.Ordinal));
                } else {
                    PIMAGE_IMPORT_BY_NAME pImportData = (PIMAGE_IMPORT_BY_NAME)(base + pOriginalThunk->u1.AddressOfData);
                    pThunk->u1.Function = (UINT_PTR)data->fnGetProcAddress(hMod, (LPCSTR)pImportData->Name);
                }
                if (!pThunk->u1.Function) { data->status = 3; return 0x44444444; }
                pThunk++; pOriginalThunk++;
            }
            pImportDesc++;
        }
    }

    // Entry Point
    if (pOptionalHeader->AddressOfEntryPoint) {
        pDllMain fnEntry = (pDllMain)(base + pOptionalHeader->AddressOfEntryPoint);
        if (!fnEntry((HMODULE)base, DLL_PROCESS_ATTACH, (LPVOID)data)) { data->status = 4; return 0x55555555; }
    }

    data->status = 1;
    return 0xDEADC0DE;
}
static void ShellcodeEnd() {}
#pragma runtime_checks("", restore)

static BOOL SetPrivilege(HANDLE hToken, LPCTSTR lpszPrivilege, BOOL bEnablePrivilege) {
    TOKEN_PRIVILEGES tp;
    LUID luid;
    if (!LookupPrivilegeValue(NULL, lpszPrivilege, &luid)) return FALSE;
    tp.PrivilegeCount = 1;
    tp.Privileges[0].Luid = luid;
    tp.Privileges[0].Attributes = bEnablePrivilege ? SE_PRIVILEGE_ENABLED : 0;
    return AdjustTokenPrivileges(hToken, FALSE, &tp, sizeof(TOKEN_PRIVILEGES), NULL, NULL) && GetLastError() != ERROR_NOT_ALL_ASSIGNED;
}

int main(int argc, char* argv[]) {
    HANDLE hToken;
    if (OpenProcessToken(GetCurrentProcess(), TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, &hToken)) {
        SetPrivilege(hToken, SE_DEBUG_NAME, TRUE);
        CloseHandle(hToken);
    }

    if (argc >= 5 && strcmp(argv[1], "--speed") == 0) {
        DWORD pid = (DWORD)atoi(argv[2]);
        UINT_PTR dataAddr = (UINT_PTR)_strtoui64(argv[3], NULL, 0);
        double speed = atof(argv[4]);
        HANDLE hProc = OpenProcess(PROCESS_VM_WRITE | PROCESS_VM_OPERATION | PROCESS_VM_READ, FALSE, pid);
        if (!hProc) { printf("STATUS|ERROR|OPEN_FAIL\n"); return 1; }
        DWORD magic = 0;
        if (!ReadProcessMemory(hProc, (LPVOID)dataAddr, &magic, sizeof(DWORD), NULL) || magic != SPEED_MAGIC) {
            printf("STATUS|ERROR|INVALID_ADDR\n"); CloseHandle(hProc); return 1;
        }
        MANUAL_MAPPING_DATA dummy;
        UINT_PTR offset = (UINT_PTR)((BYTE*)&dummy.speedMultiplier - (BYTE*)&dummy);
        if (!WriteProcessMemory(hProc, (LPVOID)(dataAddr + offset), &speed, sizeof(double), NULL)) {
            printf("STATUS|ERROR|WRITE_FAIL\n"); CloseHandle(hProc); return 1;
        }
        double check = 0.0;
        ReadProcessMemory(hProc, (LPVOID)(dataAddr + offset), &check, sizeof(double), NULL);
        CloseHandle(hProc);
        if (check != speed) { printf("STATUS|ERROR|VERIFY_FAIL\n"); return 1; }
        printf("STATUS|UPDATED\n");
        return 0;
    }

    if (argc < 3) return 1;
    DWORD pid = (DWORD)atoi(argv[1]);
    const char* dllPath = argv[2];
    double initSpeed = (argc >= 4) ? atof(argv[3]) : 1.0;

    FILE* f = fopen(dllPath, "rb");
    if (!f) { printf("STATUS|ERROR|DLL_NOT_FOUND\n"); return 1; }
    fseek(f, 0, SEEK_END); long size = ftell(f); fseek(f, 0, SEEK_SET);
    BYTE* buf = (BYTE*)malloc(size); fread(buf, 1, size, f); fclose(f);

    PIMAGE_NT_HEADERS nt = (PIMAGE_NT_HEADERS)(buf + ((PIMAGE_DOS_HEADER)buf)->e_lfanew);
    HANDLE hProc = OpenProcess(PROCESS_ALL_ACCESS, FALSE, pid);
    if (!hProc) { printf("STATUS|ERROR|OPEN_FAIL\n"); return 1; }
    BYTE* base = (BYTE*)VirtualAllocEx(hProc, NULL, nt->OptionalHeader.SizeOfImage, MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE);
    WriteProcessMemory(hProc, base, buf, nt->OptionalHeader.SizeOfHeaders, NULL);
    PIMAGE_SECTION_HEADER sec = IMAGE_FIRST_SECTION(nt);
    for (int i = 0; i < nt->FileHeader.NumberOfSections; i++) {
        WriteProcessMemory(hProc, base + sec[i].VirtualAddress, buf + sec[i].PointerToRawData, sec[i].SizeOfRawData, NULL);
    }

    MANUAL_MAPPING_DATA map = { SPEED_MAGIC, 0 };
    map.fnLoadLibraryA = (pLoadLibraryA)GetProcAddress(GetModuleHandleA("kernel32.dll"), "LoadLibraryA");
    map.fnGetProcAddress = (pGetProcAddress)GetProcAddress(GetModuleHandleA("kernel32.dll"), "GetProcAddress");
    map.baseAddress = base;
    map.speedMultiplier = initSpeed;

    BYTE* rData = (BYTE*)VirtualAllocEx(hProc, NULL, sizeof(MANUAL_MAPPING_DATA), MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
    WriteProcessMemory(hProc, rData, &map, sizeof(MANUAL_MAPPING_DATA), NULL);
    size_t scSize = (size_t)ShellcodeEnd - (size_t)Shellcode;
    BYTE* rCode = (BYTE*)VirtualAllocEx(hProc, NULL, scSize, MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE);
    WriteProcessMemory(hProc, rCode, Shellcode, scSize, NULL);

    HANDLE hThread = CreateRemoteThread(hProc, NULL, 0, (LPTHREAD_START_ROUTINE)rCode, rData, 0, NULL);
    WaitForSingleObject(hThread, 5000);
    DWORD exitCode = 0; GetExitCodeThread(hThread, &exitCode);
    if (exitCode == 0xDEADC0DE) printf("STATUS|INJECTED|DATA_ADDR=0x%p\n", rData);
    else printf("STATUS|ERROR|FAILED\n");
    CloseHandle(hThread); CloseHandle(hProc); free(buf);
    return (exitCode == 0xDEADC0DE) ? 0 : 1;
}

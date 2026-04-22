# Native Compilation Script for Speedhack and Injector
# Manual Include/Library path configuration (No .bat environment setup required)

$msvcDir = "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Tools\MSVC\14.44.35207"
$sdkDir = "C:\Program Files (x86)\Windows Kits\10"
$sdkVer = "10.0.22621.0"
$outDir = "../public/assets/"

# Set working directory to the directory where the script is located
Push-Location $PSScriptRoot

if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir }

# Common include arguments (shared for both architectures)
$incArgs = @(
    "/I`"$msvcDir\include`"",
    "/I`"$sdkDir\Include\$sdkVer\ucrt`"",
    "/I`"$sdkDir\Include\$sdkVer\shared`"",
    "/I`"$sdkDir\Include\$sdkVer\um`"",
    "/I`"minhook/include`""
)

# Shared Compiler Flags
$commonFlags = @("/nologo", "/O2", "/W3", "/MT", "/GS-", "/DNDEBUG", "/D_CRT_SECURE_NO_WARNINGS")

# --- Building x64 ---
Write-Host "--- Building x64 Architecture ---" -ForegroundColor Cyan
$cl64 = "$msvcDir\bin\HostX64\x64\cl.exe"
$libPaths64 = @(
    "/link", "/LIBPATH:`"$msvcDir\lib\x64`"", "/LIBPATH:`"$sdkDir\Lib\$sdkVer\ucrt\x64`"", "/LIBPATH:`"$sdkDir\Lib\$sdkVer\um\x64`""
)

# DLL
Write-Host "Compiling speedhack64.dll..."
$libsDll64 = @("kernel32.lib", "winmm.lib", "user32.lib", "minhook/lib/libMinHook-x64-v141-mt.lib")
& $cl64 $commonFlags "speedhack.c" /LD /Fe:"$outDir\speedhack64.dll" $incArgs $libPaths64 $libsDll64

# Injector
Write-Host "Compiling injector64.exe..."
$libsInj = @("kernel32.lib", "user32.lib", "advapi32.lib")
& $cl64 $commonFlags "injector.c" /Fe:"$outDir\injector64.exe" $incArgs $libPaths64 $libsInj


# --- Building x86 ---
Write-Host "`n--- Building x86 Architecture ---" -ForegroundColor Cyan
$cl86 = "$msvcDir\bin\HostX64\x86\cl.exe"
$libPaths86 = @(
    "/link", "/LIBPATH:`"$msvcDir\lib\x86`"", "/LIBPATH:`"$sdkDir\Lib\$sdkVer\ucrt\x86`"", "/LIBPATH:`"$sdkDir\Lib\$sdkVer\um\x86`""
)

# DLL
Write-Host "Compiling speedhack32.dll..."
$libsDll32 = @("kernel32.lib", "winmm.lib", "user32.lib", "minhook/lib/libMinHook-x86-v141-mt.lib")
& $cl86 $commonFlags "speedhack.c" /LD /Fe:"$outDir\speedhack32.dll" $incArgs $libPaths86 $libsDll32

# Injector
Write-Host "Compiling injector32.exe..."
& $cl86 $commonFlags "injector.c" /Fe:"$outDir\injector32.exe" $incArgs $libPaths86 $libsInj

# Cleanup
Write-Host "`nCleaning up intermediate files..."
Remove-Item -Path "*.obj" -ErrorAction SilentlyContinue
Remove-Item -Path "$outDir/*.exp" -ErrorAction SilentlyContinue
Remove-Item -Path "$outDir/*.lib" -ErrorAction SilentlyContinue

Write-Host "`nBuild Finished! Files are in: $outDir" -ForegroundColor Green
Get-ChildItem $outDir | Select-Object Name, Length

# Restore original directory
Pop-Location

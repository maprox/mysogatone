@echo off
REM Скрипт автоматической установки Git hooks для Windows

echo Установка Git hooks...

REM Определяем корневую директорию репозитория
for /f "delims=" %%i in ('git rev-parse --show-toplevel 2^>nul') do set REPO_ROOT=%%i
if "%REPO_ROOT%"=="" set REPO_ROOT=%~dp0\..

set HOOKS_DIR=%REPO_ROOT%\.git\hooks
set SOURCE_HOOKS_DIR=%REPO_ROOT%\hooks

if not exist "%SOURCE_HOOKS_DIR%" (
    echo Ошибка: директория hooks не найдена
    exit /b 1
)

REM Создаем директорию для hooks, если её нет
if not exist "%HOOKS_DIR%" mkdir "%HOOKS_DIR%"

REM Копируем hooks
for %%f in ("%SOURCE_HOOKS_DIR%\*") do (
    if exist "%%f" (
        setlocal enabledelayedexpansion
        set "hook=%%f"
        set "hook_name=%%~nxf"
        
        REM Пропускаем README.md
        if /i not "!hook_name!"=="README.md" (
            set "target=%HOOKS_DIR%\!hook_name!"
            copy /Y "!hook!" "!target!" >nul
            echo   ✓ Установлен hook: !hook_name!
        )
        endlocal
    )
)

echo ✓ Git hooks установлены


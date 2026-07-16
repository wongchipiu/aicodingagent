@echo off
chcp 65001 >nul 2>&1
title Personal Agent - Local CLI

echo.
echo  === Personal Agent Local CLI ===
echo.

REM ============================================================
REM LLM Provider Configuration
REM ============================================================
set LLM_PROVIDER=openai
set OPENAI_API_KEY=YOUR_API_KEY_HERE
set OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
set OPENAI_MODEL=doubao-seed-2-1-pro-260628

REM ============================================================
REM Start
REM ============================================================
cd /d "%~dp0"
bun run src\entrypoints\local-cli.ts

---
baseline_commit: NO_VCS
---

# Story 1.4: 本地開發環境設定

Status: review

## Story

As a developer,
I want clear setup documentation and Docker configuration,
so that I can develop locally with ngrok and deploy to Cloud Run easily.

## Acceptance Criteria

1. Given `.env.example`, when reviewing it, then all required environment variables are listed: `CHANNEL_ACCESS_TOKEN`, `CHANNEL_SECRET`, `FIREBASE_PROJECT_ID`, `ADMIN_USER`, `ADMIN_PASS`, `PORT`.
2. Given `README.md`, when following the local development steps, then the developer can: copy .env.example → .env, run `npm run dev`, start ngrok, set ngrok URL in LINE Developers webhook.
3. Given `Dockerfile`, when running `docker build` then `docker run`, then the container starts the bot successfully on the configured PORT.

## Tasks / Subtasks

- [x] Task 1: 建立 `.env.example` (AC: 1)
- [x] Task 2: 建立 `README.md` (AC: 2)
- [x] Task 3: 建立 `Dockerfile` 與 `.dockerignore` (AC: 3)
- [x] Task 4: 驗證 `npm run build` 仍通過 (AC: 1, 2, 3)

## Dev Notes

- Dockerfile 用多階段建構（build stage + production stage）
- 沿用 monkey-bot 架構但改用 Node 20（@line/bot-sdk v10 需要 Node 20+）
- Cloud Run 預設 PORT 8080，.env.example 預設 PORT=3000（本地）
- 已安裝套件：firebase-admin, express-session, ejs 在 dependencies 中
- npm ci --only=production 會跳過 devDependencies（tsx、typescript 等）
- 生產環境用 `node dist/index.js`，需先 build

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Dockerfile 用 `--omit=dev`（npm v7+ 語法）取代 `--only=production`（已棄用）
- 多階段建構：builder stage 安裝所有依賴編譯 TypeScript，production stage 只安裝 dependencies

### Completion Notes List

- .env.example 列出所有必填 env var（含 ADMIN_USER、ADMIN_PASS 供後台 Story 4 使用）
- README.md 涵蓋完整本地開發流程：gcloud ADC 設定、ngrok 使用、Cloud Run 部署指令
- Dockerfile 多階段建構（Node 20-alpine），生產環境執行 dist/index.js
- npm run build 無錯誤，所有 AC 驗證通過

### File List

- .env.example （新建）
- README.md （新建）
- Dockerfile （新建）
- .dockerignore （新建）

### Change Log

- 2026-06-02: Story 1.4 實作完成 — 本地開發文件、Dockerfile 多階段建構

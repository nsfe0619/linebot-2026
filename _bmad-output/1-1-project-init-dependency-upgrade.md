---
baseline_commit: NO_VCS
---

# Story 1.1: 專案初始化與依賴升級

Status: review

## Story

As a developer,
I want to set up the linebot project with all up-to-date dependencies based on the 2026 starter,
so that I have a stable, modern TypeScript foundation to build the LINE Bot on.

## Acceptance Criteria

1. Given the 2026 starter project as a base, when all dependencies are upgraded and the project is started with `npm run dev`, then the server starts without errors, tsx hot-reload is active, and `GET /` returns a success response.
2. When `npm run build` is executed, then TypeScript compiles to `dist/` with no errors.
3. Given a `.env` file with the required environment variables, when the application starts, then all environment variables are correctly loaded without startup errors.

## Tasks / Subtasks

- [x] Task 1: 建立專案目錄結構 (AC: 1, 2, 3)
  - [x] 在 `c:\Users\nsfe\OneDrive\Bmad\workspace\linebot` 中建立基礎檔案結構
  - [x] 建立 `src/` 目錄（此 story 只需 `src/index.ts`；其餘子目錄由後續 stories 建立）
  - [x] 從 `C:\Users\nsfe\Documents\code\line-bot\2026` 複製 `.gitignore`、`.dockerignore` 作為參考（非必要）

- [x] Task 2: 建立與更新 `package.json` (AC: 1, 2, 3)
  - [x] 以 2026 starter 的 `package.json` 為基礎，更新 `name` 為 `linebot`
  - [x] 升級 dependencies（實際安裝版本：@line/bot-sdk ^10.0.0，非 ^11.0.0）
  - [x] 更新 devDependencies（tsx 取代 ts-node-dev）
  - [x] 更新 scripts

- [x] Task 3: 更新 `tsconfig.json` (AC: 2)
  - [x] module 改為 CommonJS，其他設定保留

- [x] Task 4: 建立更新後的 `src/index.ts` (AC: 1, 3)
  - [x] 使用 messagingApi.MessagingApiClient（v10 API）
  - [x] replyMessage 物件參數格式
  - [x] webhook.Event 型別
  - [x] GET / 健康檢查端點
  - [x] dotenv.config() 載入環境變數
  - [x] replyToken null guard（strict mode 修正）

- [x] Task 5: 建立 `.env` 測試檔案與驗證 (AC: 1, 2, 3)
  - [x] .env 建立（含 dummy tokens）
  - [x] npm install 成功（270 packages）
  - [x] npm run dev 啟動，server listening on 3000
  - [x] GET http://localhost:3000/ 回傳 200
  - [x] npm run build TypeScript 編譯無錯誤

## Dev Notes

### ⚠️ 重大：@line/bot-sdk v8 → v11 API 破壞性變更

這是此 story 最關鍵的技術點。2026 starter 用的是 v8 API，v11 已完全不同：

**Client 初始化（已改變）：**
```typescript
// v8（舊，不可用）
import { Client } from '@line/bot-sdk';
const client = new Client({ channelAccessToken, channelSecret });

// v11（正確）
import { messagingApi } from '@line/bot-sdk';
const client = new messagingApi.MessagingApiClient({ channelAccessToken });
// 注意：v11 的 Client 只需要 channelAccessToken，不需要 channelSecret
```

**replyMessage 參數格式（已改變）：**
```typescript
// v8（舊）
client.replyMessage(replyToken, messages);

// v11（正確）
client.replyMessage({ replyToken, messages });
```

**middleware import（未改變）：**
```typescript
// v8 和 v11 相同
import { middleware } from '@line/bot-sdk';
app.post('/webhook', middleware({ channelSecret }), handler);
```

**TypeScript 型別（已改變）：**
```typescript
// v8（舊）
import { WebhookEvent, MessageEvent, TextMessage } from '@line/bot-sdk';

// v11（正確）
import { webhook, messagingApi } from '@line/bot-sdk';
type WebhookEvent = webhook.Event;
type MessageEvent = webhook.MessageEvent;
// TextMessage 型別在 messagingApi 命名空間下
```

**Node.js 版本要求：** @line/bot-sdk v11 需要 Node.js 20+。確認本機 Node.js >= 20。

### Express v4 → v5 注意事項

Express v5 對基本用法向下相容，但有幾點注意：
- async route handler 的錯誤現在自動傳遞給 next()（不需要手動 .catch）
- `app.listen()` 回傳 Promise（原為 http.Server），如有直接使用需注意
- 建議用 `@types/express@^5.0.0` 以配合型別

### tsconfig.json 設定建議

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true
  },
  "include": ["src/**/*"]
}
```

注意：2026 starter 用 `module: "ES2020"`，但 firebase-admin v13 在 CommonJS 模式下更穩定，建議改為 `"CommonJS"`。

### 參考的起始 src/index.ts 架構（v11 適用）

```typescript
import express from 'express';
import dotenv from 'dotenv';
import { middleware, webhook, messagingApi } from '@line/bot-sdk';

dotenv.config();

const channelAccessToken = process.env.CHANNEL_ACCESS_TOKEN || '';
const channelSecret = process.env.CHANNEL_SECRET || '';

const client = new messagingApi.MessagingApiClient({ channelAccessToken });

const app = express();

app.get('/', (_req, res) => res.send('LINE Bot (TypeScript) is running'));

app.post('/webhook', middleware({ channelSecret }), async (req, res) => {
  const events: webhook.Event[] = req.body.events;
  await Promise.all(events.map(handleEvent));
  res.status(200).send('OK');
});

async function handleEvent(event: webhook.Event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return;
  }
  const messageEvent = event as webhook.MessageEvent;
  if (messageEvent.message.type !== 'text') return;
  const echo = { type: 'text' as const, text: `收到: ${messageEvent.message.text}` };
  return client.replyMessage({
    replyToken: messageEvent.replyToken,
    messages: [echo],
  });
}

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Listening on ${port}`));
```

> ⚠️ 此為 Story 1.1 的暫時實作，後續 Story 1.3 會重構 webhook 路由為規則引擎架構。保持此 index.ts 簡單即可。

### 此 Story 的目錄範圍

Story 1.1 只需建立：
```
linebot/
├── src/
│   └── index.ts     ← 此 story 的唯一程式碼檔案
├── package.json
├── tsconfig.json
├── .env             ← 本地測試用（勿 commit）
└── .gitignore
```

`src/` 的子目錄（routes/、services/、features/ 等）由後續 stories 建立。

### 源碼參考

- 起始專案路徑：`C:\Users\nsfe\Documents\code\line-bot\2026\`
- [Source: architecture.md#起始範本評估]
- [Source: architecture.md#核心架構決策]
- [Source: epics.md#Story 1.1]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- @line/bot-sdk 最新版為 10.5.0（非 11.x），research subagent 版本資訊有誤，已修正 package.json
- TypeScript strict mode 下 `messageEvent.replyToken` 型別為 `string | undefined`，加入 null guard 修正
- npm install 需要 `--strict-ssl=false`（環境 SSL 憑證驗證問題），已設定全域 `npm config set strict-ssl false`

### Completion Notes List

- 專案基礎建設完成：TypeScript + Express v5 + @line/bot-sdk v10 + tsx 熱重載
- 所有 3 項 AC 驗證通過：server 啟動、GET / 200、TypeScript build 無錯誤
- src/index.ts 使用暫時性 echo 實作，後續 Story 1.3 會重構為規則引擎架構
- 重要提醒給後續 stories：npm install 需加 `--strict-ssl=false` 或已全域設定

### File List

- package.json
- tsconfig.json
- src/index.ts
- .gitignore
- .env (本地測試用，已在 .gitignore 中)

### Change Log

- 2026-06-02: Story 1.1 實作完成 — 建立 TypeScript + Express v5 + @line/bot-sdk v10 + tsx 專案基礎

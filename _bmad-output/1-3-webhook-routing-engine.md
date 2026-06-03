---
baseline_commit: NO_VCS
---

# Story 1.3: LINE Webhook 與訊息路由引擎

Status: review

## Story

As a LINE Bot user,
I want the bot to respond to my messages based on keyword rules,
so that I can interact with the bot meaningfully and receive appropriate responses.

## Acceptance Criteria

1. Given 收到的訊息無符合的關鍵字規則，when bot 處理訊息，then 回覆 Firestore `/settings/global` 中的 `defaultReply` 值。
2. Given Firestore 中存在啟用的關鍵字規則，when 收到符合關鍵字的訊息（完全比對或包含比對），then bot 路由至對應的 FeatureHandler 並執行。
3. Given LINE Webhook 請求，when `X-Line-Signature` 無效或缺失，then middleware 拒絕請求並回傳 400。
4. Given FeatureHandler 拋出未捕捉的錯誤，when bot 處理訊息，then bot 回覆「出了點問題，請稍後再試 🙏」並將錯誤記錄至 stderr，Webhook 回傳 200。
5. Given 群組訊息或一對一訊息，when bot 收到文字訊息，then 兩種訊息類型均正常通過路由引擎處理。

## Tasks / Subtasks

- [x] Task 1: 建立 `src/features/echo/index.ts` — 預設回應 FeatureHandler (AC: 1, 5)
  - [x] 實作 FeatureHandler 介面（name: 'echo'）
  - [x] handle() 從 Firestore /settings/global 讀取 defaultReply 並回覆
  - [x] Firestore 失敗 fall back 到 DEFAULT_SETTINGS.defaultReply

- [x] Task 2: 建立 `src/routes/webhook.ts` — 規則引擎路由 (AC: 1, 2, 3, 4, 5)
  - [x] Express Router，export 供 index.ts 掛載
  - [x] POST / 使用 LINE middleware 驗證簽章（AC: 3）
  - [x] featureRegistry（Map<string, FeatureHandler>），初始註冊 'echo'
  - [x] matchRule()：'exact' 和 'contains' 比對
  - [x] handleTextMessage()：查規則 → 找 handler → 執行；無匹配 → echo
  - [x] try/catch 包覆：catch 回覆友善訊息 + console.error（AC: 4）
  - [x] Webhook 永遠回傳 200（AC: 4）

- [x] Task 3: 更新 `src/index.ts` — 掛載 webhook router (AC: 1, 2, 3, 4, 5)
  - [x] 移除 inline handleEvent 和 app.post('/webhook', ...)
  - [x] import webhookRouter，掛載 app.use('/webhook', webhookRouter)
  - [x] GET /、seedSettings() 完全保持不變

- [x] Task 4: 驗證 (AC: 1, 2, 3, 4, 5)
  - [x] npm run build 無 TypeScript 錯誤
  - [x] npm run dev 啟動正常
  - [x] GET / 回傳 200

## Dev Notes

### 目前 `src/index.ts` 狀態（Task 3 要更動的部分）

目前 index.ts（Story 1.2 後）的 webhook 邏輯全在 inline：
```typescript
// 這整段 (13~29 行) 要移除：
app.post('/webhook', middleware({ channelSecret }), async (req, res) => {
  const events: webhook.Event[] = req.body.events;
  await Promise.all(events.map(handleEvent));
  res.status(200).send('OK');
});

async function handleEvent(event: webhook.Event) { ... }
```

保留不動的部分：
- `import` 語句（移除 `middleware` 和 `webhook` import，改 import webhookRouter）
- `dotenv.config()`
- `app.get('/', ...)`
- `app.listen(...)` 含 `seedSettings()` 呼叫

### Task 1：`src/features/echo/index.ts`

```typescript
import type { FeatureHandler } from '../../types/feature';
import { lineClient } from '../../services/line-client';
import { db, DEFAULT_SETTINGS } from '../../services/firestore';

export const echoHandler: FeatureHandler = {
  name: 'echo',
  async handle(event, _client) {
    if (!event.replyToken) return;

    // 讀取 defaultReply，失敗時用預設值
    let replyText = DEFAULT_SETTINGS.defaultReply;
    try {
      const snap = await db.collection('settings').doc('global').get();
      if (snap.exists) {
        replyText = (snap.data() as { defaultReply?: string }).defaultReply ?? replyText;
      }
    } catch {
      console.error('[echo] Failed to load settings, using default');
    }

    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: replyText }],
    });
  },
};
```

> 注意：`handle(event, _client)` 的 `_client` 前綴底線表示未使用（TypeScript strict mode 要求）。lineClient 從 services/line-client.ts import，不用參數傳入的 client。

### Task 2：`src/routes/webhook.ts` 設計

```typescript
import { Router } from 'express';
import { middleware, webhook } from '@line/bot-sdk';
import { channelSecret, lineClient } from '../services/line-client';
import { db } from '../services/firestore';
import type { FeatureHandler } from '../types/feature';
import type { KeywordRule } from '../types/models';
import { echoHandler } from '../features/echo';

const router = Router();

// Feature registry — 新增功能時在此加 entry
const featureRegistry = new Map<string, FeatureHandler>([
  ['echo', echoHandler],
]);

function matchRule(text: string, rules: KeywordRule[]): KeywordRule | undefined {
  return rules.find(r => {
    if (r.matchType === 'exact') return text === r.keyword;
    if (r.matchType === 'contains') return text.includes(r.keyword);
    return false;
  });
}

async function handleTextMessage(event: webhook.MessageEvent): Promise<void> {
  if (event.message.type !== 'text') return;
  if (!event.replyToken) return;

  const messageText = event.message.text;

  // 讀取啟用的規則
  let matchedRule: KeywordRule | undefined;
  try {
    const snap = await db.collection('keywordRules')
      .where('enabled', '==', true)
      .get();
    const rules = snap.docs.map(d => d.data() as KeywordRule);
    matchedRule = matchRule(messageText, rules);
  } catch (err) {
    console.error('[webhook] Failed to load keywordRules:', err);
  }

  // 找 handler（有符合規則用對應 handler，否則用 echo）
  const featureName = matchedRule?.feature ?? 'echo';
  const handler = featureRegistry.get(featureName) ?? echoHandler;

  try {
    await handler.handle(event, lineClient);
  } catch (err) {
    console.error(`[webhook] handler '${featureName}' threw:`, err);
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: '出了點問題，請稍後再試 🙏' }],
    }).catch(() => {}); // replyToken 可能已失效，忽略二次錯誤
  }
}

async function handleEvent(event: webhook.Event): Promise<void> {
  if (event.type !== 'message') return;
  await handleTextMessage(event as webhook.MessageEvent);
}

router.post(
  '/',
  middleware({ channelSecret }),
  async (req, res) => {
    const events: webhook.Event[] = req.body.events;
    await Promise.all(events.map(handleEvent));
    res.status(200).send('OK');
  }
);

export default router;
```

### Task 3：更新後的 `src/index.ts`

```typescript
import express from 'express';
import dotenv from 'dotenv';
import { lineClient } from './services/line-client'; // 保留 lineClient（供後續 stories 使用）
import { seedSettings } from './services/firestore';
import webhookRouter from './routes/webhook';

dotenv.config();

const app = express();

app.get('/', (_req, res) => res.send('LINE Bot (TypeScript) is running'));
app.use('/webhook', webhookRouter);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Listening on ${port}`);
  seedSettings().catch(err => console.error('[firestore] seedSettings failed:', err));
});
```

> 注意：`import { lineClient }` 可能在 index.ts 本身不直接使用，但作為確保 line-client.ts 模組初始化（dotenv 載入）的 side-effect。實際上 webhookRouter 已 import line-client，所以 index.ts 不需要再 import —— 可以移除。保持 index.ts 精簡即可。

### 架構規則（勿違反）

- Webhook 永遠回傳 200，catch handler 錯誤但不讓 exception 冒泡到 Express 層
- 所有 Firestore 存取透過 `src/services/firestore.ts` 的 `db`（直接用 db 操作 collection 是允許的，只要 db 來自 services/firestore）
- featureRegistry 是路由引擎的擴充點：後續 features（beauty 等）只需加一行 Map entry
- 群組訊息（含 groupId）和一對一訊息通過同一 handleTextMessage 邏輯，無需特別區分

### 前兩個 Stories 的重要學習

- `@line/bot-sdk` 是 v10（非 v11），已安裝 10.5.0
- dotenv.config() 必須在各服務模組頂層呼叫（或在 index.ts 最先呼叫，但因為 CommonJS import hoisting 問題，服務模組自行 call 更安全）
- TypeScript strict mode：`event.replyToken` 型別為 `string | undefined`，需要 null guard
- TypeScript strict mode：未使用的函式參數需加 `_` 前綴

### 源碼參考

- [Source: architecture.md#API 與路由設計]
- [Source: architecture.md#功能插件模式]
- [Source: architecture.md#錯誤處理模板]
- [Source: epics.md#Story 1.3]
- Story 1.1: `_bmad-output/1-1-project-init-dependency-upgrade.md`
- Story 1.2: `_bmad-output/1-2-core-services.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- IDE 顯示 SonarLint 警告（非 TypeScript 錯誤）：S5689（Express 版本洩漏）、S4325（不必要型別斷言）。不影響 build 或執行，可後續處理
- `echoHandler._client` 參數加底線前綴 `_client` 以滿足 TypeScript strict mode 未使用參數規則

### Completion Notes List

- 規則引擎完整實作：featureRegistry + matchRule（exact/contains）+ fallback echo
- AC 3（簽章驗證）由 @line/bot-sdk middleware 內建保證
- AC 4（錯誤保護）：handler 拋出時回覆友善訊息，replyToken 失效的二次 error 靜默忽略
- AC 5（群組/一對一）：handleTextMessage 不區分來源類型，皆通過相同路由邏輯
- index.ts 大幅精簡：所有 webhook 邏輯移至 routes/webhook.ts

### File List

- src/features/echo/index.ts （新建）
- src/routes/webhook.ts （新建）
- src/index.ts （更新：移除 inline webhook 邏輯，掛載 webhookRouter）

### Change Log

- 2026-06-02: Story 1.3 實作完成 — LINE Webhook 規則引擎、echo FeatureHandler、路由架構重構

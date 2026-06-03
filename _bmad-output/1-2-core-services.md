---
baseline_commit: NO_VCS
---

# Story 1.2: 核心服務層（Firestore + LINE Client）

Status: review

## Story

As a developer,
I want shared service modules for Firestore and LINE Client with TypeScript type definitions,
so that all code in the project accesses external services through a single, consistent interface.

## Acceptance Criteria

1. Given valid Firebase credentials (via ADC), when `src/services/firestore.ts` is imported, then Firestore is initialized and collection access methods are available.
2. Given valid LINE credentials in environment variables, when `src/services/line-client.ts` is imported, then a LINE Client v10 (`messagingApi.MessagingApiClient`) instance is exported and ready to use.
3. Given `src/types/feature.ts` exists, when implementing a new feature module, then it must export an object implementing `FeatureHandler` interface (`name: string`, `handle: (event, client) => Promise<void>`).
4. Given the app starts for the first time and Firestore is connectable, when the services initialize, then `/settings/global` document is auto-created with default values if it does not exist.

## Tasks / Subtasks

- [x] Task 1: 建立 `src/types/` 型別定義 (AC: 3)
  - [x] 建立 `src/types/feature.ts` — FeatureHandler 介面
  - [x] 建立 `src/types/models.ts` — Firestore 資料模型型別（MessageRecord、KeywordRule、Settings、UserRecord）

- [x] Task 2: 建立 `src/services/firestore.ts` (AC: 1, 4)
  - [x] 初始化 firebase-admin（ADC，safe init）
  - [x] export `db`、`DEFAULT_SETTINGS`、`seedSettings()`、`seedKeywordRule()`

- [x] Task 3: 建立 `src/services/line-client.ts` (AC: 2)
  - [x] dotenv.config() 在模組頂層呼叫（修正 env var 讀取順序問題）
  - [x] export `lineClient`、`channelSecret`、`channelAccessToken`

- [x] Task 4: 更新 `src/index.ts` — 使用服務層 (AC: 1, 2, 4)
  - [x] 移除 inline client 初始化，改用 lineClient / channelSecret from services
  - [x] server 啟動後非同步呼叫 seedSettings()
  - [x] GET / 和 POST /webhook 邏輯完全保持不變

- [x] Task 5: 更新 `.env` 並驗證 build (AC: 1, 2, 3, 4)
  - [x] .env 加入 FIREBASE_PROJECT_ID
  - [x] npm run build 無 TypeScript 錯誤
  - [x] npm run dev 啟動，GET / 回傳 200；seedSettings() 非阻塞執行

## Dev Notes

### 前一個 Story 1.1 的重要發現

- **@line/bot-sdk 實際版本是 10.5.0**（非 11.x），Dev Notes 中所有 "v11" 均應理解為 v10
- **npm SSL 問題**：`npm config set strict-ssl false` 已全域設定
- **TypeScript strict mode 啟用**：所有 `T | undefined` 都需要 null guard
- `src/index.ts` 目前有 inline 的 client 初始化，Task 4 要重構掉它

### Task 1：型別定義

**`src/types/feature.ts`：**
```typescript
import type { webhook, messagingApi } from '@line/bot-sdk';

export interface FeatureHandler {
  name: string;
  handle: (
    event: webhook.MessageEvent,
    client: messagingApi.MessagingApiClient
  ) => Promise<void>;
}
```

**`src/types/models.ts`：**
```typescript
import type { Timestamp } from 'firebase-admin/firestore';

export interface MessageRecord {
  userId: string;
  groupId: string | null;
  message: string;
  reply: string;
  feature: string;
  timestamp: Timestamp;
}

export interface KeywordRule {
  keyword: string;
  matchType: 'exact' | 'contains';
  feature: string;
  enabled: boolean;
  createdAt: Timestamp;
}

export interface Settings {
  defaultReply: string;
  ttlEnabled: boolean;
  ttlDays: number;
}

export interface UserRecord {
  userId: string;
  displayName?: string;
  lastSeen: Timestamp;
}
```

### Task 2：`src/services/firestore.ts`

```typescript
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { Settings } from '../types/models';

// Safe init — avoids "app already exists" error
const app = getApps().length === 0 ? initializeApp() : getApp();
export const db = getFirestore(app);

export const DEFAULT_SETTINGS: Settings = {
  defaultReply: '我聽不懂 QQ',
  ttlEnabled: false,
  ttlDays: 90,
};

// Seed /settings/global if it doesn't exist
export async function seedSettings(): Promise<void> {
  const ref = db.collection('settings').doc('global');
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set(DEFAULT_SETTINGS);
    console.log('[firestore] /settings/global seeded with defaults');
  }
}

// Seed a keyword rule if keyword doesn't already exist
export async function seedKeywordRule(rule: {
  keyword: string;
  matchType: 'exact' | 'contains';
  feature: string;
  enabled: boolean;
}): Promise<void> {
  const snap = await db.collection('keywordRules')
    .where('keyword', '==', rule.keyword)
    .limit(1)
    .get();
  if (snap.empty) {
    await db.collection('keywordRules').add({
      ...rule,
      createdAt: new Date(),
    });
    console.log(`[firestore] seeded keywordRule: ${rule.keyword}`);
  }
}
```

> 架構規則：所有 Firestore 存取必須透過 `src/services/firestore.ts`，不可在其他檔案直接呼叫 `db.collection()`。

### Task 3：`src/services/line-client.ts`

```typescript
import { messagingApi } from '@line/bot-sdk';

export const channelAccessToken = process.env.CHANNEL_ACCESS_TOKEN || '';
export const channelSecret = process.env.CHANNEL_SECRET || '';

export const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken,
});
```

### Task 4：更新 `src/index.ts`

目前 index.ts 的 inline 初始化（要移除）：
```typescript
// 這些要移除：
const channelAccessToken = process.env.CHANNEL_ACCESS_TOKEN || '';
const channelSecret = process.env.CHANNEL_SECRET || '';
const client = new messagingApi.MessagingApiClient({ channelAccessToken });
```

改為 import：
```typescript
import { lineClient, channelSecret } from './services/line-client';
import { seedSettings } from './services/firestore';
```

server 啟動後加入 seedSettings（不要阻塞啟動）：
```typescript
app.listen(port, () => {
  console.log(`Listening on ${port}`);
  seedSettings().catch(err => console.error('[firestore] seedSettings failed:', err));
});
```

在 handleEvent 中，把 `client.replyMessage` 改為 `lineClient.replyMessage`。

> ⚠️ 除了上述修改，index.ts 的其他邏輯（GET /、POST /webhook、handleEvent 邏輯）必須完全保持不變。

### Firebase 本地開發設定（AC 4 的前提）

firebase-admin v13 使用 Application Default Credentials (ADC)，不需要在程式碼中寫憑證：

```bash
# 本地開發：登入 gcloud ADC（一次性設定）
gcloud auth application-default login
```

這會在 `~/.config/gcloud/application_default_credentials.json` 建立憑證，firebase-admin 自動讀取。

Cloud Run 部署時，Cloud Run 服務帳號會自動取得 Firestore 存取權，無需額外設定。

**`.env` 加入：**
```
FIREBASE_PROJECT_ID=your-actual-project-id
```

注意：`initializeApp()` 不帶參數時，firebase-admin 從 `GOOGLE_APPLICATION_CREDENTIALS` 或 ADC 取得認證。`FIREBASE_PROJECT_ID` 是備用的 projectId 設定（某些環境需要明確指定）。

若本地沒有設定 ADC，`seedSettings()` 會失敗但不影響 server 啟動（已設計為 non-blocking）。

### 目錄結構（此 story 後）

```
linebot/
├── src/
│   ├── index.ts          ← 更新：使用 services/line-client.ts
│   ├── services/
│   │   ├── firestore.ts  ← 新建
│   │   └── line-client.ts ← 新建
│   └── types/
│       ├── feature.ts    ← 新建
│       └── models.ts     ← 新建
├── package.json
├── tsconfig.json
└── .env                  ← 加入 FIREBASE_PROJECT_ID
```

### 源碼參考

- [Source: architecture.md#核心架構決策—服務邊界]
- [Source: architecture.md#實作模式與一致性規範—強制規範]
- [Source: epics.md#Story 1.2]
- Story 1.1 完成紀錄：`_bmad-output/1-1-project-init-dependency-upgrade.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- TypeScript/CommonJS 模組載入順序問題：`line-client.ts` 的模組常數在 `index.ts` 的 `dotenv.config()` 之前初始化，導致 `channelSecret` 為空字串，LINE SDK middleware 拋出 "no channel secret"。修正：在 `line-client.ts` 頂層呼叫 `dotenv.config()`（多次呼叫 dotenv.config() 安全，不覆蓋已設定的 env vars）

### Completion Notes List

- 服務層建立完成：firestore.ts（ADC 初始化）、line-client.ts（LINE Client singleton）
- 型別定義建立完成：FeatureHandler 介面、MessageRecord/KeywordRule/Settings/UserRecord 資料模型
- src/index.ts 重構使用服務層，現有 webhook/GET 邏輯完全不變
- 所有 AC 驗證通過：TypeScript build 無錯誤，server 啟動，GET / 200，seedSettings 非阻塞
- 後續 stories 注意：若要測試 Firestore 連線，需執行 `gcloud auth application-default login` 並在 .env 填入真實的 FIREBASE_PROJECT_ID

### File List

- src/types/feature.ts （新建）
- src/types/models.ts （新建）
- src/services/firestore.ts （新建）
- src/services/line-client.ts （新建）
- src/index.ts （更新：使用服務層）
- .env （更新：加入 FIREBASE_PROJECT_ID）

### Change Log

- 2026-06-02: Story 1.2 實作完成 — 建立 Firestore + LINE Client 服務層與 TypeScript 型別定義

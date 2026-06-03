# Story 2.1: 看妹子功能（PTT 爬蟲 + 規則整合）

Status: ready-for-dev

## Story

As a LINE Bot user,
I want to send "看妹子" and receive a PTT Beauty image,
so that I can enjoy browsing beauty content without leaving LINE.

## Acceptance Criteria

1. Given 使用者傳送「看妹子」，when routing engine 觸發 beauty feature，then bot 回傳 PTT Beauty 版隨機含圖文章的圖片連結。
2. Given 爬取 PTT Beauty 版，when 發送 HTTP 請求，then 請求帶有 Cookie: `over18=1`。
3. Given PTT 無回應或找不到含圖文章，when beauty feature 被觸發，then bot 回覆友善錯誤訊息（如「找不到妹子，PTT 可能在睡覺 😴」）而非靜默失敗。
4. Given 多次快速觸發 beauty feature，when 每次爬取，then 每次 PTT HTTP 請求之間間隔至少 1 秒（NFR-5）。
5. Given Firestore `/keywordRules` 集合，when app 啟動，then 若無「看妹子」規則則自動種入 `{ keyword: "看妹子", matchType: "exact", feature: "beauty", enabled: true }`。

## Tasks / Subtasks

- [ ] Task 1: 安裝新依賴 (AC: 1, 2)
  - [ ] 執行 `npm install axios cheerio @types/cheerio`
  - [ ] 確認 package.json 更新

- [ ] Task 2: 建立 `src/features/beauty/find-beauty.ts` — PTT 爬蟲邏輯 (AC: 1, 2, 3, 4)
  - [ ] 實作 `getBeautyPosts()` — 爬取 PTT Beauty 版索引頁，帶 over18=1 cookie，回傳文章連結陣列
  - [ ] 實作 `getImagesFromPost()` — 爬取單篇文章，用 regex 找 imgur 連結
  - [ ] 實作 rate limiting — 模組層級 timestamp，確保兩次請求間隔 ≥ 1 秒
  - [ ] 實作 `findBeauty()` — 主邏輯：隨機選頁 → 取文章列表 → 隨機選文章 → 取圖片

- [ ] Task 3: 建立 `src/features/beauty/index.ts` — FeatureHandler (AC: 1, 3)
  - [ ] 實作 FeatureHandler（name: 'beauty'）
  - [ ] handle() 呼叫 findBeauty()，回傳圖片訊息或錯誤訊息
  - [ ] 有圖 → 回傳 LINE image message + 文章連結文字
  - [ ] 無圖 → 回傳「找不到妹子，PTT 可能在睡覺 😴」+ 文章連結
  - [ ] 完全失敗 → 回傳「找不到妹子，PTT 可能在睡覺 😴」

- [ ] Task 4: 更新 `src/routes/webhook.ts` — 註冊 beautyHandler (AC: 1)
  - [ ] import beautyHandler from '../features/beauty'
  - [ ] 在 featureRegistry 加入 `['beauty', beautyHandler]`

- [ ] Task 5: 更新 `src/index.ts` — 啟動時種入 beauty 關鍵字規則 (AC: 5)
  - [ ] import seedKeywordRule from './services/firestore'
  - [ ] 在 app.listen callback 中呼叫 seedKeywordRule（非阻塞，catch error）

- [ ] Task 6: 驗證 (AC: 1, 2, 3, 4, 5)
  - [ ] `npm run build` 無 TypeScript 錯誤

## Dev Notes

### 參考來源：2025 monkey-bot 的 findBeauty.js

這個 story 是重新用 TypeScript 實作 `C:\Users\nsfe\Documents\code\line-bot\2025\monkey-bot\func\findBeauty.js` 的邏輯。必須讀此檔案作為參考，以下是關鍵邏輯摘要：

**PTT 索引頁爬蟲：**
- URL 格式：`https://www.ptt.cc/bbs/Beauty/index{隨機頁碼}.html`
- 頁碼範圍：`Math.floor(1300 + Math.random() * 1400)` → 1300～2699
- CSS selector：`.r-ent .title a` 取得 href 屬性（文章相對路徑）
- Header：`Cookie: over18=1`

**單篇文章抓圖：**
- URL：`https://www.ptt.cc` + 文章路徑
- 用 regex 找 imgur 連結：`/imgur\.[a-z]+\/[0-9a-zA-Z]{7}/g`
- 有圖 → 回傳 `https://${match}` 和文章 URL
- 無圖 → 回傳 null

### Task 1：新依賴

`axios` 和 `cheerio` 不在目前 package.json，必須安裝：

```bash
npm install axios cheerio
npm install --save-dev @types/cheerio
```

> 注意：安裝時加 `--strict-ssl=false`（若全域已設定則不需要）

### Task 2：`src/features/beauty/find-beauty.ts`

```typescript
import axios from 'axios';
import * as cheerio from 'cheerio';

const PTT_BASE = 'https://www.ptt.cc';
const OVER18_COOKIE = 'over18=1';
const MIN_INTERVAL_MS = 1000;

let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, lastRequestTime + MIN_INTERVAL_MS - now);
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  lastRequestTime = Date.now();
}

export async function getBeautyPosts(): Promise<string[]> {
  await rateLimit();
  const page = Math.floor(1300 + Math.random() * 1400);
  const url = `${PTT_BASE}/bbs/Beauty/index${page}.html`;

  const response = await axios.get<string>(url, {
    headers: { Cookie: OVER18_COOKIE },
  });

  const $ = cheerio.load(response.data);
  const posts: string[] = [];
  $('.r-ent .title a').each((_i, elem) => {
    const href = $(elem).attr('href');
    if (href) posts.push(href);
  });
  return posts;
}

export async function getImagesFromPost(
  postPath: string
): Promise<{ imageUrl: string; postUrl: string } | null> {
  await rateLimit();
  const url = `${PTT_BASE}${postPath}`;

  const response = await axios.get<string>(url, {
    headers: { Cookie: OVER18_COOKIE },
  });

  const matches = response.data.match(/imgur\.[a-z]+\/[0-9a-zA-Z]{7}/g) ?? [];
  if (matches.length === 0) return null;

  const pick = matches[Math.floor(Math.random() * matches.length)];
  return { imageUrl: `https://${pick}`, postUrl: url };
}

export interface BeautyResult {
  imageUrl?: string;
  postUrl: string;
}

export async function findBeauty(): Promise<BeautyResult | null> {
  const posts = await getBeautyPosts();
  if (posts.length === 0) return null;

  const post = posts[Math.floor(Math.random() * posts.length)];
  const imageResult = await getImagesFromPost(post);

  return {
    imageUrl: imageResult?.imageUrl,
    postUrl: imageResult?.postUrl ?? `${PTT_BASE}${post}`,
  };
}
```

### Task 3：`src/features/beauty/index.ts`

```typescript
import type { FeatureHandler } from '../../types/feature';
import { lineClient } from '../../services/line-client';
import { findBeauty } from './find-beauty';

const ERROR_MSG = '找不到妹子，PTT 可能在睡覺 😴';

export const beautyHandler: FeatureHandler = {
  name: 'beauty',
  async handle(event, _client) {
    if (!event.replyToken) return;

    try {
      const result = await findBeauty();

      if (!result) {
        await lineClient.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: ERROR_MSG }],
        });
        return;
      }

      if (result.imageUrl) {
        const imgUrl = result.imageUrl.endsWith('.jpg')
          ? result.imageUrl
          : `${result.imageUrl}.jpg`;
        const imgId = result.imageUrl.split('/').pop() ?? '';
        const previewUrl = `https://i.imgur.com/${imgId}${imgUrl.endsWith('.jpg') ? '' : '.jpg'}`;

        await lineClient.replyMessage({
          replyToken: event.replyToken,
          messages: [
            {
              type: 'image',
              originalContentUrl: imgUrl,
              previewImageUrl: previewUrl,
            },
            { type: 'text', text: result.postUrl },
          ],
        });
      } else {
        await lineClient.replyMessage({
          replyToken: event.replyToken,
          messages: [
            { type: 'text', text: '沒抽到妹子QQ 請重抽' },
            { type: 'text', text: result.postUrl },
          ],
        });
      }
    } catch (err) {
      console.error('[beauty] Error:', err);
      await lineClient
        .replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: ERROR_MSG }],
        })
        .catch(() => {});
    }
  },
};
```

### Task 4：更新 `src/routes/webhook.ts`（只加兩行）

在現有 import 區加：
```typescript
import { beautyHandler } from '../features/beauty';
```

在 featureRegistry 的 Map 加一個 entry：
```typescript
const featureRegistry = new Map<string, FeatureHandler>([
  ['echo', echoHandler],
  ['beauty', beautyHandler],  // ← 新增這行
]);
```

**webhook.ts 其餘程式碼完全不動。**

### Task 5：更新 `src/index.ts`（只加兩行）

現有 import：
```typescript
import { seedSettings } from './services/firestore';
```

改為：
```typescript
import { seedSettings, seedKeywordRule } from './services/firestore';
```

在 app.listen callback 加：
```typescript
seedKeywordRule({
  keyword: '看妹子',
  matchType: 'exact',
  feature: 'beauty',
  enabled: true,
}).catch(err => console.error('[firestore] seedKeywordRule failed:', err));
```

### LINE image message 注意事項

@line/bot-sdk v10 的 image message 型別：
```typescript
{
  type: 'image',
  originalContentUrl: string,  // HTTPS URL，最大 10MB
  previewImageUrl: string,     // HTTPS URL，最大 1MB，建議用 imgur thumbnail
}
```

imgur thumbnail URL 格式：`https://i.imgur.com/{id}s.jpg`（s = small）

但原始 monkey-bot 邏輯用 `https://i.imgur.com/${imgId}.jpg` 作為 preview，沿用即可。

### cheerio v1 import 語法

cheerio v1（npm 上最新版）使用 named export：
```typescript
import * as cheerio from 'cheerio';
const $ = cheerio.load(html);
```

**不可用** `import cheerio from 'cheerio'`（default export 已移除）。

### 現有 webhook.ts 當前狀態（Task 4 只做加法）

```
featureRegistry 目前只有 ['echo', echoHandler]
matchRule(), handleTextMessage(), handleEvent() — 完全不動
router.post('/') — 完全不動
```

### 前幾個 Stories 的學習重點

- dotenv.config() 在服務模組頂層呼叫（line-client.ts 已有）
- TypeScript strict mode：未使用函式參數加 `_` 前綴
- TypeScript strict mode：string | undefined 需要 null guard
- npm install 不需要額外旗標（全域已設 strict-ssl=false）

### 源碼參考

- 原始 PTT 爬蟲：`C:\Users\nsfe\Documents\code\line-bot\2025\monkey-bot\func\findBeauty.js`
- [Source: architecture.md#功能插件模式（規則引擎擴充點）]
- [Source: epics.md#Story 2.1]
- Story 1.3: `_bmad-output/1-3-webhook-routing-engine.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List

### Change Log

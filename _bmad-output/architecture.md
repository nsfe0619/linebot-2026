---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-05-29'
inputDocuments:
  - _bmad-output/prds/prd-linebot-2026-05-28/prd.md
workflowType: 'architecture'
project_name: 'linebot'
user_name: '吼猴'
date: '2026-05-29'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## 專案脈絡分析

### 需求總覽

**功能需求（20 項 FR，5 個功能群）：**
- F1 LINE Bot 核心：接收 Webhook、訊息路由、預設回應、支援群組與一對一
- F2 看妹子：PTT Beauty 爬蟲，帶 over18 cookie，含錯誤處理，可被關鍵字規則覆蓋
- F3 對話紀錄：非同步寫入 Firestore，記錄用戶 ID / 群組 ID / 時間戳 / 觸發功能，TTL 可設定
- F4 後台管理：查看紀錄、使用統計、推播指定用戶、關鍵字規則 CRUD、TTL 設定、登入保護
- F5 本地開發：ngrok 支援、.env.example、README

**非功能需求：**
- 部署：GCP Cloud Run + Docker
- 語言：TypeScript
- 資料庫：Firestore（GCP 原生，免費額度）
- LINE SDK：@line/bot-sdk v8+（注意 Client 類別拆分）
- PTT 爬取：每次間隔 ≥ 1 秒

**規模與複雜度：**
- 主要領域：全端（LINE Bot 後端 + 管理 Web UI）
- 複雜度：低～中（Hobby / 個人 + 朋友群組）
- 預估架構元件數：5～7 個核心模組

### 技術限制與依賴

- GCP 生態系（Cloud Run + Firestore）：部署與 DB 已鎖定
- TypeScript：型別安全，利於維護
- @line/bot-sdk v8+ breaking changes：Client 拆分，import 方式需注意
- PTT 爬蟲為外部非官方依賴：無 SLA，需要完善的錯誤隔離

### 橫切關注點

1. **認證與安全**：LINE Webhook 簽章驗證（防偽造請求）+ 後台 session 登入
2. **非同步操作**：Firestore 寫入不阻塞 bot 回應主流程
3. **錯誤隔離**：PTT / 外部服務錯誤不影響核心 bot 功能
4. **設定分層**：靜態設定（env var）vs 動態設定（Firestore）的明確邊界
5. **規則引擎擴充性**：關鍵字→功能需插件架構，後續加功能不改核心路由

## 起始範本評估

### 主要技術領域

API/後端 + 簡易管理 Web UI（全端，Express.js + TypeScript）

### 基礎：現有 2026 起始專案升級版

以 `line-bot/2026` 起始專案為藍本，全面升級至當前版本並擴充功能。

### 版本決策

| 套件 | 版本 | 說明 |
|------|------|------|
| `@line/bot-sdk` | v11.0.0 | ⚠️ 跨 3 個主版本，Client/middleware API 需重新核對 |
| `express` | v5.2.1 | v5 為目前官方穩定版，v4 將 EOL |
| `firebase-admin` | v13.10.0 | Firestore 存取 |
| `tsx` | latest | 取代已停止維護的 ts-node-dev，熱重載開發 |
| `typescript` | v5.x | 維持現有 |
| `dotenv` | v16.x | 維持現有 |

**新增套件：**
- `express-session` — 後台登入 session 管理
- `ejs` — 後台管理頁面模板引擎（伺服器端渲染，無需前端建構）
- `axios` — PTT 爬蟲 HTTP 請求（沿用 monkey-bot 2025 版）

### 後台 UI 決策

**選擇：EJS 伺服器端模板**
- Express 直接 render HTML，無獨立前端建構流程
- 靜態資源（CSS/JS）放 `/public` 目錄，可搭配 CDN UI 套件（如 Bootstrap）
- 適合 Hobby 等級後台管理，複雜度最低

### 部署基礎

Dockerfile 架構沿用 monkey-bot（2025）的多階段建構設計，部署至 GCP Cloud Run。

### 開發環境

```bash
# 本地開發
tsx watch src/index.ts   # 熱重載
ngrok http 3000          # LINE Webhook 本地測試
```

### 注意事項

- `@line/bot-sdk` v8 → v11 升級：第一個實作故事需核對新版 Client 初始化與 middleware 使用方式

## 核心架構決策

### 優先決策分析

**關鍵決策（阻擋實作）：**
- Firestore 集合結構（/messages、/keyword-rules、/settings、/users）
- LINE Webhook 簽章驗證（@line/bot-sdk middleware 內建）
- 路由切分（/webhook、/admin/*、/api/*）

**重要決策（影響架構）：**
- PTT 爬蟲策略：每次即時爬取，不快取
- Admin Session：express-session + 記憶體儲存
- 部署：手動 `gcloud run deploy`

**延後決策（Post-MVP）：**
- 監控告警設定
- 用量超出 Firestore 免費額度時的因應策略

### 資料架構

**Firestore 集合：**

| 集合 | 用途 | 主要欄位 |
|------|------|---------|
| `/messages` | 對話紀錄 | userId、groupId、message、reply、feature、timestamp |
| `/keyword-rules` | 關鍵字規則 | keyword、matchType、feature、enabled |
| `/settings` | 全域設定 | defaultReply、ttlEnabled、ttlDays |
| `/users` | 曾互動用戶 | userId、displayName、lastSeen |

結構先採上述設計，後續可依實際需求調整。

### 認證與安全

- **LINE Webhook 驗證：** @line/bot-sdk v11 內建 `middleware()` 驗證 X-Line-Signature，防偽造請求
- **後台登入：** express-session + 記憶體 store；帳號密碼存 env var；登入後寫 session cookie
- **Session 特性：** 記憶體儲存，重啟後登出（Hobby 等級可接受）

### API 與路由設計

```
POST /webhook          — LINE Webhook（middleware 驗證）
GET  /admin            — 後台首頁（需登入）
GET  /admin/logs       — 查看對話紀錄
GET  /admin/stats      — 使用統計
POST /admin/push       — 手動推播
GET  /admin/rules      — 關鍵字規則管理
GET  /admin/settings   — Bot 設定
POST /api/admin/*      — 後台 AJAX 操作（JSON）
POST /admin/login      — 登入
POST /admin/logout     — 登出
```

**錯誤處理標準：** try/catch 包覆所有非同步操作；外部服務錯誤（PTT、LINE API）不冒泡至 Webhook 回應；使用者看到友善訊息，伺服器端 stderr 由 Cloud Logging 自動收集。

### 前端架構（後台管理 UI）

- **模板引擎：** EJS（Express 原生支援，無前端建構流程）
- **CSS：** Bootstrap 5 CDN
- **客戶端 JS：** Vanilla JS（fetch API 呼叫 /api/admin/*）
- **靜態資源：** /public 目錄

### 基礎設施與部署

- **部署方式：** 手動 `gcloud run deploy linebot --source . --region asia-east1`
- **容器：** Dockerfile 多階段建構（沿用 monkey-bot 架構）
- **日誌：** Cloud Logging（Cloud Run 自動整合 stdout/stderr）
- **環境變數：** `.env` 本地開發；Cloud Run 環境變數設定生產環境

### 決策影響分析

**實作順序建議：**
1. 專案初始化（升級依賴、設定 TypeScript + tsx）
2. LINE Bot 核心（Webhook + 路由框架）
3. Firestore 連線與 messages 集合
4. 看妹子功能
5. 關鍵字規則引擎
6. 對話紀錄非同步寫入
7. 後台 UI 框架（EJS + Bootstrap + session）
8. 後台各功能頁面
9. Dockerfile + Cloud Run 部署

**跨元件依賴：**
- 規則引擎依賴 `/keyword-rules` 集合
- 對話紀錄依賴 `/messages` 集合
- 後台推播依賴 `/users` 集合（需先有互動紀錄才能找到用戶 ID）
- TTL 清除機制依賴 `/settings` 的 ttlEnabled / ttlDays

## 實作模式與一致性規範

### 命名規範

**Firestore 集合與欄位：**
- 集合名稱：camelCase 複數（`messages`、`keywordRules`、`users`、`settings`）
- 欄位名稱：camelCase（`userId`、`groupId`、`createdAt`、`matchType`）
- 文件 ID：Firestore 自動產生（`.add()`），除 `settings/global` 使用固定 ID

**API 路由：**
- 路徑：kebab-case（`/admin/keyword-rules`、`/api/admin/push-message`）
- 路由參數：camelCase（`:ruleId`、`:userId`）

**TypeScript 程式碼：**
- 變數 / 函式：camelCase（`handleEvent`、`findBeautyPost`）
- 型別 / 介面：PascalCase（`KeywordRule`、`MessageRecord`）
- 常數：SCREAMING_SNAKE_CASE（`MAX_RETRY_COUNT`）
- 檔案名稱：kebab-case（`keyword-rule.ts`、`find-beauty.ts`）
- 目錄名稱：kebab-case（`keyword-rules/`、`admin-routes/`）

### 目錄結構規範

```
src/
  index.ts              — 入口點，Express 初始化
  routes/
    webhook.ts          — LINE Webhook 路由
    admin/              — 後台 HTML 路由（EJS render）
    api/                — 後台 AJAX JSON 路由
  features/             — 功能插件目錄
    beauty/             — 看妹子功能
      index.ts          — 功能入口，export handler
    echo/               — 預設回應功能
  services/
    firestore.ts        — Firestore 初始化與共用方法
    line-client.ts      — LINE Client 初始化
  middleware/
    auth.ts             — 後台登入驗證 middleware
    error-handler.ts    — 全域錯誤處理
  views/                — EJS 模板
  public/               — 靜態資源（CSS、JS）
  types/                — 共用 TypeScript 型別定義
```

### API 回應格式

**後台 AJAX（/api/admin/*）統一回傳：**
```typescript
// 成功
{ success: true, data: T }

// 失敗
{ success: false, error: string }
```

**HTTP 狀態碼：**
- 200：成功
- 400：用戶端錯誤（參數錯誤）
- 401：未登入
- 500：伺服器錯誤

**LINE Webhook：** 永遠回傳 200（LINE 要求），錯誤只記 log。

### 功能插件模式（規則引擎擴充點）

每個功能 export 一個統一介面：
```typescript
// src/features/*/index.ts
export interface FeatureHandler {
  name: string              // 功能代碼，對應 keywordRules.feature
  handle: (event: MessageEvent, client: Client) => Promise<void>
}
```
新增功能：建立 `src/features/{feature-name}/index.ts`，在 `routes/webhook.ts` 註冊。

### 錯誤處理模板

```typescript
// Webhook 內所有功能
async function handleFeature(event: MessageEvent) {
  try {
    // 功能邏輯
  } catch (err) {
    console.error('[feature-name]', err)
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: '出了點問題，請稍後再試 🙏'
    })
  }
}

// Firestore 非同步寫入（不阻塞回應）
saveMessage(data).catch(err => console.error('[firestore]', err))
```

### 強制規範

- 所有 Firestore 存取透過 `src/services/firestore.ts` 的封裝方法，不直接呼叫 `db.collection()`
- 所有功能插件放在 `src/features/` 並實作 `FeatureHandler` 介面
- LINE Webhook handler 永遠回傳 200，不 throw 到外層
- `/api/admin/*` 統一用 `{ success, data/error }` 格式回傳
- 欄位命名一律 camelCase（Firestore 與程式碼保持一致）

## 專案結構與邊界

### 完整目錄結構

```
linebot/
├── README.md
├── package.json
├── tsconfig.json
├── .env
├── .env.example                    — CHANNEL_ACCESS_TOKEN、CHANNEL_SECRET、
│                                     ADMIN_USER、ADMIN_PASS、PORT
├── .gitignore
├── .dockerignore
├── Dockerfile
│
├── src/
│   ├── index.ts                    — Express 初始化、路由掛載、server 啟動
│   │
│   ├── routes/
│   │   ├── webhook.ts              — POST /webhook（LINE 驗證 + 規則引擎）
│   │   ├── admin/
│   │   │   ├── index.ts            — GET /admin（儀表板）
│   │   │   ├── auth.ts             — POST /admin/login、/admin/logout
│   │   │   ├── logs.ts             — GET /admin/logs（FR-4.1）
│   │   │   ├── stats.ts            — GET /admin/stats（FR-4.2）
│   │   │   ├── push.ts             — GET /admin/push（FR-4.3）
│   │   │   ├── rules.ts            — GET /admin/rules（FR-4.4）
│   │   │   └── settings.ts         — GET /admin/settings（FR-4.5）
│   │   └── api/
│   │       ├── logs.ts             — GET /api/admin/logs（分頁、篩選）
│   │       ├── stats.ts            — GET /api/admin/stats
│   │       ├── push.ts             — POST /api/admin/push
│   │       ├── rules.ts            — GET/POST/PUT/DELETE /api/admin/rules/:ruleId
│   │       └── settings.ts         — GET/PUT /api/admin/settings
│   │
│   ├── features/                   — 功能插件（FeatureHandler 介面）
│   │   ├── beauty/
│   │   │   ├── index.ts            — export FeatureHandler（name: 'beauty'）
│   │   │   └── find-beauty.ts      — PTT 爬蟲邏輯（FR-2.1~2.3）
│   │   └── echo/
│   │       └── index.ts            — 預設回應 handler（FR-1.2）
│   │
│   ├── services/
│   │   ├── firestore.ts            — Firestore 初始化 + 集合操作封裝
│   │   ├── line-client.ts          — LINE Client 初始化（@line/bot-sdk v11）
│   │   └── message-logger.ts       — 非同步寫入 /messages（FR-3.1~3.4）
│   │
│   ├── middleware/
│   │   ├── auth.ts                 — 後台 session 驗證 middleware（FR-4.6）
│   │   └── error-handler.ts        — Express 全域錯誤處理
│   │
│   ├── views/                      — EJS 模板
│   │   ├── layout.ejs              — 共用 HTML 版型（Bootstrap 5 CDN）
│   │   ├── login.ejs
│   │   └── admin/
│   │       ├── index.ejs
│   │       ├── logs.ejs
│   │       ├── stats.ejs
│   │       ├── push.ejs
│   │       ├── rules.ejs
│   │       └── settings.ejs
│   │
│   ├── public/
│   │   ├── css/admin.css
│   │   └── js/admin.js             — 後台 fetch API 呼叫
│   │
│   └── types/
│       ├── models.ts               — Firestore 資料模型型別定義
│       └── feature.ts              — FeatureHandler 介面定義
│
└── tests/
    └── features/
        └── beauty.test.ts
```

### 架構邊界

**API 邊界：**
- `POST /webhook`：外部（LINE Platform）→ 內部，需 X-Line-Signature 驗證
- `GET|POST /admin/*`：瀏覽器 → EJS 渲染頁面，需 session cookie
- `POST|GET /api/admin/*`：瀏覽器 AJAX → JSON 回應，需 session cookie
- `services/line-client.ts`：內部 → 外部（LINE Reply/Push API）
- `features/beauty/find-beauty.ts`：內部 → 外部（PTT.cc HTTP）

**服務邊界：**
- `services/firestore.ts`：所有 Firestore 操作的唯一入口
- `services/line-client.ts`：LINE Client 的唯一入口
- `services/message-logger.ts`：對話紀錄寫入邏輯集中管理

**功能插件邊界：**
- `routes/webhook.ts`：查規則 → 找 feature → 呼叫 `handler.handle()`
- 每個 feature：執行功能 + reply，不直接寫 DB、不直接管路由

### 需求對應表

| 功能需求 | 主要檔案 |
|---------|---------|
| FR-1.1 Webhook 路由 | `routes/webhook.ts` |
| FR-1.2 預設回應 | `features/echo/index.ts` |
| FR-1.3 群組支援 | `routes/webhook.ts`（groupId 判斷）|
| FR-2.1~2.4 看妹子 | `features/beauty/` |
| FR-3.1~3.4 對話紀錄 | `services/message-logger.ts` |
| FR-4.1 查看紀錄 | `routes/admin/logs.ts` + `routes/api/logs.ts` |
| FR-4.2 使用統計 | `routes/admin/stats.ts` + `routes/api/stats.ts` |
| FR-4.3 推播 | `routes/admin/push.ts` + `routes/api/push.ts` |
| FR-4.4 關鍵字規則 | `routes/admin/rules.ts` + `routes/api/rules.ts` |
| FR-4.5 TTL 設定 | `routes/admin/settings.ts` + `routes/api/settings.ts` |
| FR-4.6 登入保護 | `middleware/auth.ts` |
| FR-5.1 ngrok 支援 | `README.md` |

### 資料流

```
LINE 訊息 → POST /webhook
  → middleware 驗證簽章
  → webhook.ts 查 Firestore /keywordRules
  → 找到 FeatureHandler → handler.handle()
  → LINE replyMessage
  → message-logger.ts 非同步寫入 /messages（不阻塞）

Admin 操作 → POST /admin/login → session cookie
  → GET /admin/* → auth middleware → EJS render
  → AJAX → /api/admin/* → Firestore CRUD → { success, data }
```

### 外部整合點

| 服務 | 整合位置 | 用途 |
|------|---------|------|
| LINE Platform | `services/line-client.ts`、`routes/webhook.ts` | 收訊息、回覆、推播 |
| PTT.cc | `features/beauty/find-beauty.ts` | 爬取表特版文章 |
| GCP Firestore | `services/firestore.ts` | 所有資料存取 |
| GCP Cloud Run | `Dockerfile` | 容器化部署 |

## 架構驗證結果

### 一致性驗證 ✅

**決策相容性：** 所有技術選擇相容無衝突（Express v5 + @line/bot-sdk v11 + firebase-admin v13 + tsx + EJS）。

**模式一致性：** camelCase 命名規範與 TypeScript 慣例一致；FeatureHandler 插件模式支援規則引擎擴充需求；路由切分清楚。

**結構對齊：** 專案目錄結構完整支援所有架構決策與邊界定義。

### 需求覆蓋驗證 ✅

所有 20 項 FR 與 5 項 NFR 均有對應架構元件，無遺漏。

### 實作就緒度驗證 ✅

決策、結構、模式均已完整記錄，AI agent 可依此文件進行一致的實作。

### 缺口分析

**延後項目（非阻擋）：**
- TTL 自動清除機制延後實作。目前 `/messages` 不自動刪除，累積量由免費額度（1GB）承擔。若日後需要，建議採用 Firestore 原生 TTL 政策（`deleteAt` 欄位），無需 Cloud Scheduler。後台設定頁面的 TTL 相關選項本次不實作。

### 架構完整性檢查清單

**需求分析**
- [x] 專案脈絡分析完整
- [x] 規模與複雜度評估
- [x] 技術限制識別
- [x] 橫切關注點對應

**架構決策**
- [x] 關鍵決策已含版本號記錄
- [x] 技術堆疊完整指定
- [x] 整合模式定義
- [x] 效能考量處理（非同步寫入、PTT rate limit）

**實作模式**
- [x] 命名規範建立
- [x] 目錄結構模式定義
- [x] 通訊模式指定
- [x] 流程模式（錯誤處理）文件化

**專案結構**
- [x] 完整目錄結構定義
- [x] 元件邊界建立
- [x] 整合點對應
- [x] 需求到結構對應完整

### 架構就緒度評估

**整體狀態：READY FOR IMPLEMENTATION**
**信心水準：高**

**主要強項：**
- 技術選擇符合 GCP 生態系，依賴最少額外服務
- FeatureHandler 插件模式確保後續擴充不影響核心
- 所有外部依賴（LINE、PTT、Firestore）有清楚的單一整合點
- Hobby 等級複雜度適中，可快速實作

**未來可強化的方向：**
- TTL 自動清除（Firestore 原生 TTL 政策）
- 關鍵字規則記憶體快取（減少 Firestore 讀取次數）
- 單元測試覆蓋率擴充

### 實作移交

**AI Agent 指引：**
- 依照架構文件的所有決策實作，不自行引入新技術
- 使用 `src/services/firestore.ts` 作為所有 Firestore 存取的唯一入口
- 新功能一律實作 `FeatureHandler` 介面放入 `src/features/`
- LINE Webhook 永遠回傳 200，不讓例外冒泡

**第一個實作優先項：**
以 `line-bot/2026` 起始專案為基礎，升級所有依賴至指定版本，設定 tsx、加入 firebase-admin，確認 @line/bot-sdk v11 API 介面。

---
stepsCompleted: [1, 2, 3, 4]
status: complete
completedAt: '2026-06-01'
inputDocuments:
  - _bmad-output/prds/prd-linebot-2026-05-28/prd.md
  - _bmad-output/architecture.md
---

# linebot - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for linebot, decomposing the requirements from the PRD and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR-1.1: Bot 接收 LINE Webhook 事件，根據訊息內容路由至對應處理器
FR-1.2: 收到無對應規則的訊息時，回覆預設回應（可於後台設定）
FR-1.3: 支援一對一訊息與群組訊息
FR-2.1: 使用者傳送關鍵字「看妹子」時，爬取 PTT Beauty 版，隨機抽取一篇含圖文章並回傳圖片連結
FR-2.2: 爬蟲需帶 over18=1 cookie，跳過 PTT 年齡驗證
FR-2.3: 若爬取失敗（PTT 無回應、無圖片文章），回覆友善錯誤訊息，不讓 bot 靜默失敗
FR-2.4: 「看妹子」為內建預設功能；後台關鍵字規則可覆蓋或停用此功能
FR-3.1: 每則收到的使用者訊息與 bot 回應，均非同步寫入 Firestore，包含 userId、groupId、message、reply、feature、timestamp
FR-3.2: 群組訊息額外記錄群組 ID
FR-3.3: 對話紀錄保留策略可於後台設定（TTL 天數或停用），預設不自動刪除
FR-3.4: 對話紀錄寫入為非同步，不阻塞 bot 回應
FR-4.1: 後台顯示對話紀錄列表，支援依 userId、日期篩選
FR-4.2: 後台顯示各指令/功能使用次數統計，可依日期區間篩選
FR-4.3: 後台可手動推播訊息給指定用戶（一或多個 LINE userId），非廣播
FR-4.4: 後台可新增/編輯/刪除/啟停關鍵字觸發規則（完全比對與包含比對）
FR-4.5: 後台可設定對話紀錄保留天數，或關閉自動刪除（預設關閉）
FR-4.6: 後台需登入保護，單一管理員帳號，帳密存 env var，記憶體 session
FR-5.1: 本地啟動 server 後，搭配 ngrok 即可接收 LINE Webhook，不需部署
FR-5.2: .env.example 明確標示所有必填環境變數
FR-5.3: README 說明本地開發啟動步驟（ngrok + LINE Developers 設定）

### NonFunctional Requirements

NFR-1: 部署至 GCP Cloud Run，支援 Docker 容器化（多階段建構）
NFR-2: TypeScript（型別安全，tsconfig 嚴格模式）
NFR-3: 資料庫使用 Firestore（GCP 原生，免費額度 1GB 儲存）
NFR-4: LINE SDK 使用 @line/bot-sdk v11（注意 v8→v11 breaking changes，Client/middleware API 需重新確認）
NFR-5: PTT 爬取每次間隔不低於 1 秒，避免 rate-limit

### Additional Requirements

- **起始專案升級**：以 line-bot/2026 為基礎，升級所有依賴至指定版本
  - @line/bot-sdk: v8 → v11
  - express: v4 → v5
  - ts-node-dev → tsx（熱重載）
  - 新增：firebase-admin v13.10.0
  - 新增：express-session（後台登入）
  - 新增：ejs（後台模板）
- **Firestore 集合設計**：messages、keywordRules、settings（固定 doc: global）、users
- **服務封裝**：所有 Firestore 存取透過 `src/services/firestore.ts`，LINE Client 透過 `src/services/line-client.ts`
- **FeatureHandler 插件介面**：每個功能 export `{ name: string, handle: (event, client) => Promise<void> }`
- **後台登入**：express-session + 記憶體 store，重啟後登出
- **後台 UI**：EJS 模板 + Bootstrap 5 CDN + Vanilla JS
- **部署**：手動 `gcloud run deploy linebot --source . --region asia-east1`
- **路由切分**：/webhook（LINE）、/admin/*（後台頁面）、/api/admin/*（AJAX JSON）

### UX Design Requirements

（無 UX 設計文件）

### FR Coverage Map

FR-1.1: Epic 1 - Webhook 路由與關鍵字規則引擎
FR-1.2: Epic 1 - 預設回應（可後台設定）
FR-1.3: Epic 1 - 支援群組與一對一訊息
FR-2.1: Epic 2 - PTT Beauty 爬蟲回傳圖片
FR-2.2: Epic 2 - over18 cookie 跳過年齡驗證
FR-2.3: Epic 2 - 爬取失敗友善錯誤訊息
FR-2.4: Epic 2 - 關鍵字規則可覆蓋/停用看妹子
FR-3.1: Epic 3 - 非同步寫入 Firestore 對話紀錄
FR-3.2: Epic 3 - 群組訊息記錄 groupId
FR-3.3: Epic 3 - TTL 保留策略設定
FR-3.4: Epic 3 - 非同步寫入不阻塞 bot 回應
FR-4.1: Epic 4 - 後台查看對話紀錄（篩選）
FR-4.2: Epic 4 - 後台使用統計
FR-4.3: Epic 4 - 後台手動推播指定用戶
FR-4.4: Epic 4 - 後台關鍵字規則 CRUD
FR-4.5: Epic 4 - 後台 TTL 保留設定
FR-4.6: Epic 4 - 後台登入保護
FR-5.1: Epic 1 - ngrok 本地開發支援
FR-5.2: Epic 1 - .env.example
FR-5.3: Epic 1 - README 本地開發說明

## Epic List

### Epic 1: 專案建設與 LINE Bot 核心
Bot 可在本地與雲端正常運作，能接收 LINE 訊息、執行關鍵字路由、回覆預設訊息，ngrok 本地開發可用。
**FRs covered:** FR-1.1, FR-1.2, FR-1.3, FR-5.1, FR-5.2, FR-5.3
**架構任務:** 依賴升級（@line/bot-sdk v11、Express v5、tsx、firebase-admin）、services 封裝層、Firestore 初始化、FeatureHandler 介面、Dockerfile

### Epic 2: 看妹子功能
使用者輸入「看妹子」，bot 爬取 PTT Beauty 版並回傳圖片；爬取失敗時回覆友善提示。
**FRs covered:** FR-2.1, FR-2.2, FR-2.3, FR-2.4

### Epic 3: 對話紀錄
所有對話自動非同步存入 Firestore，用戶資訊被追蹤，為後台管理奠定資料基礎。
**FRs covered:** FR-3.1, FR-3.2, FR-3.3, FR-3.4

### Epic 4: 後台管理介面
管理員可登入後台，查看對話紀錄、使用統計、推播訊息、管理關鍵字規則與保留設定。
**FRs covered:** FR-4.1, FR-4.2, FR-4.3, FR-4.4, FR-4.5, FR-4.6

---

## Epic 1: 專案建設與 LINE Bot 核心

Bot 可在本地與雲端正常運作，能接收 LINE 訊息、執行關鍵字路由、回覆預設訊息，ngrok 本地開發可用。

### Story 1.1: 專案初始化與依賴升級

As a developer,
I want to set up the project with all up-to-date dependencies,
So that I have a stable, modern foundation to build the LINE Bot.

**Acceptance Criteria:**

**Given** 2026 starter 為基礎
**When** 升級所有依賴並執行 `npm run dev`
**Then** server 啟動無錯誤、tsx 熱重載正常、`GET /` 回傳成功回應

**Given** 升級後的專案
**When** 執行 `npm run build`
**Then** TypeScript 編譯無錯誤

**Given** .env 含必要環境變數
**When** 應用程式啟動
**Then** 環境變數正確讀取，無啟動錯誤

### Story 1.2: 核心服務層（Firestore + LINE Client）

As a developer,
I want shared service modules for Firestore and LINE Client,
So that all code accesses external services through a single, consistent interface.

**Acceptance Criteria:**

**Given** Firebase 憑證存在環境變數
**When** import `src/services/firestore.ts`
**Then** Firestore 初始化成功，集合存取封裝方法可用

**Given** LINE 憑證存在環境變數
**When** import `src/services/line-client.ts`
**Then** LINE Client v11 實例初始化並可用

**Given** `src/types/feature.ts` 存在
**When** 實作新功能模組
**Then** 必須 export 實作 `FeatureHandler` 介面的物件（`name: string`、`handle: (event, client) => Promise<void>`）

**Given** app 首次啟動且 Firestore 可連線
**When** 服務初始化
**Then** `/settings/global` 若不存在則自動建立，預設值為 `{ defaultReply: "我聽不懂 QQ", ttlEnabled: false, ttlDays: 90 }`

### Story 1.3: LINE Webhook 與訊息路由引擎

As a LINE Bot user,
I want the bot to respond to my messages based on keyword rules,
So that I can interact with the bot meaningfully.

**Acceptance Criteria:**

**Given** 收到的訊息無符合的關鍵字規則
**When** bot 處理訊息
**Then** 回覆 Firestore `/settings/global` 中的 `defaultReply` 值

**Given** Firestore 中存在啟用的關鍵字規則
**When** 收到符合關鍵字的訊息（完全比對或包含比對）
**Then** bot 路由至對應的 FeatureHandler 並執行

**Given** LINE Webhook 請求
**When** `X-Line-Signature` 無效或缺失
**Then** middleware 拒絕請求並回傳 400

**Given** FeatureHandler 拋出未捕捉的錯誤
**When** bot 處理訊息
**Then** bot 回覆「出了點問題，請稍後再試 🙏」並將錯誤記錄至 stderr，Webhook 回傳 200

**Given** 群組訊息或一對一訊息
**When** bot 收到文字訊息
**Then** 兩種訊息類型均正常通過路由引擎處理

### Story 1.4: 本地開發環境設定

As a developer,
I want clear setup documentation and Docker configuration,
So that I can develop locally and deploy to Cloud Run easily.

**Acceptance Criteria:**

**Given** `.env.example` 檔案
**When** 查看內容
**Then** 列出所有必填環境變數：`CHANNEL_ACCESS_TOKEN`、`CHANNEL_SECRET`、`FIREBASE_PROJECT_ID`、`ADMIN_USER`、`ADMIN_PASS`、`PORT`

**Given** `README.md`
**When** 照步驟操作
**Then** 開發者可完成本地開發設定：複製 .env、執行 `npm run dev`、啟動 ngrok、將 ngrok URL 設定至 LINE Developers Webhook

**Given** `Dockerfile`
**When** 執行 `docker build` 後 `docker run`
**Then** 容器成功啟動 bot，服務在設定的 PORT 回應

---

## Epic 2: 看妹子功能

使用者輸入「看妹子」，bot 爬取 PTT Beauty 版並回傳圖片；爬取失敗時有友善提示。

### Story 2.1: 看妹子功能（PTT 爬蟲 + 規則整合）

As a LINE Bot user,
I want to send "看妹子" and receive a PTT Beauty image,
So that I can enjoy browsing beauty content without leaving LINE.

**Acceptance Criteria:**

**Given** 使用者傳送「看妹子」
**When** routing engine 觸發 beauty feature
**Then** bot 回傳 PTT Beauty 版隨機含圖文章的圖片連結

**Given** 爬取 PTT Beauty 版
**When** 發送 HTTP 請求
**Then** 請求帶有 Cookie: `over18=1`

**Given** PTT 無回應或找不到含圖文章
**When** beauty feature 被觸發
**Then** bot 回覆友善錯誤訊息（如「找不到妹子，PTT 可能在睡覺 😴」）而非靜默失敗

**Given** 多次快速觸發 beauty feature
**When** 每次爬取
**Then** 每次 PTT HTTP 請求之間間隔至少 1 秒

**Given** Firestore `/keywordRules` 集合
**When** app 啟動
**Then** 若無「看妹子」規則則自動種入 `{ keyword: "看妹子", matchType: "exact", feature: "beauty", enabled: true }`

---

## Epic 3: 對話紀錄

所有對話自動非同步存入 Firestore，用戶資訊被追蹤，為後台管理奠定資料基礎。

### Story 3.1: 對話紀錄與用戶追蹤

As a bot admin,
I want all conversations automatically logged to Firestore,
So that I can review past interactions and manage users for push messaging.

**Acceptance Criteria:**

**Given** bot 收到文字訊息並完成回應
**When** 回應送出
**Then** 非同步寫入 `/messages` 新文件，欄位含：`userId`、`groupId`（群組時有值，一對一時為 null）、`message`、`reply`、`feature`、`timestamp`

**Given** Firestore 寫入操作失敗
**When** 紀錄對話
**Then** 錯誤記錄至 stderr，bot 的 LINE 回應不受影響

**Given** 使用者與 bot 互動
**When** 處理其訊息
**Then** 建立或更新 `/users/{userId}` 文件，含 `lastSeen` timestamp

**Given** 群組訊息
**When** 寫入對話紀錄
**Then** `/messages` 記錄的 `groupId` 欄位有值

---

## Epic 4: 後台管理介面

管理員可登入後台，查看對話紀錄、使用統計、推播訊息、管理關鍵字規則與設定。

### Story 4.1: 後台框架與登入系統

As a bot admin,
I want a secure login system for the admin panel,
So that only I can access the management interface.

**Acceptance Criteria:**

**Given** 未登入狀態訪問 `/admin`
**When** 頁面載入
**Then** 重導向至 `/admin/login`

**Given** `/admin/login` 頁面，輸入正確的 ADMIN_USER 與 ADMIN_PASS
**When** 送出登入表單
**Then** session 建立並重導向至 `/admin` 儀表板

**Given** 輸入錯誤帳號或密碼
**When** 送出登入表單
**Then** 頁面顯示錯誤訊息，停留在登入頁

**Given** 已登入的 admin session
**When** 訪問任何 `/admin/*` 路由
**Then** 頁面使用共用 EJS layout 渲染（含 Bootstrap 5 導覽列）

**Given** 訪問 `/admin/logout`
**When** 執行
**Then** session 銷毀，重導向至 `/admin/login`

### Story 4.2: 對話紀錄查看頁

As a bot admin,
I want to view and filter conversation logs,
So that I can review what users are saying to the bot.

**Acceptance Criteria:**

**Given** 已登入並訪問 `/admin/logs`
**When** 頁面載入
**Then** 顯示分頁對話紀錄列表，每筆含：時間戳、userId、使用者訊息、bot 回應、觸發功能

**Given** 輸入 userId 篩選條件或日期區間
**When** 點擊搜尋
**Then** 只顯示符合條件的紀錄

**Given** AJAX 呼叫 `GET /api/admin/logs`，帶有效 query params
**When** 請求處理
**Then** 回傳 `{ success: true, data: [...] }`

### Story 4.3: 使用統計頁

As a bot admin,
I want to see which features are used most,
So that I can understand how users interact with the bot.

**Acceptance Criteria:**

**Given** 已登入並訪問 `/admin/stats`
**When** 頁面載入
**Then** 顯示統計表，列出各功能名稱與使用次數

**Given** 輸入日期區間篩選
**When** 查詢
**Then** 統計數字只反映所選期間的資料

### Story 4.4: 手動推播訊息

As a bot admin,
I want to send push messages to specific users,
So that I can proactively communicate with users who have interacted with the bot.

**Acceptance Criteria:**

**Given** 已登入並訪問 `/admin/push`
**When** 輸入一或多個 LINE userId 與訊息內容，送出
**Then** 對每個 userId 呼叫 LINE push API，頁面顯示每個 userId 的成功/失敗結果

**Given** 其中一個 userId 無效
**When** 執行推播
**Then** 該 userId 的 LINE API 錯誤被捕捉並顯示，其他有效 userId 的推播仍繼續執行

### Story 4.5: 關鍵字規則管理

As a bot admin,
I want to manage keyword-to-feature mapping rules,
So that I can control how the bot responds without touching code.

**Acceptance Criteria:**

**Given** 已登入並訪問 `/admin/rules`
**When** 頁面載入
**Then** 列出所有 Firestore keywordRules，每筆顯示：關鍵字、比對方式、觸發功能、啟用狀態

**Given** 填入新規則（keyword、matchType、feature）
**When** 點擊新增
**Then** 規則寫入 Firestore `/keywordRules`，並立即出現在列表中

**Given** 現有規則
**When** 切換啟用/停用狀態
**Then** 變更儲存至 Firestore，bot 路由引擎立即反映更新

**Given** 現有規則
**When** 點擊刪除並確認
**Then** 規則從 Firestore 移除，列表更新

### Story 4.6: Bot 設定頁

As a bot admin,
I want to configure the bot's default behavior,
So that I can customize responses without touching code.

**Acceptance Criteria:**

**Given** 已登入並訪問 `/admin/settings`
**When** 頁面載入
**Then** 顯示目前設定：defaultReply 文字、ttlEnabled 開關、ttlDays 數值（從 Firestore `/settings/global` 讀取）

**Given** 更新 defaultReply 文字後儲存
**When** 使用者傳送無符合規則的訊息
**Then** bot 使用新的預設回應文字

**Given** 更新 ttlEnabled 和 ttlDays 後儲存
**When** 儲存操作完成
**Then** 新值寫入 Firestore `/settings/global`（實際清除機制延後實作）

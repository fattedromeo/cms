# QA 測試報告 — CMS 管理後台（localhost:4200）

**日期：** 2026-07-17
**測試人員：** /qa（標準等級 Standard tier）
**登入帳號：** miles@uuu.com.tw（Admin）
**範圍：** 全站測試 — 先前所有功能皆未經過 QA
**技術架構：** Angular 20（standalone）+ PrimeNG v20，後端 .NET 9 Web API（Dapper）

> ⚠️ **Worktree 說明：** 測試過程中發現 `localhost:4200` / `:5000` 實際上是由另一個 git worktree
> （`.claude/worktrees/feature-course-pdf`，分支 `worktree-feature-course-pdf`）所提供服務，而非
> `develop` 主分支的工作目錄；該 worktree 當時還有另一項未提交（uncommitted）的「課程 PDF
> 傳單」功能開發中。ISSUE-001 與 ISSUE-003 的修正皆已在該 worktree 中實際套用並於瀏覽器中驗證通過
> （未提交、不影響該 worktree 既有的 PDF 傳單變更），並同步套用到 `develop` 主分支後提交
> （commit `6a2c9cb`、`f4ff129`）。修正 ISSUE-003 時需要重新啟動該 worktree 的 API 處理程序
> （`CMS.API.exe`，PID 8504）以套用變更 — 此動作已事先徵求使用者同意才執行。

---

## 摘要

本次測試涵蓋登入、課程 Course（列表／檢視／編輯／新增／表單驗證）、合作廠商 Partner、課程群組
CourseGroup（含刪除前的連動刪除警示）、角色 AppRole、使用者 AppUser、發布狀態 PublishStatus、
個人資料 My Profile（密碼錯誤時的錯誤處理、使用者名稱去除空白）、以及上稿作業
FeaturedPromoItem 週曆頁面。導覽選單中尚未開放的項目（說明會 Seminar、活動管理 Promotion
頂層、線上報名 Forms、網站資訊 WebInfo、考試中心 TestingCenter）皆正確顯示為無子項目、不會導向
不存在的路由，符合 CLAUDE.md 規則 #4 的要求。異動紀錄（RowAudit）、連動刪除警示，以及「目前密碼
錯誤時回傳 400 而非 401」的驗證流程，皆符合 CLAUDE.md 明訂的不可妥協規則（non-negotiables）。

| 指標 | 數值 |
|---|---|
| 已測試頁面／功能 | 9 項（Course、Partner、CourseGroup、AppRole、AppUser、PublishStatus、My Profile、FeaturedPromoItem、Login） |
| 發現問題數 | 3 項（2 項已修復，1 項調查後降級並延後處理） |
| 健康分數（初始 → 最終） | 91 → 95 / 100 |
| 已套用修正 | 已驗證：2 項，盡力而為：0 項，已還原：0 項 |
| 延後處理 | 1 項（ISSUE-002，低嚴重度，詳見下方說明） |

**PR 摘要：** 本次 QA 共發現 3 個問題，修復 2 個，健康分數由 91 提升至 95。兩項修正皆已於瀏覽器中
實機驗證，並提交至 `develop` 分支（`6a2c9cb`、`f4ff129`），後端 292/292、前端 476/476 測試全數通過。

### 待優先處理的前 3 項問題
1. **ISSUE-001** — `/login` 路由缺少守衛（guard），已登入使用者仍可看到登入表單疊加在系統畫面上。**已修復。**
2. **ISSUE-002** — 舊資料首次編輯時，異動紀錄（RowAudit）會列出未實際修改的欄位為「已變更」。**已調查，判定為低嚴重度，延後處理。**
3. **ISSUE-003** — 合作廠商 Partner 的 `DisplayOrder` 排序在同值時缺少穩定的次要排序鍵。**已修復。**

### Console 健康狀況
整個測試過程中僅出現 2 筆全新的 console 錯誤：登入導向 /courses 時發生的暫時性 401（屬於畫面過場
時的競速情形，資料仍正確載入）；以及刻意輸入不存在的課程 ID 所觸發的預期性 404（畫面正確顯示
「查無此課程」，處理得宜）。未發現非預期的 JS 例外、hydration／渲染錯誤，或資源載入失敗。

---

## 問題清單

### ISSUE-001：已登入使用者進入 `/login` 時，登入表單會疊加在完整系統畫面上

- **嚴重度：** Medium（中）
- **分類：** 功能性 / UX
- **狀態：** ✅ 已修復並驗證

**重現步驟：**
1. 以 `miles@uuu.com.tw` 登入（登入狀態有效，JWT token 正常）。
2. 直接在網址列輸入 `http://localhost:4200/login`（例如透過網址列手動輸入、瀏覽器上一頁、或舊的
   書籤連結）。
3. 觀察結果：畫面同時顯示了完整的已登入版型（含側邊選單、頂端列的「Miles Sun」／個人資料 My
   Profile／登出 Logout）**以及**登入表單，兩者疊在一起。

**預期行為：** 已登入使用者進入 `/login` 時應自動被導向至其他頁面（例如預設首頁），登入表單畫面
不應在已登入狀態下與系統版型同時渲染。

**佐證截圖：** `screenshots/login-while-authed.png`（修復前）→ `screenshots/issue-001-after-fixed.png`（修復後）

**根本原因（已確認）：** `/login` 路由未設定任何路由守衛（route guard）；`app.html` 僅依據
`isAuthenticated()` 判斷是否渲染系統版型，與目前實際所在的路由無關。

**修復狀態：** ✅ 已驗證 — commit `6a2c9cb`（develop）。新增 `guestGuard`（比照現有
`authGuard`／`adminGuard` 的作法），並掛載於 `login` 路由上。於 `auth.guard.spec.ts` 新增 3 筆
回歸測試（11/11 通過）。實機重新測試：已登入狀態下進入 `/login` 會正確導向 `/courses`，畫面不再
出現疊加情形。

**變更檔案：** `core/guards/auth.guard.ts`、`app.routes.ts`、`core/guards/auth.guard.spec.ts`

---

### ISSUE-002：舊資料首次編輯時，異動紀錄（RowAudit）會將未實際變更的欄位列為「已變更」

- **嚴重度：** ~~Medium~~ → **Low，延後處理**（經原始碼調查後重新分類，詳見下方說明）
- **分類：** 功能性 / 資料完整性（RowAudit）
- **狀態：** 已調查，未修復（屬設計行為，影響輕微）

**重現步驟：**
1. 開啟課程 1412（「使用Windows PowerShell進行自動化管理」）— 一筆批次匯入的舊資料，異動紀錄
   顯示「尚無紀錄 No history」（從未透過系統編輯過）。
2. 僅修改「顯示順序」（DisplayOrder）欄位，由 `7` 改為 `70`，並儲存。
3. 開啟「異動紀錄 History」徽章 → 差異比對顯示 **DisplayOrder、Target、Prerequisites、Outline、
   Note** 皆為已變更 — 但實際上只修改了 DisplayOrder，長文字欄位（課程目標／先備知識／課程
   大綱／備註）內容並未被使用者觸碰，內容本身也沒有變化。
4. 重新開啟編輯頁面，不做任何修改直接再次儲存 → **未產生新的異動紀錄**（徽章時間戳記未變），
   證實差異比對機制在資料已經過一次系統寫入後，能正確判斷「無變更」。

**分析：** 這指向資料庫原始值（批次匯入、系統上線前的資料）與 Angular 表單首次載入後再送出的值
之間，存在一次性的正規化落差（推測為前後空白字元／換行符號的處理差異）。由於此現象在第一次儲存
後會自我修正，並不會造成資料損毀，但會讓異動紀錄出現使用者未曾觸碰的欄位「被變更」的誤導性紀錄
— 這會削弱異動紀錄（CLAUDE.md 不可妥協規則 #19）作為稽核依據的可信度，且影響範圍是每一筆舊資料
第一次被編輯時皆會發生。

**佐證截圖：** `screenshots/course-rowaudit-history.png`（差異比對顯示 DisplayOrder 及另外 4 個
未觸碰的欄位）

**影響範圍：** 推測影響所有透過批次匯入的舊資料（Course，以及可能包含 Partner／CourseGroup 等）
在透過系統首次編輯時皆會發生。

**根本原因（已對照原始碼確認）：** 並非 RowAudit 比對機制本身的錯誤。`course-form.ts`
（第 269–291 行）在送出表單時，會對所有文字欄位執行 `.trim()`（去除前後空白）— 包含 `title`、
`courseId`、`material`、`objective`、`target`、`prerequisites`、`outline`、`towardCertOrExam`、
`note`、`otherInfo`；而該表單的 `FormGroup` 涵蓋所有四個頁籤的欄位，因此即使使用者只在「基本資料」
頁籤進行操作並儲存，「課程內容」頁籤的欄位（無論使用者是否曾切換查看過）仍會一併被重新送出並
執行 trim。`CourseRepository.UpdateAsync`（第 253–278 行）每次儲存皆無條件寫入整列資料。兩者
疊加後，只要舊資料的長文字欄位中帶有批次匯入殘留的前後空白，編輯任一欄位時都會讓這些欄位在
資料庫中被靜默（且真實）修剪 — 因此 RowAudit 的「已變更」清單其實**是正確的**，只是對只想修改
DisplayOrder 的使用者而言容易造成誤解。此現象在每筆資料第一次儲存後即會自我修正（已驗證：
第二次無異動的儲存不會產生新的異動紀錄）。

**處理決定：** 不予修復。真正的修復方式（例如：不重新送出使用者未曾開啟過的頁籤欄位，或讓
RowAudit 將僅空白字元的差異視為未變更）屬於較大範圍的設計調整，超出一般 QA 修復的規模；而目前
的行為本身並非錯誤 — 只是對歷史資料造成一次性、會自我修正、且僅涉及空白字元的邊際影響，不會造成
功能異常或資料遺失。已列為延後處理項目。

---

### ISSUE-003：合作廠商 Partner 列表的 `DisplayOrder` 同值排序缺少可見的次要排序依據

- **嚴重度：** Medium（中）
- **分類：** 功能性
- **狀態：** ✅ 已修復並驗證

**重現步驟：**
1. 開啟合作廠商列表（`http://localhost:4200/partners`）。
2. 觀察「顯示順序」（DisplayOrder）欄位：`0,0,0,0,1,1,1,1,1,2,3,3,4,7,10,101,201` — 在 0 與 1
   的位置出現大量重複值。
3. 在 `DisplayOrder=1` 的同值群組中，資料列的主代碼（pkid）排序為 `131,132,129,126,107` —
   既非主代碼遞增，也非遞減，更非依名稱字母排序，找不到任何可見欄位能解釋這個排序依據。
4. 重新整理頁面 3 次，排序皆維持一致（本次測試 session 中未出現排序跳動的情形），但這與
   CLAUDE.md 明訂的不可妥協規則 #3 完全吻合：「顯示順序（DisplayOrder）欄位若可用值過少，會出現
   同值時排序依據不明確的情形…請務必檢查實際資料。」

**佐證截圖：** `screenshots/partner-list.png`（修復前）→ `screenshots/issue-003-after-fixed.png`（修復後）

**根本原因（已確認）：** `PartnerRepository.GetAllAsync` / `QueryAsync` 僅以 `p.DisplayOrder ASC`
單一欄位排序。相較之下，課程 Course（以 `CourseId ASC` 排序）及課程群組 CourseGroup（以
`pkid ASC` 排序）皆已補上明確的排序依據；唯獨 Partner 的查詢漏未處理這個問題。

**修復狀態：** ✅ 已驗證 — commit `f4ff129`（develop）。於兩個查詢皆加上 `, p.pkid ASC` 作為次要
排序依據，比照 CourseGroup 現行的作法。重新編譯並重啟 API 後於瀏覽器實機驗證：原本
`DisplayOrder=1` 群組中排序不規律的 `131,132,129,126,107`，修復後已正確變為遞增排序的
`107,126,129,131,132`。既有的 12 項 Partner 相關測試皆維持通過；未額外新增 C# 單元測試 — 依照
本專案既有慣例（`spec/auth/Login.md` 的「已知缺口」段落），原始 SQL 排序邏輯的正確性無法透過
mocked repository 的單元測試驗證，且專案目前並無資料庫整合測試環境，因此以實機驗證取代。

**變更檔案：** `Repositories/PartnerRepository.cs`

---

## 驗證總結

| 項目 | 結果 |
|---|---|
| 後端測試（`dotnet test CMS.sln`，develop） | ✅ 292 / 292 通過 |
| 前端測試（`ng test`，develop） | ✅ 476 / 476 通過 |
| 前端正式版建置（`ng build --configuration production`） | ✅ 建置成功（僅既有、與本次變更無關的 bundle 大小警告） |
| ISSUE-001 實機重測 | ✅ `/login` 於已登入狀態下正確導向 `/courses` |
| ISSUE-003 實機重測 | ✅ Partner 同值群組排序已變為穩定遞增順序 |

## 提醒事項

該 worktree（`.claude/worktrees/feature-course-pdf`）目前仍留有本次 QA 針對 `guestGuard` 與
`PartnerRepository` 所做的未提交修改，與該分支既有的「課程 PDF 傳單」功能開發變更並存；其 API
處理程序也已重新啟動。建議該功能負責人於下次接續作業前，先確認這些檔案狀態。

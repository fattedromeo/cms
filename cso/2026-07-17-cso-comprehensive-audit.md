# CMS 資訊安全稽核報告 — 深度掃描（CSO Comprehensive Audit）

- **稽核日期**：2026-07-17 11:34（當地時間）
- **稽核範圍**：整個專案（`develop` 分支）— 後端 `CMS.API`（.NET 9 / Dapper）＋ 前端 `CMS.NG`（Angular 20 / PrimeNG 20）
- **稽核模式**：`--comprehensive`（2/10 信心門檻；相較每日模式，會額外浮現「值得複核但未達確認門檻」的 TENTATIVE 項目）
- **前次報告**：`2026-07-17-cso-full-audit.md`（每日模式，8/10 門檻）
- **稽核方式**：唯讀。本報告不變更任何程式碼。

> 本報告是前次每日稽核的**深化版**。前次確認的 4 項發現於此沿用，另新增 5 項於較低門檻下浮現的 **TENTATIVE（待複核）** 項目。TENTATIVE 不代表確定漏洞，而是「在深度模式下值得由具部署背景的人拍板」的觀察。

---

## 一、與前次報告的差異（Trend）

```
資安態勢趨勢（對比 2026-07-17 每日稽核）
════════════════════════════════════
  已修復（Resolved） : 0
  持續存在（Persistent）: 4（F1–F4，程式碼未變更，仍成立）
  新增（New）        : 5（T1–T5，深度模式浮現的 TENTATIVE）
  趨勢              : → STABLE（無回歸；新增項皆為既有低門檻觀察）
  過濾統計          : 掃描 14 候選 → 硬性排除 3 → 信心門檻降至 2/10 後保留 9 → 回報 9
```

## 二、確認發現（沿用前次，程式碼未變更仍成立）

| # | 等級 | 發現 | 位置 | 信心 |
|---|------|------|------|------|
| F1 | 🟠 HIGH | 密碼以無加鹽 SHA-256 儲存；共用預設密碼→雜湊相同 | `Data/PasswordHasher.cs:33` | 9/10 |
| F2 | 🟡 MEDIUM | 登入端點無速率限制／帳號鎖定 | `Controllers/AuthController.cs:73` | 7/10 |
| F3 | 🔵 LOW | 24h JWT 無伺服器端撤銷，登出僅前端行為 | `Services/JwtTokenService.cs:35` | 8/10 |
| F4 | 🔵 LOW | CORS 為開發導向設定卻不分環境套用 | `Program.cs:58` | 7/10 |

> F1–F4 的完整利用情境、影響與修補建議見前次報告 `2026-07-17-cso-full-audit.md` 第三節。此處不重複。**F1 仍為全案最需優先處理者。**

---

## 三、深度模式新增：TENTATIVE（待複核）項目

> 以下皆**需要部署／營運背景**才能拍板為「風險」或「可接受」。列出是為讓具背景者判斷，非斷言為漏洞。

### 🟡 T1 — 應用層無傳輸加密強制（HTTPS 重導向／HSTS 皆缺）

- **信心**：5/10（TENTATIVE — 取決於正式環境是否有上游 TLS）
- **分類**：OWASP A02 / A05（傳輸層保護 / 設定）
- **位置**：`Program.cs`（無 `UseHttpsRedirection()`、無 HSTS）、`Properties/launchSettings.json:9`（僅 `http://localhost:5000`）

**觸發程式碼：**
```csharp
// Program.cs — 管線中無任何 HTTPS/HSTS：
app.UseCors(CorsPolicy);
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
```
```json
// launchSettings.json:9 — 僅 http profile
"applicationUrl": "http://localhost:5000",
```

**問題描述：** 應用程式本身不強制 HTTPS，也不發送 HSTS 標頭。JWT bearer token 於每次請求以 `Authorization` 標頭傳遞——若正式環境未由上游反向代理終結 TLS，token 與登入密碼可被同網段側錄（man-in-the-middle）。

**利用情境：** 若 API 以純 HTTP 對外（無 TLS 代理），攻擊者於同網段側錄 `Authorization: Bearer ...` 或登入請求的明文密碼，即可重放取得帳號。

**待確認：** 正式環境是否一律經 HTTPS 反向代理？若是，本項可接受（內部服務常見）。**建議：** 即便有上游 TLS，仍建議加入 `app.UseHsts()` 與 `UseHttpsRedirection()` 作為縱深防禦，並提供 https 的 launch profile。

---

### 🟡 T2 — RowAudit 讀取端點未依呼叫者權限範圍限縮

- **信心**：4/10（TENTATIVE — 僅洩漏中繼資料，不含欄位值）
- **分類**：OWASP A01（存取控制 — 水平資訊揭露）
- **位置**：`Controllers/RowAuditController.cs:28`、`Repositories/RowAuditRepository.cs:21`

**觸發程式碼：**
```csharp
// RowAuditController.cs:31 — tableName 與 pkid 由查詢字串任意指定，僅需通過驗證（非 Admin）
public async Task<ActionResult<IEnumerable<RowAuditEntry>>> GetForRecord(
    [FromQuery] string? tableName, [FromQuery] string? pkid, CancellationToken ct)
```

**問題描述：** 任何**已登入**使用者（含 role「User」）可對**任意資料表／任意主鍵**查詢異動歷史，包含僅 Admin 可管理的 `AppUser`／`AppRole`。回傳內容為 `UserName`（操作者）、`ActionType`、`ActionDesc`（異動欄位名，或 Insert/Delete 時的第一個字串欄位值）。

一個重要細節：由 `RowAuditWriter.FirstStringPropertyValue`（`RowAuditWriter.cs:129`）可知，Insert／Delete 的 `ActionDesc` 會寫入該實體「第一個字串屬性值」——對 `AppUser` 而言即 **UserId（電子郵件，屬 PII）**。因此低權限使用者可透過 `GET /api/rowaudit?tableName=AppUser&pkid=<x>` 得知：管理者帳號的存在、何人於何時異動、異動了哪些欄位，以及新增／刪除時的 UserId email。

**利用情境：** role「User」的內部帳號列舉 `tableName=AppUser` 的稽核紀錄，蒐集管理員 email 清單與帳號異動時間軸，作為後續社交工程或針對性攻擊的偵查資料。

**限制（為何非高風險）：** 不洩漏任何欄位「值」（除第一字串屬性）、不含密碼或機密；僅為中繼資料與 PII 層級。

**建議：** 若稽核徽章僅出現在使用者本就能開啟的頁面，可考慮將此端點的可查詢 `tableName` 限縮為「呼叫者角色可存取的資料表白名單」（例如非 Admin 不可查 `AppUser`／`AppRole`），或至少對管理表的稽核查詢加上 Admin 檢查。

---

### 🔵 T3 — 前端未設定 Content-Security-Policy；API 無安全性標頭

- **信心**：4/10（TENTATIVE — 縱深防禦缺口，目前無 XSS 切入點）
- **分類**：OWASP A05（安全設定）
- **位置**：`CMS.NG/src/index.html`（無 CSP meta）、`Program.cs`（API 無安全標頭中介軟體）

**問題描述：** Angular 外殼的 `index.html` 未設定 CSP，API 亦未回傳 `X-Content-Type-Options`、`X-Frame-Options`／`frame-ancestors` 等標頭。存取 token 存於 `sessionStorage`（可被 JS 讀取），因此一旦出現 XSS（**本次未發現任何切入點**——Angular 預設跳脫且無 `innerHTML`／`bypassSecurityTrust`），CSP 這道可攔截 token 外送的防線是缺席的。

**待確認：** 前端靜態主機（或反向代理）是否於 HTTP 回應層統一注入 CSP／安全標頭？許多部署在代理層處理。

**建議：** 於前端主機或代理層加上 `Content-Security-Policy`（限制 `default-src`／`connect-src` 至自家 API）、`X-Frame-Options: DENY`。屬縱深防禦，非緊急。

---

### 🔵 T4 — 登入可能存在時間側通道帳號列舉

- **信心**：3/10（TENTATIVE — 網路環境下難穩定利用）
- **分類**：OWASP A07（認證）
- **位置**：`Controllers/AuthController.cs:82-87`

**觸發程式碼：**
```csharp
var user = await _auth.FindByUserIdAsync(request.UserId, ct);
if (user is null) return InvalidCredentials();          // 未知帳號：未做雜湊比對，較快返回
if (!user.IsActive) return InvalidCredentials();
if (!HashMatches(request.Password, user.PasswordHash))  // 已知帳號：執行 FixedTimeEquals 雜湊比對
    return InvalidCredentials();
```

**問題描述：** 回應「內容」已正確單一化為同一則 401（避免內容型列舉，設計良好）。但「未知帳號」路徑不執行雜湊計算即返回，而「已知帳號密碼錯誤」會執行一次 SHA-256 + 常數時間比對——兩者存在可測量的時間差，理論上可用於帳號列舉。

**限制：** 網路抖動通常淹沒此差異，且 UserId 為 email、本就易猜；實務利用價值低。**建議：** 若日後導入 F2 的登入節流，可一併對「未知帳號」路徑補一次等量的假雜湊運算以拉平時間。低優先。

---

### 🔵 T5 — 缺乏認證事件的安全記錄（A09）

- **信心**：3/10（TENTATIVE — 「缺少記錄」本身非漏洞，屬監控成熟度）
- **分類**：OWASP A09（安全記錄與監控）
- **位置**：`Controllers/AuthController.cs`、`Middleware/ExceptionHandlingMiddleware.cs`

**問題描述：** 目前僅「未處理例外」會被 `LogError` 記錄。登入失敗、Admin 的 `reset-password`、`[Authorize]` 授權失敗（403）等安全相關事件**未留下記錄**，因此無法事後偵測密碼噴灑或異常管理操作。

> 註：依 CSO 準則，「缺少稽核記錄」不列為漏洞，故置於 TENTATIVE 供成熟度參考。業務資料層面已有 `RowAudit`（寫入異動），但**認證／授權層事件**未涵蓋。

**建議：** 為登入失敗（含來源 IP、UserId）、`reset-password` 與 403 授權失敗加上結構化記錄，接入既有 log 管線即可，作為 F2 節流的偵測面。

---

## 四、資料分類（Phase 11）

```
RESTRICTED（外洩＝法律／安全責任）
  AppUser.PasswordHash        nvarchar(800) — 無加鹽 SHA-256（見 F1）
  SysConfig.configValue       nvarchar(4000) — 含 JWT 簽章金鑰 + 預設密碼；
                              嚴禁進入 DTO／log／回應（程式碼已落實）

CONFIDENTIAL（外洩＝業務損害）
  JWT 簽章對稱金鑰            存於 SysConfig，5 分鐘 TTL 快取，可輪換

PII
  AppUser.UserId             電子郵件（登入識別碼）；經由 RowAudit.ActionDesc 可被
                              已登入使用者讀取（見 T2）
  AppUser.UserName           使用者姓名（CJK）

INTERNAL
  RowAudit                   操作者、動作、異動欄位名（不含值）；對所有已登入者可讀
  系統例外                    完整記錄於伺服器端 log；對用戶端一律通用 500（設計良好）

備註：本案 PII 足跡極小 — 無電話、地址、身分證號、金流或付款資料。
```

## 五、STRIDE 摘要（Phase 10，重點元件）

| 元件 | 主要威脅 | 現況 |
|------|---------|------|
| 認證（AuthController + JWT） | Spoofing / EoP | 簽章驗證嚴謹；但 F1 雜湊弱、F2 無節流、T4 時間側通道 |
| 授權（FallbackPolicy + Roles） | EoP | fail-closed、Admin 表正確把關；模型正確 |
| 資料存取（Dapper repositories） | Tampering / Injection | 全面參數化，無注入面 |
| 稽核（RowAudit） | Repudiation / Info Disclosure | 寫入健全；讀取端點未依權限限縮（T2） |
| 傳輸 | Info Disclosure | 應用層未強制 TLS（T1，取決於部署） |

---

## 六、修補優先序（含 TENTATIVE）

| 優先 | 項目 | 動作 | 工作量 |
|------|------|------|--------|
| 1 | F1 密碼雜湊 | 導入 Argon2id + 登入時透明重雜湊 | 中（1–2 天） |
| 2 | F2 登入節流 | `AddRateLimiter` 於 login；一併處理 T4／T5 | 小 |
| 3 | T1 傳輸加密 | 確認上游 TLS；加 `UseHttpsRedirection` + HSTS | 小 |
| 4 | T2 稽核讀取範圍 | 管理表稽核查詢加 Admin 檢查或白名單 | 小 |
| 5 | F3／F4／T3／T5 | 依部署背景排入（多為縱深防禦） | 小 |

**建議建立 `.gitleaks.toml`** 作為 CI 的機密掃描防線（目前專案無此檔）。

---

## 七、深度模式下仍確認「無問題」的面向

- **SQL 注入**：全面參數化（14 個 repository 全數檢視），動態組裝僅含固定欄位／述詞常數。
- **XSS**：無切入點。Angular 預設跳脫，無 `innerHTML`／`bypassSecurityTrust`／`eval`。
- **ReDoS**：密碼規則（前後端）皆為字元迴圈，非正則，無災難性回溯。
- **Mass assignment（過度張貼）**：Request DTO 與 Model 分離，`AppUserRequest` 刻意無 `PasswordHash` 屬性；欄位有 `[Required]` + `[MaxLength]`。
- **機密外洩**：原始碼／設定／Git 歷史／log 全數乾淨；連線字串用 Windows 驗證。
- **供應鏈**：相依套件為近期版，無已知重大 CVE；QR 於前端產生，後端無對外 HTTP，無 SSRF 面；無 CI/CD、Docker、IaC 面。
- **內容控制器非 Admin**：經 `spec/auth/Authorization.md` 確認為 CMS 預期存取模型，非漏洞。

---

## 八、免責聲明

**本工具不能取代專業資安稽核。** `/cso` 是 AI 輔助掃描，用以捕捉常見漏洞樣態，並非全面、亦不保證無遺漏，更不能取代委託合格資安團隊進行滲透測試。LLM 可能遺漏細微漏洞、誤解複雜的認證流程並產生偽陰性。對於處理敏感資料、金流或個資的正式系統，請委由專業滲透測試廠商執行。請將 `/cso` 作為在專業稽核之間、捕捉低垂果實並改善資安態勢的第一道防線，而非唯一防線。

---

*報告產生時間：2026-07-17 11:34 ｜ 稽核分支：`develop` ｜ 模式：`--comprehensive`（2/10 門檻）*

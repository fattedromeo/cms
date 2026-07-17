# CMS 資訊安全稽核報告（CSO Security Posture Report）

- **稽核日期**：2026-07-17 11:20（當地時間）
- **稽核範圍**：整個專案（`develop` 分支）— 後端 `CMS.API`（.NET 9 / Dapper）＋ 前端 `CMS.NG`（Angular 20 / PrimeNG 20）
- **稽核模式**：全專案深度掃描（因先前功能均未經 CSO 稽核，比照 comprehensive 廣度）
- **稽核者**：Claude Code（`/cso` 技能）
- **稽核方式**：唯讀（read-only）。本報告不變更任何程式碼。

---

## 一、執行摘要（Executive Summary）

整體而言，這是一套**資安意識極高、防護做得相當紮實**的程式碼庫。`CLAUDE.md` 的「不可妥協事項（Non-negotiables）」本身幾乎就是一份資安檢查清單，且這些規則在程式碼中都有確實落實並以測試釘住。

- **SQL 注入**：無。所有查詢皆使用 Dapper 參數化，動態組裝的僅為固定的欄位／述詞片段，使用者輸入一律走參數。
- **XSS**：無可利用切入點。Angular 預設輸出跳脫，且全專案未使用 `innerHTML`、`bypassSecurityTrust`、`eval` 等逃生門。
- **機密外洩**：無。原始碼、設定檔、Git 歷史皆無硬編碼金鑰／密碼；連線字串使用 Windows 驗證（Trusted_Connection），不含密碼。JWT 簽章金鑰與預設密碼存於資料庫 `SysConfig`，並嚴格遵守「不進入 DTO／log／例外訊息」的規則。
- **授權（AuthZ）**：模型正確且「預設關閉（fail-closed）」。`FallbackPolicy` 要求所有端點需驗證；系統管理表（AppUser／AppRole／PublishStatus）以 `[Authorize(Roles = "Admin")]` 把關；`[AllowAnonymous]` 僅正確地掛在 `Login` 動作上。
- **供應鏈**：相依套件版本均為近期版，無已知重大 CVE；QR Code 於前端產生（`qrcode` 1.5.4），後端無對外 HTTP 呼叫，故無 SSRF 面。

**唯一需要正視的實質風險是密碼儲存採用「無加鹽、未經 KDF 的 SHA-256」**（見 F1）。此為與既有登入系統相容而繼承的設計，程式碼中亦已明白註記，但仍屬真實的縱深防禦弱點，建議納入後續修補規劃。

### 風險統計

| 等級 | 數量 |
|------|------|
| 🔴 CRITICAL | 0 |
| 🟠 HIGH | 1 |
| 🟡 MEDIUM | 1 |
| 🔵 LOW / 觀察事項 | 3 |

---

## 二、攻擊面盤點（Attack Surface Map）

```
程式碼面（CODE SURFACE）
  公開端點（未驗證）      : 1   （POST /api/auth/login）
  需驗證端點             : 全部其餘端點（FallbackPolicy 強制）
  僅限 Admin             : AppUsers / AppRoles / PublishStatuses 三個控制器全部動作
                           ＋ POST /api/auth/reset-password
  一般內容 CRUD          : Courses / CourseGroups / Partners /
                           FeaturedPromoItems / RowAudit（需驗證，非 Admin）
  檔案上傳點             : 0
  對外整合／webhook       : 0
  背景工作               : 0
  WebSocket              : 0

基礎設施面（INFRASTRUCTURE SURFACE）
  CI/CD 工作流程          : 0（未發現 .github/workflows 或 .gitlab-ci.yml）
  容器設定               : 0（無 Dockerfile / docker-compose）
  IaC 設定               : 0
  機密管理               : 資料庫 SysConfig（JWT 金鑰、預設密碼）＋ Windows 整合驗證
```

---

## 三、發現事項（Findings）

### 🟠 F1 — 密碼以無加鹽 SHA-256 儲存

| 項目 | 內容 |
|------|------|
| **嚴重度** | HIGH |
| **信心** | 9/10 |
| **狀態** | VERIFIED（已由原始碼直接確認） |
| **分類** | 加密儲存 / 認證（OWASP A02: Cryptographic Failures） |
| **位置** | `src/CMS.API/Data/PasswordHasher.cs:33` |

**觸發程式碼（逐字引用）：**

```csharp
// PasswordHasher.cs:30-35
public static string Hash(string password)
{
    ArgumentNullException.ThrowIfNull(password);
    var digest = SHA256.HashData(Encoding.UTF8.GetBytes(password));   // ← 無鹽、單次快速雜湊
    return Convert.ToHexString(digest).ToLowerInvariant();
}
```

**問題描述：**
`AppUser.PasswordHash` 以「未加鹽、未經金鑰延伸（KDF）」的單次 SHA-256 儲存。SHA-256 是設計為**快速**的雜湊，恰與密碼儲存的需求相反：

1. **可被大規模離線暴力破解**：現代 GPU 每秒可嘗試數十億次 SHA-256，一旦取得雜湊即可高速還原明文。
2. **無鹽 → 相同密碼產生相同雜湊**：由 `AuthController.ResetPassword` 與 `AppUserRepository.CreateAsync` 可知，所有新帳號與被重設的帳號皆以**同一組共用預設密碼**播種，因此它們的 `PasswordHash` **完全相同**。攻擊者只要破解其中一個（或直接以預設密碼的雜湊比對），即等於一次破解所有仍使用預設密碼的帳號。
3. 可直接套用彩虹表（rainbow table），因為無鹽。

程式碼本身（`PasswordHasher.cs` 的 XML 註解）已誠實記載此弱點，並說明這是為「與既有登入系統互通」而繼承的設計，非從零選型。**這降低了「意外」的成分，但不改變其為真實弱點的事實。**

**利用情境（Exploit Scenario）：**
1. 攻擊者透過任一途徑取得資料庫讀取權（例如：DB 備份外洩、伺服器遭入侵、或其他系統的 SQL 注入橫向移動）。
2. 匯出 `AppUser.PasswordHash` 欄位。
3. 以 GPU 破解工具（hashcat `-m 1400` SHA-256）或彩虹表離線還原明文密碼；弱密碼於數秒內破解。
4. 由於使用者常於多系統重複使用密碼，攻擊者以還原的明文對本系統及**其他系統**進行帳號接管。
5. 所有仍為預設密碼的帳號，因雜湊相同而一次全數淪陷。

**影響（Impact）：** 資料庫一旦外洩，可從「資料外洩」升級為「全站憑證外洩 + 跨系統帳號接管」。

**修補建議（Recommendation）：**
- 短期（縱深防禦）：確保資料庫備份加密、存取權最小化，並強制所有帳號離開預設密碼（`PasswordUpdatedTime IS NULL` 即代表仍在預設密碼，可作為強制變更的判斷依據）。
- 根本解：改用**加鹽 + 慢速 KDF**（Argon2id 為首選，其次 bcrypt / PBKDF2）。若受限於既有登入系統的相容性，建議採「登入時透明重雜湊（rehash-on-login）」：使用者下次成功登入時，以新演算法重新雜湊並寫回，逐步汰換。此邏輯集中於 `PasswordHasher` 與 `AuthController.HashMatches`／`IAuthRepository.UpdatePasswordAsync`，改動範圍可控。

**事件應變（若確認雜湊已外洩）：** 立即強制全站密碼重設 → 撤換 JWT 簽章金鑰（`SysConfig.symmetricSecurityKey`，使所有既發 token 失效）→ 稽核登入紀錄找出異常存取。

---

### 🟡 F2 — 登入端點無速率限制／帳號鎖定

| 項目 | 內容 |
|------|------|
| **嚴重度** | MEDIUM |
| **信心** | 7/10 |
| **狀態** | VERIFIED |
| **分類** | 認證（OWASP A07: Identification and Authentication Failures） |
| **位置** | `src/CMS.API/Program.cs`（無 `AddRateLimiter`）、`src/CMS.API/Controllers/AuthController.cs:73`（Login 無節流） |

**問題描述：**
`POST /api/auth/login` 未套用任何速率限制、失敗次數上限或帳號鎖定機制（全專案未發現 `RateLimiter` / `Lockout` 相關程式碼）。搭配 F1 的**快速** SHA-256 驗證，線上暴力破解／密碼噴灑（password spraying）成本極低——特別是針對共用預設密碼的帳號。

> 註：純粹的資源耗盡型 DoS 不在 CSO 報告範圍；此處針對的是「**線上密碼暴力破解**」的認證風險，而非服務可用性。

**利用情境：** 攻擊者對已知的 UserId（本系統 UserId 為 email，易枚舉）以常見密碼字典高速嘗試登入，因無鎖定或節流而不受阻。

**修補建議：**
- 於 `Program.cs` 加入 ASP.NET Core Rate Limiting（`AddRateLimiter`），對 `login` 端點以 IP／UserId 設定固定視窗或滑動視窗限制。
- 導入漸進式延遲或多次失敗後暫時鎖定。
- 搭配 F1 的 KDF 修補，可同時提高單次嘗試成本。

---

### 🔵 F3 — JWT 為 24 小時效期且無伺服器端撤銷（登出僅為前端行為）

| 項目 | 內容 |
|------|------|
| **嚴重度** | LOW（設計取捨） |
| **信心** | 8/10 |
| **狀態** | VERIFIED |
| **分類** | 工作階段管理 |
| **位置** | `src/CMS.API/Services/JwtTokenService.cs:35`（`TokenLifetime = 24h`）、`src/CMS.NG/src/app/core/services/auth.service.ts:88`（`logout()` 僅清除 sessionStorage） |

**問題描述：**
存取 token 效期為 24 小時，且系統無伺服器端撤銷清單（deny-list）。前端 `logout()` 只是移除 sessionStorage 中的 token，**token 本身在到期前仍為有效**。若 token 在有效期內外洩（例如透過惡意瀏覽器擴充或側錄），「登出」無法使其失效。

此為多數 SPA + 無狀態 JWT 架構的常見取捨，非缺陷；列此供風險知悉。可行的緩解手段有：縮短存取 token 效期並搭配 refresh token、或於 `SysConfig` 金鑰輪換時一併使舊 token 失效（`SigningKeyProvider` 已支援 5 分鐘 TTL 的金鑰快取，輪換金鑰即可全面撤銷）。

---

### 🔵 F4 — CORS 政策於所有環境皆套用，屬開發導向設定

| 項目 | 內容 |
|------|------|
| **嚴重度** | LOW（部署前需複核） |
| **信心** | 7/10 |
| **狀態** | VERIFIED |
| **分類** | 設定 |
| **位置** | `src/CMS.API/Program.cs:58-64` |

**問題描述：**
CORS 政策 `SetIsOriginAllowed(origin => new Uri(origin).IsLoopback)` 搭配 `AllowAnyHeader()` / `AllowAnyMethod()`，且**不分環境一律套用**。

此設定本身**並非可被利用的漏洞**：僅允許 loopback 來源實際上是限制性的（瀏覽器無法為遠端網站偽造 loopback Origin），且本系統以 `Authorization` 標頭（非 Cookie）帶 token，未啟用 `AllowCredentials`，故 CORS 不構成憑證竊取途徑。

風險在於**上線正確性**：正式環境前端若非 loopback 來源，將被此政策擋下而需修改。建議正式部署時以組態切換為明確的白名單網域，避免臨時放寬成過度寬鬆的設定。

---

## 四、已查核但判定「非缺陷」的項目

| 項目 | 判定 |
|------|------|
| 內容控制器（Courses / CourseGroups / Partners / FeaturedPromoItems / RowAudit）僅需驗證、非 Admin | **符合設計**。`spec/auth/Authorization.md:16` 明確界定僅 AppUsers／AppRoles／PublishStatuses 為 Admin-only；內容編輯開放給所有登入員工是 CMS 的預期存取模型。 |
| `LookupsController` 未 Admin 把關 | **刻意為之**（`LookupsController.cs:7-14` 註解與規格確認）。僅提供 id/label 對，且為 Course/Promo 表單下拉所需。 |
| SQL 動態組裝（`$@"... {whereSql} ..."`） | **安全**。內插的僅為固定欄位／述詞字串常數；使用者輸入一律經 `DynamicParameters` 參數化。 |
| Token 存於 sessionStorage | **標準且較 localStorage 安全**（隨分頁關閉即失效，共用機器不會繼承登入）。未發現 XSS 途徑可竊取。 |
| `appsettings.json` 進版控 | **安全**。僅含 Windows 驗證連線字串，無密碼；`.gitignore` 已排除 `*.local.json` 等本機機密檔。 |
| 例外處理中介軟體 | **正確**。統一回傳通用 500，絕不外洩堆疊／SQL／機密（`ExceptionHandlingMiddleware.cs`）。 |

---

## 五、值得肯定的資安實作（Positive Posture）

1. **全面參數化 SQL**：無任何字串拼接使用者輸入至 SQL。
2. **機密零外洩紀律**：`PasswordHash` 無 DTO 屬性；`SysConfig` 的簽章金鑰與預設密碼絕不進入 log／例外訊息／回應。
3. **`MapInboundClaims = false`**：正確處理了會 403 掉所有 Admin 的隱性陷阱。
4. **`[AllowAnonymous]` 僅掛在 `Login` 動作**：避免了控制器層級誤放而架空 `[Authorize]`。
5. **Fail-closed 的 `FallbackPolicy`**：新增控制器若忘記加 `[Authorize]`，預設為拒絕而非暴露。
6. **常數時間雜湊比對**（`CryptographicOperations.FixedTimeEquals`）：避免比對延遲側錄。
7. **登入錯誤訊息單一化**：避免帳號枚舉 oracle。
8. **自助式寫入鎖定 JWT 使用者**：`UpdateProfile` / `ChangePassword` 皆以 token 的 `sub` 為對象，DTO 無 UserId 屬性可越權改他人。
9. **前端 token 不跨來源外洩**：攔截器僅對本 API 附加 `Authorization`，不會帶往 `publicSiteUrl` 等第三方。
10. **RowAudit 稽核**：寫入與稽核同交易，快照排除機密欄位。

---

## 六、修補優先序建議（Remediation Roadmap）

| 優先 | 發現 | 建議動作 | 估計工作量 |
|------|------|----------|-----------|
| 1 | F1 密碼雜湊 | 導入 Argon2id + 登入時透明重雜湊；強制汰換預設密碼帳號 | 中（1–2 天） |
| 2 | F2 登入節流 | `Program.cs` 加入 Rate Limiting 於 login 端點 | 小（數小時） |
| 3 | F3 Token 撤銷 | 評估縮短效期 + refresh token，或以金鑰輪換撤銷 | 中 |
| 4 | F4 CORS | 正式環境改為明確網域白名單 | 小 |

---

## 七、免責聲明

**本工具不能取代專業資安稽核。** `/cso` 是 AI 輔助掃描，用以捕捉常見漏洞樣態，並非全面、亦不保證無遺漏，更不能取代委託合格資安團隊進行滲透測試。LLM 可能遺漏細微漏洞、誤解複雜的認證流程並產生偽陰性。對於處理敏感資料、金流或個資的正式系統，請委由專業滲透測試廠商執行。請將 `/cso` 作為在專業稽核之間、捕捉低垂果實並改善資安態勢的第一道防線，而非唯一防線。

---

*報告產生時間：2026-07-17 11:20 ｜ 稽核分支：`develop` ｜ 模式：全專案深度掃描*

# 學生陳情系統 (Student Petition System)

這是一個基於 **Google Apps Script (GAS)** 開發的輕量化陳情系統，專為學校學生自治組織設計。系統整合了 Google Sheets 作為資料庫，並提供自動化 Email 通知與 Discord Webhook 提醒功能，讓陳情處理流程更加透明、高效。<br>
本專案開放各校學生自治組織使用，惟於使用時請告知並標註作者(對就是我)。<br>
這是我的聯絡方式 ：<br>
Instagram：[chenarnold_](https://www.instagram.com/chenarnold_)<br>
E-Mail：chenarnold0705@gmail.com<br>

---

## ✨ 專案特色

* **雙介面設計**：
    * **學生端**：支援「實名」與「匿名」陳情，並可透過案號即時查詢處理進度。
    * **後台管理端**：工作人員可進行案件狀態更迭（待處理、處理中、處理完成）、撰寫回覆草稿及發送結案通知。
* **全自動通知系統**：
    * **Email 通知**：提交案件後自動寄送收案確認信；結案時自動發送詳細回覆信件。
    * **Discord 整合**：新案件進入時，即時透過 Webhook 推送到工作群組。
* **高度安全性**：
    * 整合 **Google reCAPTCHA v2** 阻擋惡意攻擊與機器人垃圾訊息。
    * 管理後台設有帳號密碼驗證機制。
* **雲端化與零成本**：
    * 無需購買伺服器，完全運行於 Google 雲端平台。
    * 使用瀏覽器緩存（sessionStorage）功能，防止學生輸入到一半內容遺失。

---

## 🛠️ 技術棧

* **Frontend**: HTML5, CSS3 (Responsive Design), JavaScript (Vanilla JS)
* **Backend**: Google Apps Script (GAS)
* **Database**: Google Sheets
* **Integration**: Gmail API, Discord Webhook, Google reCAPTCHA

---

## 🚀 安裝與設定說明

### 第一步：準備 Google 試算表
1. 建立一個新的 Google 試算表。
2. 建立兩個工作表（分頁），名稱必須完全一致：
    * `Petitions`：用於存放陳情資料。
    * `Staff`：用於存放工作人員帳號。
3. 在 `Petitions` 工作表中，第一列設定標題：`時間`、`案號`、`姓名`、`學號`、`Email`、`匿名/實名`、`類別`、`主旨`、`內容`、`狀態`、`回覆`、`承辦人`。~~(其實也可以不用設)~~
4. 在 `Staff` 工作表中，第一列設定標題：`帳號`、`密碼`、`姓名`、`職位`。並至少新增一組帳號。

### 第二步的前置作業：申請reCAPTCHA
1. 開啟 [Google reCAPTCHA](https://www.google.com/recaptcha/admin/create) 網頁
2. 設定參數：
   * `標籤`：隨便設定一個你喜歡的名稱。
   * `reCAPTCHA 類型`：選擇 `驗證問題 (v2)` 的 `「我不是機器人」核取方塊`
   * `網域`：填入陳情系統架設的網址 (我知道在這裡寫這個很怪，但對 你可以先填`localhost`，我們之後再改)
3. 提交
4. 取得兩個金鑰 (請先保留好) ，這邊兩個金鑰上面的是`Site Key`，下面的是`Secret Key`

### 第二步的前置作業：申請Discord webhook
1. 這還要教喔？？？ (如果你沒用Discord那就算了，請把第3行、第107行、第235~263行的`sendToDiscord`函式全部刪掉)
2. 首先你要有一個伺服器。(這我不教)
3. 然後你要有一個頻道。(這我也不教)
4. 確保你有管理webhook的權限。(沒啥好教的，有就有沒有就沒有，自己創的伺服器一定有)
5. 進入頻道設定。(點那個齒輪)
6. 進入`整合`頁面
7. 按下`建立webhook`
8. 然後有一個`複製webhook網址`，複製好就對了，看下一步吧

### 第二步：部署 Google Apps Script (GAS)
1. 回到試算表，在試算表中點選 `擴充功能` -> `Apps Script`。
2. 將專案中的 `GAS.js` 內容貼入程式碼編輯器。
3. 修改 `GAS.js` 頂部的常數：
    * `DISCORD_WEBHOOK`: 貼入你的 Discord 頻道 Webhook 網址。
    * `RECAPTCHA_SECRET`: 貼入你的 reCAPTCHA Secret Key (對這邊是Secret Key不要貼錯了)。
4. 點選右上方 `部署` -> `新增部署` 。
    * 有一個齒輪的符號，點下去就對了，在那邊選 `網頁應用程式 (Web App)`
    * 設定參數如下：
      * **名稱**：隨便打
      * **執行身分**：我 (Your account)
      * **誰有權限存取**：所有人 (Anyone)
5. 複製產生的 **網頁應用程式網址 (URL)**。

### 第三步：設定前端網頁
1. 開啟 `index.html` (陳情端) 與 `admin.html` (管理端)。 (你可以用VScode開，如果你是狠人用txt我不反對)
2. 在`index.html`中請修改以下內容
   * 第6行：把臺中高工改成你的學校，這個是在標題顯示的文字
   * 第205、206行：把臺中高工改成你的學校，這個是在陳情頁面中的標題文字 (反正改就對了)
   * 第240行：你可以把學生會改成你的組織名稱(可能是學生代表團、班聯會等)
   * 第258行：`<div class="g-recaptcha" data-sitekey="RECAPTCHA ID"></div>` 的RECAPTCHA ID請改成你在第二步複製的`Site Key`
   * 第289行：請把你在第二步複製的`網頁應用程式網址 (URL)`網址貼上來
   * 第324、325行：把臺中高工改成你的學校，這個是在陳情頁面中的標題文字 (反正改就對了)
3. 在`admin.html`中請修改以下內容
   * 第192行：把臺中高工改成你的學校
   * 第219行：請把你在第二步複製的`網頁應用程式網址 (URL)`網址貼上來

### 第四步：上架 GitHub Pages
1. 進入 [cloudfare](https://www.cloudflare.com/zh-tw/) 官網
2. 登入或是註冊帳號(求你了這東西你會的)
3. 在左邊找到`組建`->`運算`-> `Workers 和 Pages`
4. 點擊右上角的`建立應用程式`
5. 點選下面的 `想要部署 Pages? 開始使用` 開始使用那四個字
6. 選擇 `拖放您的檔案` -> `開始使用`
7. 輸入`專案名稱`，這會關係到最終的網址，請慎選
8. `上傳您的專案資產`的地方，把你的`index.html` 與 `admin.html` 放到一個資料夾然後上傳
9. 之後就會自己跑好了 (那編寫的是中文，請你好好看懂)

### 第五步：把你的reCAPTCHA設定好
1. 進入網站 [這個網站](https://console.cloud.google.com/security/recaptcha)
2. 往下滑在`reCAPTCHA 金鑰`中找到你的專案 並點擊 `金鑰詳細資料`
3. 進入後點擊右上角的`編輯金鑰`
4. 到下方的 `Key usage settings` 的 `新增網域` ，把你的網址打進去 (第四步部署完的網址) ，例如：`tcivssa-tall.pages.dev` (爽的話你還可以把localhost給刪了)
5. 順便把`script.google.com`也打進去 (不要問為甚麼，反正是玄學 可能吧)
6. 然後按完成以及最下面的`Save change`(這還要教喔？)
7. 完成

<br>
再不會我要殺人了:DDDDDD
<br>

---

## 📂 檔案結構

* `index.html`: 學生陳情與查詢介面，包含表單驗證與狀態顯示。
* `admin.html`: 工作人員後台，包含登入驗證、案件分類分頁與回覆系統。
* `GAS.js`: 核心後端邏輯，負責處理資料寫入、Email 寄送、Discord 推送與身分驗證。

---

## ⚠️ 注意事項

1. **安全性**：雖然後台有密碼驗證，但由於 GAS 的特性，請確保 `GAS.js` 中的敏感資訊（如 Webhook）不會直接外流。
2. **限額**：Google Gmail API 每日發信有上限（個人帳戶約 500 封），請根據學校規模評估使用。

---

## 📄 開源授權

本專案採用 **MIT License** 授權開源，歡迎各校學生會自由 Fork 使用並加以改進。<br>
對但記得跟我取的聯繫告知我，然後使用系統的時候標註我 (反正讓大家知道這系統是我開發的)<br>
如果你改進了，麻煩告訴我並給我一份程式，我也想學學

---

## 📫 聯繫方式
Instagram：[chenarnold_](https://www.instagram.com/chenarnold_)<br>
E-Mail：chenarnold0705@gmail.com<br>
如果有任何問題歡迎向我詢問，有建議也很歡迎，有改進、有使用一定要跟我講喔喔喔！！

---

**💡 貢獻與反饋**<br>
如果你有任何建議或發現 Bug，歡迎提交 Issue 或 Pull Request！ (但最簡單還是透過IG或Mail聯繫我)


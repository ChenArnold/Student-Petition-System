/**
 * ============================================================
 *  陳情系統 - 後端 (Google Apps Script)
 * ============================================================
 *  部署前，請先到 Apps Script 編輯器左側「專案設定」
 *  →「指令碼屬性 (Script Properties)」新增以下屬性，
 *  避免把機密資訊直接寫死在程式碼中並公開在 GitHub 上：
 *
 *    RECAPTCHA_SECRET   Google reCAPTCHA 的「私鑰」(Secret Key)
 *    DISCORD_WEBHOOK    (選填) Discord 頻道 Webhook 網址；不填則略過 Discord 通知
 *    NOTIFY_EMAIL       (選填) 要接收「新案件通知」的內部信箱；不填則略過內部通知信
 *
 * ============================================================
 */

const PETITION_SHEET = "Petitions";
const STAFF_SHEET = "Staff";

const SCRIPT_PROPS = PropertiesService.getScriptProperties();
const RECAPTCHA_SECRET = SCRIPT_PROPS.getProperty("RECAPTCHA_SECRET");
const DISCORD_WEBHOOK = SCRIPT_PROPS.getProperty("DISCORD_WEBHOOK");
const NOTIFY_EMAIL = SCRIPT_PROPS.getProperty("NOTIFY_EMAIL");

const SYS_NAM = "田總召御用陳情系統";   // 陳情系統名稱 (與前端不同步)
const DEP_NAM = "學生代表團田總召";     // 陳情系統所設之單位 ( OOO敬上 使用，與前端不同步)

const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFY_CODE_TTL_SECONDS = 600;      // 驗證碼有效期：10 分鐘
const VERIFY_CODE_COOLDOWN_SECONDS = 60;  // 同一信箱重新發送驗證碼的冷卻時間

// ------------------------------------------------------------
// 輔助函式
// ------------------------------------------------------------

// 檢查管理員身分（帳號 + 密碼）
function verifyStaff(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const staffData = ss.getSheetByName(STAFF_SHEET).getDataRange().getValues();
  for (let i = 1; i < staffData.length; i++) {
    if (staffData[i][0] == params.account && staffData[i][1] == params.password) {
      return { success: true, name: staffData[i][2], position: staffData[i][3] };
    }
  }
  return { success: false };
}

// 驗證 Google reCAPTCHA
function verifyCaptcha(token) {
  if (!RECAPTCHA_SECRET) {
    // 如未在指令碼屬性設定 RECAPTCHA_SECRET 則會略過檢查。
    // 強烈建議在正式使用時須要設定。
    return true;
  }
  if (!token) return false;
  const response = UrlFetchApp.fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "post",
    payload: { secret: RECAPTCHA_SECRET, response: token }
  });
  const result = JSON.parse(response.getContentText());
  return result.success;
}

// 避免 Google Sheet / Excel 公式注入
function sanitizeForExcel(text) {
  if (typeof text !== "string") return text;
  const forbiddenChars = ["=", "+", "-", "@"];
  if (forbiddenChars.includes(text.charAt(0))) {
    return "'" + text; // 前面加上單引號，強迫視為純文字
  }
  return text;
}

function normalizeEmail(email) {
  return (email || "").toString().trim().toLowerCase();
}

function verifyCodeCacheKey(email) {
  return "vcode_" + normalizeEmail(email);
}

function verifyCooldownCacheKey(email) {
  return "vcode_cooldown_" + normalizeEmail(email);
}

function responseJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function escapeHtml(text) {
  if (!text) return "";
  return text.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ------------------------------------------------------------
// 主要進入點
// ------------------------------------------------------------

function doPost(e) {
  const params = e.parameter;
  const action = params.action;
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- 0. 寄送 Email 驗證碼 ---
  if (action === "sendVerificationCode") {
    return handleSendVerificationCode(params);
  }

  // --- 1. 提交陳情（需先通過 Email 驗證碼）---
  if (action === "submit") {
    return handleSubmit(params, ss);
  }

  // --- 2. 工作人員登入 ---
  if (action === "staffLogin") {
    const staffData = ss.getSheetByName(STAFF_SHEET).getDataRange().getValues();
    for (let i = 1; i < staffData.length; i++) {
      if (staffData[i][0] == params.account && staffData[i][1] == params.password) {
        return responseJSON({ result: "success", name: staffData[i][2], position: staffData[i][3] });
      }
    }
    return responseJSON({ result: "error", error: "帳號或密碼錯誤" });
  }

  // --- 3. 取得案件資料（管理員用）---
  if (action === "getStaffData") {
    const auth = verifyStaff(params);
    if (!auth.success) return responseJSON({ result: "error", error: "權限不足" });

    const data = ss.getSheetByName(PETITION_SHEET).getDataRange().getValues();
    const cases = data.slice(1).map(row => ({
      time: row[0].toString(),
      caseId: row[1],
      name: row[2],
      studentId: row[3],
      email: row[4],
      identity: row[5],
      category: row[6],
      subject: row[7],
      content: row[8],
      status: row[9],
      reply: row[10],
      handlingStaff: row[11]
    })).reverse();
    return responseJSON({ result: "success", cases: cases });
  }

  // --- 4. 案件更新與回覆 ---
  if (action === "staffUpdateStatus" || action === "staffReply") {
    const auth = verifyStaff(params);
    if (!auth.success) return responseJSON({ result: "error", error: "權限不足" });

    const sheet = ss.getSheetByName(PETITION_SHEET);
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === params.caseId) {
        const originalSubject = data[i][7] || "無主旨";
        const originalContent = data[i][8] || "無內容";

        sheet.getRange(i + 1, 10).setValue(params.status);        // 狀態欄
        sheet.getRange(i + 1, 11).setValue(params.replyContent);  // 回覆欄
        sheet.getRange(i + 1, 12).setValue(params.handlingStaff); // 辦理人欄

        if (action === "staffReply") {
          try {
            const htmlReplyMessage = `
              <div style="font-family:'Microsoft JhengHei',sans-serif;color:#222;line-height:1.6;max-width:600px;">
                <h2 style="color:#111;border-bottom:2px solid #16a34a;padding-bottom:10px;">案件處理完成通知</h2>
                <p>同學您好：</p>
                <p>您的陳情案件（<strong>${params.caseId}</strong>）已經辦理完畢，以下是詳細的回覆資訊：</p>

                <div style="background-color:#f7f7f8;padding:15px;border-radius:8px;border:1px solid #e2e4e9;margin:20px 0;">
                  <p style="margin:5px 0;"><strong>案號：</strong> ${params.caseId}</p>
                  <p style="margin:5px 0;"><strong>來信主旨：</strong> ${originalSubject}</p>
                  <hr style="border:0;border-top:1px solid #e2e4e9;margin:10px 0;">
                  <p style="margin:5px 0;"><strong>來信內容：</strong></p>
                  <p style="margin:5px 0;color:#444;">${originalContent.replace(/\n/g, "<br>")}</p>
                </div>

                <div style="background-color:#fef2f2;border-left:5px solid #dc2626;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;">
                  <p style="margin:0;font-weight:bold;color:#dc2626;font-size:1.1em;">處理單位回覆內容：</p>
                  <p style="margin:10px 0 0 0;color:#000;font-weight:500;">
                    ${escapeHtml(params.replyContent).replace(/\n/g, "<br>")}
                  </p>
                </div>

                <hr style="border:0;border-top:2px solid #eee;margin:20px 0;">

                <p style="font-size:14px;">
                  感謝您的熱忱參與，若對結果有任何疑問，歡迎再次提出。<br>
                  敬祝 萬事如意 身體健康<br><br>
                  <strong>本郵件是由系統自動寄發，請勿直接回覆。</strong><br>
                  <strong>${DEP_NAM} 敬啟</strong>
                </p>
              </div>
            `;

            MailApp.sendEmail({
              to: data[i][4],
              subject: `【${SYS_NAM}】案件回覆 - ${params.caseId}`,
              htmlBody: htmlReplyMessage
            });
          } catch (mailError) {
            console.error("發信失敗: " + mailError.toString());
          }
        }
        return responseJSON({ result: "success" });
      }
    }
    return responseJSON({ result: "error", error: "找不到對應的案件編號" });
  }

  // --- 5. 案件查詢（學生用）---
  if (action === "inquiry") {
    const data = ss.getSheetByName(PETITION_SHEET).getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === params.inquiryCaseId &&
          normalizeEmail(data[i][4]) === normalizeEmail(params.inquiryEmail)) {
        return responseJSON({
          result: "found",
          status: data[i][9],
          name: data[i][2],
          studentId: data[i][3],
          category: data[i][6],
          subject: data[i][7],
          content: data[i][8],
          contentReply: data[i][10],
          handlingStaff: data[i][11]
        });
      }
    }
    return responseJSON({ result: "not_found", message: "找不到符合的案件編號或 Email。" });
  }

  return responseJSON({ result: "error", error: "未知的操作 (action)。" });
}

// ------------------------------------------------------------
// Email 驗證碼（功能 2：確保使用者填寫的 Email 正確）
// ------------------------------------------------------------

function handleSendVerificationCode(params) {
  const email = normalizeEmail(params.email);

  if (!EMAIL_RULE.test(email)) {
    return responseJSON({ result: "error", error: "Email 格式不正確，請重新檢查。" });
  }

  if (!verifyCaptcha(params["g-recaptcha-response"])) {
    return responseJSON({ result: "error", error: "機器人驗證失敗，請重試。" });
  }

  const cache = CacheService.getScriptCache();
  if (cache.get(verifyCooldownCacheKey(email))) {
    return responseJSON({ result: "error", error: "驗證碼才剛寄出，請稍後再試一次。" });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6 位數字驗證碼

  const htmlBody = `
    <div style="font-family:'Microsoft JhengHei',sans-serif;color:#222;line-height:1.6;max-width:480px;">
      <h2 style="margin:0 0 16px;color:#111;">陳情系統 Email 驗證碼</h2>
      <p>您好，感謝您使用${SYS_NAM}。您的驗證碼為：</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;
                background:#f7f7f8;border-radius:8px;padding:16px 0;margin:16px 0;color:#111;">${code}</p>
      <p>此驗證碼將於 <strong>10 分鐘</strong> 後失效，請儘快回到陳情頁面完成送出。</p>
      <p style="font-size:13px;color:#888;margin-top:24px;">若您並未申請此驗證碼，請忽略本封郵件即可，不會有任何案件因此被建立。</p>
    </div>
  `;

  // 先嘗試寄信，成功才寫入快取，避免使用者收不到信卻被鎖住 60 秒
  try {
    MailApp.sendEmail({
      to: email,
      subject: `【${SYS_NAM}】您的 Email 驗證碼`,
      htmlBody: htmlBody
    });
  } catch (err) {
    return responseJSON({ result: "error", error: "驗證信寄送失敗，請確認 Email 是否正確無誤。" });
  }

  cache.put(verifyCodeCacheKey(email), code, VERIFY_CODE_TTL_SECONDS);
  cache.put(verifyCooldownCacheKey(email), "1", VERIFY_CODE_COOLDOWN_SECONDS);

  return responseJSON({ result: "success", message: "驗證碼已寄出，請至信箱查收。" });
}

// ------------------------------------------------------------
// 提交陳情（需先驗證通過 Email 驗證碼）
// ------------------------------------------------------------

function handleSubmit(params, ss) {
  const email = normalizeEmail(params.email);
  const cache = CacheService.getScriptCache();
  const cachedCode = cache.get(verifyCodeCacheKey(email));

  if (!cachedCode) {
    return responseJSON({ result: "error", error: "驗證碼已過期或尚未取得，請重新發送驗證碼。" });
  }
  if (String(params.verifyCode || "").trim() !== cachedCode) {
    return responseJSON({ result: "error", error: "驗證碼不正確，請重新輸入。" });
  }

  // 驗證成功後立即清除，避免同一組驗證碼被重複使用
  cache.remove(verifyCodeCacheKey(email));
  cache.remove(verifyCooldownCacheKey(email));

  const sheet = ss.getSheetByName(PETITION_SHEET);
  const timestamp = new Date();
  const dateStr = Utilities.formatDate(timestamp, "GMT+8", "yyyyMMdd");
  const caseId = `CASE-${dateStr}-${Math.floor(Math.random() * 900) + 100}`;

  // 根據身分判斷個資
  const identity = params.identity; // "實名" 或 "匿名"
  const name = (identity === "實名") ? params.name : "（匿名者）";
  const studentId = (identity === "實名") ? params.studentId : "（匿名）";

  // 欄位順序：0時間, 1案號, 2姓名, 3學號, 4Email, 5匿名/實名, 6類別, 7主旨, 8內容, 9狀態, 10回覆, 11辦理人
  const newRow = [
    timestamp,
    caseId,
    sanitizeForExcel(name),
    sanitizeForExcel(studentId),
    sanitizeForExcel(email),
    identity,
    params.category,
    sanitizeForExcel(params.subject),
    sanitizeForExcel(params.content),
    "待處理",
    "",
    ""
  ];
  sheet.appendRow(newRow);

  // 受理通知信
  const htmlAcceptanceMessage = `
    <div style="font-family:'Microsoft JhengHei',sans-serif;color:#222;line-height:1.6;max-width:600px;">
      <h2 style="color:#111;border-bottom:2px solid #3b82f6;padding-bottom:10px;">案件已受理通知</h2>
      <p>同學您好：</p>
      <p>我們已收到您的陳情，案件已進入系統排隊處理中。</p>

      <div style="background-color:#f7f7f8;padding:15px;border-radius:8px;border:1px solid #e2e4e9;margin:20px 0;">
        <p style="margin:5px 0;"><strong>案號：</strong> <span style="font-size:1.1em;">${caseId}</span></p>
        <p style="margin:5px 0;"><strong>來信主旨：</strong> ${params.subject}</p>
        <hr style="border:0;border-top:1px solid #ccc;margin:10px 0;">
        <p style="margin:5px 0;"><strong>來信內容：</strong></p>
        <p style="margin:5px 0;white-space:pre-wrap;">${params.content}</p>
      </div>

      <p>您可以隨時透過系統查詢進度。若有進一步處理結果，系統將會再次發信通知您。</p>

      <hr style="border:0;border-top:2px solid #eee;margin:20px 0;">

      <p style="font-size:14px;">
        敬祝 萬事如意 身體健康<br><br>
        <strong>本郵件是由系統自動寄發，請勿直接回覆。</strong><br>
        <strong>${DEP_NAM} 敬上</strong>
      </p>
    </div>
  `;

  MailApp.sendEmail({
    to: email,
    subject: `【${SYS_NAM}】案件已受理 - ${caseId}`,
    htmlBody: htmlAcceptanceMessage
  });

  if (NOTIFY_EMAIL) {
    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      subject: `【${SYS_NAM}】有新案件 - ${caseId}`,
      htmlBody: htmlAcceptanceMessage
    });
  }

  sendToDiscord(caseId, params.subject, params.category, params.content);
  return responseJSON({ result: "success", caseId: caseId });
}

function sendToDiscord(id, subject, cat, content) {
  if (!DISCORD_WEBHOOK) return; // 未設定 Webhook 則略過通知

  const safeContent = (content || "無內容").toString();

  const payload = {
    "embeds": [{
      "title": "收到新陳情案件",
      "color": 3980406,
      "fields": [
        { "name": "案件編號", "value": id || "未知", "inline": true },
        { "name": "項目類別", "value": cat || "未分類", "inline": true },
        { "name": "案件主旨", "value": subject || "無主旨" },
        { "name": "內容簡述", "value": safeContent.substring(0, 500) }
      ],
      "timestamp": new Date().toISOString()
    }]
  };

  try {
    UrlFetchApp.fetch(DISCORD_WEBHOOK, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (e) {
    console.error("Discord 發送失敗: " + e.toString());
  }
}

const PETITION_SHEET = "Petitions";
const STAFF_SHEET = "Staff";
const DISCORD_WEBHOOK = "Discrod Webhook 網址"; 
const RECAPTCHA_SECRET = "RECAPTCHA Secret key";

// 輔助函式：檢查管理員身分
function verifyStaff(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const staffData = ss.getSheetByName(STAFF_SHEET).getDataRange().getValues();
  for (let i = 1; i < staffData.length; i++) {
    // 同時檢查帳號與密碼
    if (staffData[i][0] == params.account && staffData[i][1] == params.password) {
      return { success: true, name: staffData[i][2], position: staffData[i][3] };
    }
  }
  return { success: false };
}

// 輔助函式：驗證 reCAPTCHA
function verifyCaptcha(token) {
  if (!token) return false;
  const url = "https://www.google.com/recaptcha/api/siteverify";
  const response = UrlFetchApp.fetch(url, {
    method: "post",
    payload: {
      secret: RECAPTCHA_SECRET,
      response: token
    }
  });
  const result = JSON.parse(response.getContentText());
  return result.success;
}

function sanitizeForExcel(text) {
  if (typeof text !== 'string') return text;
  // 檢查是否以常見的公式觸發符號開頭
  const forbiddenChars = ['=', '+', '-', '@'];
  if (forbiddenChars.includes(text.charAt(0))) {
    return "'" + text; // 在前面加上單引號，強迫 Excel 視為純文字
  }
  return text;
}

function doPost(e) {
  const params = e.parameter;
  const action = params.action;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // --- 1. 提交陳情 ---
  if (action === "submit") {
    if (!verifyCaptcha(params['g-recaptcha-response'])) {
      return responseJSON({ result: "error", error: "機器人驗證失敗，請重試。" });
    }

    const sheet = ss.getSheetByName(PETITION_SHEET);
    const timestamp = new Date();
    const dateStr = Utilities.formatDate(timestamp, "GMT+8", "yyyyMMdd");
    const caseId = `CASE-${dateStr}-${Math.floor(Math.random() * 900) + 100}`;
    
    // 根據身分判斷個資
    const identity = params.identity; // "實名" 或 "匿名"
    const name = (identity === "實名") ? params.name : "（匿名者）";
    const studentId = (identity === "實名") ? params.studentId : "（匿名）";

    // 欄位順序更新：0時間, 1案號, 2姓名, 3學號, 4Email, 5匿名/實名, 6類別, 7主旨, 8內容, 9狀態, 10回覆, 11辦理人
    const newRow = [
      timestamp, 
      caseId, 
      sanitizeForExcel(name), 
      sanitizeForExcel(studentId), 
      sanitizeForExcel(params.email), 
      identity, 
      params.category, 
      sanitizeForExcel(params.subject),
      sanitizeForExcel(params.content), 
      "待處理", 
      "", 
      ""
    ];
    sheet.appendRow(newRow);

    // 發送 Email 通知 (功能 1)
    // 製作受理通知的 HTML 內容
    const htmlAcceptanceMessage = `
      <div style="font-family: 'Microsoft JhengHei', sans-serif; color: #222; line-height: 1.6; max-width: 600px;">
        <h2 style="color: #000; border-bottom: 2px solid #fda755; padding-bottom: 10px;">✅ 案件已受理通知</h2>
        <p>同學您好：</p>
        <p>我們已收到您的陳情，案件已進入系統排隊處理中。</p>
        
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 8px; border: 1px solid #ddd; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>案號：</strong> <span style="font-size: 1.1em;">${caseId}</span></p>
          <p style="margin: 5px 0;"><strong>來信主旨：</strong> ${params.subject}</p>
          <hr style="border: 0; border-top: 1px solid #ccc; margin: 10px 0;">
          <p style="margin: 5px 0;"><strong>來信內容：</strong></p>
          <p style="margin: 5px 0; white-space: pre-wrap;">${params.content}</p>
        </div>

        <p>您可以隨時透過系統查詢進度。若有進一步處理結果，系統將會再次發信通知您。</p>
        
        <hr style="border: 0; border-top: 2px solid #eee; margin: 20px 0;">
        
        <p style="font-size: 14px;">
          敬祝 萬事如意 身體健康<br><br>
          <strong>本郵件是由系統自動寄發，請勿直接回覆。</strong><br>
          <strong>臺中高工學生會 敬上</strong>
        </p>
      </div>
    `;

    // 發送郵件
    MailApp.sendEmail({
      to: params.email,
      subject: `【臺中高工學生陳情系統】案件已受理 - ${caseId}`,
      htmlBody: htmlAcceptanceMessage
    });

    sendToDiscord(caseId, params.subject, params.category, params.content);
    return responseJSON({ result: "success", caseId: caseId });
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

  // --- 3. 取得案件資料 (管理員用) ---
  if (action === "getStaffData") {
    const auth = verifyStaff(params);
    if (!auth.success) return responseJSON({ result: "error", error: "權限不足" });

    const data = ss.getSheetByName(PETITION_SHEET).getDataRange().getValues();
    const cases = data.slice(1).map(row => ({
      time: row[0].toString(), 
      caseId: row[1], 
      name: row[2],      // 補上姓名
      studentId: row[3], // 補上學號
      email: row[4], 
      identity: row[5],  // 補上身份 (重要：前端需要這個判斷)
      category: row[6],  // 修正索引
      subject: row[7],   // 修正索引
      content: row[8],   // 修正索引
      status: row[9],    // 修正索引
      reply: row[10],    // 修正索引
      handlingStaff: row[11] // 修正索引
    })).reverse();
    return responseJSON({ result: "success", cases: cases });
  }

  // --- 4. 案件更新與回覆 (修正版) ---
  if (action === "staffUpdateStatus" || action === "staffReply") {
    const auth = verifyStaff(params);
    if (!auth.success) return responseJSON({ result: "error", error: "權限不足" });

    const sheet = ss.getSheetByName(PETITION_SHEET);
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === params.caseId) {
        // 1. 從試算表內直接讀取該案件原本的主旨與內容 (假設主旨第7欄, 內容第8欄，請依實際欄位調整)
        // data[i] 索引從 0 開始，所以第 7 欄是 data[i][6], 第 8 欄是 data[i][7]
        const originalSubject = data[i][7] || "無主旨"; 
        const originalContent = data[i][8] || "無內容";

        sheet.getRange(i + 1, 10).setValue(params.status);        // 原本是 9，修正為 10 (狀態欄)
        sheet.getRange(i + 1, 11).setValue(params.replyContent);  // 原本是 10，修正為 11 (回覆欄)
        sheet.getRange(i + 1, 12).setValue(params.handlingStaff); // 原本是 11，修正為 12 (辦理人欄)

        if (action === "staffReply") {
          // 使用 HTML 語法製作樣式

          // 製作結案回覆的 HTML 內容
          const htmlReplyMessage = `
            <div style="font-family: 'Microsoft JhengHei', sans-serif; color: #222; line-height: 1.6; max-width: 600px;">
              <h2 style="color: #000; border-bottom: 2px solid #5cb85c; padding-bottom: 10px;">✨ 案件處理完成通知</h2>
              <p>同學您好：</p>
              <p>您的陳情案件 (<strong>${params.caseId}</strong>) 已經辦理完畢，以下是詳細的回覆資訊：</p>
              
              <!-- 原始陳情內容區塊 -->
              <div style="background-color: #f9f9f9; padding: 15px; border-radius: 8px; border: 1px solid #ddd; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>案號：</strong> ${params.caseId}</p>
                <p style="margin: 5px 0;"><strong>來信主旨：</strong> ${originalSubject}</p>
                <hr style="border: 0; border-top: 1px solid #ccc; margin: 10px 0;">
                <p style="margin: 5px 0;"><strong>來信內容：</strong></p>
                <p style="margin: 5px 0; color: #444;">${originalContent.replace(/\n/g, '<br>')}</p>
              </div>

              <!-- 單位回覆內容區塊：使用醒目的紅框 -->
              <div style="background-color: #fff5f5; border-left: 5px solid #ff4d4f; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                <p style="margin: 0; font-weight: bold; color: #ff4d4f; font-size: 1.1em;">📢 處理單位回覆內容：</p>
                <p style="margin: 10px 0 0 0; color: #000; font-weight: 500;">
                  ${escapeHtml(params.replyContent).replace(/\n/g, '<br>')}
                </p>
              </div>
              
              <hr style="border: 0; border-top: 2px solid #eee; margin: 20px 0;">
              
              <p style="font-size: 14px;">
                感謝您的熱忱參與，若對結果有任何疑問，歡迎再次提出。 <br>
                敬祝 萬事如意 身體健康<br><br>
                <strong>本郵件是由系統自動寄發，請勿直接回覆。</strong><br>
                <strong>臺中高工學生會 敬啟</strong>
              </p>
            </div>
          `;

          MailApp.sendEmail({
            to: data[i][4],
            subject: `【臺中高工學生陳情系統】案件回覆 - ${params.caseId}`,
            htmlBody: htmlReplyMessage
          });
        }
        return responseJSON({ result: "success" });
      }
    }
  }
  
  // --- 5. 案件查詢 (學生用) ---
  if (action === "inquiry") {
    const data = ss.getSheetByName(PETITION_SHEET).getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      // 假設 Email 在第 4 欄 (Index 4)，請對照你的試算表結構
      if (data[i][1] === params.inquiryCaseId && data[i][4] === params.inquiryEmail) {
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
}


function sendToDiscord(id, subject, cat, content) {
  // --- 修正點：防呆處理 ---
  // 如果 content 是空的，就給它一個預設值 "無內容"，避免 substring 報錯
  var safeContent = (content || "無內容").toString();
  
  const payload = {
    "embeds": [{
      "title": "🆕 收到新陳情案件",
      "color": 16623445,
      "fields": [
        { "name": "案件編號", "value": id || "未知", "inline": true },
        { "name": "項目類別", "value": cat || "未分類", "inline": true },
        { "name": "案件主旨", "value": subject || "無主旨" },
        { "name": "內容簡述", "value": safeContent.substring(0, 500) } // 現在不會報錯了
      ],
      "timestamp": new Date().toISOString()
    }]
  };

  try {
    UrlFetchApp.fetch(DISCORD_WEBHOOK, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload)
    });
  } catch (e) {
    console.error("Discord 發送失敗: " + e.toString());
  }
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
/**
 * Solution Studio — homepage inquiry → Google Sheet
 *
 * ONE-TIME SETUP (about 2 minutes)
 * 1. Create a Google Sheet: https://sheets.new
 *    Name it something like "Solution Studio Inquiries"
 * 2. Extensions → Apps Script
 * 3. Delete any placeholder code, paste THIS entire file, Save
 * 4. Deploy → New deployment → type: Web app
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 5. Authorize, then copy the Web App URL
 * 6. Paste that URL into index.html as INQUIRY_ENDPOINT
 *    (search for: const INQUIRY_ENDPOINT)
 *
 * Optional: set a Sheet notification rule, or rely on the email below.
 */

const SHEET_NAME = 'Inquiries';
const NOTIFY_EMAIL = 'hello@solutionstud.io';

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    const data = JSON.parse(raw);

    // Honeypot — bots fill hidden "website" fields
    if (data.website) {
      return json_({ ok: true, ignored: true });
    }

    const name = String(data.name || '').trim();
    const email = String(data.email || '').trim();
    if (!name || !email) {
      return json_({ ok: false, error: 'Name and email are required.' }, 400);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow([
        'Timestamp',
        'Name',
        'Company',
        'Email',
        'Timing',
        'Engagement',
        'Message',
        'Page URL',
        'User Agent'
      ]);
      sheet.setFrozenRows(1);
    }

    const row = [
      new Date(),
      name,
      String(data.company || '').trim(),
      email,
      String(data.timing || '').trim(),
      String(data.engagement || '').trim(),
      String(data.message || '').trim(),
      String(data.page || '').trim(),
      String(data.userAgent || '').trim()
    ];
    sheet.appendRow(row);

    const subject = 'New inquiry — ' + (String(data.company || '').trim() || name);
    const body = [
      'New project inquiry from solutionstud.io',
      '',
      'Name: ' + name,
      'Company: ' + (data.company || ''),
      'Email: ' + email,
      'Timing: ' + (data.timing || ''),
      'Engagement: ' + (data.engagement || ''),
      '',
      (data.message || '(no message)'),
      '',
      'Page: ' + (data.page || '')
    ].join('\n');

    try {
      MailApp.sendEmail({
        to: NOTIFY_EMAIL,
        replyTo: email,
        subject: subject,
        body: body
      });
    } catch (mailErr) {
      // Sheet write succeeded; email is best-effort
      console.error('MailApp failed', mailErr);
    }

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) }, 500);
  }
}

function doGet() {
  return ContentService
    .createTextOutput('Solution Studio inquiry endpoint is live.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

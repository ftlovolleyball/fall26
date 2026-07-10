// ─────────────────────────────────────────────────────────────────────────────
// FTLO APPS SCRIPT: FALL 2026 CLINIC APPLICATIONS
// ─────────────────────────────────────────────────────────────────────────────
//
// SETUP (do this once):
//
//  1. This script targets your sheet directly by ID (SHEET_ID below), so it
//     works whether it's pasted into Extensions > Apps Script on the sheet
//     itself, or created as its own separate project at script.google.com.
//  2. Paste this entire file into the Apps Script editor (replacing whatever
//     is already there).
//  3. Click Deploy > New deployment (or, if you already have a deployment,
//     Deploy > Manage deployments > pencil icon > Version: New version, to
//     update it without changing the URL).
//       - Select type: "Web app"
//       - Description: anything, e.g. "Fall 2026 applications"
//       - Execute as: Me
//       - Who has access: Anyone
//     Click Deploy, and authorize the script when prompted (it needs permission
//     to edit this spreadsheet and send email as you).
//  4. Copy the "Web app URL" you're given (ends in /exec) and send it back,
//     it needs to be pasted into index.html as APPS_SCRIPT_URL.
//
// WHAT THIS DOES:
//  - doPost(e): runs when someone submits the application form. Writes a row to
//    the "Applications" tab (created automatically if it doesn't exist yet) and
//    emails the applicant a confirmation.
//  - doGet(e): handles the "already applied?" duplicate-email check the form
//    does before letting someone continue past Step 1.
//
// TIMESTAMPS:
//  The "Timestamp" column is generated HERE, on Google's servers, using
//  Utilities.formatDate(), NOT taken from the applicant's browser or device.
//  This means it's always in the same format and timezone (America/Vancouver)
//  no matter what device, browser, or clock the applicant's phone/computer has:
//  YYYY-MM-DD HH:MM:SS, 24-hour time.
//
// ─────────────────────────────────────────────────────────────────────────────

var SHEET_ID = '1QAXakjHOKh3pvCH7IXMXExRSrjYfWWnR0xcd-80zAkc'; // "2026 Fall Clinic Programs"
var SHEET_NAME = 'Applications';
var TIMEZONE = 'America/Vancouver';

function doPost(e) {
  var data = JSON.parse(e.postData.contents);

  // Honeypot: real applicants never see or fill this field. If it has a
  // value, this is a bot. Pretend it worked, but don't write a row or
  // send an email.
  if (data.website) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
                          .setMimeType(ContentService.MimeType.JSON);
  }

  var ss = SpreadsheetApp.openById(SHEET_ID);
  handleApplicationSubmit(data, ss);
  return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
                        .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var action = e.parameter.action;

  if (action === 'checkEmail') {
    var email = (e.parameter.email || '').toLowerCase().trim();
    var exists = emailAlreadyApplied(email);
    return ContentService.createTextOutput(JSON.stringify({ exists: exists }))
                          .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
                        .setMimeType(ContentService.MimeType.JSON);
}

// ── Writes the application row and sends the confirmation email ──────────────
function handleApplicationSubmit(data, ss) {
  var sheet = ss.getSheetByName(SHEET_NAME);

  // Create the tab if it doesn't exist yet
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  // Add the header row if the tab is empty (covers both a brand-new tab and
  // one you already created by hand, like the current "Applications" tab)
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Timestamp',
      'First Name', 'Last Name', 'Email', 'Phone',
      'City', 'Gender',
      'Recent FTLO Program(s)',
      'Programs Applied For',
      'Program Priority',
      'Conduct Agreed',
      'Medical / Training Notes',
      'Heard From', 'Heard Details',
      'Comments',
      'Payment Invite Sent'   // left blank, fill in manually once you invite them to pay
    ]);
  }

  var serverTimestamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');

  sheet.appendRow([
    serverTimestamp,
    data.firstName    || '',
    data.lastName     || '',
    data.email        || '',
    data.phone        || '',
    data.city         || '',
    data.gender       || '',
    data.recentPrograms || '',
    data.programs     || '',
    data.programPriority || '',
    data.agreeConduct || '',
    data.medical      || '',
    data.heardFrom    || '',
    data.heardDetails || '',
    data.comments     || '',
    ''  // Payment Invite Sent, blank until you send it
  ]);

  if (data.email) {
    sendApplicationConfirmationEmail(data, serverTimestamp);
  }
}

// ── Checks the Applications sheet for a matching email (case-insensitive) ────
function emailAlreadyApplied(email) {
  if (!email) return false;
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return false;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  // Email is column D (4th column), see header row above
  var emails = sheet.getRange(2, 4, lastRow - 1, 1).getValues();
  for (var i = 0; i < emails.length; i++) {
    if (String(emails[i][0]).toLowerCase().trim() === email) return true;
  }
  return false;
}

function sendApplicationConfirmationEmail(data, serverTimestamp) {
  var CC = 'info@ftlovolleyball.ca';

  var fullName = ((data.firstName || '') + ' ' + (data.lastName || '')).trim();
  var toEmail = data.email;

  var subject = 'FTLO 2026 Fall Clinics - Application Received';

  var html = [
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#222;">',

    '<div style="background:#1F4049;padding:24px 28px;border-radius:8px 8px 0 0;">',
      '<p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#F8BA44;">FTLO Volleyball</p>',
      '<h1 style="margin:0;font-size:22px;line-height:1.25;color:#FFF9F5;">Fall 2026 Clinic Program<br>Application Received</h1>',
    '</div>',

    '<div style="background:#fff3e0;border-left:5px solid #e65100;padding:22px 28px;">',
      '<p style="margin:0;font-size:15px;line-height:1.65;color:#333;">',
        'Hi <strong>' + fullName + '</strong>,<br><br>',
        'Thanks for applying to FTLO\'s Fall 2026 clinic programs! ',
        'This confirms we received your application, but it does not confirm your registered training spot. ',
        'FTLO will review applications and follow up by email with payment invite instructions if a spot is available.',
      '</p>',
      '<p style="margin:12px 0 0;font-size:12.5px;font-style:italic;line-height:1.6;color:#7a5a3a;">',
        'FTLO clinics are built around a positive and community-driven training culture. Our coaches and admin team do our best, within our limits, to create enjoyable training environments with a healthy mix of returning and new FTLO participants. If you do not receive an invite immediately, we may later contact you via text/WhatsApp. We are hoping to train with you very soon!',
      '</p>',
    '</div>',

    '<div style="background:#f7f7f7;border:1px solid #e0e0e0;border-top:none;padding:22px 28px;">',
      '<p style="margin:0 0 14px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#1F4049;">Application Summary</p>',

      _emailRow('Name',            fullName          || 'N/A'),
      _emailRow('Email',           data.email        || 'N/A'),
      _emailRow('Phone',           data.phone        || 'N/A'),
      _emailRow('City',            data.city         || 'N/A'),
      (data.recentPrograms ? _emailRow('Recent FTLO Program(s)', data.recentPrograms) : ''),

      '<div style="border-top:1px solid #ddd;margin:12px 0;"></div>',

      _emailRow('Programs Applied For', (data.programs || 'N/A').split(' | ').join('<br>')),
      (data.programPriority ? _emailRow('Program Priority', data.programPriority) : ''),

      (data.medical ? _emailRow('Medical / Training Notes', data.medical) : ''),
      (data.comments ? _emailRow('Comments', data.comments) : ''),

      '<div style="border-top:1px solid #ddd;margin:12px 0;"></div>',
      _emailRow('Submitted', serverTimestamp + ' (Pacific time)'),
    '</div>',

    '<div style="background:#eef4fb;border:1px solid #b8cdd2;border-top:none;padding:18px 28px;">',
      '<p style="margin:0;font-size:13.5px;line-height:1.6;color:#333;">',
        '<strong>Need to modify your application, or have questions?</strong><br>',
        'Email <a href="mailto:operations@ftlovolleyball.ca" style="color:#1F4049;font-weight:700;">operations@ftlovolleyball.ca</a>.',
      '</p>',
    '</div>',

    '<div style="background:#fff;border:1px solid #e0e0e0;border-top:none;padding:20px 28px;text-align:center;">',
      '<a href="https://www.instagram.com/ftlovolleyball/" target="_blank" style="display:inline-block;background:#1F4049;color:#F8BA44;font-weight:700;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;padding:11px 24px;border-radius:6px;text-decoration:none;">Follow @ftlovolleyball on Instagram</a>',
    '</div>',

    '<div style="background:#1F4049;padding:16px 28px;border-radius:0 0 8px 8px;text-align:center;">',
      '<p style="margin:0;font-size:12px;color:rgba(255,249,245,0.55);">',
        'FTLO Volleyball Association &middot; ',
        '<a href="https://www.ftlovolleyball.ca" style="color:#F8BA44;text-decoration:none;">ftlovolleyball.ca</a>',
      '</p>',
    '</div>',

    '</div>'
  ].join('');

  GmailApp.sendEmail(toEmail, subject, '', {
    htmlBody: html,
    cc: CC,
    name: 'FTLO Volleyball'
  });
}

// Helper: one labelled row in the summary block
function _emailRow(label, value) {
  return '<div style="display:flex;gap:8px;margin-bottom:8px;font-size:14px;line-height:1.5;">' +
    '<span style="min-width:170px;font-weight:700;color:#444;flex-shrink:0;">' + label + ':</span>' +
    '<span style="color:#222;">' + value + '</span>' +
    '</div>';
}

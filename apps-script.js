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
//  5. Select installReminderTrigger in the function dropdown at the top of
//     the editor and click Run once. This turns on the abandoned-application
//     reminder emails (see ABANDONED APPLICATION REMINDERS below). You'll be
//     asked to authorize the script again the first time - that's expected.
//
// WHAT THIS DOES:
//  - doPost(e): runs when someone submits the application form. Writes a row to
//    the "Applications" tab (created automatically if it doesn't exist yet) and
//    emails the applicant a confirmation.
//  - doGet(e): handles the "already applied?" duplicate-email check the form
//    does before letting someone continue past Step 1, and records when
//    someone starts an application (see below).
//
// ABANDONED APPLICATION REMINDERS:
//  When an applicant gets past Step 1 (Contact Info), the form pings this
//  script with their name/email, which gets logged to a separate "Started
//  Applications" tab (created automatically), with a Completed column left
//  blank. If/when that person actually submits, the Completed column on
//  their row is filled in immediately (see markApplicationCompleted()), so
//  the tab always shows current status at a glance - no need to wait on the
//  reminder trigger below to find out who's done. Every 6 hours, the
//  sendAbandonedApplicationReminders() trigger checks that tab for anyone who
//  started at least 48 hours ago and is still not marked Completed, and sends
//  them a one-time reminder email. This requires the one-time
//  installReminderTrigger() run described in step 5 above - simply pasting
//  the code is not enough, since Apps Script triggers aren't created by
//  deploying, only by running that setup function (or via the Triggers UI).
//
// UPGRADING AN EXISTING DEPLOYMENT TO ADD THE "Completed" COLUMN:
//  If you already had this script deployed with a "Started Applications" tab
//  before the Completed column existed, redeploying picks up the new column
//  automatically (see ensureStartedSheetSchema()) - no need to touch the
//  sheet by hand. But that only fills in Completed going forward; anyone
//  already sitting in that tab from before this update won't be checked
//  automatically. Right after redeploying, select backfillCompletedColumn in
//  the function dropdown and click Run once to fill in Completed for
//  everyone already in the tab. Safe to re-run any time.
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
var BACKUP_SHEET_NAME = 'backup'; // mirror of every submission; never edited by hand
var STARTED_SHEET_NAME = 'Started Applications'; // tracks who began but hasn't submitted, for the abandoned-application reminder
var REMINDER_DELAY_HOURS = 48;
var TIMEZONE = 'America/Vancouver';

// ── PROGRAM CATALOG ───────────────────────────────────────────────────────
// One entry per selectable time slot (matches the `data-code` / checkbox
// `value` pairs in index.html). Used to look up price + training dates for
// the confirmation email, and to resolve the applicant's priority codes
// back into full program details.
var PROGRAM_CATALOG = [
  { code: 'Tue B 6',    value: 'Tuesday BEG 6:00-7:45 PM',                   label: 'Tuesday · Beginner · 6:00–7:45 PM',                 price: '$295 GST Included', dates: '9 Tuesdays · Sep 15 – Nov 10 (ext. to Nov 24 if needed)',                                       column: 'Tue Beg',        shortLabel: 'Tue Beg 6-745' },
  { code: 'Tue B 745',  value: 'Tuesday BEG 7:45-9:30 PM',                   label: 'Tuesday · Beginner · 7:45–9:30 PM',                 price: '$295 GST Included', dates: '9 Tuesdays · Sep 15 – Nov 10 (ext. to Nov 24 if needed)',                                       column: 'Tue Beg',        shortLabel: 'Tue Beg 745-930' },
  { code: 'Wed B 6',    value: 'Wednesday BEG (Edmonds) 6:00-7:30 PM',       label: 'Wednesday · Beginner · 6:00–7:30 PM',               price: '$255 GST Included', dates: '9 Wednesdays · Sep 16 – Nov 25 (no clinic Sep 30 & Nov 11; ext. to Dec 9 if needed)',           column: 'Wed Beg',        shortLabel: 'Wed Beg 6-730' },
  { code: 'Wed B 730',  value: 'Wednesday BEG (Edmonds) 7:30-9:00 PM',       label: 'Wednesday · Beginner · 7:30–9:00 PM',               price: '$255 GST Included', dates: '9 Wednesdays · Sep 16 – Nov 25 (no clinic Sep 30 & Nov 11; ext. to Dec 9 if needed)',           column: 'Wed Beg',        shortLabel: 'Wed Beg 730-9' },
  { code: 'Tue FF 6',   value: 'Tuesday FF (Location TBD) 6:00-7:45 PM',     label: 'Tuesday · Foundation Focus · 6:00–7:45 PM',         price: '$295 GST Included', dates: '9 Tuesdays · Sep 15 – Nov 10 (ext. to Nov 24 if needed)',                                       column: 'Tue FF',         shortLabel: 'Tue FF 6-745' },
  { code: 'Tue FF 745', value: 'Tuesday FF (Location TBD) 7:45-9:30 PM',     label: 'Tuesday · Foundation Focus · 7:45–9:30 PM',         price: '$295 GST Included', dates: '9 Tuesdays · Sep 15 – Nov 10 (ext. to Nov 24 if needed)',                                       column: 'Tue FF',         shortLabel: 'Tue FF 745-930' },
  { code: 'Wed I 6',    value: 'Wednesday INT (Lochdale) 6:00-7:30 PM',      label: 'Wednesday · Intermediate · 6:00–7:30 PM',           price: '$255 GST Included', dates: '9 Wednesdays · Sep 16 – Nov 25 (no clinic Sep 30 & Nov 11; ext. to Dec 9 if needed)',           column: 'Wed Int',        shortLabel: 'Wed Int 6-730' },
  { code: 'Wed I 730',  value: 'Wednesday INT (Lochdale) 7:30-9:00 PM',      label: 'Wednesday · Intermediate · 7:30–9:00 PM',           price: '$255 GST Included', dates: '9 Wednesdays · Sep 16 – Nov 25 (no clinic Sep 30 & Nov 11; ext. to Dec 9 if needed)',           column: 'Wed Int',        shortLabel: 'Wed Int 730-9' },
  { code: 'Thu I 6',    value: 'Thursday INT (Lochdale) 6:00-7:30 PM',       label: 'Thursday · Intermediate · 6:00–7:30 PM',            price: '$255 GST Included', dates: '9 Thursdays · Sep 17 – Nov 12 (ext. to Nov 26 if needed)',                                     column: 'Thu Int',        shortLabel: 'Thu Int 6-730' },
  { code: 'Thu I 730',  value: 'Thursday INT (Lochdale) 7:30-9:00 PM',       label: 'Thursday · Intermediate · 7:30–9:00 PM',            price: '$255 GST Included', dates: '9 Thursdays · Sep 17 – Nov 12 (ext. to Nov 26 if needed)',                                     column: 'Thu Int',        shortLabel: 'Thu Int 730-9' },
  { code: 'Thu IW 6',   value: 'Thursday WOMENS INT (Richmond) 6:00-7:45 PM', label: 'Thursday · Women\'s Intermediate · 6:00–7:45 PM', price: '$295 GST Included', dates: '9 Thursdays · Sep 17 – Nov 12 (ext. to Nov 26 if needed)',                                     column: "Thu Women's Int", shortLabel: 'Thu Wmn Int 6-745' },
  { code: 'Thu IW 745', value: 'Thursday WOMENS INT (Richmond) 7:45-9:30 PM', label: 'Thursday · Women\'s Intermediate · 7:45–9:30 PM', price: '$295 GST Included', dates: '9 Thursdays · Sep 17 – Nov 12 (ext. to Nov 26 if needed)',                                     column: "Thu Women's Int", shortLabel: 'Thu Wmn Int 745-930' }
];

// The 6 sheet columns, one per program card, in the order they should appear.
var PROGRAM_COLUMNS = ['Tue Beg', 'Wed Beg', 'Tue FF', 'Wed Int', 'Thu Int', "Thu Women's Int"];

function doPost(e) {
  // Submitted either as a raw JSON body (older fetch/XHR path) or as a real
  // HTML form post with the JSON tucked into a hidden "payload" field (the
  // current path - a real form submission is far less likely to get silently
  // blocked by ad blockers/privacy extensions than a scripted fetch/XHR call,
  // since blocking normal form posts would break most of the web). Support
  // both so neither submission method is left behind.
  var raw = (e.postData && e.postData.contents) || (e.parameter && e.parameter.payload) || '{}';
  var data = JSON.parse(raw);

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

  if (action === 'markStarted') {
    var startedEmail = (e.parameter.email || '').toLowerCase().trim();
    markApplicationStarted(startedEmail, e.parameter.firstName || '', e.parameter.lastName || '');
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
                          .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
                        .setMimeType(ContentService.MimeType.JSON);
}

var HEADER_ROW = [
  'Timestamp',
  'First Name', 'Last Name', 'Email', 'Phone',
  'City', 'Gender',
  'Recent FTLO Program(s)',
  'Clinic Recommendation'    // Skipped / BEG / BEG/FF / FF/INT / INT / INT/INT(W) — from the Section 2 self-assessment quiz
].concat(PROGRAM_COLUMNS).concat([
  'Applicant Expressed Preference',
  'Invited Program',   // left blank, fill in manually once you decide which program to invite them to
  'Conduct Agreed',
  'Medical / Training Notes',
  'Heard From', 'Heard Details',
  'Comments',
  'Payment Invite Sent'   // left blank, fill in manually once you invite them to pay
]);

// ── Writes the application row (to both Applications and its Backup mirror)
//    and sends the confirmation email ────────────────────────────────────
function handleApplicationSubmit(data, ss) {
  var serverTimestamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');

  var row = [
    serverTimestamp,
    data.firstName    || '',
    data.lastName     || '',
    data.email        || '',
    data.phone        || '',
    data.city         || '',
    data.gender       || '',
    data.recentPrograms || '',
    data.clinicRecommendation || ''
  ].concat(buildProgramColumnValues(data)).concat([
    buildPreferenceCell(data),
    '', // Invited Program, blank until you fill it in manually
    data.agreeConduct || '',
    data.medical      || '',
    data.heardFrom    || '',
    data.heardDetails || '',
    data.comments     || '',
    ''  // Payment Invite Sent, blank until you send it
  ]);

  appendRowToSheet(ss, SHEET_NAME, row);
  appendRowToSheet(ss, BACKUP_SHEET_NAME, row);

  if (data.email) {
    markApplicationCompleted(ss, data.email, serverTimestamp);
    sendApplicationConfirmationEmail(data, serverTimestamp);
  }
}

// Appends a row to the named tab, creating the tab and/or header row first
// if needed (covers a brand-new tab and one you already created by hand).
function appendRowToSheet(ss, sheetName, row) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER_ROW);
  }
  sheet.appendRow(row);
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

// ── Adds the Completed column the first time this code runs against a
// Started Applications tab that predates it. A brand-new tab gets the
// current 6-column header outright. An existing tab (with real rows and an
// old 5-column "...Email, Reminder Sent" header) just gets a "Completed"
// header appended as a new 6th column - existing columns and their data
// are never touched or moved, so every row's existing Reminder Sent value
// stays exactly where it is; the new Completed cell is simply blank for
// rows that predate it, same as any other new column added to a sheet with
// existing rows. Safe to call every time - a no-op once already current.
function ensureStartedSheetSchema(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Started Timestamp', 'First Name', 'Last Name', 'Email', 'Reminder Sent', 'Completed']);
    return;
  }

  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (header[5] !== 'Completed') {
    sheet.getRange(1, 6).setValue('Completed');
  }
}

// ── Records that someone got past Contact Info, so a reminder can go out later
// if they never actually submit. Called once per applicant - if they've
// already been recorded (e.g. they navigated back and forward through Step 1
// again), this does nothing, so the original started time is preserved. ─────
function markApplicationStarted(email, firstName, lastName) {
  if (!email) return;
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(STARTED_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(STARTED_SHEET_NAME);
  }
  ensureStartedSheetSchema(sheet);

  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var emails = sheet.getRange(2, 4, lastRow - 1, 1).getValues();
    for (var i = 0; i < emails.length; i++) {
      if (String(emails[i][0]).toLowerCase().trim() === email) return;
    }
  }

  var serverTimestamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  sheet.appendRow([serverTimestamp, firstName || '', lastName || '', email, '', '']);
}

// ── Called right when someone submits (handleApplicationSubmit), so the
// Started Applications tab reflects completion immediately rather than
// waiting on the 6-hourly reminder trigger to notice. Finds their row by
// email and fills in the Completed column; does nothing if they don't have
// a Started Applications row (e.g. they submitted without the Step 1 ping
// ever firing). ───────────────────────────────────────────────────────────
function markApplicationCompleted(ss, email, completedTimestamp) {
  var normalizedEmail = String(email).toLowerCase().trim();
  if (!normalizedEmail) return;

  var sheet = ss.getSheetByName(STARTED_SHEET_NAME);
  if (!sheet) return;
  ensureStartedSheetSchema(sheet);

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var emails = sheet.getRange(2, 4, lastRow - 1, 1).getValues();
  for (var i = 0; i < emails.length; i++) {
    if (String(emails[i][0]).toLowerCase().trim() === normalizedEmail) {
      sheet.getRange(i + 2, 6).setValue(completedTimestamp);
      return; // markApplicationStarted dedupes, so only one row per email
    }
  }
}

// ── Time-driven (see installReminderTrigger() below): finds anyone who
// started an application at least REMINDER_DELAY_HOURS ago and never
// submitted, and sends them a one-time reminder. ─────────────────────────────
function sendAbandonedApplicationReminders() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(STARTED_SHEET_NAME);
  if (!sheet) return;
  ensureStartedSheetSchema(sheet);

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var rows = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  var now = new Date();

  for (var i = 0; i < rows.length; i++) {
    var startedAt = rows[i][0];
    var firstName = rows[i][1];
    var email = rows[i][3];
    var reminderSent = rows[i][4];
    var completed = rows[i][5];
    var rowNum = i + 2; // header row + 1-indexing

    if (completed || reminderSent) continue; // already handled
    if (!(startedAt instanceof Date) || !email) continue;

    var hoursElapsed = (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60);
    if (hoursElapsed < REMINDER_DELAY_HOURS) continue;

    // Completed should normally already be set by markApplicationCompleted()
    // at submit time; this is a fallback for rows from before that existed.
    if (emailAlreadyApplied(String(email).toLowerCase().trim())) {
      sheet.getRange(rowNum, 6).setValue('Yes (detected)');
      continue;
    }

    sendReminderEmail(email, firstName);
    sheet.getRange(rowNum, 5).setValue(Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss'));
  }
}

// ── ONE-TIME CLEANUP: run this once, manually, right after deploying the
// Completed column for the first time. Only markApplicationCompleted() (fired
// by new submissions) and the reminder trigger's 48-hour fallback check ever
// fill in Completed, so anyone who already had a Started Applications row
// before this deploy - including people who quietly finished their
// application days ago - would otherwise show blank Completed forever. This
// walks every existing row and fills in Completed for anyone who's actually
// in the Applications tab. Safe to re-run any time; it only ever fills in
// blank Completed cells, never overwrites one. ───────────────────────────────
function backfillCompletedColumn() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(STARTED_SHEET_NAME);
  if (!sheet) return;
  ensureStartedSheetSchema(sheet);

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var rows = sheet.getRange(2, 1, lastRow - 1, 6).getValues();

  for (var i = 0; i < rows.length; i++) {
    var email = rows[i][3];
    var completed = rows[i][5];
    var rowNum = i + 2;

    if (completed || !email) continue;

    if (emailAlreadyApplied(String(email).toLowerCase().trim())) {
      sheet.getRange(rowNum, 6).setValue('Yes (backfilled)');
    }
  }
}

// ── ONE-TIME SETUP: after deploying, select this function in the dropdown at
// the top of the Apps Script editor and click Run once. It installs a trigger
// that calls sendAbandonedApplicationReminders() every 6 hours. Safe to
// re-run - it clears any existing trigger for that function first, so you
// won't end up with duplicates. ───────────────────────────────────────────────
function installReminderTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendAbandonedApplicationReminders') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('sendAbandonedApplicationReminders')
    .timeBased()
    .everyHours(6)
    .create();
}

function sendReminderEmail(toEmail, firstName) {
  var subject = "Don't forget to finish your FTLO Fall Clinic application";
  var greetingName = firstName ? firstName : 'there';
  var formUrl = 'https://ftlovolleyball.github.io/fall26/';

  var html = [
    '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#222;">',

    '<div style="background:#1F4049;padding:22px 28px;border-radius:8px 8px 0 0;">',
      '<p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#F8BA44;">FTLO Volleyball</p>',
      '<h1 style="margin:0;font-size:19px;line-height:1.3;color:#FFF9F5;">Still want to join us this Fall?</h1>',
    '</div>',

    '<div style="background:#fff;border:1px solid #e0e0e0;border-top:none;padding:24px 28px;">',
      '<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#333;">',
        'Hi ' + greetingName + ',<br><br>',
        'We noticed you started an application for FTLO\'s Fall 2026 clinic programs but haven\'t submitted it yet.',
      '</p>',
      '<p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#333;">',
        'If you have any questions, just reply to this email or reach out to ',
        '<a href="mailto:info@ftlovolleyball.ca" style="color:#1F4049;font-weight:700;">info@ftlovolleyball.ca</a>. ',
        'Otherwise, we\'d love for you to complete your application as soon as possible so we can review it!',
      '</p>',
      '<div style="text-align:center;">',
        '<a href="' + formUrl + '" target="_blank" style="display:inline-block;background:#F8BA44;color:#1F4049;font-weight:800;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;padding:13px 28px;border-radius:6px;text-decoration:none;">Finish My Application</a>',
      '</div>',
    '</div>',

    '<div style="background:#1F4049;padding:14px 28px;border-radius:0 0 8px 8px;text-align:center;">',
      '<p style="margin:0;font-size:12px;color:rgba(255,249,245,0.55);">FTLO Volleyball Association &middot; <a href="https://www.ftlovolleyball.ca" style="color:#F8BA44;text-decoration:none;">ftlovolleyball.ca</a></p>',
    '</div>',

    '</div>'
  ].join('');

  GmailApp.sendEmail(toEmail, subject, '', {
    htmlBody: html,
    name: 'FTLO Volleyball'
  });
}

function sendApplicationConfirmationEmail(data, serverTimestamp) {
  var fullName = ((data.firstName || '') + ' ' + (data.lastName || '')).trim();
  var toEmail = data.email;

  var subject = "FTLO '26 Fall Clinics - " + fullName + ' Application Received';

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

      _emailRow('Programs Applied For (in order of preference)', buildProgramsHtml(data)),

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

  // No `cc` here on purpose: GmailApp.sendEmail() runs as the account that
  // authorized the deployment ("Execute as: Me" at Deploy time). Every email
  // it sends is automatically saved to that account's Sent folder, so
  // info@ftlovolleyball.ca gets a record without also getting an inbox
  // notification for every single application.
  GmailApp.sendEmail(toEmail, subject, '', {
    htmlBody: html,
    name: 'FTLO Volleyball'
  });
}

// ── Resolves the applicant's checked programs + priority codes into an
//    ordered (most- to least-preferred) list of { label, price, dates } ──
function getOrderedProgramEntries(data) {
  var appliedValues = (data.programs || '').split(' | ').filter(function (v) { return v; });
  var priorityCodes = (data.programPriority || '').split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s; });

  var byValue = {}, byCode = {};
  for (var i = 0; i < PROGRAM_CATALOG.length; i++) {
    byValue[PROGRAM_CATALOG[i].value] = PROGRAM_CATALOG[i];
    byCode[PROGRAM_CATALOG[i].code] = PROGRAM_CATALOG[i];
  }

  var ordered = [];
  var used = {};

  // Applicant's stated order of preference first
  for (var p = 0; p < priorityCodes.length; p++) {
    var entry = byCode[priorityCodes[p]];
    if (entry && appliedValues.indexOf(entry.value) !== -1 && !used[entry.value]) {
      ordered.push(entry);
      used[entry.value] = true;
    }
  }
  // Safety net: include any applied program the priority list didn't cover
  for (var a = 0; a < appliedValues.length; a++) {
    var val = appliedValues[a];
    if (used[val]) continue;
    ordered.push(byValue[val] || { label: val, price: '', dates: '' });
    used[val] = true;
  }
  return ordered;
}

// Builds the 6 program-card sheet columns (see PROGRAM_COLUMNS), each
// containing the short slot label(s) applied for in that card, e.g.
// "Tue Beg 6-745, Tue Beg 745-930" if both time slots were picked.
function buildProgramColumnValues(data) {
  var appliedValues = (data.programs || '').split(' | ').filter(function (v) { return v; });

  var byValue = {};
  for (var i = 0; i < PROGRAM_CATALOG.length; i++) byValue[PROGRAM_CATALOG[i].value] = PROGRAM_CATALOG[i];

  var byColumn = {};
  for (var c = 0; c < PROGRAM_COLUMNS.length; c++) byColumn[PROGRAM_COLUMNS[c]] = [];

  for (var a = 0; a < appliedValues.length; a++) {
    var entry = byValue[appliedValues[a]];
    if (entry) byColumn[entry.column].push(entry.shortLabel);
  }

  var out = [];
  for (var c2 = 0; c2 < PROGRAM_COLUMNS.length; c2++) out.push(byColumn[PROGRAM_COLUMNS[c2]].join(', '));
  return out;
}

// Builds the "Applicant Expressed Preference" sheet cell: short slot labels
// in the applicant's ranked order, e.g. "Wed Beg 6-730, Wed Beg 730-9, Tue FF 6-745".
function buildPreferenceCell(data) {
  var ordered = getOrderedProgramEntries(data);
  var labels = [];
  for (var i = 0; i < ordered.length; i++) labels.push(ordered[i].shortLabel || ordered[i].label);
  return labels.join(', ');
}

// Builds the "Programs Applied For" HTML block: numbered by preference,
// each with its price and training dates.
function buildProgramsHtml(data) {
  var ordered = getOrderedProgramEntries(data);
  if (ordered.length === 0) return 'N/A';

  var lines = [];
  for (var i = 0; i < ordered.length; i++) {
    var e = ordered[i];
    var priceStr = e.price ? ' &mdash; ' + e.price : '';
    var datesStr = e.dates ? '<br><span style="font-size:12.5px;color:#666;">' + e.dates + '</span>' : '';
    lines.push((i + 1) + '. ' + e.label + priceStr + datesStr);
  }
  return lines.join('<br><br>');
}

// Helper: one labelled row in the summary block
function _emailRow(label, value) {
  return '<div style="display:flex;gap:8px;margin-bottom:8px;font-size:14px;line-height:1.5;">' +
    '<span style="min-width:170px;font-weight:700;color:#444;flex-shrink:0;">' + label + ':</span>' +
    '<span style="color:#222;">' + value + '</span>' +
    '</div>';
}

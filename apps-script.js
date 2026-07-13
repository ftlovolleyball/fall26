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

// ── PROGRAM CATALOG ───────────────────────────────────────────────────────
// One entry per selectable time slot (matches the `data-code` / checkbox
// `value` pairs in index.html). Used to look up price + training dates for
// the confirmation email, and to resolve the applicant's priority codes
// back into full program details.
var PROGRAM_CATALOG = [
  { code: 'Tue B 6',    value: 'Tuesday BEG 6:00-7:45 PM',                   label: 'Tuesday · Beginner · 6:00–7:45 PM',                 price: '$295 GST Included', dates: '9 Tuesdays · Sep 15 – Nov 10 (ext. to Nov 24 if needed)' },
  { code: 'Tue B 745',  value: 'Tuesday BEG 7:45-9:30 PM',                   label: 'Tuesday · Beginner · 7:45–9:30 PM',                 price: '$295 GST Included', dates: '9 Tuesdays · Sep 15 – Nov 10 (ext. to Nov 24 if needed)' },
  { code: 'Wed B 6',    value: 'Wednesday BEG (Edmonds) 6:00-7:30 PM',       label: 'Wednesday · Beginner · 6:00–7:30 PM',               price: '$255 GST Included', dates: '9 Wednesdays · Sep 16 – Nov 25 (no clinic Sep 30 & Nov 11; ext. to Dec 9 if needed)' },
  { code: 'Wed B 730',  value: 'Wednesday BEG (Edmonds) 7:30-9:00 PM',       label: 'Wednesday · Beginner · 7:30–9:00 PM',               price: '$255 GST Included', dates: '9 Wednesdays · Sep 16 – Nov 25 (no clinic Sep 30 & Nov 11; ext. to Dec 9 if needed)' },
  { code: 'Tue FF 6',   value: 'Tuesday FF (Location TBD) 6:00-7:45 PM',     label: 'Tuesday · Foundation Focus · 6:00–7:45 PM',         price: '$295 GST Included', dates: '9 Tuesdays · Sep 15 – Nov 10 (ext. to Nov 24 if needed)' },
  { code: 'Tue FF 745', value: 'Tuesday FF (Location TBD) 7:45-9:30 PM',     label: 'Tuesday · Foundation Focus · 7:45–9:30 PM',         price: '$295 GST Included', dates: '9 Tuesdays · Sep 15 – Nov 10 (ext. to Nov 24 if needed)' },
  { code: 'Wed I 6',    value: 'Wednesday INT (Lochdale) 6:00-7:30 PM',      label: 'Wednesday · Intermediate · 6:00–7:30 PM',           price: '$255 GST Included', dates: '9 Wednesdays · Sep 16 – Nov 25 (no clinic Sep 30 & Nov 11; ext. to Dec 9 if needed)' },
  { code: 'Wed I 730',  value: 'Wednesday INT (Lochdale) 7:30-9:00 PM',      label: 'Wednesday · Intermediate · 7:30–9:00 PM',           price: '$255 GST Included', dates: '9 Wednesdays · Sep 16 – Nov 25 (no clinic Sep 30 & Nov 11; ext. to Dec 9 if needed)' },
  { code: 'Thu I 6',    value: 'Thursday INT (Lochdale) 6:00-7:30 PM',       label: 'Thursday · Intermediate · 6:00–7:30 PM',            price: '$255 GST Included', dates: '9 Thursdays · Sep 17 – Nov 12 (ext. to Nov 26 if needed)' },
  { code: 'Thu I 730',  value: 'Thursday INT (Lochdale) 7:30-9:00 PM',       label: 'Thursday · Intermediate · 7:30–9:00 PM',            price: '$255 GST Included', dates: '9 Thursdays · Sep 17 – Nov 12 (ext. to Nov 26 if needed)' },
  { code: 'Thu IW 6',   value: 'Thursday WOMENS INT (Richmond) 6:00-7:45 PM', label: 'Thursday · Women\'s Intermediate · 6:00–7:45 PM', price: '$295 GST Included', dates: '9 Thursdays · Sep 17 – Nov 12 (ext. to Nov 26 if needed)' },
  { code: 'Thu IW 745', value: 'Thursday WOMENS INT (Richmond) 7:45-9:30 PM', label: 'Thursday · Women\'s Intermediate · 7:45–9:30 PM', price: '$295 GST Included', dates: '9 Thursdays · Sep 17 – Nov 12 (ext. to Nov 26 if needed)' }
];

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
      'Clinic Recommendation',   // Skipped / BEG / BEG/FF / FF/INT / INT / INT/INT(W) — from the Section 2 self-assessment quiz
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
    data.clinicRecommendation || '',
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

# FTLO Fall 2026 Clinic Program Application

Static registration/application page for FTLO Volleyball's Fall 2026 clinics, hosted via GitHub Pages.

## Status

- [x] Application form built (`index.html`): Contact → Programs → Conduct & Submit
- [x] Apps Script written (`apps-script.js`) and deployed, writes to the "Applications" tab of
      "2026 Fall Clinic Programs" and emails a confirmation
- [x] `index.html` is wired up to the deployed Apps Script URL
- [x] GitHub Pages enabled: https://ftlovolleyball.github.io/fall26/
- [x] Hero background photo in place (`images/hero-photo.jpg`)
- [ ] Exact facility addresses not yet filled in (marked `[exact address to be added]` in Step 2)
- [ ] Program pricing not yet finalized (not shown on the form)
- [ ] `images/logo.svg` is still a placeholder. Replace whenever you have a real logo file
      (see "Replacing the placeholder images" below)

## The Google Apps Script

`apps-script.js` in this repo is not itself run by GitHub. It's a copy of the code that's pasted
into a Google Apps Script project and deployed as a web app. It targets the "2026 Fall Clinic
Programs" sheet directly by ID (`SHEET_ID` near the top of the file), so it works whether the
script lives inside the sheet (Extensions → Apps Script) or as its own separate project at
script.google.com. Full setup instructions are in the comment at the top of that file.

If you ever edit `apps-script.js` again, the live copy in Google needs to be updated too: paste
the new version into the Apps Script editor, then **Deploy → Manage deployments → pencil icon →
Version: New version → Deploy** (this keeps the same URL; a brand new deployment would get a
new URL and break the link from `index.html`).

The "Timestamp" column this script writes is generated on Google's servers (not the applicant's
device), formatted as `YYYY-MM-DD HH:MM:SS` in Pacific time, so it's consistent no matter what
browser, phone, or clock the applicant used to submit the form.

## Replacing images

`images/hero-photo.jpg` is the hero section's background photo (behind the headline text), with
a dark overlay and text shadow already applied so the text stays readable over any photo. To
swap it for a different photo:
1. On github.com, open the `images` folder in this repo and click "Add file → Upload files".
2. Upload your real photo, keeping its real file extension (e.g. `hero-2026.jpg`).
3. Tell Claude the new filename. It's a one-line edit in `index.html` to point to it, then the
   old `hero-photo.jpg` can be deleted.

`images/indoor-coaching-collage.jpg` was also uploaded but isn't used anywhere on the page yet.

`images/logo.svg` (header logo) is still a placeholder. Swap it the same way, or tell Claude the
new filename.

## How this differs from the Summer 2026 site

This is an **application**, not a paid registration. There is no payment step. Applicants
select the programs they're interested in, and FTLO follows up later by email (via Brevo/CRM)
with a payment invite once a spot is confirmed.

## Flagged for review

See the `TODO` comment near the top of Section 3 (Conduct & Submit) in `index.html`. Some
policy text was carried over from the Summer registration page and may need edits (e.g. a
T-shirt refund charge that assumes a perk Fall clinics may not include).

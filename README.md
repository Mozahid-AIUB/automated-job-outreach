# Job Emailing Automation

Google Sheets driven automation for:

- Job application emails
- Service outreach emails

## How it works

1. Add rows in Google Sheets.
2. Mark each row with `status = pending`.
3. Run the script in `preview` or `send` mode.
4. The script reads pending rows, prepares personalized emails, sends them through Gmail, and updates the sheet with `sent`, `failed`, or `skipped`.

## Required setup

### 1. Gmail app passwords

Create an App Password for each Gmail account:

- `JOB_GMAIL_USER`
- `SERVICE_GMAIL_USER`

### 2. Google Sheets service account

Create a Google Cloud service account and enable the Google Sheets API.
Share the target Google Sheet with the service account email.

Set:

- `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` or use the downloaded JSON file in the project root
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SHEETS_ID`

### 3. Sheet tabs

Create two tabs:

- `job_applications`
- `service_outreach`

You can rename them, but then update `.env`.

## Suggested columns

### `job_applications`

Minimum columns:

`company_name`, `recipient_email`, `website`, `status`

Optional columns:

`job_title`, `recipient_name`, `job_link`, `career_page`, `job_post`, `application_mode`, `location`, `custom_note`, `resume_link`, `resume_path`, `last_message`, `last_run_at`, `found_email`, `source_page`

If you provide a `website`, the script tries to:

- find careers or jobs pages
- collect likely job openings
- pick one likely opening
- detect a public email from the website

If you also provide `career_page` and `job_post`, the AI prompt uses them to create a more personalized application email.

### `service_outreach`

`business_name`, `recipient_email`, `recipient_name`, `industry`, `country`, `website`, `pain_point`, `service_offer`, `outreach_type`, `custom_note`, `status`, `last_message`, `last_run_at`, `found_email`, `source_page`

## Commands

Preview only:

```bash
npm run preview
```

Send emails:

```bash
npm run send
```

Launch the local dashboard:

```bash
npm run ui
```

Then open `http://localhost:3030`.

## Frontend structure

The dashboard frontend is now organized like this:

```text
public/
  index.html
  services.html
  assets/
    css/
      main.css
      animations.css
    js/
      app.js
      animations.js
```

- `index.html` is the main job application page
- `services.html` is the dedicated service outreach page
- `assets/css/main.css` holds the main visual layout and component styles
- `assets/css/animations.css` holds motion and reveal effects
- `assets/js/app.js` holds dashboard logic, form actions, preview, filters, and stats
- `assets/js/animations.js` holds reusable page animation behavior

## Notes

- Use low sending volume at first.
- Keep `status` as `pending` for new rows.
- The script writes a log file in `logs/`.
- Website scanning is best-effort. Some company sites block bots or hide jobs behind forms, so not every site will produce openings automatically.
- If `YOUR_CV_FILE_PATH` is set, job emails attach your CV automatically.

Projectটা দেখে যা বুঝলাম, এটা একটা Node.js + Express based email automation tool. Main idea হলো Google Sheets-এ job application আর service outreach rows রাখা হয়, তারপর app ওই pending rows পড়ে company website scan করে, AI দিয়ে personalized email draft বানায়, Gmail দিয়ে send/preview করে, আর status আবার sheet-এ update করে।
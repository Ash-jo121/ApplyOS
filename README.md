# ApplyOS Job Radar

ApplyOS watches a referral-first list of 18 companies for frontend roles aligned to Ashish's profile. It scans official career portals every six hours, scores jobs with transparent rules, remembers what it has already seen, and can send only new matches by email and WhatsApp.

It does not apply to jobs, upload a resume, or mutate resume content.

## What it watches

It watches a set of prospective companies. The source adapters use official Workday, Greenhouse, Lever, Oracle Recruiting, or company-hosted pages. A source failure is isolated and shown on the dashboard without stopping the remaining companies.

## Matching profile

- 4 years of frontend engineering experience
- React, TypeScript, JavaScript, and Angular
- UI architecture, component libraries, and design systems
- rendering and bundle performance
- accessibility and cross-browser delivery
- Redux, REST, WebSocket, Jest, React Testing Library, Webpack, and Vite
- India or India-compatible remote roles

Internships, engineering management, staff/principal/architect, mobile-only, QA, backend-only, and clearly 7+ year roles are excluded.

## Run locally

```bash
npm install
npm test
npm run build
npm run scan
npm run dev
```

The dashboard is available at `http://localhost:4173`.

The first scan is a silent baseline. Later scans mark unseen roles as new. To send notifications while scanning:

```bash
npm run scan:notify
```

## Notification secrets

Configure these as GitHub Actions repository secrets. Scanning and the dashboard continue to work if notification secrets are absent.

### Email via Gmail

- `GMAIL_USER` — the Gmail address that sends the alerts
- `GMAIL_APP_PASSWORD` — a Google App Password, not the account password
- `ALERT_EMAIL_TO` — optional; defaults to `GMAIL_USER`

Enable 2-Step Verification on the Google account, create an App Password, and save the generated 16-character password without spaces. Gmail SMTP does not require a custom domain.

## LinkedIn and Instahyre discovery

Official company career portals remain the primary sources. ApplyOS can also import job-alert emails from LinkedIn and Instahyre without scraping either service or storing account cookies.

1. On LinkedIn, create daily email job alerts for the target companies and frontend/React roles in India. LinkedIn supports up to 20 alerts.
2. On Instahyre, complete the candidate profile and job preferences and enable matching-job emails.
3. Add the GitHub Actions repository secret `EMAIL_ALERT_IMPORT_ENABLED` with value `true`.
4. Optionally add the repository variable `EMAIL_ALERT_LOOKBACK_DAYS` (default `7`, maximum `30`).

The importer connects to the same Gmail account using IMAP and the existing `GMAIL_USER` and `GMAIL_APP_PASSWORD`. It searches only recent messages sent from `linkedin.com` or `instahyre.com`, extracts target-company job links, applies the normal profile matcher, and deduplicates them behind official career-portal results.

### WhatsApp via Meta Cloud API

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_TO` — recipient in international format, digits only
- `WHATSAPP_TEMPLATE_NAME` — recommended for proactive notifications outside the 24-hour messaging window
- `WHATSAPP_TEMPLATE_LANGUAGE` — optional, defaults to `en_US`

The template body receives four text variables: match count, first company, first title, and first official job URL. Without a template name, ApplyOS sends a regular text message, which only works inside Meta's open customer-service window.

## Scheduling and deployment

`.github/workflows/job-radar.yml` runs at minute 17 every six hours and on manual dispatch. It verifies the project, scans companies, commits the deduplication state and latest dashboard data, and deploys `public/` to GitHub Pages.

The dashboard never contains notification tokens or recipient details.

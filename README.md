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

### Email via Resend

- `RESEND_API_KEY`
- `ALERT_EMAIL_FROM` — a sender on a verified Resend domain
- `ALERT_EMAIL_TO`

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

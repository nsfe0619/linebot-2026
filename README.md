# Linebot

LINE Bot with keyword routing, PTT beauty scraper, conversation logging, and admin dashboard.

## Tech Stack

- TypeScript + Express v5
- @line/bot-sdk v10
- Firebase Admin SDK v13 (Firestore)
- GCP Cloud Run

## Prerequisites

- Node.js 20+
- npm
- [gcloud CLI](https://cloud.google.com/sdk/docs/install) (for Firebase ADC and deployment)
- [ngrok](https://ngrok.com/) (for local development)
- A [LINE Developers](https://developers.line.biz/) account with a Messaging API channel

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials:

| Variable | Description |
|----------|-------------|
| `CHANNEL_ACCESS_TOKEN` | LINE channel access token |
| `CHANNEL_SECRET` | LINE channel secret |
| `FIREBASE_PROJECT_ID` | Your GCP project ID |
| `ADMIN_USER` | Admin dashboard username |
| `ADMIN_PASS` | Admin dashboard password |
| `PORT` | Server port (default: 3000) |

### 3. Set up Firebase credentials (for Firestore)

```bash
gcloud auth application-default login
```

This creates Application Default Credentials that firebase-admin uses automatically.

### 4. Start the development server

```bash
npm run dev
```

The server starts with tsx hot-reload on `http://localhost:3000`.

### 5. Set up ngrok tunnel

In a separate terminal:

```bash
ngrok http 3000
```

Copy the HTTPS URL (e.g., `https://xxxx.ngrok-free.app`).

### 6. Configure LINE Developers webhook

1. Go to [LINE Developers Console](https://developers.line.biz/console/)
2. Select your channel → Messaging API tab
3. Set **Webhook URL** to: `https://xxxx.ngrok-free.app/webhook`
4. Enable **Use webhook**
5. Click **Verify** to test the connection

## Build

```bash
npm run build   # Compiles TypeScript to dist/
npm start       # Runs compiled output
```

## Deployment (GCP Cloud Run)

```bash
gcloud run deploy linebot \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated \
  --set-env-vars CHANNEL_ACCESS_TOKEN=xxx,CHANNEL_SECRET=xxx,FIREBASE_PROJECT_ID=xxx,ADMIN_USER=xxx,ADMIN_PASS=xxx,PORT=8080
```

Cloud Run automatically uses the service account for Firestore access — no credential file needed.

## Project Structure

```
src/
  index.ts              # Entry point
  routes/
    webhook.ts          # LINE webhook + keyword routing engine
    admin/              # Admin UI routes (Story 4)
    api/                # Admin AJAX API routes (Story 4)
  features/
    echo/               # Default reply feature
    beauty/             # PTT Beauty scraper (Story 2)
  services/
    firestore.ts        # Firestore initialization and helpers
    line-client.ts      # LINE Client singleton
  middleware/
    auth.ts             # Admin login middleware (Story 4)
  views/                # EJS templates (Story 4)
  types/
    feature.ts          # FeatureHandler interface
    models.ts           # Firestore data models
```

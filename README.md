# Anchor AP Automation

Invoice processing tool for accountspayable@anchorinv.com — scans the inbox, extracts invoice data with Claude, and routes to Yardi and Google Drive.

## Setup (one-time)

### 1. Prerequisites
- [Node.js](https://nodejs.org/) v18 or higher
- Git

### 2. Clone the repo
```bash
git clone https://github.com/janchorvis/anchor-ap-automation.git
cd anchor-ap-automation
npm install
```

### 3. Create your environment file
Copy the example file:
```bash
cp .env.example .env.local
```

Then open `.env.local` and fill in the values Jacob gives you:
- `GOOGLE_CLIENT_ID` — from Google Cloud Console
- `GOOGLE_CLIENT_SECRET` — from Google Cloud Console
- `ANTHROPIC_API_KEY` — from console.anthropic.com
- `NEXTAUTH_SECRET` — generate one by running: `openssl rand -base64 32`
- `NEXTAUTH_URL` — leave as `http://localhost:3000`

### 4. Add localhost to Google Cloud Console
Before logging in will work, you need to add the local redirect URI:

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Select the Anchor AP Automation project
3. Navigate to APIs & Services > Credentials
4. Click on your OAuth 2.0 Client ID
5. Under "Authorized redirect URIs", add: `http://localhost:3000/api/auth/callback/google`
6. Click Save

### 5. Run the app
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser and log in with your Anchor Google account.

## Daily Use

1. Open `http://localhost:3000` (make sure the app is running — `npm run dev`)
2. Click "Scan Inbox" on the dashboard
3. Review extracted invoices — edit any fields that look off
4. Click "Process" to upload to Drive and forward to Yardi

## Settings

Click the Settings icon in the top right to configure:
- Yardi forwarding email address
- Google Drive folder IDs
- Skip rules (vendors or keywords to ignore)

## Need to make code changes?

The codebase is straightforward Next.js. If you want to tweak how invoices are extracted or add new fields, the main logic lives in:
- `app/api/invoices/` — invoice scanning and extraction
- `app/dashboard/` — the main UI
- `app/settings/` — settings page

You can ask Claude to help with any changes — just paste the relevant file and describe what you want.

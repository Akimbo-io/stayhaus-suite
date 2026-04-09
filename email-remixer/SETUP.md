# Email Remixer -- Setup Guide

Fetches marketing emails from Gmail, parses them into structured design data, and imports them into Figma as editable layers. Each email becomes a Figma frame with text, images, buttons, and layout -- ready for remixing.

---

## Prerequisites

Before you start, make sure you have:

- **Node.js 18 or newer** -- check with `node -v` in your terminal
- **A Gmail account** with the marketing emails you want to import
- **A Figma account** (free or paid)
- **A code editor** (VS Code recommended, but any text editor works)

Optional:
- **An Anthropic API key** -- only if you want AI-powered image analysis that breaks images into editable design layers

---

## Step 1 -- Download and install

1. Download or clone this repository to your computer
2. Open your terminal and navigate to the folder:

```bash
cd email-remixer
```

3. Install the main dependencies:

```bash
npm install
```

4. Install and build the Figma plugin:

```bash
cd email-remixer-plugin
npm install
npm run build
cd ..
```

You should see a `dist/code.js` file created inside `email-remixer-plugin/`. If you see errors, make sure you have Node.js 18+ installed.

---

## Step 2 -- Set up Google Cloud credentials

This step lets the tool read emails from your Gmail account. You only need to do this once.

### 2a. Create a Google Cloud project

1. Go to **https://console.cloud.google.com**
2. Click the project dropdown at the top of the page
3. Click **New Project**
4. Name it anything (e.g. "Email Remixer")
5. Click **Create**
6. Make sure your new project is selected in the dropdown

### 2b. Enable the Gmail API

1. In the left sidebar, go to **APIs & Services** then **Library**
2. Search for **Gmail API**
3. Click on it, then click **Enable**

### 2c. Set up the OAuth consent screen

1. In the left sidebar, go to **APIs & Services** then **OAuth consent screen**
2. Choose **External** as the user type
3. Click **Create**
4. Fill in the required fields:
   - App name: "Email Remixer" (or anything)
   - User support email: your email
   - Developer contact: your email
5. Click **Save and Continue** (you can leave Scopes blank)
6. On the **Test users** step, click **Add Users** and enter the Gmail address you want to read emails from
7. Click **Save and Continue**, then **Back to Dashboard**

### 2d. Create OAuth credentials

1. In the left sidebar, go to **APIs & Services** then **Credentials**
2. Click **Create Credentials** at the top
3. Choose **OAuth client ID**
4. For Application type, select **Desktop app** (the auth flow uses `http://localhost:8080` as the redirect URI)
5. Name it anything (e.g. "Email Remixer Desktop")
6. Click **Create**
7. In the popup, click **Download JSON**
8. Move/rename the downloaded file to `credentials.json` in the `email-remixer` root folder

Your folder should now look like:

```
email-remixer/
  credentials.json    <-- you just added this
  config.json
  server.js
  src/
  ...
```

---

## Step 3 -- Choose which emails to fetch

Open `config.json` in your code editor. It looks like this:

```json
{
  "senders": ["support@hears.com"],
  "outputDir": "./output",
  "processedLedger": "./processed.json"
}
```

Replace the email address in `senders` with the sender(s) whose emails you want to import. You can add multiple:

```json
{
  "senders": [
    "newsletters@brand1.com",
    "marketing@brand2.com"
  ],
  "outputDir": "./output",
  "processedLedger": "./processed.json"
}
```

**Tip:** Check your Gmail inbox for the exact "From" address of the emails you want. The sender address must match exactly.

Leave `outputDir` and `processedLedger` as they are.

---

## Step 4 -- Authenticate with Gmail

Run the main script for the first time:

```bash
node src/index.js
```

A browser window will open asking you to sign in to Google and grant access. Here's what to expect:

1. **Select your Google account** -- choose the one with the emails
2. You may see a warning: "Google hasn't verified this app" -- click **Continue** (this is your own app, it's safe)
3. Grant the requested permission (read-only Gmail access)
4. You'll see "Authentication successful. You can close this tab."

Back in the terminal, the script will fetch and parse your emails. A `token.json` file is saved so you won't need to log in again.

**If authentication fails:** Make sure the Gmail address you're using is listed as a Test User in your Google Cloud OAuth consent screen (Step 2c, point 6).

---

## Step 5 -- Load the Figma plugin

1. Open **Figma** (desktop app or browser)
2. Open any file or create a new one
3. Right-click the canvas, go to **Plugins** then **Development** then **Import plugin from manifest...**
4. Navigate to `email-remixer-plugin/manifest.json` and select it
5. The plugin "Email Remixer" is now available under **Plugins** then **Development**

You only need to import the manifest once. Figma will remember it.

---

## Step 6 -- Run the full pipeline

### Option A: Run step by step

**Start the local server** (this serves parsed emails to the Figma plugin):

```bash
node server.js
```

You should see: `Email Remixer server running at http://localhost:3055`

**In a new terminal tab**, parse new emails:

```bash
cd email-remixer
node src/index.js
```

This fetches new emails, parses them into JSON, and saves them to the `output/` folder.

**In Figma**, open the plugin:

1. Right-click the canvas, then **Plugins** then **Development** then **Email Remixer**
2. The plugin shows a list of parsed emails
3. Click **Import** next to any email to create it as a Figma frame
4. Or click **Import All** to import everything at once

### Option B: Run everything at once

```bash
bash run.sh
```

This starts the server and runs the parser in one command. Then open the Figma plugin to import.

---

## Step 7 (Optional) -- Enable AI image analysis

By default, images in emails are imported as flat image fills. If you want the AI to analyze images and break them into editable text/button/layout layers:

1. Go to **https://console.anthropic.com**
2. Create an account or sign in
3. Go to **API Keys** and create a new key
4. Open `run.sh` in your code editor
5. Replace the placeholder with your actual key:

```bash
export ANTHROPIC_API_KEY="sk-ant-your-actual-key-here"
```

6. Run with `bash run.sh` -- the AI analysis will activate automatically for image-heavy sections

**Note:** This uses the Claude API which has usage-based pricing. Each email analyzed costs a small amount.

---

## Troubleshooting

**"Cannot find module" errors when running npm install**
Make sure you're running Node.js 18 or newer: `node -v`

**"Error: invalid_grant" when authenticating**
Delete `token.json` from the project root and run `node src/index.js` again to re-authenticate.

**Figma plugin says "Could not connect to local server"**
Make sure `node server.js` is running in a terminal. The server must be running for the plugin to work.

**No emails showing up**
- Check that the sender address in `config.json` matches exactly (case-sensitive)
- Make sure there are emails from that sender in the Gmail account you authenticated with
- Already-processed emails are skipped. Delete `processed.json` to re-process all emails

**Plugin shows emails but Import does nothing**
- Check the Figma developer console (Menu then Plugins then Development then Open console) for errors
- Make sure you ran `npm run build` inside `email-remixer-plugin/`

---

## Day-to-day usage

Once set up, your daily workflow is:

1. Open terminal, navigate to `email-remixer`
2. Run `bash run.sh`
3. Open Figma, run the Email Remixer plugin
4. Click Import on the emails you want
5. Remix the imported design

The tool remembers which emails it already processed, so it only fetches new ones each time.

---

## Running tests

The project has a test suite using Vitest. To run it:

```bash
npm test
```

All 25 tests should pass. No Gmail credentials or API keys are needed to run tests.

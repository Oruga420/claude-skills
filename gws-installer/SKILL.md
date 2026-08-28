---
name: gws-installer
description: Interactive installer for Google Workspace CLI (gws). Guides employees through installation, OAuth setup, and authentication so they can access Drive, Docs, Sheets, Gmail, Calendar, and more from the terminal.
---

# Google Workspace CLI — Installer

This skill installs and configures the `gws` CLI (Google Workspace CLI) for your organization's employees. It handles npm installation, gcloud authentication, OAuth client configuration, scope selection, and browser-based Google login.

**End result**: The employee can run `gws` commands to interact with Google Drive, Docs, Sheets, Gmail, Calendar, Tasks, Forms, Slides, and Apps Script.

## When to Activate

- User runs `/gws-installer`
- User asks to "install Google Workspace CLI" or "set up gws"
- A new employee needs Google Workspace access from the terminal

## Prerequisites (provided by admin)

Before starting, the employee needs these from their Workspace admin:
1. Their `@<YOUR_COMPANY_DOMAIN>` Google account (already provisioned)
2. The **OAuth Client ID** (looks like `123456789012-xxxx.apps.googleusercontent.com`)
3. The **OAuth Client Secret** (looks like `GOCSPX-xxxx`)

The admin distributes these via Slack DM, 1Password, or another secure channel.

---

## Workflow

Execute these steps IN ORDER. Do not skip steps. Wait for user confirmation where indicated.

### Step 1: Check if gws is already installed and authenticated

First, check if gws CLI is already installed and working:

```bash
gws --version 2>&1
```

- **If found**, also check auth status:
  ```bash
  gws auth status 2>&1
  ```
  - If `"token_valid": true` and `"user"` ends with `@<YOUR_COMPANY_DOMAIN>`: Tell the user gws is already installed and authenticated. Print their account, version, and scope count. Run a quick smoke test (`gws drive files list --params '{"pageSize": 1}'`). If everything works, **skip to Step 11 (summary)** — no need to reinstall.
  - If `"token_valid": false` or user is wrong: Tell the user gws is installed but needs re-authentication. **Skip to Step 8** to re-configure OAuth and login.
- **If not found**: Continue to Step 2 (fresh install).

### Step 2: Ask for email

Use `AskUserQuestion` with a free-text prompt:

> **What is your @<YOUR_COMPANY_DOMAIN> email address?**

**Validate**: The email MUST end with `@<YOUR_COMPANY_DOMAIN>`. If it doesn't, tell the user this installer only works with your organization's Google Workspace accounts and stop.

Store the email for verification in Step 10.

### Step 3: Detect OS and shell

Run:
```bash
uname -s 2>/dev/null || echo "Windows"
```

Determine the platform:
- **Windows** (MINGW, MSYS, CYGWIN, or "Windows"): Commands use Git Bash syntax. npm global installs go to AppData.
- **Darwin**: macOS. Standard Unix paths.
- **Linux**: Standard Unix paths.

Inform the user what OS was detected and continue.

### Step 4: Check Node.js

Run:
```bash
node --version 2>&1
```

- **If found**: Print version and continue.
- **If not found**: Tell the user:
  > Node.js is required. Install it from https://nodejs.org (LTS version recommended).
  > After installing, close and reopen your terminal, then run this skill again.

  **STOP here.** Do not continue without Node.js.

### Step 5: Install gws CLI

Run:
```bash
npm install -g @googleworkspace/cli 2>&1
```

Then verify:
```bash
gws --version 2>&1
```

- **If successful**: Print the version (e.g., `gws 0.18.1`) and continue.
- **If npm fails with EACCES/permission error**:
  - On macOS/Linux: suggest `sudo npm install -g @googleworkspace/cli`
  - On Windows: suggest running terminal as Administrator
- **If `gws` not found after install**: Check PATH. On Windows, may need to close/reopen terminal.

### Step 6: Check for gcloud CLI

Run:
```bash
gcloud version 2>&1 | head -1
```

- **If found**: Print version and continue.
- **If not found**: Tell the user:
  > Google Cloud SDK (gcloud) is required for initial setup.
  > Install from: https://cloud.google.com/sdk/docs/install
  > After installing, close and reopen your terminal, then run this skill again.

  **STOP here.** Do not continue without gcloud.

### Step 7: Authenticate gcloud

Check current auth:
```bash
gcloud auth list 2>&1
```

Look at the output:
- **If their @<YOUR_COMPANY_DOMAIN> email is listed as active**: Skip to Step 7.
- **If not authenticated or wrong account**: Tell the user:

  > Run this command in your terminal (it will open your browser):
  > ```
  > gcloud auth login
  > ```
  > Sign in with your **{email}** account and come back here when done.

**Wait for user to confirm they completed the login.**

Then verify:
```bash
gcloud auth list 2>&1
```

Confirm their @<YOUR_COMPANY_DOMAIN> account is now active. If not, troubleshoot.

### Step 8: Set GCP project

Run:
```bash
gcloud config set project <GCP_PROJECT_ID> 2>&1
```

This sets your organization's GCP project as the active project.

### Step 9: Configure OAuth credentials

Ask the user for their OAuth credentials using `AskUserQuestion`:

> **Paste the OAuth Client ID your admin gave you:**

Then ask:

> **Paste the OAuth Client Secret your admin gave you:**

**Validate**:
- Client ID should end with `.apps.googleusercontent.com`
- Client Secret should start with `GOCSPX-`
- If either looks wrong, warn the user and ask them to double-check with their admin

Once you have both values, tell the user to run this in their terminal (PowerShell on Windows, Terminal on macOS/Linux):

**On Windows (PowerShell):**
```powershell
$env:GOOGLE_WORKSPACE_CLI_CLIENT_ID="<the-client-id>"
$env:GOOGLE_WORKSPACE_CLI_CLIENT_SECRET="<the-client-secret>"
gws auth login -s drive,gmail,sheets,docs,calendar,tasks,forms,slides,scripts
```

**On Windows (Git Bash) / macOS / Linux:**
```bash
export GOOGLE_WORKSPACE_CLI_CLIENT_ID="<the-client-id>"
export GOOGLE_WORKSPACE_CLI_CLIENT_SECRET="<the-client-secret>"
gws auth login -s drive,gmail,sheets,docs,calendar,tasks,forms,slides,scripts
```

Replace `<the-client-id>` and `<the-client-secret>` with the actual values the user provided.

**IMPORTANT**: The `-s` flag limits scopes to these services only. Google blocks unverified apps with too many scopes (>40 individual scopes causes `unknownerror`). The `-s` flag keeps it safe.

### Step 10: Browser authorization

Tell the user:

> A URL will appear in your terminal. Open it in your browser.
>
> **You will see a warning** because the app is not verified by Google. This is normal for internal tools.
>
> Click **"Advanced"** at the bottom left, then click **"Go to gws CLI (unsafe)"** to continue.
>
> Sign in with your **{email}** account and click **"Allow"** on all permission screens.
>
> When you see "Authentication successful" in your terminal, come back here.

**Wait for user to confirm they see "Authentication successful".**

### Step 11: Verify installation

Run these checks:

```bash
gws auth status 2>&1
```

Verify in the JSON output:
- `"token_valid": true`
- `"user"` matches the email from Step 1
- `"scope_count"` is > 0
- `"encrypted_credentials_exists": true`

Then run a smoke test:
```bash
gws drive files list --params '{"pageSize": 1}' 2>&1
```

- **If it returns a file**: Everything works.
- **If it returns an auth error**: Token may not have saved. Ask user to re-run the login command from Step 8.

### Step 12: Done — Summary

Print a summary:

> ## Google Workspace CLI — Setup Complete
>
> - **Account**: {email}
> - **GCP Project**: <GCP_PROJECT_ID>
> - **Services**: Drive, Gmail, Sheets, Docs, Calendar, Tasks, Forms, Slides, Scripts
> - **Credentials**: Encrypted (AES-256-GCM) at `~/.config/gws/credentials.enc`
>
> ### Quick commands to try:
> ```
> gws drive files list                              # List your Drive files
> gws docs documents get --document-id <ID>         # Read a Google Doc
> gws gmail messages list                           # List your emails
> gws calendar events list                          # List calendar events
> gws sheets spreadsheets get --spreadsheet-id <ID> # Read a spreadsheet
> ```
>
> ### If your token expires:
> Run `gws auth login -s drive,gmail,sheets,docs,calendar,tasks,forms,slides,scripts` again in your terminal.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `unknownerror` on Google consent screen | Too many scopes. Make sure you're using the `-s` flag to limit services |
| `No OAuth client configured` | Env vars weren't set. Re-run Step 8 in the SAME terminal session |
| `gws: command not found` after install | Close and reopen terminal. On Windows, check `npm config get prefix` is in PATH |
| `EACCES` permission error on npm install | Use `sudo` (macOS/Linux) or run as Administrator (Windows) |
| Token expired after a few hours | Normal. Re-run `gws auth login -s drive,gmail,sheets,docs,calendar,tasks,forms,slides,scripts` |
| Wrong Google account authorized | Run `gws auth logout` then re-run Step 8 with correct account |
| `restricted_client` error | Do NOT use `--full` flag. Stick with `-s` flag for service filtering |

## Technical Reference

- **GCP Project**: `<GCP_PROJECT_ID>` 
- **OAuth Client**: `<OAUTH_CLIENT_NAME>` (Desktop type)
- **Config directory**: `~/.config/gws/`
- **Encryption**: AES-256-GCM, key stored in OS keyring
- **gws repo**: https://github.com/googleworkspace/cli
- **Scope limit**: Unverified Google apps fail with >40 individual scopes. The `-s` flag maps service names to reasonable scope sets automatically.

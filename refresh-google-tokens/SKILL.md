---
name: refresh-google-tokens
description: Refresh both Google Cloud CLI auth and Application Default Credentials (ADC) in one step. Fixes expired token errors for gcloud commands and Python code.
---

# Refresh Google Tokens

Refresh both Google Cloud authentication methods in one step:

1. **gcloud CLI auth** (`gcloud auth login`) - for running gcloud commands
2. **ADC** (`gcloud auth application-default login`) - for Python code that calls Google APIs (Vertex AI, Secret Manager, Sheets, etc.)

## When to Activate

- When you see `Reauthentication is needed` or `RefreshError` errors
- When `gcloud` commands return `UNAUTHENTICATED` or `token expired`
- When Python code throws `google.auth.exceptions.RefreshError`
- At the start of a new work session (tokens expire after a few hours)
- When the user runs `/refresh-google-tokens`

## Workflow

### Step 1: Check current auth status

Run this to see what's currently authenticated:

```bash
gcloud auth list 2>&1
```

Tell the user which accounts are active (if any).

### Step 2: Refresh gcloud CLI auth

Tell the user to run this in their PowerShell/terminal (NOT in Claude Code, because it needs browser interaction):

```
gcloud auth login
```

This opens a browser for Google login. It authenticates the gcloud CLI for commands like `gcloud functions deploy`, `gcloud secrets versions access`, etc.

Wait for the user to confirm they completed it.

### Step 3: Verify CLI auth

```bash
gcloud auth list 2>&1
```

Confirm the correct account is active. For this project it should be `<your-workspace-admin@example.com>`.

### Step 4: Refresh ADC (Application Default Credentials)

Tell the user to run this in their PowerShell/terminal:

```
gcloud auth application-default login
```

IMPORTANT: This is a DIFFERENT command from Step 2. Both are needed.
- `gcloud auth login` = authenticates the gcloud CLI tool
- `gcloud auth application-default login` = creates credentials at `~/.config/gcloud/application_default_credentials.json` that Python libraries use

Wait for the user to confirm they completed it.

### Step 5: Verify ADC works

Run a quick test to confirm ADC is working:

```bash
python -c "import google.auth; creds, project = google.auth.default(); print('ADC OK - Project:', project)"
```

### Step 6: Set correct project

```bash
gcloud config set project <GCP_PROJECT_ID> 2>&1
```

### Step 7: Summary

Tell the user:
- gcloud CLI: authenticated as [account]
- ADC: working, project [project_id]
- Both tokens refreshed, good to go

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Reauthentication is needed` | ADC token expired | Run `gcloud auth application-default login` |
| `UNAUTHENTICATED` | CLI token expired | Run `gcloud auth login` |
| `Permission denied` on secrets | Account lacks IAM role | Ask your cloud admin to grant `secretmanager.versions.access` |
| `RefreshError` in Python | ADC expired | Run `gcloud auth application-default login` |
| Wrong project in output | Project not set | Run `gcloud config set project <GCP_PROJECT_ID>` |

## Important Notes

- Both auth commands require browser interaction, so the USER must run them in their own terminal
- Tokens typically expire after 1-4 hours of inactivity
- The CLI auth and ADC auth are INDEPENDENT. Refreshing one does NOT refresh the other
- For this project, the GCP project ID is `<GCP_PROJECT_ID>`

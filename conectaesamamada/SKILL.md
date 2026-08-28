---
name: conectaesamamada
description: Connect to GCP. No fumbling, no guessing, no 10 attempts. Just follow these exact steps in order.
---

# Connect to GCP

## STOP. Read this entire file before running ANY command.

This skill exists because previous sessions wasted time trying random auth approaches. DO NOT improvise. Follow these steps EXACTLY.

## The Problem

Claude Code runs in a non-interactive shell. `gcloud auth login` needs browser interaction (paste a code back). This shell CANNOT do that. So you CANNOT run `gcloud auth login` from here. Period. Stop trying.

## The Solution (3 steps, no more, no less)

### Step 1: Test if tokens are alive

```bash
gcloud config set project <GCP_PROJECT_ID> 2>&1
```

If this succeeds (no "Reauthentication" error), skip to Step 3. You are done.

If it fails with "Reauthentication is needed", go to Step 2.

### Step 2: Tell the user to run ONE command

Tell the user:

> Run this in your PowerShell terminal:
> ```
> gcloud auth login --update-adc
> ```
> Tell me when it is done.

That is it. ONE command. It refreshes both CLI and ADC at the same time. Do NOT tell them to run `gcloud auth login` and then `gcloud auth application-default login` separately. ONE command: `gcloud auth login --update-adc`.

WAIT for the user to confirm. Do NOT proceed until they say it is done.

### Step 3: Verify and set project

```bash
gcloud config set project <GCP_PROJECT_ID> 2>&1
```

If it works, say "Connected" and move on with whatever you were doing.

## What NOT to do

- Do NOT run `gcloud auth login` from this shell (it will crash with EOFError)
- Do NOT run `gcloud auth login --no-launch-browser` (same problem, needs stdin)
- Do NOT try `--impersonate-service-account` (the deploy account lacks the serviceAccountTokenCreator role)
- Do NOT activate the service account key (it lacks cloudfunctions.functions.get permission for deploys)
- Do NOT try to get an access token from ADC and pass it manually
- Do NOT run `gcloud auth list` or `gcloud auth print-access-token` to "diagnose" the issue. You already know what the issue is: expired tokens. The fix is Step 2.
- Do NOT ask the user to run more than ONE command
- Do NOT explain what OAuth is or how tokens work. Just fix it.

## Account Info

- **Deploy account**: `<DEPLOY_ACCOUNT_EMAIL>`
- **GCP Project**: `<GCP_PROJECT_ID>`
- **Service account** (for runtime, not deploys): `<SERVICE_ACCOUNT_NAME>@<GCP_PROJECT_ID>.iam.gserviceaccount.com`
- **Service account key**: `<project>/secrets/service-account.json` (exists but lacks deploy permissions)

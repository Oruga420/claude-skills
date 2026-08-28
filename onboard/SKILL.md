---
name: onboard
description: Onboard a new employee at your organization. Creates Google Workspace account, provisions Slack via SCIM, and sends welcome email. User provides data directly (no Google Sheet).
---

# Onboard Employee

Provision a new employee without touching Google Sheets. The user provides employee data directly, and the skill creates accounts and sends credentials.

Uses `onboard_manual.py` which pulls the SCIM token from GCP Secret Manager.

## When to Activate

- When the user runs `/onboard`
- When the user asks to onboard a new employee manually

## Important Paths

```
PHASE_A = <PATH_TO>\onboarding_automation\PhaseA
SCRIPT  = {PHASE_A}\onboard_manual.py
```

## Workflow

### Step 1: Collect Employee Data

Use the **AskUserQuestion** tool to gather the following. If the user already provided some or all of this data (e.g., as arguments or in conversation), parse it directly instead of asking.

Required fields:
1. **Full name** (e.g., "Jane Doe")
2. **Role** (e.g., "VFX Compositor", "AI Engineer", "Production Coordinator")
3. **Personal email** (where to send credentials, e.g., "jane.doe@gmail.com")
4. **Long-term contract?** (yes/no)

Optional fields:
5. **Specific email override** (if user wants a specific `@yourcompany.com` address instead of auto-generated)

### Step 2: Confirm Before Proceeding

Display a summary and ask the user to confirm before creating real accounts.

### Step 3: Run onboard_manual.py

Run the script from the PhaseA directory using the Bash tool. Use system Python.

**Basic usage (short-term):**
```bash
cd "<PATH_TO>/onboarding_automation/PhaseA" && python onboard_manual.py "Full Name" "Role" "personal@email.com"
```

**Long-term contract:**
```bash
cd "<PATH_TO>/onboarding_automation/PhaseA" && python onboard_manual.py "Full Name" "Role" "personal@email.com" --long-term
```

**With email override:**
```bash
cd "<PATH_TO>/onboarding_automation/PhaseA" && python onboard_manual.py "Full Name" "Role" "personal@email.com" --long-term --email-override firstname@yourcompany.com
```

### Step 4: Report Results

After the script finishes, show the user a clean summary:

1. **Promise email** created
2. **Temporary password** (display clearly, only time it's shown)
3. **Google Workspace**: created / already existed / failed
4. **Slack**: created / already existed / skipped
5. **Welcome email**: sent / failed

If any step failed, explain what happened and suggest manual steps.

### Step 5: Ask About Sheet Update (Optional)

After reporting, ask if the user wants to update the Google Sheet manually. Do NOT update it automatically.

## Email Format Reference

### Short-term contracts (role-based prefix)

| Role Keywords | Prefix | Example |
|---------------|--------|---------|
| VFX, CG, Compositor, Animator, Lighter, etc. | `gfx` | gfx42@yourcompany.com |
| AI, ML | `ai` | ai05@yourcompany.com |
| Producer, PM, VP, Supervisor, Manager | `prod` | prod12@yourcompany.com |
| Coordinator | `coord` | coord03@yourcompany.com |
| Editor, Colorist, Post | `post` | post08@yourcompany.com |
| Developer, Engineer, Pipeline, TD | `dev` | dev15@yourcompany.com |
| Unrecognized | `gfx` | gfx43@yourcompany.com |

### Long-term contracts

Uses `firstname@yourcompany.com`. If taken, appends number: `firstname2@yourcompany.com`.

## Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| Secret Manager 403 | SA needs secretAccessor role | Ask your cloud admin to grant the role to `onboarding-auto@<GCP_PROJECT_ID>.iam.gserviceaccount.com` |
| Google 409 | User already exists | Account is there. Script continues with Slack + email |
| Email invalid_grant | DWD not configured for sender | Check service account DWD for `gmail.send` scope |

## Security Notes

- SCIM token pulled from GCP Secret Manager at runtime, never stored locally
- Temporary passwords are 16-char high-entropy, forced change on first login
- Credentials read from `secrets/service-account.json`, never hardcoded

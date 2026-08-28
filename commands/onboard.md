# Onboard Employee

Manually onboard a new employee at your company. Creates Google Workspace account, provisions Slack via SCIM, and sends welcome email.

The user provides employee data directly (no Google Sheet scanning). Invoke the `onboard` skill to execute.

## Usage

```
/onboard
/onboard Jane Doe
```

## What It Does

1. Collects employee info (name, role, personal email, contract type)
2. Creates Google Workspace account with auto-generated email
3. Provisions Slack account via SCIM API
4. Sends welcome email with credentials to personal email

## Skill Reference

This command invokes the `onboard` skill. See `~/.claude/skills/onboard/SKILL.md` for full details.

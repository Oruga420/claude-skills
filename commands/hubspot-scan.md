# HubSpot Scan — On-Demand Activity Feed

Run a HubSpot activity scan, post to Slack, collect feedback, or analyze performance.

## Usage

```
/hubspot-scan                  # Post new activities to Slack
/hubspot-scan dry-run          # Preview what would be posted (with scores)
/hubspot-scan feedback         # Collect reactions from Slack
/hubspot-scan analyze          # Show performance dashboard
/hubspot-scan propose          # Propose a rule optimization
/hubspot-scan dashboard        # Full experiment history
/hubspot-scan reset            # Reset state (fresh start)
```

## Step 1: Parse Arguments

Read the argument passed to this command: `$ARGUMENTS`

Map to the correct action:
- (empty) or `post` → **Post to Slack**
- `dry-run` or `dry` → **Dry Run**
- `feedback` or `collect` → **Collect Feedback**
- `analyze` or `stats` → **Analyze Performance**
- `propose` → **Propose Experiment**
- `dashboard` or `history` → **Dashboard**
- `reset` → **Reset State**

## Step 2: Execute

### Post to Slack (default)
```bash
cd "$HUBSPOT_INTEGRATION_DIR"   # your local HubSpot integration checkout
node hubspot-top-accounts/slack-feed.mjs
```

### Dry Run
```bash
cd "$HUBSPOT_INTEGRATION_DIR"   # your local HubSpot integration checkout
node hubspot-top-accounts/slack-feed.mjs --dry-run --show-scores
```

### Collect Feedback
```bash
cd "$HUBSPOT_INTEGRATION_DIR"   # your local HubSpot integration checkout
node hubspot-top-accounts/slack-feed.mjs --collect-feedback
```

### Analyze Performance
```bash
cd "$HUBSPOT_INTEGRATION_DIR"   # your local HubSpot integration checkout
node autoresearch.mjs --analyze
```

### Propose Experiment
```bash
cd "$HUBSPOT_INTEGRATION_DIR"   # your local HubSpot integration checkout
node autoresearch.mjs --propose
```

### Dashboard
```bash
cd "$HUBSPOT_INTEGRATION_DIR"   # your local HubSpot integration checkout
node autoresearch.mjs --dashboard
```

### Reset State
```bash
cd "$HUBSPOT_INTEGRATION_DIR"   # your local HubSpot integration checkout
node hubspot-top-accounts/slack-feed.mjs --reset-state
```

## Step 3: Report

After running the command:
1. Show the full output to the user
2. If the HubSpot token expired, tell the user to run: `hs account auth --account <YOUR_HUBSPOT_ACCOUNT>`
3. If posting succeeded, confirm how many activities were posted and their scores
4. If collecting feedback, report the count and current approval ratio
5. If analyzing, highlight the best and worst performing dimensions

## Notes
- Token refreshes are interactive — the user must do them manually
- The scoring engine reads `selection-rules.json` for weights and thresholds
- Feedback requires `reactions:read` OAuth scope on the Slack bot
- Experiments are tracked in `experiments.json`

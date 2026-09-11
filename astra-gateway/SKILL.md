---
name: astra-gateway
description: Install and verify GPT-6 Astra in Claude Code CLI through Eigenwise Model Gateway, including project-root wiring and troubleshooting resumed conversations.
---

# Astra Gateway

Enable `claude-gpt-6-astra[1m]` in Claude Code CLI using the existing Eigenwise Model Gateway. Do not build a replacement proxy. Keep the endpoint on loopback.

## Resolve the root before changing anything

Use the user's intended working directory. For an existing conversation, obtain `/status` and use its actual `cwd`, not the folder where a launcher or shortcut lives. Do not assume that `/resume` changes the conversation's effective root to the intended pilot directory.

Default to one project. If the user explicitly wants all sessions rooted at their home directory, target that directory. Explain that `<root>/.claude/settings.local.json` then lives inside the same directory as user-level settings; preserve `settings.json` and all unrelated local keys. This is not a claim that every unrelated project is configured.

## Inspect and install

Read the current [upstream setup guide](https://eigenwise.github.io/eigenwise-toolshed/getting-started/model-gateway/) and the installed plugin's instructions before execution. Commands and release requirements can change.

1. Resolve the Claude executable and run `claude --version`. The gateway picker requires CLI 2.1.129 or newer; verify upstream requirements before upgrading anything.
2. Check for an existing gateway and owners of loopback ports 18764 and 18765. Reuse a healthy compatible instance. Do not stop foreign or unidentified processes. An active shared instance may serve other sessions.
3. Record existing project settings, plugin registration, gateway registry and model discovery cache. Make private local backups and hashes outside any public repository. Keep an absent-file marker for files that do not exist. Never restore an old shared file over concurrent changes.
4. From the intended root, install the plugin if it is not already available there:

   ```text
   claude plugin marketplace add Eigenwise/eigenwise-toolshed --scope project
   claude plugin install model-gateway@eigenwise-toolshed --scope project
   ```

   In an interactive Claude session the equivalent commands start with `/plugin`; reload plugins afterward. Inspect the real installation path and version from the installed plugin registry; do not guess a cache version.

5. Use `node "<plugin-root>/bin/model-gateway.js" setup` from the intended root. If setup reports a prerequisite requiring user interaction, relay that instruction and wait; do not declare setup complete. Continue setup only after the prerequisite is satisfied.
6. If a healthy gateway already exists and only another root needs wiring, use `node "<plugin-root>/bin/model-gateway.js" env --write-project` from that root. Inspect the resulting diff. Do not use `--write-user` or reconciliation unless the user explicitly requested broader scope. Ensure the plugin's normal startup support is available at the target scope; wiring an endpoint alone does not install its startup hook.

The runtime under `~/.claude/model-gateway` and the discovery cache under `~/.claude/cache` are shared even with project-scoped wiring. Do not expose the service on LAN, edit hosts, or enable Remote Control compatibility as part of this workflow.

## Verify before reporting success

Run `status`, `doctor`, and `models` through the resolved gateway entrypoint. Record their exit codes. Require Astra in the live model list and a serving proxy version supporting it; the documented minimum is 0.1.36. A successful doctor check alone does not prove Astra is present or can answer.

Fully restart the Claude process in the target root. Reloading plugins or selecting `/model` alone does not reload process settings. Then launch:

```text
claude --model "claude-gpt-6-astra[1m]"
```

Use a small disposable conversation and fixture:

- Ask for exactly `ASTRA_OK`; require that response and a matching `gpt-6-astra` request-route record for the same session.
- Create `gateway-smoke.txt` containing `TOOL_OK`. Ask Claude to use `Read` on it and return its contents. Require the actual tool event, correct file path and result, and correlated Astra route. Use only fixture data.
- Run `/context` and confirm the selected model. The `[1m]` client alias does not demonstrate one million units of backend input capacity. Preserve existing compaction settings.
- Check startup and shutdown hook results. Report unrelated hook failures separately; do not silently alter those plugins.

Route metadata is normally in `~/.claude/model-gateway/logs/request-routes.jsonl`. If logging is disabled, report the missing route evidence rather than claiming a provider from the response text alone. Keep all live evidence local.

## Resume and wrong-model errors

If the picker accepts Astra but a prompt reports that the model does not exist or is unavailable:

1. Read `/status` for the failing conversation and verify its effective root.
2. Check the effective `ANTHROPIC_BASE_URL`, including process-environment precedence. The normal default is `http://127.0.0.1:18764`; use the actual configured endpoint if upstream uses another port.
3. Check whether the failing session reached the gateway. No matching route suggests a routing problem, but is not proof when logging is disabled or incomplete.
4. If the root differs from the configured project, wire that root only when authorized. Otherwise relaunch from the configured root. After `/resume`, check `/status` again instead of assuming the root stayed the same.
5. If a matching route exists, inspect gateway diagnostics and the serving model list. Do not treat an accepted picker entry as proof of backend availability.

Session limits and organization Remote Control restrictions are separate signals. This skill does not change those policies.

## Reversibility and handoff

To disconnect only the selected root, remove its gateway-added `env.ANTHROPIC_BASE_URL` if it still equals the value this workflow wrote, or restore that key's previous value. Preserve all other settings and restart the affected CLI. Test a minimal response from the previous Claude model. Do not use global `env --remove` without reviewing its scope.

For a temporary rollback test, compare hashes before restoring the gateway configuration. If concurrent changes appeared, merge only owned keys. Leave the gateway enabled afterward when installation was the requested outcome. Do not delete the shared runtime or shared records used by other sessions.

Report the configured root, versions, checks passed, remaining limitations, and exact restart command. Never describe a project-scoped installation as fully isolated or claim that unrelated memory stores were validated by a model smoke test.

---
name: appbuilder
description: Builds a complete new project from a photo (mockup/sketch/screenshot) or a text description, following a standard pipeline: Desktop folder with the user's work/personal prefix, /arise memory harness inside, orchestrated build (fable-it style) against verifiable goals, arise update, private GitHub repo, and Vercel deploy. Use when the user says /appbuilder, "build an app from this photo", "new project from this image/description", or asks for the full idea-to-production pipeline.
---

# /appbuilder — From a photo or description to a deployed app

Complete workflow for NEW projects. Every step is a gate: do not advance until
the previous one holds.

## Files in this skill

| File | Read it when |
|---|---|
| `SKILL.md` | always, it is the pipeline |
| `SKETCH-LANG.md` | the input is a hand-drawn sketch with color or glyph annotation |
| `AGENTIC-FIRST.md` | before Step 4, to decide what becomes a tool, a skill, an agent, or a workflow |
| `ADDENDUM.md` | the profile declares a restricted work target |
| `PROFILE.template.md` | writing a profile for the first time |

## Step 0 — Inputs (ask ONLY for what is missing)

1. **What to build**: a photo (local path or attached in chat) or a text
   description. If there is a photo, READ it with the Read tool FIRST and
   extract the visual spec: screens, components, flows, states, visible copy.
2. **Work or personal**: ask which kind of project this is. ALWAYS ask, even
   when a profile exists; only the user knows which identity this build belongs
   to.
3. **Folder prefixes (first run)**: ask the user what they want as their Desktop
   folder prefix for WORK projects and for PERSONAL projects (e.g. work
   `Acme-`, personal `Me-`). Offer to save the answer by filling the Config
   section below in their local copy of this skill, so future runs never ask.
   Skip this if Step 0.5 already loaded a profile with the prefixes.
4. **Short project name** (kebab or short PascalCase).
5. **GitHub account/org** and **Vercel scope** for publishing (first run; also
   saveable in Config).

## Config (fill in on first run; empty = ask)

```
work_prefix:
personal_prefix:
github_owner:
vercel_scope:
```

## Step 0.5 — Load the local profile, if there is one

BEFORE asking anything, check for a profile file, in this order, and read the
first one that exists:

1. `~/.claude/appbuilder-profile.md`
2. `./appbuilder-profile.md` (current project, for a per-repo override)

A profile answers the Config questions once and survives re-installing this
skill, because it lives OUTSIDE this folder. Precedence, strongest first:

```
profile file  >  Config block above  >  ask the user
```

Two things a profile never decides, no matter what it says: whether this
particular project is work or personal (always ask; a wrong prefix files the
project under the wrong identity), and whether to push or deploy (always a
human OK).

If no profile exists and the user answers the Config questions, offer to write
`~/.claude/appbuilder-profile.md` from `PROFILE.template.md` so the next run
does not ask again.

A profile may also declare a **restricted work target** (an org monorepo where
writes are confined to one branch and one subtree). If it does, read
`ADDENDUM.md` before Step 6 and follow the routing there instead of creating a
standalone repo.

## Step 1 — Folder with the naming convention

- Work: `~/Desktop/<work_prefix><project>`
- Personal: `~/Desktop/<personal_prefix><project>`

Create the folder. ALL work happens inside it (never in another open repo).

## Step 2 — /arise inside the project

Run the `arise` skill (harness-only default) INSIDE the new folder: project
CLAUDE.md, Karpathy wiki (`wiki/` with index.md and log.md) and its own
MemPalace wing (`mempalace.yaml`). From this moment the session is anchored to
the project: its wiki and its wing are the only memory surfaces.

## Step 3 — Goals from the photo or description

Before coding, turn EVERY visible element of the photo (or every requirement of
the description) into a verifiable acceptance criterion (file exists, command
runs, button does X, URL returns 200, the screen looks like the photo). Write
the list to the project's `wiki/log.md`. These are the build GOALS; for large
builds use the `ultraplan` skill for the deep plan.

## Step 4 — Orchestrated build (fable-it mode)

You are the orchestrator (plan and judge); subagents execute (a scout to
explore, fast-workers to implement and test, a deep-reasoner for architecture).
LOOP per goal: build, verify against the real deliverable, fix, repeat until ALL
goals pass. At the end a FRESH-context verifier subagent reviews against the
original spec and the photo; never self-evaluate. The app must end up running
locally.

## Step 5 — Update arise

Before publishing: `wiki/log.md` (what was built, decisions, lessons),
`wiki/index.md` (new pages), and verbatim episodes to the project's MemPalace
wing.

## Step 6 — Private GitHub repo

Default route, for a project that gets its own repo:

```
git init && git add -A && git commit
gh repo create <github_owner>/<folder-name> --private --source . --push
```

Gate: `.gitignore` first (node_modules, .env*, build output). NEVER commit
secrets. Verify with `gh repo view` that the repo is private.

Gate before ANY push, both routes: write the `.gitignore`, run a secret audit
over what is actually staged (`git diff --cached`, not just a glance at the file
list), DECLARE the target out loud (owner, repo, branch, path) and WAIT for a
human OK. A target declared is a target the user can veto; a target assumed is
an incident.

If the profile from Step 0.5 declares a **restricted work target**, work
projects do NOT take the default route. Read `ADDENDUM.md` and follow it. When
the profile also names a publishing skill for that route (for example a
`subelo`-style skill that already knows the org's rules), delegate to it rather
than reimplementing the routing here.

## Step 7 — Deploy to Vercel

```
vercel link (new project, the scope from the profile or Config)
vercel deploy --prod
```

If the profile's `vercel_scope` is marked as personal-only, do NOT reuse it for
a work project. Ask for the work scope instead.

If the app needs env vars, load them with `vercel env add` BEFORE deploying.
Final gate: open the production URL and verify the main goals against the real
page (not the build log). Report the URL to the user.

## Rules

- Confirm with the user before outward-facing steps (repo creation, deploy)
  unless they were already authorized in the original instruction.
- If a gate fails, fix and repeat that gate; do not skip.
- Time and important decisions go to the project wiki, not just the chat.

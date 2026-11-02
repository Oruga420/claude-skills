---
name: hallmark
description: "Design and implement distinctive, polished websites, app screens and components with intentional branding, responsive layout, motion and real visual QA. Use for new UI design or when Hallmark is named; preserve existing designs unless a redesign is explicitly requested."
metadata:
  version: "2.0.0-oruga.1"
  upstream: "Nutlope/hallmark@4f6a46c6dc325d40ab268c93e25c7b96676ebccd"
---

# Hallmark

Build a considered visual system with working interactions. Delivering HTML is not the quality bar: the result needs deliberate composition, color relationships, spacing, typography, credible material and verified behavior. A restrained design can be excellent; a generic template with substituted copy is unfinished.

This is an MIT-licensed adaptation of Hallmark. [Provenance](ORIGIN.json) and the [script review](references/scripts-audit.md) explain what changed. The current request, project instructions and brand system govern; theme examples are inspiration, not rules to impose.

## Establish the actual job

Read the project, its design tokens, existing routes and components, supplied assets and relevant instructions. Preserve delivered formats, content, wiring and layout unless the requested change authorizes altering them. `audit` produces a report; `redesign` changes only the named scope. Ordinary edits should fit the existing system.

Identify the audience, primary action, usable material, tone and constraints from available context. Ask only for missing information that changes the result. If enough is known, state consequential assumptions briefly and build. Do not repeat an intake the user already answered. Separate verified facts from placeholders; never invent customer counts, endorsements, product capabilities or testimonials.

If the user asks for **a prompt**, deliver the complete final prompt with all constraints preserved. Do not generate media or return only a diff. Image generation applies to an actual image request, including an explicitly requested image asset, not automatically to every UI task.

## Choose and build a direction

Read [design craft](references/design.md). Explain one concrete direction: palette roles, type voice, layout rhythm, signature detail and the purpose of motion. Use a hero when the page benefits from a lead story or action; an app workspace or component does not need a marketing hero. No fixed section count, word quota, mandatory random theme or prescribed card grid.

The optional [theme library](references/themes/README.md) offers 50 visual starting points. `node <skill-dir>/scripts/theme.mjs shortlist "<brief>"` returns candidates with reasons. Inspect a selected theme's picture and document, then adapt it. A named brand or existing system takes precedence. `theme.mjs tokens <slug>` prints tokens; it never overwrites a stylesheet or fetches fonts. Map them to the project's existing tokens after checking contrast and font availability.

Build an early representative screen at the intended fidelity, then carry the system through the requested scope. Use semantic components, meaningful controls, responsive grids, appropriate density and accessible states. Motion should clarify response, hierarchy or continuity and respect reduced motion. Prefer the project's established stack. Do not substitute flat placeholder HTML merely to finish quickly, or replace real products with fabricated screenshots.

## Tools and media

Prefer a connected MCP when it covers the action. Discover the tools and current schemas in this runtime; follow the relevant provider or browser skill. Respect the user's named browser and restrictions. Do not infer that a missing MCP authorizes a different browser, new service or installation.

For requested imagery, use [media routing](references/media.md): Higgsfield or Replicate according to the user's choice and available authorized connection. Models, schemas, input roles and prices are discovered at runtime. No fixed model IDs, Together dependency, credential setup, automatic subscriptions or paid calls are bundled here. The offline `media-plan.mjs` helper emits a handoff, not a generation result.

Read [video workflow](references/video.md) **only for a video request**. Its production approval and budget rules do not turn ordinary UI work into a video pipeline.

## Verify the actual result

Read [visual and interaction QA](references/qa.md). Open the real result with the permitted browser tooling, inspect desktop and mobile screenshots, click the principal paths and test keyboard/focus and relevant states. A screenshot must be inspected, not merely saved. Fix observed defects and retest affected behavior. Report the exact evidence and any unverified surface; never call a UI finished based on a static lint pass.

Optional local checks use already installed Node; no package installation is necessary for the static tier:

```text
node <skill-dir>/scripts/sloplint.mjs <files-or-directory> --json
```

This is a scoped technical audit, not an aesthetic judge or proof of accessibility. It retains upstream parsing and useful checks for motion, contrast, focus, responsive failures and lost wiring; stylistic quotas and mandatory stamps are inactive. Review warnings in context.

When MCP/browser tools cannot cover a permitted check, the optional render/capture fallback uses an **already installed** Puppeteer and browser. Read the QA reference first. It requires `--allow-browser`, does not install dependencies, and returns incomplete when a dependency or requested check is unavailable. Do not use it to bypass an explicit restriction. Runtime screenshots, logs and before/after snapshots belong in the project, never in the installed skill.

Deliver the working artifact with a concise account of what changed, what was actually checked, evidence paths and any material limitation. Include full revised prompts when prompts are part of the deliverable.

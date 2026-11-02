# Script review and verification

Source: Nutlope/hallmark 2.0.0 at the commit in [ORIGIN.json](../ORIGIN.json). The source scripts were inspected as text before any adapted script was run. MIT attribution remains in [LICENSE](../LICENSE). No upstream installer or paid generator is part of the active workflow.

| Upstream component | Decision and reason |
|---|---|
| `theme.mjs` | Rewritten as offline catalogue, reproducible shortlist with reasons and explicit token export. Keep visual variety; remove mandatory random layouts, project salt/log writes, downloads and overwrite flags. |
| `sloplint.mjs` | Retain the substantial HTML/CSS/framework parser and useful technical checks. Replace the reporting contract with the Oruga profile: style quotas/stamps are inactive; technical heuristics are contextual warnings; broken motion, invisible content, missing image alternatives and lost wiring remain actionable. Static output explicitly says visual and interaction QA were not performed. |
| `sloplint-render.mjs` | Keep viewport measurements, contrast probes, keyboard focus, screenshots and before/after support. Shared explicit browser helper; no global npm probing. A missing dependency, navigation error or failed evaluation cannot be presented as a completed render pass. Runtime captures still require inspection and real clicks by the agent. |
| `capture.mjs` | Rewritten as bounded desktop/mobile capture into a new evidence directory, using the same existing-browser helper. No profile attachment, debug-port manipulation, package install or silent overwrite. |
| `refcheck.mjs` | Rewritten as package-local link/theme checks and SHA256 manifest verification. It does not execute helpers or fixtures as a side effect. Tests are a separate explicit command. |
| `imagegen.mjs` | Replaced with `media-plan.mjs`: offline prompt/image/video handoff, full constraints, provider choice, runtime model discovery and scoped video budget. The agent performs separately authorized MCP/API work. |
| `install.mjs` | Removed: it executed validators and replaced destination folders. Installation is explicit copy of the verified package; no self-installer. |
| `install-hook.mjs`, `lint-hook.mjs` | Removed: no automatic edit hooks or changes to agent settings. |
| `picture.mjs` | Removed: maintenance of catalogue JPG/Markdown is outside ordinary design work and can overwrite the reference library. |
| `photos.json` | Removed: no automatic stock library downloads. Use supplied/licensed assets or the requested authorized generation route with provenance. |
| `theme.test.mjs`, fixtures | Replaced tests cover the adapted contract. Preserve useful upstream markup, Tailwind and redesign fixtures for regression coverage. |

The theme Markdown/JPEG collection is retained as inspiration with an explicit scope notice. The old prescriptive flow, gate manuals and Together-specific references are replaced by the linked design/media/QA guidance, so an old reference cannot reactivate removed scripts. Unused upstream rule functions remain inside the parser file for provenance and shared parsing support; only the explicit active check list and profile contribute findings. No source file is loaded into an agent merely because it is in the package.

## Local checks

Requires existing Node 18+ for the helpers and Node 20+ for the test runner. No network or dependencies are required for the static tests.

```text
node --test <skill-dir>/scripts/hallmark.test.mjs
node <skill-dir>/scripts/refcheck.mjs
```

Maintainers run `refcheck.mjs --write-manifest` after reviewed package edits, then verify every installed copy. The manifest excludes itself, lists every other payload file and rejects additions, removals and changed bytes. The manifest's own SHA256 can be compared separately across destinations. This verifies byte equality, not provider connectivity or visual quality.

The static linter keeps inherited parsing heuristics; warnings require contextual review and it is not a general JS/TS compiler, exhaustive accessibility scanner or factual-claims verifier. Render uses reduced motion for stable measurements; normal motion and the actual click flow require browser review. Provider generation is not tested by offline checks and is never invoked to install this skill.

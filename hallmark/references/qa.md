# Visual and interaction QA

## Use the permitted surface

Use the available browser/MCP and its instructions first. Honor a named browser, prohibited browser, authenticated-session boundary and project restrictions. Never change security settings, open debugging ports, copy browser profiles or install automation dependencies as an incidental workaround. If visual access is unavailable, finish independent work and report the precise gap; do not claim the UI is verified.

Inspect the running project, not only a source preview. Wait for actual fonts, images and critical data. Check desktop and mobile at useful widths (for example 1440 and 390), plus a narrow/wide boundary or tablet when the design calls for it. Record the widths actually checked. Look at screenshots for composition, spacing, wrapping, clipping, contrast, focus visibility, image crop and motion intent.

Click the primary action and important secondary paths. Test the relevant menus, tabs, dialogs, validation, loading, errors and empty states. Use keyboard navigation and focus return. Avoid sending a real production form, making a purchase or causing an external side effect just to test it without authorization; use a safe test mode or record the boundary. Check reduced motion and actual responsive behavior. A screenshot does not prove a click path works.

Keep evidence in a project QA record: target/revision, tooling, viewport, screenshot/trace paths, action performed, observed result, issues and retest result. Do not record credentials or personal data in screenshots. Distinguish **observed**, **inferred**, **not run** and **blocked**. A linter count describes only that check. No broad compliance or visual-quality certification follows from it.

## Optional local fallback

Use only when an existing local browser workflow is permitted and MCP cannot cover the check. No npm/npx install is bundled. `HALLMARK_PUPPETEER` may name a directory containing an already installed `puppeteer-core` or `puppeteer`; otherwise only the current project and skill directory are searched. `CHROME_PATH` may point to an existing browser executable. Neither value is persisted by the helper.

```text
node <skill-dir>/scripts/sloplint.mjs <project> --json
node <skill-dir>/scripts/sloplint.mjs <project> --render --allow-browser --url http://localhost:3000 --json
node <skill-dir>/scripts/capture.mjs http://localhost:3000 --allow-browser --out .hallmark/captures
```

Render and capture save screenshots; they do not provide a human or agent visual review. Inspect the screenshots with the harness's image viewer and do the actual clicks through the permitted tool. Capture also does not claim to test interactions. Missing browser/dependency, failed navigation or internal errors are incomplete/failure outcomes, not zero-defect passes. The renderer probes layout with reduced motion; also inspect the normal motion experience with your browser tool when relevant.

For an explicitly authorized redesign, `sloplint --before` records content and wiring; `--kept` compares after edits. These options write `.hallmark` evidence in the current project. They cannot establish semantic equivalence or replace interaction tests. Do not run snapshot commands inside the installed skill or overwrite earlier evidence blindly.

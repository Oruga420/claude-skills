# The clickables inventory

The first deliverable of a voice agent build, and the one that decides whether "everything
clickable works by voice" is true or a slogan. It is produced from the target app's real code,
before any tool is designed.

## Why it is mandatory

A registry written from memory of what the app does misses the controls that live in less
visited screens: admin tabs, lifecycle buttons inside an item, export and print, sign out, the
guided tour. On the reference build the first registry had 14 tools; the inventory found 82
controls and the finished registry had 39 tools plus 2 control tools. The gap was the difference
between "the agent can file a ticket" and "the agent can do what I can do".

## Produce it

```bash
node ~/.claude/skills/voice-agent/scripts/inventory-clickables.mjs <srcDir> --routes <appDir> --out docs/voice/clickables.md --json docs/voice/clickables.json
node ~/.claude/skills/voice-agent/scripts/inventory-clickables.mjs <srcDir> --summary
```

The script finds, with file and line: buttons, links (`<a>`, `<Link>`), elements with `onClick`,
`onChange`, `onSubmit`, selects, inputs (with type), textareas, forms, `role="tab" | "menuitem" |
"switch" | "checkbox"`, `<summary>`, and anything with an `aria-label`. For each it records the
label it can see (children text, aria-label, title, placeholder, or the handler name), the handler
or href, the API path when the handler body nearby calls the app's fetch helper with an `/api/`
path, and the screen (derived from the app router path, otherwise the component folder).

Known limits, measured on the reference app: the script reported 129 controls in 33 files where
the hand made inventory counted 82. The difference is over count, which is the safe direction:
every select of a multi field form is one row each where a person lumps "the form" together;
native `<button>` and a custom `<Button>` component are reported as two kinds on purpose;
conditionally rendered variants of one control in one file count twice; a JSX call inside a
`map()` counts once, so long lists do not inflate the number. What it misses: a bespoke wrapper
(`<Toggle>`) whose handler is not visible in the JSX text, and controls in components rendered
from configuration arrays. It is regex based, not a parser, so read the table; do not trust it
blindly. The classification pass below is done by reading, and it corrects both directions.

## Classify it

Fill two columns per row, by reading the handler and the route it calls:

| Kind | Meaning | Becomes |
|---|---|---|
| view | drives the page, touches no data: navigate, filters, open a form, switch a tab, toggle a section | a view tool that dispatches a view command and answers with what is now on screen |
| read | calls a GET and shows data | a read tool that calls the same GET and answers one condensed sentence |
| consequential | calls a POST / PATCH / DELETE, or anything the person would want to confirm | a propose tool that raises the overlay |
| control | part of the voice UI itself | not a tool for the agent (confirm_action and stop_action already exist) |
| skip | cannot be driven by a page tool | listed with the reason: browser permission prompts, file pickers, OS dialogs, external links that leave the app |

Role gate: the roles the route accepts. Read the route handler, not the UI (the UI may hide a
button the route still allows, or the reverse). This value becomes `allowedRoles`.

## Group it into tools

One tool per distinct action, not per DOM node:

- Every `Take it` button on every row is one `propose_take_item(code)`.
- Every filter select on one screen is one `set_<screen>_filters(...)` with optional fields, so
  the agent can change one thing without resetting the others.
- Tabs on one screen are `navigate('/screen?tab=x')`, not one tool per tab.
- A multi step flow (open form, fill, submit) is one propose tool when the fields are known by
  voice, or one view tool that opens the form prefilled when the fields cannot be taken by voice
  (full names, dates, long lists), with the persona telling the agent to say the form is open.
- Reads that always travel together (counts in the header) are one tool.

Write the grouping in the inventory as a third column, `voiceTool`, with the tool name. Rows that
share a name are one tool. The count of distinct names is the registry size, and acceptance
criterion A5 in `acceptance-criteria.md` asserts that number from the sync script's dry run.

## Keep it alive

The inventory lives in the repo (`docs/voice/clickables.md`). A new control in a pull request
adds a row and a tool, or a `skip` with a reason. The registry test compares its count against the
inventory's distinct tool names, so the two cannot drift silently.

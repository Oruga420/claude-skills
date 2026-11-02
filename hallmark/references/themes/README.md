# Theme library

Fifty upstream Hallmark themes provide palettes, type combinations, surface treatments and visual examples. Their stylistic directives are optional inspiration; the current SKILL.md, project brand and user brief govern. A brand must not be replaced with a randomly dealt theme.

Use `node <skill-dir>/scripts/theme.mjs list` or `shortlist "<brief>"`. The catalogue is in [index.json](index.json). Each entry points to its Markdown and JPEG; inspect the picture before adopting a direction. These are examples, not assets to republish as your own work. Verify font availability, licensing, actual contrast and the suitability of complex effects.

`theme.mjs tokens <slug>` prints tokens. `theme.mjs tokens <slug> --out <new-file.css>` writes only a new file and refuses an existing path. The helper never fetches assets, imposes a layout or claims that tokens constitute a completed design.

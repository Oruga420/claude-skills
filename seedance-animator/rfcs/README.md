# RFCs

One markdown file per non-trivial change: new agent, new Replicate model,
schema change. Filename: `NNNN-title.md` (zero-padded).

Template:

```
# RFC-NNNN: Title

## Motivation
(what previous run showed this was needed)

## Change
(diff or description)

## Quality gate
- [ ] scripts/rfc_gate.py passes
- [ ] One smoke-test run produces a valid video

## Rollback
(how to revert if the next rating is lower)
```

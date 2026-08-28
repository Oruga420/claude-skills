# appbuilder profile (template)

Copy to `~/.claude/appbuilder-profile.md` and fill in. `/appbuilder` reads it at
Step 0.5, and its values beat the Config block inside `SKILL.md`.

Keep it OUTSIDE the skill folder. That is the whole point: re-installing or
re-vendoring `appbuilder/` must not erase your answers. It also keeps org
internal names out of any repo you publish this skill to.

Leave a field empty to be asked about it. Nothing here is secret material:
put prefixes, owners and scopes, never tokens or keys.

```
# --- Desktop folder prefixes ---
work_prefix:
personal_prefix:

# --- Personal publishing ---
github_owner:
github_auth_user:       # if you juggle several gh accounts, the one to switch to
vercel_scope:
vercel_scope_is_personal_only:   yes | no

# --- Work publishing: restricted target (see ADDENDUM.md) ---
# Fill these ONLY if work projects land in an existing org monorepo.
# Leave work_target_repo empty to use the default one-repo-per-project route.
work_target_repo:       # <owner>/<repo>
work_target_branch:     # the single permitted branch
work_target_path:       # the single permitted subtree, e.g. automations/
work_integration_branch:  # where PRs land; you open them, you never merge them
work_publish_skill:     # a skill that already knows these rules, or: none

# --- Behavior ---
harness_in_git:         yes | no    # no = wiki/ and mempalace.yaml stay local
default_stack:                      # e.g. Next.js + Tailwind + shadcn
style_skills:                       # design skills to load, comma separated
language:                           # language for chat replies
```

## Notes

- **Work or personal is never stored here.** It is asked per project, every
  time. A prefix guessed wrong files a build under the wrong company identity,
  and that is not a mistake you can fix by renaming the folder afterwards.
- **Pushing and deploying are never pre-authorized here.** A profile removes
  questions about configuration, not questions about consequences.

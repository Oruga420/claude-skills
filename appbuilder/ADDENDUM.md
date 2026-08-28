# ADDENDUM — Restricted work target

Scenario addendum for `/appbuilder`. It replaces NOTHING in `SKILL.md`; it adds
a second route for Step 6 that only activates when the profile from Step 0.5
declares a restricted work target. Personal projects keep the default route.
No em dashes in any output.

## The scenario

Some people build under two identities from the same machine:

- **Personal** projects get their own standalone repo. The default Step 6 works.
- **Work** projects do NOT get their own repo. They land inside an existing org
  monorepo, on ONE permitted branch, under ONE permitted subtree. Everything
  else in that repo belongs to the team: other branches are integration or
  production, and a stray branch or a stray top-level folder is a visible
  incident, not a stylistic preference.

The default `gh repo create` route is wrong for the second case, and wrong in a
way that is expensive to undo: you cannot un-push a branch someone already
fetched, and you cannot un-notify the reviewers it pinged.

## What the profile must declare

For this addendum to activate, the profile needs at least:

```
work_target_repo:    <owner>/<repo>
work_target_branch:  <the single permitted branch>
work_target_path:    <the single permitted subtree, e.g. automations/>
work_publish_skill:  <skill that already knows these rules, or "none">
```

If `work_target_repo` is empty, this addendum does not apply. Use the default
route.

## Step 6, restricted route

1. **Classify.** Personal, or work? This was already answered in Step 0. If the
   answer is somehow missing at this point, STOP and ask. Do not infer it from
   the folder prefix, and above all do not infer it from how the project looks.
2. **Delegate if you can.** If `work_publish_skill` names a skill, invoke it and
   stop here. It already encodes the org's rules, including ones this file does
   not know about. Reimplementing them from this file is how drift starts.
3. **Otherwise, the manual route, in this exact order:**

```
git checkout <work_target_branch>        # NEVER git checkout -b
git pull --ff-only
# copy the project into <work_target_path><project>/
git add <work_target_path><project>
git diff --cached                        # read it, this is the secret audit
git commit
# DECLARE target + wait for human OK
git push origin <work_target_branch>
```

4. **Pull request**, only if the org's flow expects one, and only after a human
   OK: from `<work_target_branch>` into the org's integration branch. You open
   it. Someone else merges it. Never self-merge.

## Hard rules for this route

1. **No new branches.** Not `feat/<project>`, not `<project>-import`, not a
   "temporary" one. `git checkout -b` and `git switch -c` are both off limits.
   The permitted branch already exists.
2. **No writes outside the permitted subtree.** A new top-level folder is a new
   branch's twin: same blast radius, same visibility.
3. **No pushes to the integration or production branches.** PRs land there.
   You do not.
4. **If the task seems to need another branch or another path, STOP and ask.**
   A plan that calls for a new branch is a plan that was written without this
   constraint in mind. The constraint wins, not the plan. This rule exists
   because "the plan said so" is the single most common way the previous three
   get broken.
5. **Declare before pushing, every time.** Owner, repo, branch, path. Even on
   the tenth run of the day. Familiarity is not authorization.

## Harness files and the repo

If the profile sets `harness_in_git: no`, the memory harness that Step 2
installed stays local. Add to `.gitignore` BEFORE the first `git add`:

```
wiki/
mempalace.yaml
.mempalace/
appbuilder-profile.md
```

The last line matters even when the harness is allowed in git: a per-project
profile override is local configuration, and it is exactly the kind of file that
carries an org's internal names.

## Why an addendum instead of editing SKILL.md

`SKILL.md` describes a pipeline that works for anyone. This file describes one
organization's constraint. Keeping them apart means a re-install of the skill
never overwrites the constraint, and a change to the constraint never forks the
pipeline. The profile file, which lives outside this folder entirely, is what
binds the two at runtime.

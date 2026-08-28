#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
livetrack - live progress board for a project, ticket or task.

State lives in ONE json file. Every mutating command rewrites the json and
re-renders a self-contained HTML board next to it. The board reloads itself
from disk every few seconds, so a browser tab left open shows progress live.

This source file is deliberately ASCII-only; injected content may be any
unicode and is written out as UTF-8 without BOM.

Usage:
  python livetrack.py init --title "Fix rate sync" --kind ticket --ref ABC-412 \
      --objective "..." --summary "..."
  python livetrack.py task add --title "Reproduce the bug" --steps "read logs|write test"
  python livetrack.py task start T1
  python livetrack.py task step T1 1
  python livetrack.py task progress T1 60 --note "test written, still red"
  python livetrack.py task done T1 --verified "pytest -k rate_sync passes"
  python livetrack.py decision --what "use webhook, not polling" --why "..."
  python livetrack.py block --what "no staging creds" --owner operator
  python livetrack.py unblock B1 --how "creds provided"
  python livetrack.py ask --question "prod or staging?" --why "..." --options "prod|staging"
  python livetrack.py answer A1 --answer "staging"
  python livetrack.py health yellow --note "blocked on creds"
  python livetrack.py show          # compact text state (cheap for an agent to read)
  python livetrack.py render        # re-render html only
  python livetrack.py open          # open the board in the browser
  python livetrack.py path          # print state + html absolute paths
"""

import argparse
import html
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime

# --------------------------------------------------------------------------- io

DEFAULT_DIRNAME = os.path.join(".claude", "livetrack")
STATUSES = ("todo", "active", "blocked", "done", "dropped")
HEALTHS = ("green", "yellow", "red")


def now():
    return datetime.now().isoformat(timespec="seconds")


def stamp():
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def resolve_paths(args):
    root = os.path.abspath(args.root or os.environ.get("LIVETRACK_ROOT") or os.getcwd())
    directory = args.dir or os.environ.get("LIVETRACK_DIR") or os.path.join(root, DEFAULT_DIRNAME)
    directory = os.path.abspath(directory)
    slug = args.slug or os.environ.get("LIVETRACK_SLUG") or "current"
    return (
        os.path.join(directory, slug + ".json"),
        os.path.join(directory, slug + ".html"),
    )


def read_text(path):
    with open(path, "r", encoding="utf-8") as fh:
        return fh.read()


def write_text(path, text):
    """Atomic-ish UTF-8 write, no BOM, LF preserved."""
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=parent or ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def load(state_path):
    if not os.path.exists(state_path):
        die("no track at %s - run `livetrack.py init --title ...` first" % state_path)
    return json.loads(read_text(state_path))


def save(state_path, state):
    state["updated"] = now()
    write_text(state_path, json.dumps(state, ensure_ascii=False, indent=2) + "\n")


def die(msg):
    sys.stderr.write("livetrack: " + msg + "\n")
    raise SystemExit(1)


# ---------------------------------------------------------------------- helpers


def next_id(items, prefix):
    used = set()
    for it in items:
        ident = it.get("id", "")
        if ident.startswith(prefix) and ident[len(prefix):].isdigit():
            used.add(int(ident[len(prefix):]))
    n = 1
    while n in used:
        n += 1
    return "%s%d" % (prefix, n)


def find(items, ident, what):
    key = (ident or "").strip().upper()
    for it in items:
        if it.get("id", "").upper() == key:
            return it
    die("no %s with id %s (have: %s)" % (what, ident, ", ".join(i.get("id", "?") for i in items) or "none"))


def event(state, kind, text, task=None):
    state.setdefault("events", []).append(
        {"at": now(), "kind": kind, "text": text, "task": task}
    )


def split_list(raw):
    if not raw:
        return []
    return [p.strip() for p in raw.split("|") if p.strip()]


def clamp(n):
    return max(0, min(100, int(n)))


def task_progress(task):
    """Explicit progress wins; otherwise derive from steps."""
    if task["status"] == "done":
        return 100
    if task["status"] == "dropped":
        return clamp(task.get("progress") or 0)
    steps = task.get("steps") or []
    if steps and task.get("progress_explicit") is not True:
        done = sum(1 for s in steps if s.get("done"))
        return clamp(round(done * 100.0 / len(steps)))
    return clamp(task.get("progress") or 0)


def overall(state):
    live = [t for t in state.get("tasks", []) if t["status"] != "dropped"]
    if not live:
        return 0
    return int(round(sum(task_progress(t) for t in live) / float(len(live))))


def open_blockers(state):
    return [b for b in state.get("blockers", []) if not b.get("resolved")]


def open_asks(state):
    return [a for a in state.get("asks", []) if not a.get("answered")]


def auto_health(state):
    """Only used when the operator never set health explicitly."""
    if open_asks(state) or open_blockers(state):
        return "yellow", "waiting on input or blocked"
    tasks = [t for t in state.get("tasks", []) if t["status"] != "dropped"]
    if tasks and all(t["status"] == "done" for t in tasks):
        return "green", "all tracked work done"
    return "green", "work in progress"


# ------------------------------------------------------------------- commands


def cmd_init(args, state_path, html_path):
    if os.path.exists(state_path) and not args.force:
        die("track already exists at %s (use --force to start over)" % state_path)
    state = {
        "title": args.title,
        "kind": args.kind,
        "ref": args.ref,
        "ref_url": args.ref_url,
        "objective": args.objective,
        "summary": args.summary,
        "scope_out": split_list(args.scope_out),
        "started": now(),
        "updated": now(),
        "health": None,
        "health_note": None,
        "tasks": [],
        "blockers": [],
        "asks": [],
        "decisions": [],
        "events": [],
    }
    event(state, "start", "Track opened: %s" % args.title)
    save(state_path, state)
    render(state_path, html_path)
    print("track: %s" % state_path)
    print("board: %s" % html_path)


def cmd_meta(args, state_path, html_path):
    state = load(state_path)
    for field in ("title", "kind", "ref", "ref_url", "objective", "summary"):
        val = getattr(args, field, None)
        if val is not None:
            state[field] = val
    if args.scope_out is not None:
        state["scope_out"] = split_list(args.scope_out)
    event(state, "note", "Track details updated")
    finish(state, state_path, html_path)


def cmd_task_add(args, state_path, html_path):
    state = load(state_path)
    task = {
        "id": args.id or next_id(state["tasks"], "T"),
        "title": args.title,
        "what": args.what,
        "objective": args.objective,
        "status": "active" if args.start else "todo",
        "progress": 0,
        "progress_explicit": False,
        "steps": [{"label": s, "done": False} for s in split_list(args.steps)],
        "notes": [],
        "verified": None,
        "created": now(),
        "started": now() if args.start else None,
        "finished": None,
    }
    state["tasks"].append(task)
    event(state, "task-add", "Task added: %s" % task["title"], task["id"])
    if args.start:
        event(state, "task-start", "Started: %s" % task["title"], task["id"])
    finish(state, state_path, html_path, note="task %s" % task["id"])


def cmd_task_start(args, state_path, html_path):
    state = load(state_path)
    task = find(state["tasks"], args.id, "task")
    task["status"] = "active"
    task["started"] = task["started"] or now()
    if args.note:
        task["notes"].append({"at": now(), "text": args.note})
    event(state, "task-start", "Started: %s%s" % (task["title"], " - " + args.note if args.note else ""), task["id"])
    finish(state, state_path, html_path)


def cmd_task_progress(args, state_path, html_path):
    state = load(state_path)
    task = find(state["tasks"], args.id, "task")
    task["progress"] = clamp(args.pct)
    task["progress_explicit"] = True
    if task["status"] == "todo":
        task["status"] = "active"
        task["started"] = task["started"] or now()
    if args.note:
        task["notes"].append({"at": now(), "text": args.note})
    event(
        state,
        "progress",
        "%s at %d%%%s" % (task["title"], task["progress"], " - " + args.note if args.note else ""),
        task["id"],
    )
    finish(state, state_path, html_path)


def cmd_task_step(args, state_path, html_path):
    state = load(state_path)
    task = find(state["tasks"], args.id, "task")
    steps = task.get("steps") or []
    if not steps:
        die("task %s has no steps - add them with `task edit %s --steps \"a|b|c\"`" % (task["id"], task["id"]))
    if args.n < 1 or args.n > len(steps):
        die("task %s has %d steps, no step %d" % (task["id"], len(steps), args.n))
    step = steps[args.n - 1]
    step["done"] = not args.undo
    task["progress_explicit"] = False
    if task["status"] == "todo":
        task["status"] = "active"
        task["started"] = task["started"] or now()
    event(
        state,
        "step" if step["done"] else "step-undo",
        "%s: %s %s" % (task["title"], "done" if step["done"] else "reopened", step["label"]),
        task["id"],
    )
    finish(state, state_path, html_path)


def cmd_task_edit(args, state_path, html_path):
    state = load(state_path)
    task = find(state["tasks"], args.id, "task")
    for field in ("title", "what", "objective"):
        val = getattr(args, field, None)
        if val is not None:
            task[field] = val
    if args.steps is not None:
        keep = {s["label"]: s.get("done", False) for s in task.get("steps") or []}
        task["steps"] = [{"label": s, "done": keep.get(s, False)} for s in split_list(args.steps)]
        task["progress_explicit"] = False
    if args.add_step:
        task.setdefault("steps", []).append({"label": args.add_step, "done": False})
        task["progress_explicit"] = False
    event(state, "note", "Task updated: %s" % task["title"], task["id"])
    finish(state, state_path, html_path)


def cmd_task_done(args, state_path, html_path):
    state = load(state_path)
    task = find(state["tasks"], args.id, "task")
    task["status"] = "done"
    task["progress"] = 100
    task["finished"] = now()
    task["verified"] = args.verified
    for step in task.get("steps") or []:
        step["done"] = True
    if args.note:
        task["notes"].append({"at": now(), "text": args.note})
    event(
        state,
        "task-done",
        "Done: %s%s" % (task["title"], " (verified: %s)" % args.verified if args.verified else " (NOT verified)"),
        task["id"],
    )
    finish(state, state_path, html_path)


def cmd_task_drop(args, state_path, html_path):
    state = load(state_path)
    task = find(state["tasks"], args.id, "task")
    task["status"] = "dropped"
    task["finished"] = now()
    task["notes"].append({"at": now(), "text": "dropped: %s" % args.why})
    event(state, "task-drop", "Dropped: %s - %s" % (task["title"], args.why), task["id"])
    finish(state, state_path, html_path)


def cmd_block(args, state_path, html_path):
    state = load(state_path)
    blocker = {
        "id": next_id(state["blockers"], "B"),
        "what": args.what,
        "task": (args.task or "").upper() or None,
        "owner": args.owner,
        "needs": args.needs,
        "opened": now(),
        "resolved": None,
        "resolution": None,
    }
    state["blockers"].append(blocker)
    if blocker["task"]:
        task = find(state["tasks"], blocker["task"], "task")
        task["status"] = "blocked"
    event(state, "blocked", "Blocked: %s (owner: %s)" % (args.what, args.owner), blocker["task"])
    finish(state, state_path, html_path, note="blocker %s" % blocker["id"])


def cmd_unblock(args, state_path, html_path):
    state = load(state_path)
    blocker = find(state["blockers"], args.id, "blocker")
    blocker["resolved"] = now()
    blocker["resolution"] = args.how
    if blocker.get("task"):
        task = find(state["tasks"], blocker["task"], "task")
        if task["status"] == "blocked":
            still = [b for b in open_blockers(state) if b.get("task") == task["id"]]
            task["status"] = "blocked" if still else "active"
    event(state, "unblocked", "Unblocked: %s - %s" % (blocker["what"], args.how), blocker.get("task"))
    finish(state, state_path, html_path)


def cmd_ask(args, state_path, html_path):
    state = load(state_path)
    ask = {
        "id": next_id(state["asks"], "A"),
        "question": args.question,
        "why": args.why,
        "options": split_list(args.options),
        "task": (args.task or "").upper() or None,
        "blocking": bool(args.blocking),
        "opened": now(),
        "answered": None,
        "answer": None,
    }
    state["asks"].append(ask)
    event(state, "ask", "Needs operator: %s" % args.question, ask["task"])
    finish(state, state_path, html_path, note="ask %s" % ask["id"])


def cmd_answer(args, state_path, html_path):
    state = load(state_path)
    ask = find(state["asks"], args.id, "ask")
    ask["answered"] = now()
    ask["answer"] = args.answer
    event(state, "answer", "Answered: %s -> %s" % (ask["question"], args.answer), ask.get("task"))
    finish(state, state_path, html_path)


def cmd_decision(args, state_path, html_path):
    state = load(state_path)
    decision = {
        "at": now(),
        "what": args.what,
        "why": args.why,
        "by": args.by,
        "task": (args.task or "").upper() or None,
        "alternative": args.instead_of,
    }
    state["decisions"].append(decision)
    event(state, "decision", "%s (why: %s)" % (args.what, args.why), decision["task"])
    finish(state, state_path, html_path)


def cmd_note(args, state_path, html_path):
    state = load(state_path)
    task_id = (args.task or "").upper() or None
    if task_id:
        task = find(state["tasks"], task_id, "task")
        task["notes"].append({"at": now(), "text": args.text})
    event(state, "note", args.text, task_id)
    finish(state, state_path, html_path)


def cmd_health(args, state_path, html_path):
    state = load(state_path)
    state["health"] = args.level
    state["health_note"] = args.note
    event(state, "health", "Health -> %s (%s)" % (args.level, args.note or ""))
    finish(state, state_path, html_path)


def cmd_show(args, state_path, html_path):
    state = load(state_path)
    health, note = state.get("health"), state.get("health_note")
    if not health:
        health, note = auto_health(state)
    print("%s [%s]" % (state["title"], state.get("kind") or "task"), end="")
    if state.get("ref"):
        print("  ref=%s" % state["ref"], end="")
    print()
    print("overall %d%%   health %s%s" % (overall(state), health, " (%s)" % note if note else ""))
    if state.get("objective"):
        print("objective: %s" % state["objective"])
    print("tasks:")
    for t in state.get("tasks", []):
        line = "  %-4s %-8s %3d%%  %s" % (t["id"], t["status"], task_progress(t), t["title"])
        steps = t.get("steps") or []
        if steps:
            line += "  [%d/%d steps]" % (sum(1 for s in steps if s.get("done")), len(steps))
        print(line)
    if not state.get("tasks"):
        print("  (none)")
    ob = open_blockers(state)
    if ob:
        print("open blockers:")
        for b in ob:
            print("  %-4s %s (owner: %s%s)" % (b["id"], b["what"], b.get("owner"), ", task " + b["task"] if b.get("task") else ""))
    oa = open_asks(state)
    if oa:
        print("waiting on operator:")
        for a in oa:
            print("  %-4s %s%s" % (a["id"], a["question"], "  [blocking]" if a.get("blocking") else ""))
    print("board: %s" % html_path)


def cmd_render(args, state_path, html_path):
    load(state_path)
    render(state_path, html_path)
    print(html_path)


def cmd_path(args, state_path, html_path):
    print(state_path)
    print(html_path)


def cmd_open(args, state_path, html_path):
    load(state_path)
    render(state_path, html_path)
    launch(html_path)


def finish(state, state_path, html_path, note=None):
    save(state_path, state)
    render(state_path, html_path)
    health = state.get("health") or auto_health(state)[0]
    msg = "ok%s | overall %d%% | health %s" % (" | " + note if note else "", overall(state), health)
    oa, ob = open_asks(state), open_blockers(state)
    if oa:
        msg += " | %d waiting on operator" % len(oa)
    if ob:
        msg += " | %d blocked" % len(ob)
    print(msg)


def launch(path):
    try:
        if sys.platform.startswith("win"):
            os.startfile(path)  # noqa: S606
        elif sys.platform == "darwin":
            subprocess.run(["open", path], check=False)
        else:
            subprocess.run(["xdg-open", path], check=False)
        print("opened %s" % path)
    except Exception as exc:  # pragma: no cover
        print("could not open the board (%s). Path: %s" % (exc, path))


# --------------------------------------------------------------------- render

CSS = """
:root{
  --bg:#f6f7f9;--panel:#fff;--ink:#1a2233;--muted:#5c6675;--line:#dde1e7;
  --accent:#2f5fd0;--accent-soft:#e8eefb;--ok:#1d7a3e;--ok-bg:#e5f3ea;
  --warn:#b26a00;--warn-bg:#fdf1dd;--bad:#b3261e;--bad-bg:#fbe7e6;--track:#e7eaef;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#14171c;--panel:#1d2129;--ink:#e6e9ee;--muted:#9aa3b0;--line:#313743;
  --accent:#7ea2f0;--accent-soft:#232c40;--ok:#6fce93;--ok-bg:#1c2f23;
  --warn:#e6b566;--warn-bg:#332a1a;--bad:#ef8f89;--bad-bg:#38201e;--track:#2a3140;
}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:15px/1.55 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
a{color:var(--accent)}
header{background:var(--panel);border-bottom:1px solid var(--line);padding:18px 26px 16px;
  position:sticky;top:0;z-index:20}
.hrow{display:flex;gap:14px;align-items:baseline;flex-wrap:wrap}
h1{margin:0;font-size:20px}
.chip{display:inline-block;padding:2px 10px;border-radius:99px;font-size:12px;font-weight:600;
  background:var(--accent-soft);color:var(--accent)}
.pill{display:inline-block;padding:2px 11px;border-radius:99px;font-size:12.5px;font-weight:600}
.pill.green{background:var(--ok-bg);color:var(--ok)}
.pill.yellow{background:var(--warn-bg);color:var(--warn)}
.pill.red{background:var(--bad-bg);color:var(--bad)}
.sub{color:var(--muted);font-size:13px;margin-top:6px}
.live{display:inline-flex;align-items:center;gap:6px;color:var(--muted);font-size:12.5px}
.dot{width:8px;height:8px;border-radius:99px;background:var(--ok);animation:pulse 2s infinite}
.dot.off{background:var(--muted);animation:none}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
button.mini{font:inherit;font-size:12px;color:var(--muted);background:none;border:1px solid var(--line);
  border-radius:6px;padding:2px 9px;cursor:pointer}
.bar{height:9px;border-radius:99px;background:var(--track);overflow:hidden;margin-top:10px}
.bar>i{display:block;height:100%;background:var(--accent);border-radius:99px;
  transition:width .5s ease}
.bar.ok>i{background:var(--ok)}
.bar.bad>i{background:var(--bad)}
.bar.muted>i{background:var(--muted)}
.bar.slim{height:6px}
main{max-width:1080px;margin:22px auto 60px;padding:0 22px}
section{margin-bottom:22px}
h2{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);
  margin:0 0 10px;font-weight:700}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(122px,1fr));gap:11px}
.tile{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.tile b{display:block;font-size:23px;line-height:1.2}
.tile span{color:var(--muted);font-size:12px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:15px 17px}
.banner{border-left:4px solid var(--warn);background:var(--warn-bg);border-radius:0 10px 10px 0;
  padding:13px 16px;margin-bottom:20px}
.banner.red{border-left-color:var(--bad);background:var(--bad-bg)}
.banner h3{margin:0 0 8px;font-size:14.5px}
.banner ol{margin:0;padding-left:20px}
.banner li{margin:5px 0}
.task{background:var(--panel);border:1px solid var(--line);border-radius:10px;
  padding:13px 16px;margin-bottom:11px}
.task.active{border-left:4px solid var(--accent)}
.task.done{border-left:4px solid var(--ok)}
.task.blocked{border-left:4px solid var(--bad)}
.task.todo{border-left:4px solid var(--line)}
.task.dropped{opacity:.55}
.task .top{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.task .id{font:600 12px/1 ui-monospace,Consolas,monospace;color:var(--muted);
  border:1px solid var(--line);border-radius:5px;padding:3px 6px}
.task .t{font-weight:650;flex:1;min-width:200px}
.task .pct{font-variant-numeric:tabular-nums;color:var(--muted);font-size:13px}
.task dl{margin:10px 0 0;display:grid;grid-template-columns:74px 1fr;gap:3px 10px;font-size:13.5px}
.task dt{color:var(--muted)}
.task dd{margin:0}
ul.steps{list-style:none;margin:10px 0 0;padding:0;font-size:13.5px}
ul.steps li{padding:1px 0;color:var(--muted)}
ul.steps li.d{color:var(--ink)}
ul.steps li b{color:var(--ok);font-weight:700;margin-right:6px}
ul.steps li i{color:var(--muted);font-style:normal;margin-right:6px}
.notes{margin:9px 0 0;padding-left:0;list-style:none;font-size:13px;color:var(--muted)}
.notes li{padding:1px 0}
.item{border-left:3px solid var(--bad);background:var(--bad-bg);border-radius:0 8px 8px 0;
  padding:10px 13px;margin-bottom:9px}
.item.resolved{border-left-color:var(--ok);background:var(--ok-bg)}
.item.ask{border-left-color:var(--warn);background:var(--warn-bg)}
.item .meta{color:var(--muted);font-size:12.5px;margin-top:4px}
table{border-collapse:collapse;width:100%;font-size:13.5px}
th,td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
th{background:var(--accent-soft);color:var(--accent);font-size:12px;text-transform:uppercase;
  letter-spacing:.04em}
.tl{list-style:none;margin:0;padding:0;font-size:13.5px}
.tl li{display:flex;gap:10px;padding:6px 0;border-top:1px solid var(--line)}
.tl li:first-child{border-top:none}
.tl time{color:var(--muted);font-variant-numeric:tabular-nums;flex:0 0 96px;font-size:12.5px}
.tl .k{flex:0 0 88px;font-size:11.5px;font-weight:700;text-transform:uppercase;
  letter-spacing:.03em;color:var(--muted)}
.tl .k.done{color:var(--ok)}
.tl .k.blocked,.tl .k.ask{color:var(--bad)}
.tl .k.decision{color:var(--accent)}
.tl .fresh{box-shadow:inset 3px 0 0 var(--accent);padding-left:8px;margin-left:-11px}
.empty{color:var(--muted);font-size:13.5px}
footer{color:var(--muted);font-size:12px;border-top:1px solid var(--line);padding-top:12px}
details>summary{cursor:pointer;color:var(--muted);font-size:13px;padding:6px 0}
@media (max-width:640px){.tl li{flex-wrap:wrap}.tl time,.tl .k{flex:0 0 auto}}
"""

JS = """
(function(){
  var KEY='livetrack:paused:'+location.pathname, SY='livetrack:y:'+location.pathname;
  var paused=localStorage.getItem(KEY)==='1', btn=document.getElementById('pause'),
      dot=document.getElementById('dot'), timer=null;
  var y=sessionStorage.getItem(SY); if(y){window.scrollTo(0,parseInt(y,10)||0);}
  window.addEventListener('beforeunload',function(){sessionStorage.setItem(SY,String(window.scrollY));});
  function paint(){
    dot.className='dot'+(paused?' off':'');
    btn.textContent=paused?'resume live':'pause live';
    if(timer){clearTimeout(timer);timer=null;}
    if(!paused){timer=setTimeout(function(){location.reload();},REFRESH*1000);}
  }
  btn.addEventListener('click',function(){
    paused=!paused; localStorage.setItem(KEY,paused?'1':'0'); paint();
  });
  function ago(iso){
    var d=(Date.now()-new Date(iso).getTime())/1000;
    if(d<45)return 'just now';
    if(d<90)return '1 min ago';
    if(d<3600)return Math.round(d/60)+' min ago';
    if(d<7200)return '1 hour ago';
    if(d<86400)return Math.round(d/3600)+' hours ago';
    return Math.round(d/86400)+' days ago';
  }
  function ticks(){
    var n=document.querySelectorAll('[data-ago]');
    for(var i=0;i<n.length;i++){n[i].textContent=ago(n[i].getAttribute('data-ago'));}
    var f=document.querySelectorAll('[data-at]');
    for(var j=0;j<f.length;j++){
      var fresh=(Date.now()-new Date(f[j].getAttribute('data-at')).getTime())<180000;
      f[j].classList.toggle('fresh',fresh);
    }
  }
  ticks(); setInterval(ticks,20000); paint();
})();
"""


def e(value):
    return html.escape("" if value is None else str(value), quote=True)


def bar(pct, kind=""):
    return '<div class="bar %s"><i style="width:%d%%"></i></div>' % (kind, clamp(pct))


def render_task(task):
    status = task["status"]
    pct = task_progress(task)
    kind = {"done": "ok", "blocked": "bad", "todo": "muted", "dropped": "muted"}.get(status, "")
    parts = ['<article class="task %s">' % status]
    parts.append('<div class="top">')
    parts.append('<span class="id">%s</span>' % e(task["id"]))
    parts.append('<span class="t">%s</span>' % e(task["title"]))
    parts.append('<span class="pill %s">%s</span>' % (
        {"done": "green", "active": "yellow", "blocked": "red", "todo": "", "dropped": ""}.get(status, ""),
        e(status),
    ))
    parts.append('<span class="pct">%d%%</span></div>' % pct)
    parts.append(bar(pct, kind + " slim"))

    rows = []
    if task.get("what"):
        rows.append(("What", e(task["what"])))
    if task.get("objective"):
        rows.append(("Goal", e(task["objective"])))
    if task.get("verified"):
        rows.append(("Verified", e(task["verified"])))
    elif status == "done":
        rows.append(("Verified", "<b>not verified</b>"))
    if rows:
        parts.append("<dl>")
        for label, value in rows:
            parts.append("<dt>%s</dt><dd>%s</dd>" % (label, value))
        parts.append("</dl>")

    steps = task.get("steps") or []
    if steps:
        parts.append('<ul class="steps">')
        for step in steps:
            done = step.get("done")
            parts.append('<li class="%s">%s%s</li>' % (
                "d" if done else "",
                "<b>&#10003;</b>" if done else "<i>&#9675;</i>",
                e(step.get("label")),
            ))
        parts.append("</ul>")

    notes = task.get("notes") or []
    if notes:
        parts.append('<ul class="notes">')
        for note in notes[-4:]:
            parts.append("<li>%s &mdash; %s</li>" % (
                e(note.get("at", "")[11:16]), e(note.get("text"))))
        parts.append("</ul>")
    parts.append("</article>")
    return "".join(parts)


def render(state_path, html_path):
    state = json.loads(read_text(state_path))
    tasks = state.get("tasks", [])
    live = [t for t in tasks if t["status"] != "dropped"]
    done = [t for t in live if t["status"] == "done"]
    asks, blockers = open_asks(state), open_blockers(state)
    health = state.get("health")
    health_note = state.get("health_note")
    if not health:
        health, health_note = auto_health(state)
    total = overall(state)

    head = ['<header><div class="hrow"><h1>%s</h1>' % e(state.get("title") or "Untitled track")]
    if state.get("ref"):
        ref = e(state["ref"])
        if state.get("ref_url"):
            ref = '<a href="%s">%s</a>' % (e(state["ref_url"]), ref)
        head.append('<span class="chip">%s</span>' % ref)
    head.append('<span class="chip">%s</span>' % e(state.get("kind") or "task"))
    head.append('<span class="pill %s">%s%s</span>' % (
        health, e(health), " &middot; " + e(health_note) if health_note else ""))
    head.append("</div>")
    if state.get("objective"):
        head.append('<div class="sub"><b>Objective:</b> %s</div>' % e(state["objective"]))
    head.append(bar(total, "ok" if total >= 100 else ""))
    head.append(
        '<div class="sub"><span class="live"><span class="dot" id="dot"></span>'
        'live &middot; updated <span data-ago="%s">just now</span></span> '
        '&nbsp;<button class="mini" id="pause">pause live</button> '
        '&nbsp;<span>%d%% overall &middot; %d/%d tasks done</span></div>'
        % (e(state.get("updated")), total, len(done), len(live))
    )
    head.append("</header>")

    body = ["<main>"]

    if asks:
        body.append('<div class="banner red"><h3>&#9888; Needs you (%d)</h3><ol>' % len(asks))
        for ask in asks:
            extra = []
            if ask.get("why"):
                extra.append("why: " + e(ask["why"]))
            if ask.get("options"):
                extra.append("options: " + e(" / ".join(ask["options"])))
            if ask.get("task"):
                extra.append("task " + e(ask["task"]))
            if ask.get("blocking"):
                extra.append("<b>blocking</b>")
            body.append("<li><b>%s</b> %s<div class=\"meta\">%s</div></li>" % (
                e(ask["id"]), e(ask["question"]),
                " &middot; ".join(extra) if extra else ""))
        body.append("</ol></div>")

    if state.get("summary"):
        body.append('<section><h2>What this is</h2><div class="panel">%s' % e(state["summary"]))
        if state.get("scope_out"):
            body.append('<div class="meta" style="margin-top:8px;color:var(--muted);font-size:13px">'
                        "<b>Out of scope:</b> %s</div>" % e("; ".join(state["scope_out"])))
        body.append("</div></section>")

    body.append('<section><div class="tiles">')
    tiles = [
        ("%d%%" % total, "overall"),
        ("%d/%d" % (len(done), len(live)), "tasks done"),
        (str(sum(1 for t in live if t["status"] == "active")), "in flight"),
        (str(len(blockers)), "blocked"),
        (str(len(asks)), "need you"),
        (str(len(state.get("decisions", []))), "decisions"),
    ]
    for value, label in tiles:
        body.append('<div class="tile"><b>%s</b><span>%s</span></div>' % (value, label))
    body.append("</div></section>")

    body.append("<section><h2>Tasks</h2>")
    if tasks:
        order = {"blocked": 0, "active": 1, "todo": 2, "done": 3, "dropped": 4}
        for task in sorted(tasks, key=lambda t: (order.get(t["status"], 9), t["id"])):
            body.append(render_task(task))
    else:
        body.append('<div class="panel empty">No tasks tracked yet.</div>')
    body.append("</section>")

    all_blockers = state.get("blockers", [])
    if all_blockers:
        body.append("<section><h2>Blockers</h2>")
        for blocker in sorted(all_blockers, key=lambda b: bool(b.get("resolved"))):
            resolved = bool(blocker.get("resolved"))
            meta = ["owner: %s" % e(blocker.get("owner") or "?")]
            if blocker.get("task"):
                meta.append("task " + e(blocker["task"]))
            if blocker.get("needs"):
                meta.append("needs: " + e(blocker["needs"]))
            meta.append("opened " + e((blocker.get("opened") or "").replace("T", " ")[:16]))
            if resolved:
                meta.append("resolved " + e((blocker["resolved"] or "").replace("T", " ")[:16]))
            body.append('<div class="item%s"><b>%s</b> %s%s<div class="meta">%s</div></div>' % (
                " resolved" if resolved else "",
                e(blocker["id"]),
                e(blocker["what"]),
                " &rarr; <b>%s</b>" % e(blocker.get("resolution")) if resolved else "",
                " &middot; ".join(meta),
            ))
        body.append("</section>")

    answered = [a for a in state.get("asks", []) if a.get("answered")]
    if answered:
        body.append("<section><h2>Answered</h2>")
        for ask in answered:
            body.append('<div class="item resolved"><b>%s</b> %s &rarr; <b>%s</b>'
                        '<div class="meta">answered %s</div></div>' % (
                            e(ask["id"]), e(ask["question"]), e(ask["answer"]),
                            e((ask["answered"] or "").replace("T", " ")[:16])))
        body.append("</section>")

    decisions = state.get("decisions", [])
    if decisions:
        body.append("<section><h2>Decisions</h2><div class=\"panel\" style=\"padding:0;overflow-x:auto\">"
                    "<table><tr><th>When</th><th>Decision</th><th>Why</th><th>By</th></tr>")
        for decision in reversed(decisions):
            what = e(decision["what"])
            if decision.get("alternative"):
                what += ' <span style="color:var(--muted)">(instead of %s)</span>' % e(decision["alternative"])
            body.append("<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>" % (
                e((decision.get("at") or "").replace("T", " ")[:16]),
                what, e(decision.get("why")), e(decision.get("by") or "claude")))
        body.append("</table></div></section>")

    events = list(reversed(state.get("events", [])))
    body.append("<section><h2>Timeline</h2><div class=\"panel\">")
    if events:
        def render_events(items):
            out = ['<ul class="tl">']
            for ev in items:
                kind = ev.get("kind", "note")
                cls = {"task-done": "done", "blocked": "blocked", "ask": "ask", "decision": "decision"}.get(kind, "")
                label = kind.replace("task-", "").replace("-", " ")
                out.append('<li data-at="%s"><time>%s</time><span class="k %s">%s</span>'
                           "<span>%s</span></li>" % (
                               e(ev.get("at")), e((ev.get("at") or "").replace("T", " ")[5:16]),
                               cls, e(label), e(ev.get("text"))))
            out.append("</ul>")
            return "".join(out)

        body.append(render_events(events[:25]))
        if len(events) > 25:
            body.append("<details><summary>%d earlier events</summary>%s</details>" % (
                len(events) - 25, render_events(events[25:])))
    else:
        body.append('<span class="empty">Nothing logged yet.</span>')
    body.append("</div></section>")

    body.append('<footer>Live board for <b>%s</b> &middot; started %s &middot; '
                "state: <code>%s</code> &middot; reloads itself every %d seconds while "
                "Claude keeps working.</footer></main>" % (
                    e(state.get("title")),
                    e((state.get("started") or "").replace("T", " ")[:16]),
                    e(os.path.basename(state_path)), REFRESH_SECONDS))

    page = (
        "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        "<title>%s &mdash; livetrack</title>\n<style>%s</style>\n</head>\n<body>\n%s\n%s\n"
        "<script>var REFRESH=%d;</script>\n<script>%s</script>\n</body>\n</html>\n"
        % (e(state.get("title") or "livetrack"), CSS, "".join(head), "".join(body),
           REFRESH_SECONDS, JS)
    )
    write_text(html_path, page)


REFRESH_SECONDS = 10


# ------------------------------------------------------------------------ cli


def build_parser():
    parser = argparse.ArgumentParser(prog="livetrack", description="live progress board")
    parser.add_argument("--root", help="project root (default: cwd)")
    parser.add_argument("--dir", help="state directory (default: <root>/.claude/livetrack)")
    parser.add_argument("--slug", help="track name (default: current)")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("init", help="start a track")
    p.add_argument("--title", required=True)
    p.add_argument("--kind", default="task", choices=["project", "ticket", "task", "feature", "bug"])
    p.add_argument("--ref", help="ticket id, e.g. ABC-412")
    p.add_argument("--ref-url", dest="ref_url")
    p.add_argument("--objective", help="the outcome that means this is finished")
    p.add_argument("--summary", help="what this work is, in plain language")
    p.add_argument("--scope-out", dest="scope_out", help="pipe-separated out-of-scope items")
    p.add_argument("--force", action="store_true")
    p.set_defaults(fn=cmd_init)

    p = sub.add_parser("meta", help="update track title/objective/summary")
    for flag in ("title", "kind", "ref", "objective", "summary"):
        p.add_argument("--" + flag)
    p.add_argument("--ref-url", dest="ref_url")
    p.add_argument("--scope-out", dest="scope_out")
    p.set_defaults(fn=cmd_meta)

    task = sub.add_parser("task", help="task operations").add_subparsers(dest="tcmd", required=True)

    p = task.add_parser("add")
    p.add_argument("--title", required=True)
    p.add_argument("--what", help="one line: what this task actually is")
    p.add_argument("--objective", help="what done looks like")
    p.add_argument("--steps", help="pipe-separated checklist")
    p.add_argument("--id")
    p.add_argument("--start", action="store_true", help="mark active immediately")
    p.set_defaults(fn=cmd_task_add)

    p = task.add_parser("start")
    p.add_argument("id")
    p.add_argument("--note")
    p.set_defaults(fn=cmd_task_start)

    p = task.add_parser("progress")
    p.add_argument("id")
    p.add_argument("pct", type=int)
    p.add_argument("--note")
    p.set_defaults(fn=cmd_task_progress)

    p = task.add_parser("step", help="tick a checklist step (1-indexed)")
    p.add_argument("id")
    p.add_argument("n", type=int)
    p.add_argument("--undo", action="store_true")
    p.set_defaults(fn=cmd_task_step)

    p = task.add_parser("edit")
    p.add_argument("id")
    for flag in ("title", "what", "objective", "steps"):
        p.add_argument("--" + flag)
    p.add_argument("--add-step", dest="add_step")
    p.set_defaults(fn=cmd_task_edit)

    p = task.add_parser("done")
    p.add_argument("id")
    p.add_argument("--verified", help="the command/test/observation that proves it")
    p.add_argument("--note")
    p.set_defaults(fn=cmd_task_done)

    p = task.add_parser("drop")
    p.add_argument("id")
    p.add_argument("--why", required=True)
    p.set_defaults(fn=cmd_task_drop)

    p = sub.add_parser("block", help="record a blocker")
    p.add_argument("--what", required=True)
    p.add_argument("--task")
    p.add_argument("--owner", default="claude", help="who has to clear it: claude|operator|external")
    p.add_argument("--needs", help="what exactly would unblock it")
    p.set_defaults(fn=cmd_block)

    p = sub.add_parser("unblock")
    p.add_argument("id")
    p.add_argument("--how", required=True)
    p.set_defaults(fn=cmd_unblock)

    p = sub.add_parser("ask", help="record something only the operator can answer")
    p.add_argument("--question", required=True)
    p.add_argument("--why", help="why it matters / what it changes")
    p.add_argument("--options", help="pipe-separated candidate answers")
    p.add_argument("--task")
    p.add_argument("--blocking", action="store_true", help="work stops until answered")
    p.set_defaults(fn=cmd_ask)

    p = sub.add_parser("answer")
    p.add_argument("id")
    p.add_argument("--answer", required=True)
    p.set_defaults(fn=cmd_answer)

    p = sub.add_parser("decision", help="record a call taken")
    p.add_argument("--what", required=True)
    p.add_argument("--why", required=True)
    p.add_argument("--instead-of", dest="instead_of", help="the alternative it beat")
    p.add_argument("--by", default="claude", choices=["claude", "operator"])
    p.add_argument("--task")
    p.set_defaults(fn=cmd_decision)

    p = sub.add_parser("note")
    p.add_argument("--text", required=True)
    p.add_argument("--task")
    p.set_defaults(fn=cmd_note)

    p = sub.add_parser("health")
    p.add_argument("level", choices=list(HEALTHS))
    p.add_argument("--note")
    p.set_defaults(fn=cmd_health)

    for name, fn in (("show", cmd_show), ("render", cmd_render), ("open", cmd_open), ("path", cmd_path)):
        sub.add_parser(name).set_defaults(fn=fn)

    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    state_path, html_path = resolve_paths(args)
    args.fn(args, state_path, html_path)


if __name__ == "__main__":
    main()

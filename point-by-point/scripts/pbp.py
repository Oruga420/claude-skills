"""point-by-point CLI: dated 'our pendings' per project (JSON truth -> root HTML + optional wiki page).

Wiki page location, first match wins:
  1. --wiki <dir>            (explicit; created if missing)
  2. PBP_WIKI_DIR env var    (absolute, or relative to --root; created if missing)
  3. <root>/.claude/wiki/    (if it already exists)
  4. <root>/wiki/            (if it already exists)
  otherwise no wiki page is written. --no-wiki (or PBP_WIKI_DIR=none) disables it.
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import os
import sys
from pathlib import Path

PREFIX = "our-pendings-"


def _today() -> str:
    return dt.date.today().isoformat()


def _dir(root: Path) -> Path:
    return root / ".claude" / "pendings"


def _day_file(root: Path, day: str) -> Path:
    return _dir(root) / f"{PREFIX}{day}.json"


def _latest_before(root: Path, day: str) -> Path | None:
    d = _dir(root)
    if not d.exists():
        return None
    files = sorted(p for p in d.glob(f"{PREFIX}*.json") if p.stem[len(PREFIX):] < day)
    return files[-1] if files else None


def _load(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def _save(root: Path, data: dict) -> None:
    p = _day_file(root, data["date"])
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def _open_today(root: Path, create: bool) -> dict | None:
    """Today's file; on first creation carry over open points from the latest previous day."""
    day = _today()
    p = _day_file(root, day)
    if p.exists():
        return _load(p)
    prev = _latest_before(root, day)
    carried = []
    if prev:
        carried = [dict(pt, carried_from=pt.get("carried_from") or _load(prev)["date"])
                   for pt in _load(prev)["points"] if pt["status"] == "open"]
    if not carried and not create:
        return None
    # Carried points keep their original id, so "point 3" means the same thing on every day's page.
    return {"date": day, "project": root.name, "points": carried}


def _fmt_point(pt: dict) -> str:
    lines = [
        f"{pt['id']}. {pt['title']}",
        f"   Why: {pt['why']}",
        f"   Blocks: {pt['blocks']}",
        f"   Impact: {pt['impact']}",
        f"   Ask: {pt['ask']}",
    ]
    return "\n".join(lines)


def _e(s: str) -> str:
    return html.escape(s or "")


def _render_html(root: Path, data: dict) -> Path:
    open_pts = [p for p in data["points"] if p["status"] == "open"]
    current = open_pts[0]["id"] if open_pts else None
    rows = []
    for pt in data["points"]:
        done = pt["status"] == "done"
        cls = "done" if done else ("current" if pt["id"] == current else "open")
        badge = '<span class="b done">DONE</span>' if done else (
            '<span class="b cur">NOW</span>' if pt["id"] == current else '<span class="b open">OPEN</span>')
        extra = f'<p class="note">Closed: {_e(pt.get("note", ""))} <span class="muted">{_e(pt.get("done_at", ""))}</span></p>' if done else ""
        carried = f' <span class="muted">(from {_e(pt["carried_from"])})</span>' if pt.get("carried_from") else ""
        rows.append(f"""<li class="pt {cls}"><div class="h">{badge}<span class="n">{pt['id']}</span>
<span class="t">{_e(pt['title'])}</span>{carried}<span class="owner">{_e(pt.get('owner', ''))}</span></div>
<dl><dt>Why</dt><dd>{_e(pt['why'])}</dd><dt>Blocks</dt><dd>{_e(pt['blocks'])}</dd>
<dt>Impact</dt><dd>{_e(pt['impact'])}</dd><dt>Ask</dt><dd>{_e(pt['ask'])}</dd></dl>{extra}</li>""")
    n_done = sum(1 for p in data["points"] if p["status"] == "done")
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Our Pendings {data['date']}</title>
<style>
:root{{--bg:#f6f5f2;--card:#fff;--ink:#1d1d1b;--muted:#6b6a66;--line:#e3e1db;--cur:#2f4f8f;--cur-bg:#e8eefb;--ok:#1e6b3a;--ok-bg:#e3f3e8;--open:#9a6400;--open-bg:#fdf1dc}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#141413;--card:#1f1f1d;--ink:#ecebe6;--muted:#9d9b94;--line:#34332f;--cur:#8fb0ff;--cur-bg:#1d2740;--ok:#7fd49b;--ok-bg:#16301f;--open:#f2b544;--open-bg:#352a14}}}}
:root[data-theme="dark"]{{--bg:#141413;--card:#1f1f1d;--ink:#ecebe6;--muted:#9d9b94;--line:#34332f;--cur:#8fb0ff;--cur-bg:#1d2740;--ok:#7fd49b;--ok-bg:#16301f;--open:#f2b544;--open-bg:#352a14}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}}
main{{max-width:860px;margin:0 auto;padding:28px 16px 60px}}h1{{margin:0 0 4px;font-size:24px}}.sub{{color:var(--muted);margin:0 0 20px}}
ol{{list-style:none;padding:0;margin:0}}.pt{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:10px 0}}
.pt.current{{border-color:var(--cur);box-shadow:0 0 0 2px var(--cur-bg)}}.pt.done{{opacity:.6}}.pt.done .t,.pt.done dd{{text-decoration:line-through}}
.h{{display:flex;gap:10px;align-items:center;flex-wrap:wrap}}.n{{font-weight:700}}.t{{font-weight:600;flex:1 1 300px}}.owner{{color:var(--muted);font-size:13px}}
.b{{font-size:11px;font-weight:700;letter-spacing:.05em;padding:2px 8px;border-radius:999px}}.b.done{{color:var(--ok);background:var(--ok-bg)}}.b.cur{{color:var(--cur);background:var(--cur-bg)}}.b.open{{color:var(--open);background:var(--open-bg)}}
dl{{display:grid;grid-template-columns:70px 1fr;gap:2px 12px;margin:10px 0 0}}dt{{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.05em;padding-top:2px}}dd{{margin:0;overflow-wrap:anywhere}}
.note{{margin:8px 0 0;color:var(--ok)}}.muted{{color:var(--muted);font-weight:400}}
</style></head><body><main>
<h1>Our pendings · {data['date']}</h1>
<p class="sub">{_e(data['project'])} · {n_done} done of {len(data['points'])} · one point at a time, most blocking first</p>
<ol>{''.join(rows)}</ol></main></body></html>"""
    out = root / f"{PREFIX}{data['date']}.html"
    out.write_text(page, encoding="utf-8")
    return out


def _wiki_dir(root: Path, explicit: Path | None, disabled: bool) -> Path | None:
    if disabled:
        return None
    env = os.environ.get("PBP_WIKI_DIR", "").strip()
    if env.lower() in ("none", "off", "0"):
        return None
    for chosen in (explicit, Path(env) if env else None):
        if chosen is not None:
            chosen = chosen if chosen.is_absolute() else root / chosen
            chosen.mkdir(parents=True, exist_ok=True)
            return chosen
    for cand in (root / ".claude" / "wiki", root / "wiki"):
        if cand.exists():
            return cand
    return None


def _render_wiki(root: Path, wiki: Path | None) -> Path | None:
    if wiki is None:
        return None
    days = sorted(_dir(root).glob(f"{PREFIX}*.json"), reverse=True)
    lines = [
        "# Our pendings",
        "",
        f"**Last updated:** {_today()}",
        "**Tags:** pendings, point-by-point, operator",
        "**Related:** [[log]]",
        "",
        "Living index of the operator's pendings, written by `/point-by-point` (`pbp.py`). One dated file per day with open",
        "points, open ones carry over. Physical page per day: `our-pendings-YYYY-MM-DD.html` in the project root.",
        "",
    ]
    for p in days:
        d = _load(p)
        link = Path(os.path.relpath(root / f"{PREFIX}{d['date']}.html", wiki)).as_posix()
        lines.append(f"## {d['date']} ([html]({link}))")
        for pt in d["points"]:
            mark = "x" if pt["status"] == "done" else " "
            title = f"~~{pt['title']}~~" if pt["status"] == "done" else pt["title"]
            tail = f" (done: {pt.get('note', '')})" if pt["status"] == "done" else f" (ask: {pt['ask']})"
            lines.append(f"- [{mark}] {pt['id']}. {title}{tail}")
        lines.append("")
    out = wiki / "our-pendings.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    return out


_WIKI: Path | None = None


def _render(root: Path, data: dict) -> None:
    h = _render_html(root, data)
    w = _render_wiki(root, _WIKI)
    print(f"html: {h}")
    if w:
        print(f"wiki: {w}")


def main() -> int:
    ap = argparse.ArgumentParser(prog="pbp")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("add", "edit", "next", "done", "list", "render"):
        s = sub.add_parser(name)
        s.add_argument("--root", required=True, type=Path)
        s.add_argument("--wiki", type=Path, default=None,
                       help="wiki dir for our-pendings.md (overrides PBP_WIKI_DIR and auto-detect)")
        s.add_argument("--no-wiki", action="store_true", help="do not write the wiki page")
        if name == "add":
            for f in ("title", "why", "blocks", "impact", "ask"):
                s.add_argument(f"--{f}", required=True)
            s.add_argument("--owner", default="", help="who owns the ask, any name or role")
        if name == "edit":
            s.add_argument("--id", required=True, type=int)
            for f in ("title", "why", "blocks", "impact", "ask", "owner"):
                s.add_argument(f"--{f}")
        if name == "done":
            s.add_argument("--id", required=True, type=int)
            s.add_argument("--note", default="")
    a = ap.parse_args()
    root = a.root.resolve()
    global _WIKI
    _WIKI = _wiki_dir(root, a.wiki.resolve() if a.wiki else None, a.no_wiki)

    if a.cmd == "add":
        data = _open_today(root, create=True)
        assert data is not None
        nid = max((p["id"] for p in data["points"]), default=0) + 1
        data["points"].append({"id": nid, "title": a.title, "why": a.why, "blocks": a.blocks,
                               "impact": a.impact, "ask": a.ask, "owner": a.owner,
                               "status": "open", "opened": _today()})
        _save(root, data)
        _render(root, data)
        print(f"added #{nid}")
        return 0

    data = _open_today(root, create=False)
    if data is None:
        print("no open pendings")
        return 0
    if a.cmd == "edit":
        pt = next((p for p in data["points"] if p["id"] == a.id), None)
        if pt is None:
            print(f"no point #{a.id}", file=sys.stderr)
            return 1
        for f in ("title", "why", "blocks", "impact", "ask", "owner"):
            if getattr(a, f) is not None:
                pt[f] = getattr(a, f)
        _save(root, data)
        _render(root, data)
        print(_fmt_point(pt))
        return 0
    if a.cmd == "done":
        pt = next((p for p in data["points"] if p["id"] == a.id), None)
        if pt is None:
            print(f"no point #{a.id}", file=sys.stderr)
            return 1
        pt.update(status="done", note=a.note, done_at=dt.datetime.now().strftime("%Y-%m-%d %H:%M"))
        _save(root, data)
        _render(root, data)
        nxt = next((p for p in data["points"] if p["status"] == "open"), None)
        print(f"done #{a.id}")
        print(_fmt_point(nxt) if nxt else "all points done")
        return 0
    if a.cmd == "next":
        nxt = next((p for p in data["points"] if p["status"] == "open"), None)
        print(_fmt_point(nxt) if nxt else "all points done")
        return 0
    if a.cmd == "list":
        for p in data["points"]:
            print(f"[{'x' if p['status'] == 'done' else ' '}] {p['id']}. {p['title']}")
        return 0
    _save(root, data)
    _render(root, data)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

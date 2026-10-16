#!/usr/bin/env python3
"""
ttm.py - talk-to-me engine.

Camera-gated, cross-session voice notifications for Claude Code.

The rule: NOTHING is ever spoken unless the configured webcam can actually SEE the
operator. If the camera is missing, busy, or the frame is black, the announcement is
parked in a queue shared by every Claude Code session on this machine. The next time
any session checks and the operator IS there, the whole backlog is handed over at once
so it can be said as ONE voice message (saves ElevenLabs characters and the operator's
patience).

State lives centrally at ~/.claude/talk-to-me/ (override with TTM_HOME), but every session
works against it independently. All mutations are taken under a lock so concurrent sessions
cannot corrupt the queue, double-speak an item, or talk over each other.

Privacy: webcam frames are captured to a temp folder, analysed locally with OpenCV,
and deleted in a finally block. No frame is ever stored long-term, logged, or uploaded.

Commands
    notify   Queue a message, then speak the backlog if the operator is on camera.
    review   Same gate, but without adding anything new (drains an existing backlog).
    say      Speak a composed line for a claim and finalise it (call after notify/review).
    check    Camera presence probe only.
    cameras  List the video devices ffmpeg sees and which one the config selects.
    status   Show queue, claims, last presence, config.
    abandon  Return a claim's items to the queue (use if composing failed).
    clear    Drop pending items (maintenance).
    init     Create the central store and config.json.

Camera selection (config.json, or env for one run):
    camera_match / TTM_CAMERA_MATCH   part of the device name, case-insensitive
    camera_index / TTM_CAMERA_INDEX   position in the device list (0 = first webcam), used
                                      only when no name match is configured

Every command prints a single JSON object on stdout - including on failure.
"""

import argparse
import errno
import getpass
import hashlib
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime, timezone

os.environ.setdefault("OPENCV_LOG_LEVEL", "ERROR")

try:
    # PowerShell 5.1 hands Python a cp1252 pipe; Spanish accents would raise on write.
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HOME = os.path.expanduser("~")
STORE = os.environ.get("TTM_HOME") or os.path.join(HOME, ".claude", "talk-to-me")
SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

QUEUE_PATH = os.path.join(STORE, "queue.json")
HISTORY_PATH = os.path.join(STORE, "history.md")
PRESENCE_PATH = os.path.join(STORE, "presence.json")
CONFIG_PATH = os.path.join(STORE, "config.json")
LOCK_DIR = os.path.join(STORE, "locks")
QUEUE_LOCK = os.path.join(LOCK_DIR, "queue.lock")
CAMERA_LOCK = os.path.join(LOCK_DIR, "camera.lock")

DEFAULT_CONFIG = {
    "camera_match": "",          # empty = no name filter, camera_index decides
    "camera_index": 0,           # 0 = first video device ffmpeg lists
    "allow_camera_fallback": False,
    "fallback_camera_match": "",
    "voice_id": "",              # ELEVENLABS_VOICE_ID (env or .env) wins over this
    "model_id": "eleven_v3",
    "language": "es",            # language of the spoken announcement
    "operator_name": "",         # how to address the operator; empty = neutral
    "allow_sapi_fallback": False,
    "ffmpeg": "",
    "frames": 12,
    "analyze_last": 4,
    "black_mean": 10.0,
    "black_std": 6.0,
    "face_conf": 0.6,
    "detect_max_width": 1280,
    "presence_cache_seconds": 10,
    "presence_absent_cache_seconds": 20,
    "claim_stale_seconds": 300,
    "claim_speak_max_age_seconds": 90,
    "capture_timeout_seconds": 30,
    "enumerate_timeout_seconds": 20,
    "max_age_hours": 12,
    "lock_timeout_seconds": 30,
    "lock_stale_seconds": 90,
    "lock_hard_stale_seconds": 900,
}

KINDS = ("done", "blocker", "question", "wrap", "info")
HOSTNAME = socket.gethostname()


# --------------------------------------------------------------------------- utils


def now() -> float:
    return time.time()


def iso(ts: float = None) -> str:
    return datetime.fromtimestamp(ts if ts is not None else now(), timezone.utc).isoformat(
        timespec="seconds"
    )


def local_hhmmss(ts: float) -> str:
    return datetime.fromtimestamp(ts).strftime("%H:%M:%S")


def local_day(ts: float) -> str:
    return datetime.fromtimestamp(ts).strftime("%Y-%m-%d")


def out(obj, code=0):
    payload = json.dumps(obj, ensure_ascii=False, indent=2)
    try:
        sys.stdout.write(payload + "\n")
    except UnicodeEncodeError:
        sys.stdout.write(json.dumps(obj, ensure_ascii=True, indent=2) + "\n")
    sys.stdout.flush()
    sys.exit(code)


def ensure_store():
    os.makedirs(STORE, exist_ok=True)
    os.makedirs(LOCK_DIR, exist_ok=True)


def test_frames_dir() -> str:
    """The test seam is only ACTIVE when the variable points at a real directory.
    Every consumer must agree on that, or a bad path leaves a session in a half-state."""
    d = os.environ.get("TTM_TEST_FRAMES_DIR", "")
    return d if d and os.path.isdir(d) else ""


def _as_index(value, default=0) -> int:
    try:
        return max(0, int(str(value).strip()))
    except (TypeError, ValueError):
        return default


def camera_override() -> bool:
    """A per-run camera choice from the environment. Its verdicts describe a camera the
    rest of the machine did not ask for, so they never become the shared cached answer."""
    return bool(os.environ.get("TTM_CAMERA_MATCH") or os.environ.get("TTM_CAMERA_INDEX"))


def dotenv_value(name: str) -> str:
    """Process env first, then <skill>/.env, then <store>/.env. Values are never logged."""
    if os.environ.get(name):
        return os.environ[name].strip()
    for path in (os.path.join(SKILL_DIR, ".env"), os.path.join(STORE, ".env")):
        try:
            with open(path, "r", encoding="utf-8-sig") as fh:
                for line in fh:
                    key, sep, val = line.strip().partition("=")
                    if sep and key.strip() == name:
                        val = val.strip().strip('"').strip("'")
                        if val:
                            return val
        except OSError:
            continue
    return ""


def load_config() -> dict:
    cfg = dict(DEFAULT_CONFIG)
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8-sig") as fh:
                cfg.update(json.load(fh) or {})
        except Exception:
            pass
    cfg["camera_match"] = str(cfg.get("camera_match") or "")
    cfg["camera_index"] = _as_index(cfg.get("camera_index"))
    if os.environ.get("TTM_CAMERA_MATCH"):
        cfg["camera_match"] = os.environ["TTM_CAMERA_MATCH"]
    if os.environ.get("TTM_CAMERA_INDEX"):
        # an index chosen for this run replaces the configured name filter
        cfg["camera_match"] = os.environ.get("TTM_CAMERA_MATCH", "")
        cfg["camera_index"] = _as_index(os.environ["TTM_CAMERA_INDEX"])
    if os.environ.get("TTM_FFMPEG"):
        cfg["ffmpeg"] = os.environ["TTM_FFMPEG"]
    if os.environ.get("TTM_OPERATOR_NAME"):
        cfg["operator_name"] = os.environ["TTM_OPERATOR_NAME"]
    return cfg


def camera_label(cfg: dict) -> str:
    return (f"name contains '{cfg['camera_match']}'" if cfg["camera_match"]
            else f"device #{cfg['camera_index']}")


def select_camera(devices: list, cfg: dict):
    """The configured camera among the listed devices, or None. A name match wins; without
    one, the index picks (0 = the first webcam ffmpeg lists)."""
    wanted = cfg["camera_match"].strip().lower()
    if wanted:
        return next((d for d in devices if wanted in d.lower()), None)
    idx = cfg["camera_index"]
    return devices[idx] if idx < len(devices) else None


def atomic_write_json(path: str, obj):
    """Windows refuses MoveFileEx while any reader holds the destination open, so the
    replace gets a bounded retry; the temp file is unlinked whatever happens."""
    tmp = f"{path}.tmp-{os.getpid()}-{uuid.uuid4().hex[:6]}"
    try:
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(obj, fh, ensure_ascii=False, indent=2)
            fh.flush()
            os.fsync(fh.fileno())
        last = None
        for attempt in range(6):
            try:
                os.replace(tmp, path)
                return
            except PermissionError as exc:
                last = exc
                time.sleep(0.05 * (attempt + 1))
        raise last
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


def write_config(cfg: dict):
    atomic_write_json(CONFIG_PATH, cfg)


# ---------------------------------------------------------------------- liveness


def pid_alive(pid: int) -> bool:
    """Is that process still running? A lock is only safe to steal when its owner is
    gone - age alone cannot tell a crash from a legitimately long hold."""
    if not pid or pid <= 0:
        return False
    if os.name != "nt":
        try:
            os.kill(pid, 0)
            return True
        except ProcessLookupError:
            return False
        except PermissionError:
            return True
    # NEVER use os.kill on Windows for a liveness probe: it terminates the target.
    try:
        import ctypes

        kernel32 = ctypes.windll.kernel32
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        STILL_ACTIVE = 259
        handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, int(pid))
        if not handle:
            # 87 = ERROR_INVALID_PARAMETER -> no such pid. Anything else (e.g. access
            # denied) means it exists but we cannot query it: assume alive.
            return kernel32.GetLastError() != 87
        try:
            code = ctypes.c_ulong()
            if kernel32.GetExitCodeProcess(handle, ctypes.byref(code)):
                return code.value == STILL_ACTIVE
            return True
        finally:
            kernel32.CloseHandle(handle)
    except Exception:
        return True  # cannot tell -> never steal


# ---------------------------------------------------------------------------- lock


class FileLock:
    """Cross-process lock built on O_CREAT|O_EXCL, with liveness-gated stale recovery.

    Windows will not let anyone delete a file whose owner still holds the handle, so a
    steal attempt against a LIVE holder always fails. The waiter must therefore fall
    through to the timeout check and the backoff sleep on every failed steal - looping
    straight back to the top would spin a core until the holder happened to exit, and
    would never raise TimeoutError.
    """

    def __init__(self, path, timeout=30.0, stale=90.0, hard_stale=900.0):
        self.path = path
        self.timeout = timeout
        self.stale = stale
        self.hard_stale = hard_stale
        self.fd = None

    def _owner(self):
        try:
            with open(self.path, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except Exception:
            return {}

    def _stealable(self, age: float) -> bool:
        if age > self.hard_stale:
            return True                      # absolute backstop for unknown owners
        if age <= self.stale:
            return False
        owner = self._owner()
        if owner.get("host") not in (None, HOSTNAME):
            return False                     # someone else's machine: never guess
        return not pid_alive(int(owner.get("pid") or 0))

    def touch(self):
        """Refresh the mtime during a long legitimate hold so waiters do not mistake
        slow work (a camera capture, a suspended laptop) for a dead owner."""
        try:
            os.utime(self.path, None)
        except OSError:
            pass

    def __enter__(self):
        started = now()
        delay = 0.02
        while True:
            try:
                self.fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(self.fd, json.dumps(
                    {"pid": os.getpid(), "ts": now(), "host": HOSTNAME}).encode())
                return self
            except FileExistsError:
                pass
            except OSError as exc:
                if exc.errno != errno.EACCES:
                    raise

            try:
                age = now() - os.path.getmtime(self.path)
            except OSError:
                age = None                    # vanished or unreadable between checks

            stolen = False
            if age is not None and self._stealable(age):
                try:
                    os.remove(self.path)
                    stolen = True
                except OSError:
                    stolen = False            # owner still holds the handle -> alive
            if stolen:
                continue
            # Every other path MUST fall through to the timeout check and the sleep below.
            # Looping back without both is how a lock waiter burns a core forever.
            if now() - started > self.timeout:
                raise TimeoutError(
                    f"could not acquire {os.path.basename(self.path)} after {self.timeout:.0f}s"
                )
            time.sleep(delay)
            delay = min(delay * 1.6, 0.25)

    def __exit__(self, *exc):
        if self.fd is not None:
            try:
                os.close(self.fd)
            except OSError:
                pass
        try:
            os.remove(self.path)
        except OSError:
            pass
        return False


def queue_lock(cfg):
    return FileLock(QUEUE_LOCK, float(cfg["lock_timeout_seconds"]),
                    float(cfg["lock_stale_seconds"]), float(cfg["lock_hard_stale_seconds"]))


# --------------------------------------------------------------------------- queue


def empty_queue() -> dict:
    return {"version": 1, "updated": iso(), "history_day": "", "pending": [], "claims": {}}


def load_queue() -> tuple:
    """Returns (queue, note). Quarantine is reserved for genuinely unparseable content -
    a transient read error must never be allowed to destroy a real backlog."""
    if not os.path.exists(QUEUE_PATH):
        return empty_queue(), None
    last_os_error = None
    for attempt in range(3):
        try:
            with open(QUEUE_PATH, "r", encoding="utf-8-sig") as fh:
                data = json.load(fh)
            break
        except (json.JSONDecodeError, ValueError) as exc:
            return _quarantine(f"unparseable: {exc}")
        except OSError as exc:
            last_os_error = exc
            time.sleep(0.05 * (attempt + 1))
    else:
        raise last_os_error

    try:
        if not isinstance(data, dict):
            raise ValueError("queue root is not an object")
        data.setdefault("version", 1)
        data.setdefault("pending", [])
        data.setdefault("claims", {})
        data.setdefault("history_day", "")
        if not isinstance(data["pending"], list) or not isinstance(data["claims"], dict):
            raise ValueError("queue shape invalid")
    except ValueError as exc:
        return _quarantine(f"bad shape: {exc}")
    return data, None


def _quarantine(reason: str) -> tuple:
    dest = os.path.join(STORE, f"queue.corrupt-{int(now())}.json")
    try:
        os.replace(QUEUE_PATH, dest)
    except OSError:
        dest = None
    return empty_queue(), {"quarantined": dest, "reason": reason}


def save_queue(q: dict):
    q["updated"] = iso()
    atomic_write_json(QUEUE_PATH, q)


def reclaim_stale(q: dict, cfg: dict) -> int:
    """A session that claimed items and died must not swallow them."""
    limit = float(cfg["claim_stale_seconds"])
    reclaimed = 0
    for cid, claim in list(q["claims"].items()):
        if now() - float(claim.get("ts", 0)) > limit:
            q["pending"].extend(claim.get("items", []))
            reclaimed += len(claim.get("items", []))
            del q["claims"][cid]
    if reclaimed:
        q["pending"].sort(key=lambda i: i.get("ts", 0))
    return reclaimed


def live_claims(q: dict, cfg: dict) -> list:
    limit = float(cfg["claim_stale_seconds"])
    return [c for c in q["claims"].values() if now() - float(c.get("ts", 0)) < limit]


def expire_old(q: dict, cfg: dict) -> list:
    limit = float(cfg["max_age_hours"]) * 3600.0
    keep, dropped = [], []
    for item in q["pending"]:
        (dropped if now() - float(item.get("ts", 0)) > limit else keep).append(item)
    q["pending"] = keep
    return dropped


# ------------------------------------------------------------------------- history


def history_append(q: dict, lines: list) -> bool:
    """Append to the shared markdown log. Caller must already hold the queue lock AND
    must have persisted the queue first - the log is a record of what the queue says
    happened, so it can never be the thing that survives a crash on its own."""
    day = local_day(now())
    try:
        fresh = not os.path.exists(HISTORY_PATH)
        if fresh:
            # UTF-8 *with BOM* so PowerShell 5.1's Get-Content does not mangle accents.
            # The BOM goes in once, at creation; writing it on every append corrupts it.
            with open(HISTORY_PATH, "w", encoding="utf-8-sig") as fh:
                fh.write("# talk-to-me - historial de avisos de voz\n\n")
                fh.write(
                    "Append-only. Toda sesion de Claude Code en esta maquina escribe aqui.\n"
                    "`queued` = encolado; `spoken` = dicho en voz; `expired` = caduco sin decirse.\n\n"
                )
        need_header = fresh or q.get("history_day") != day
        with open(HISTORY_PATH, "a", encoding="utf-8") as fh:
            if need_header:
                fh.write(f"\n## {day}\n\n")
            for line in lines:
                fh.write(line.rstrip() + "\n")
        q["history_day"] = day
        return True
    except OSError:
        return False


def record(q: dict, lines: list) -> bool:
    """Persist the queue, then log. Order matters: see history_append."""
    save_queue(q)
    ok = history_append(q, lines)
    if ok:
        save_queue(q)          # history_day moved
    return ok


def hist_line(kind_label: str, item: dict, extra: str = "") -> str:
    ts = float(item.get("ts", now()))
    return (f"- `{local_hhmmss(ts)}` **{kind_label}** · sesion `{item.get('session_short', '?')}`"
            f" · proyecto `{item.get('project', '?')}`{extra}")


def esc(text: str) -> str:
    return " ".join(str(text).split()).replace("|", "/")


# -------------------------------------------------------------------------- camera


def find_ffmpeg(cfg: dict) -> str:
    if cfg.get("ffmpeg") and os.path.exists(cfg["ffmpeg"]):
        return cfg["ffmpeg"]
    found = shutil.which("ffmpeg")
    if found:
        return found
    import glob

    hits = sorted(glob.glob(os.path.join(
        HOME, "AppData", "Local", "Microsoft", "WinGet", "Packages",
        "*FFmpeg*", "*", "bin", "ffmpeg.exe")))
    return hits[-1] if hits else ""


def list_video_devices(ffmpeg: str, timeout: float):
    """DirectShow device names in enumeration order, or None if the probe itself failed
    - an empty list and a failed probe must not be reported as the same thing."""
    try:
        proc = subprocess.run(
            [ffmpeg, "-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"],
            capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return None
    except OSError:
        return None
    blob = ((proc.stderr or b"").decode("utf-8", "replace")
            + (proc.stdout or b"").decode("utf-8", "replace"))
    # lines look like:  [in#0 @ 0x..] "HD Webcam" (video)
    return re.findall(r'"([^"]+)"\s*\(video\)', blob)


def capture_frames(ffmpeg: str, device: str, workdir: str, n: int, timeout: float):
    """Grab n frames. A timed-out capture may still have written usable frames, so they
    are salvaged rather than thrown away (analyse() skips any unreadable file)."""
    pattern = os.path.join(workdir, "f%03d.png")
    cmd = [ffmpeg, "-hide_banner", "-loglevel", "error",
           "-f", "dshow", "-rtbufsize", "128M", "-i", f"video={device}",
           "-frames:v", str(n), "-y", pattern]
    note = ""
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=timeout)
        err = (proc.stderr or b"").decode("utf-8", "replace").strip().splitlines()
        note = err[-1][:200] if err else ""
    except subprocess.TimeoutExpired:
        note = "capture timed out"
    except OSError as exc:
        return [], f"ffmpeg could not run: {exc}"

    try:
        frames = sorted(os.path.join(workdir, f) for f in os.listdir(workdir)
                        if f.startswith("f") and f.endswith(".png"))
    except OSError:
        frames = []
    if not frames:
        return [], note or "no frames produced"
    return frames, note


def analyse(frames: list, cfg: dict) -> dict:
    import cv2

    stats, best_conf, faces_found = [], 0.0, 0
    model = os.path.join(SKILL_DIR, "models", "face_detection_yunet_2023mar.onnx")
    detector = None
    if os.path.exists(model):
        try:
            detector = cv2.FaceDetectorYN.create(
                model, "", (320, 320), float(cfg["face_conf"]), 0.3, 5000)
        except Exception:
            detector = None

    for path in frames:
        img = cv2.imread(path)
        if img is None:
            continue
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        stats.append({"mean": round(float(gray.mean()), 2), "std": round(float(gray.std()), 2)})
        if detector is None:
            continue
        small = img
        max_w = int(cfg["detect_max_width"])
        if img.shape[1] > max_w:
            scale = max_w / img.shape[1]
            small = cv2.resize(img, (max_w, int(img.shape[0] * scale)))
        try:
            detector.setInputSize((small.shape[1], small.shape[0]))
            _, dets = detector.detect(small)
        except Exception:
            dets = None
        if dets is not None and len(dets):
            faces_found = max(faces_found, len(dets))
            best_conf = max(best_conf, max(float(d[14]) for d in dets))

    return {
        "stats": stats,
        "faces": faces_found,
        "confidence": round(best_conf, 3),
        "detector": "yunet" if detector is not None else "missing",
        "brightest_mean": round(max((s["mean"] for s in stats), default=0.0), 2),
        "max_std": round(max((s["std"] for s in stats), default=0.0), 2),
    }


def classify(res: dict, cfg: dict) -> dict:
    if res.get("detector") == "missing":
        res["verdict"] = "no_detector"
        res["detail"] = "YuNet model missing; presence cannot be confirmed"
    elif not res.get("stats"):
        res["verdict"] = "camera_busy"
        res["detail"] = "no readable frames"
    elif (res["brightest_mean"] < float(cfg["black_mean"])
          and res["max_std"] < float(cfg["black_std"])):
        res["verdict"] = "black"
        res["detail"] = "lens covered or no signal (frames are flat black)"
    elif res["faces"] > 0:
        res["verdict"] = "present"
        res["detail"] = f"{res['faces']} face(s), confidence {res['confidence']}"
    else:
        res["verdict"] = "absent"
        res["detail"] = "camera sees the room but no face in frame"
    return res


def probe_presence(cfg: dict) -> dict:
    """Verdicts: present | absent | black | no_camera | camera_busy | enumerate_failed |
    no_ffmpeg | no_detector"""
    stamp = {
        "ts": now(),
        "match": cfg["camera_match"],
        "index": cfg["camera_index"],
        "override": camera_override(),
        "test_mode": bool(test_frames_dir()),
    }

    # Test seam: point TTM_TEST_FRAMES_DIR at a folder of images to exercise the decision
    # logic without hardware. Results are stamped test_mode and can never satisfy a real
    # check, nor be written into the shared cache.
    tdir = test_frames_dir()
    if tdir:
        imgs = sorted(os.path.join(tdir, f) for f in os.listdir(tdir)
                      if f.lower().endswith((".png", ".jpg", ".jpeg", ".bmp")))
        if not imgs:
            return {**stamp, "verdict": "camera_busy", "detail": "test frames dir is empty"}
        res = analyse(imgs, cfg)
        res.update(stamp)
        res.update({"camera": f"TEST:{tdir}", "frames_analysed": len(imgs)})
        return classify(res, cfg)

    ffmpeg = find_ffmpeg(cfg)
    if not ffmpeg:
        return {**stamp, "verdict": "no_ffmpeg", "detail": "ffmpeg not found on PATH or WinGet"}

    devices = list_video_devices(ffmpeg, float(cfg["enumerate_timeout_seconds"]))
    if devices is None:
        return {**stamp, "verdict": "enumerate_failed",
                "detail": "ffmpeg could not list video devices (timed out or failed to run)"}

    target = select_camera(devices, cfg)
    used_fallback = False
    if target is None and cfg.get("allow_camera_fallback") and cfg.get("fallback_camera_match"):
        fb = cfg["fallback_camera_match"].lower()
        target = next((d for d in devices if fb in d.lower()), None)
        used_fallback = target is not None
    if target is None:
        return {**stamp, "verdict": "no_camera", "devices": devices,
                "detail": f"no connected video device matches ({camera_label(cfg)})"}

    workdir = tempfile.mkdtemp(prefix="ttm-cam-")
    try:
        frames, note = capture_frames(ffmpeg, target, workdir, int(cfg["frames"]),
                                      float(cfg["capture_timeout_seconds"]))
        if not frames:
            return {**stamp, "verdict": "camera_busy", "camera": target,
                    "detail": f"capture from '{target}' failed: {note}"}
        # The tail frames are the freshest ones; on a cold start the earliest frames can
        # still be mid-exposure, and a partial capture leaves the final file truncated.
        keep = frames[-int(cfg["analyze_last"]):] or frames
        res = analyse(keep, cfg)
        res.update(stamp)
        res.update({"camera": target, "fallback": used_fallback, "frames_analysed": len(keep)})
        if note:
            res["capture_note"] = note
        return classify(res, cfg)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)  # frames never outlive the check


def _cached_presence(cfg: dict):
    """A cached verdict is only reusable when it was produced by the SAME camera policy
    as this call. The cache is machine-wide; the camera policy is per-process."""
    if not os.path.exists(PRESENCE_PATH):
        return None
    try:
        with open(PRESENCE_PATH, "r", encoding="utf-8-sig") as fh:
            prev = json.load(fh)
    except Exception:
        return None
    if bool(prev.get("test_mode")) != bool(test_frames_dir()):
        return None
    if bool(prev.get("override")) != camera_override():
        return None
    if (prev.get("match") or "").lower() != cfg["camera_match"].lower():
        return None
    if not cfg["camera_match"] and _as_index(prev.get("index")) != cfg["camera_index"]:
        return None
    if prev.get("fallback") and not cfg.get("allow_camera_fallback"):
        return None
    age = now() - float(prev.get("ts", 0))
    ttl = float(cfg["presence_cache_seconds"] if prev.get("verdict") == "present"
                else cfg["presence_absent_cache_seconds"])
    if age > ttl:
        return None
    prev["cached"] = True
    prev["age_seconds"] = round(age, 1)
    return prev


def get_presence(cfg: dict, force: bool = False) -> dict:
    """Cached + camera-locked presence. Two sessions checking at once must not fight over
    the device; the loser reuses the winner's fresh verdict rather than re-probing.
    NOTE: the cache read must stay OUTSIDE the camera lock - FileLock is not re-entrant."""
    if not force:
        hit = _cached_presence(cfg)
        if hit:
            return hit
    try:
        lock = FileLock(CAMERA_LOCK, float(cfg["capture_timeout_seconds"]) + 20,
                        float(cfg["lock_stale_seconds"]), float(cfg["lock_hard_stale_seconds"]))
        with lock:
            hit = _cached_presence(cfg)   # someone may have refreshed it while we waited
            if hit:
                return hit
            lock.touch()
            res = probe_presence(cfg)
            res["cached"] = False
            # An override verdict describes a camera the rest of the machine did not ask
            # for; it must never become the shared answer.
            if not res.get("override") and not res.get("test_mode"):
                try:
                    atomic_write_json(PRESENCE_PATH, res)
                except OSError as exc:
                    res["cache_write_failed"] = str(exc)
            return res
    except TimeoutError:
        return {"verdict": "camera_busy", "ts": now(),
                "detail": "another session held the camera too long"}


# ------------------------------------------------------------------------ identity


def session_id(explicit: str = None) -> str:
    if explicit:
        return explicit
    for var in ("CLAUDE_SESSION_ID", "TTM_SESSION"):
        if os.environ.get(var):
            return os.environ[var]
    seed = f"{os.getcwd()}|{getpass.getuser()}"
    return "cwd-" + hashlib.sha1(seed.encode()).hexdigest()[:12]


def project_name(explicit: str = None, cwd: str = None) -> str:
    if explicit:
        return explicit
    base = os.path.basename((cwd or os.getcwd()).rstrip("\\/"))
    return base or "home"


def make_item(text: str, kind: str, args) -> dict:
    cwd = args.cwd or os.getcwd()
    sid = session_id(args.session)
    ts = now()
    return {
        "id": uuid.uuid4().hex[:8],
        "ts": ts,
        "iso": iso(ts),
        "session": sid,
        "session_short": sid[:8],
        "cwd": cwd,
        "project": project_name(args.project, cwd),
        "kind": kind if kind in KINDS else "info",
        "text": " ".join(text.split()),
    }


def human_age(secs: int) -> str:
    if secs < 90:
        return "hace un momento"
    if secs < 3600:
        return f"hace {secs // 60} min"
    if secs < 86400:
        h = secs // 3600
        return f"hace {h} hora" + ("s" if h > 1 else "")
    return "hace mas de un dia"


def decorate(items: list) -> list:
    for it in items:
        it["age_seconds"] = int(now() - float(it.get("ts", now())))
        it["age_human"] = human_age(it["age_seconds"])
    return items


# ------------------------------------------------------------------------ commands


def claim_all(q: dict, sid: str) -> tuple:
    cid = uuid.uuid4().hex[:10]
    items = list(q["pending"])
    q["pending"] = []
    q["claims"][cid] = {"ts": now(), "created": now(), "session": sid,
                        "state": "held", "items": items}
    return cid, items


def blocked_by_other_speaker(q: dict, cfg: dict):
    """Only one voice at a time. Without this, a message queued while another session is
    mid-announcement produces a second claim and two overlapping ElevenLabs playbacks."""
    live = live_claims(q, cfg)
    return live[0] if live else None


def cmd_notify(args, cfg):
    ensure_store()
    if not (args.text or "").strip():
        out({"ok": False, "error": "empty --text"}, 2)
    item = make_item(args.text, args.kind, args)

    with queue_lock(cfg):
        q, note = load_queue()
        reclaim_stale(q, cfg)
        q["pending"].append(item)
        logged = record(q, [hist_line("queued", item,
                                      f" · {item['kind']} — \"{esc(item['text'])}\"")])

    presence = get_presence(cfg, force=args.force_check)

    with queue_lock(cfg):
        q, note2 = load_queue()
        reclaim_stale(q, cfg)
        dropped = expire_old(q, cfg)
        base = {"ok": True, "queued_id": item["id"], "expired": len(dropped)}
        if note or note2:
            base["queue_recovered"] = note or note2
        if not logged:
            base["history_write_failed"] = True
        if dropped:
            record(q, [hist_line("expired", d, f" · {d['kind']} — \"{esc(d['text'])}\"")
                       for d in dropped])

        if presence.get("verdict") != "present":
            save_queue(q)
            return out({**base, "action": "queued", "reason": presence.get("verdict"),
                        "detail": presence.get("detail"), "camera": presence.get("camera"),
                        "presence_cached": presence.get("cached", False),
                        "pending": len(q["pending"]),
                        "note": "No se dijo nada en voz. Sigue en cola hasta que la camara "
                                "vea al operador."})

        speaker = blocked_by_other_speaker(q, cfg)
        if speaker is not None:
            save_queue(q)
            return out({**base, "action": "queued", "reason": "another_session_speaking",
                        "detail": f"la sesion {speaker.get('session', '?')[:8]} esta hablando; "
                                  "tu mensaje entra en su siguiente tanda",
                        "pending": len(q["pending"])})

        if not q["pending"]:
            save_queue(q)
            return out({**base, "action": "already_handled", "pending": 0,
                        "detail": "otra sesion tomo la cola mientras se validaba la camara; "
                                  "no digas nada"})

        cid, items = claim_all(q, session_id(args.session))
        save_queue(q)

    return out({**base, "action": "speak", "claim": cid, "count": len(items),
                "presence": {k: presence.get(k) for k in
                             ("verdict", "confidence", "camera", "faces", "cached")},
                "language": cfg["language"], "address_as": cfg["operator_name"] or None,
                "items": decorate(items),
                "next": f"Compon UN solo mensaje (idioma: {cfg['language']}) que cubra los "
                        f"items y llama: ttm.py say --claim {cid} --text \"<mensaje>\""})


def cmd_review(args, cfg):
    ensure_store()
    with queue_lock(cfg):
        q, note = load_queue()
        reclaim_stale(q, cfg)
        dropped = expire_old(q, cfg)
        if dropped:
            record(q, [hist_line("expired", d, f" · {d['kind']} — \"{esc(d['text'])}\"")
                       for d in dropped])
        else:
            save_queue(q)
        pending_count = len(q["pending"])
        speaker = blocked_by_other_speaker(q, cfg)

    base = {"ok": True, "expired": len(dropped)}
    if note:
        base["queue_recovered"] = note
    if pending_count == 0:
        # never wake the camera for an empty queue
        return out({**base, "action": "idle", "pending": 0,
                    "note": "Cola vacia; no se toco la camara."})
    if speaker is not None:
        return out({**base, "action": "queued", "reason": "another_session_speaking",
                    "pending": pending_count})

    presence = get_presence(cfg, force=args.force_check)

    with queue_lock(cfg):
        q, _ = load_queue()
        reclaim_stale(q, cfg)
        if presence.get("verdict") != "present" or not q["pending"]:
            save_queue(q)
            return out({**base, "action": "queued" if q["pending"] else "idle",
                        "reason": presence.get("verdict"), "detail": presence.get("detail"),
                        "camera": presence.get("camera"), "pending": len(q["pending"]),
                        "presence_cached": presence.get("cached", False)})
        if blocked_by_other_speaker(q, cfg) is not None:
            save_queue(q)
            return out({**base, "action": "queued", "reason": "another_session_speaking",
                        "pending": len(q["pending"])})
        cid, items = claim_all(q, session_id(args.session))
        save_queue(q)

    return out({**base, "action": "speak", "claim": cid, "count": len(items),
                "presence": {k: presence.get(k) for k in
                             ("verdict", "confidence", "camera", "faces", "cached")},
                "language": cfg["language"], "address_as": cfg["operator_name"] or None,
                "items": decorate(items),
                "next": f"ttm.py say --claim {cid} --text \"<un solo mensaje, idioma "
                        f"{cfg['language']}>\""})


def cmd_say(args, cfg):
    """Speak a composed line for a claim, then finalise it. If the TTS leg fails, or only
    reached the offline SAPI fallback, the items go BACK to pending - a message the
    operator did not actually hear in the configured language has not been delivered."""
    ensure_store()
    text = (args.text or "").strip()
    if not text:
        out({"ok": False, "error": "empty --text"}, 2)

    sid = session_id(args.session)
    with queue_lock(cfg):
        q, _ = load_queue()
        claim = q["claims"].get(args.claim)
        if claim is None:
            return out({"ok": False, "error": f"unknown or already-finalised claim '{args.claim}'",
                        "hint": "run review to re-claim the backlog"}, 3)
        if (claim.get("state") == "speaking"
                and now() - float(claim.get("ts", 0)) < float(cfg["claim_stale_seconds"])):
            return out({"ok": False, "error": "that claim is already being spoken",
                        "speaker": claim.get("speaker"), "detail": "do not retry"}, 3)
        age = now() - float(claim.get("created", claim.get("ts", now())))
        if age > float(cfg["claim_speak_max_age_seconds"]):
            items = q["claims"].pop(args.claim)["items"]
            q["pending"] = items + q["pending"]
            q["pending"].sort(key=lambda i: i.get("ts", 0))
            record(q, [f"- `{local_hhmmss(now())}` **speak_deferred** · claim `{args.claim}` · "
                       f"{len(items)} msg(s) devueltos: la camara lo vio hace {int(age)}s, "
                       "demasiado viejo para darlo por presente"])
            return out({"ok": False, "action": "speak_deferred", "returned_to_queue": len(items),
                        "detail": f"presence was confirmed {int(age)}s ago; re-run review"}, 5)
        # acquisition, not just a check: a retry must not start a second playback
        claim["state"] = "speaking"
        claim["speaker"] = sid
        claim["ts"] = now()   # heartbeat: the stale window starts when speaking starts
        save_queue(q)

    script = os.path.join(SKILL_DIR, "scripts", "speak.ps1")
    tf = tempfile.NamedTemporaryFile("w", suffix=".txt", encoding="utf-8",
                                     delete=False, prefix="ttm-say-")
    tf.write(text)
    tf.close()
    engine, err = "", ""
    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script,
             "-TextFile", tf.name], capture_output=True, timeout=240)
        stdout = (proc.stdout or b"").decode("utf-8", "replace").strip()
        err = (proc.stderr or b"").decode("utf-8", "replace").strip()
        engine = next((l for l in stdout.splitlines() if l.startswith("spoken:")), "")
    except subprocess.TimeoutExpired:
        err = "speak.ps1 timed out"
    except Exception as exc:
        err = str(exc)
    finally:
        try:
            os.unlink(tf.name)
        except OSError:
            pass

    # An offline SAPI voice reading the announcement in the wrong language is not a delivery.
    degraded = engine.startswith("spoken:sapi") and not cfg.get("allow_sapi_fallback")
    delivered = bool(engine) and not degraded

    with queue_lock(cfg):
        q, _ = load_queue()
        claim = q["claims"].pop(args.claim, None)
        if claim is None:
            # reclaimed underneath us: report it, never finalise a phantom 0-item success
            return out({"ok": False, "action": "claim_vanished",
                        "detail": "the claim was reclaimed while speaking; its items are back "
                                  "in the queue and may be announced again",
                        "engine": engine or None}, 6)
        items = claim.get("items", [])
        if not delivered:
            q["pending"] = items + q["pending"]
            q["pending"].sort(key=lambda i: i.get("ts", 0))
            label = "speak_degraded" if degraded else "speak_failed"
            reason = ("solo llego al fallback SAPI (voz offline de Windows)" if degraded
                      else esc(err)[:160] or "sin audio")
            record(q, [f"- `{local_hhmmss(now())}` **{label}** · claim `{args.claim}` · "
                       f"{len(items)} msg(s) devueltos a la cola — {reason}"])
            return out({"ok": False, "action": label, "error": reason,
                        "engine": engine or None, "returned_to_queue": len(items),
                        "pending": len(q["pending"])}, 1)

        ids = ", ".join(i["id"] for i in items) or "-"
        projs = sorted({i.get("project", "?") for i in items}) or ["?"]
        record(q, [f"- `{local_hhmmss(now())}` **spoken** · {len(items)} msg(s) [{ids}] · "
                   f"proyectos: {', '.join(projs)} · {engine}",
                   f"  - voz: \"{esc(text)}\""])
        pending_left = len(q["pending"])

    return out({"ok": True, "action": "spoken", "engine": engine, "spoken_items": len(items),
                "pending": pending_left, "text": text})


def cmd_check(args, cfg):
    ensure_store()
    # force only the outer cache read; the in-lock re-check still spares the camera when
    # a concurrent session just produced a fresh verdict
    presence = get_presence(cfg, force=True)
    with queue_lock(cfg):
        q, _ = load_queue()
        pending = len(q["pending"])
    return out({"ok": True, "presence": presence, "pending": pending})


def cmd_status(args, cfg):
    ensure_store()
    with queue_lock(cfg):
        q, note = load_queue()
        reclaimed = reclaim_stale(q, cfg)
        if reclaimed:
            save_queue(q)
        pending = decorate(list(q["pending"]))
        claims = {cid: {"session": c.get("session"), "state": c.get("state"),
                        "age_seconds": int(now() - float(c.get("ts", now()))),
                        "items": len(c.get("items", []))}
                  for cid, c in q["claims"].items()}
    presence = None
    try:
        if os.path.exists(PRESENCE_PATH):
            with open(PRESENCE_PATH, "r", encoding="utf-8-sig") as fh:
                presence = json.load(fh)
            presence["age_seconds"] = int(now() - float(presence.get("ts", now())))
    except Exception:
        presence = None
    return out({"ok": True, "store": STORE, "pending": pending, "pending_count": len(pending),
                "claims": claims, "reclaimed": reclaimed, "last_presence": presence,
                "queue_recovered": note,
                "config": {**{k: cfg[k] for k in ("camera_match", "camera_index", "model_id",
                                                  "language", "operator_name", "face_conf",
                                                  "black_mean", "max_age_hours",
                                                  "claim_stale_seconds", "allow_sapi_fallback")},
                           "camera": camera_label(cfg),
                           "voice_id": (dotenv_value("ELEVENLABS_VOICE_ID") or cfg["voice_id"]
                                        or None),
                           "api_key_found": bool(dotenv_value("ELEVENLABS_API_KEY"))},
                "history": HISTORY_PATH})


def cmd_abandon(args, cfg):
    ensure_store()
    with queue_lock(cfg):
        q, _ = load_queue()
        claim = q["claims"].pop(args.claim, None)
        if claim is None:
            return out({"ok": False, "error": f"unknown claim '{args.claim}'"}, 3)
        items = claim.get("items", [])
        q["pending"] = items + q["pending"]
        q["pending"].sort(key=lambda i: i.get("ts", 0))
        record(q, [f"- `{local_hhmmss(now())}` **abandoned** · claim `{args.claim}` · "
                   f"{len(items)} msg(s) devueltos a la cola"])
        left = len(q["pending"])
    return out({"ok": True, "returned_to_queue": len(items), "pending": left})


def cmd_clear(args, cfg):
    ensure_store()
    with queue_lock(cfg):
        q, _ = load_queue()
        n, c = len(q["pending"]), len(q["claims"])
        q["pending"], q["claims"] = [], {}
        if n or c:
            record(q, [f"- `{local_hhmmss(now())}` **cleared** · {n} pendiente(s) y "
                       f"{c} claim(s) descartados manualmente"])
        else:
            save_queue(q)
    return out({"ok": True, "dropped_pending": n, "dropped_claims": c})


def cmd_backlog(args, cfg):
    """One human line for a SessionStart hook, or silence. Deliberately cheap: it reads
    the queue and never touches the camera, so it costs a new session nothing."""
    try:
        ensure_store()
        with queue_lock(cfg):
            q, _ = load_queue()
            reclaim_stale(q, cfg)
            pending = list(q["pending"])
            speaking = bool(live_claims(q, cfg))
    except Exception:
        sys.exit(0)          # a hook must never be the reason a session fails to start
    if not pending or speaking:
        sys.exit(0)
    projects = sorted({i.get("project", "?") for i in pending})
    oldest = human_age(int(now() - min(float(i.get("ts", now())) for i in pending)))
    blockers = sum(1 for i in pending if i.get("kind") in ("blocker", "question"))
    line = (f"[talk-to-me] Hay {len(pending)} aviso(s) de voz en cola "
            f"({', '.join(projects[:4])}), el mas viejo {oldest}"
            + (f", {blockers} esperando tu decision" if blockers else "")
            + ". La camara no ha visto al operador. Para entregarlos: "
              "ttm.py review, y si devuelve action=speak, componer UN mensaje y ttm.py say.")
    sys.stdout.write(line + "\n")
    sys.exit(0)


def cmd_cameras(args, cfg):
    """List the video devices ffmpeg sees, in order, and which one the config selects.
    Never captures a frame."""
    ffmpeg = find_ffmpeg(cfg)
    if not ffmpeg:
        return out({"ok": False, "verdict": "no_ffmpeg",
                    "detail": "ffmpeg not found on PATH or WinGet"}, 1)
    devices = list_video_devices(ffmpeg, float(cfg["enumerate_timeout_seconds"]))
    if devices is None:
        return out({"ok": False, "verdict": "enumerate_failed",
                    "detail": "ffmpeg could not list video devices"}, 1)
    target = select_camera(devices, cfg)
    return out({"ok": True, "selection": camera_label(cfg), "selected": target,
                "devices": [{"index": i, "name": d, "selected": d == target}
                            for i, d in enumerate(devices)],
                "hint": "set camera_match (part of the name) or camera_index in "
                        f"{CONFIG_PATH}, or TTM_CAMERA_MATCH / TTM_CAMERA_INDEX for one run"})


def cmd_init(args, cfg):
    ensure_store()
    cfg = dict(cfg)
    cfg["ffmpeg"] = find_ffmpeg(cfg)
    for key, value in DEFAULT_CONFIG.items():
        cfg.setdefault(key, value)
    write_config(cfg)
    with queue_lock(cfg):
        q, _ = load_queue()
        save_queue(q)
    model = os.path.join(SKILL_DIR, "models", "face_detection_yunet_2023mar.onnx")
    return out({"ok": True, "store": STORE, "config": CONFIG_PATH, "queue": QUEUE_PATH,
                "history": HISTORY_PATH, "ffmpeg": cfg["ffmpeg"], "detector_model": model,
                "detector_present": os.path.exists(model),
                "api_key_found": bool(dotenv_value("ELEVENLABS_API_KEY")),
                "voice_id_set": bool(dotenv_value("ELEVENLABS_VOICE_ID") or cfg.get("voice_id")),
                "camera": camera_label(cfg)})


# ----------------------------------------------------------------------------- cli


def main():
    p = argparse.ArgumentParser(description="talk-to-me: camera-gated voice notifications")
    sub = p.add_subparsers(dest="cmd", required=True)

    def common(sp):
        sp.add_argument("--session", default=None, help="Claude Code session id")
        sp.add_argument("--project", default=None, help="project label (default: cwd basename)")
        sp.add_argument("--cwd", default=None)
        sp.add_argument("--force-check", action="store_true", help="ignore the presence cache")

    sp = sub.add_parser("notify", help="queue a message, speak the backlog if the operator is seen")
    sp.add_argument("--text", required=True)
    sp.add_argument("--kind", default="done", choices=KINDS)
    common(sp)
    sp.set_defaults(fn=cmd_notify)

    sp = sub.add_parser("review", help="drain the backlog if the operator is on camera")
    common(sp)
    sp.set_defaults(fn=cmd_review)

    sp = sub.add_parser("say", help="speak a composed line for a claim and finalise it")
    sp.add_argument("--claim", required=True)
    sp.add_argument("--text", required=True)
    common(sp)
    sp.set_defaults(fn=cmd_say)

    sp = sub.add_parser("check", help="camera presence probe only")
    common(sp)
    sp.set_defaults(fn=cmd_check)

    sp = sub.add_parser("cameras", help="list video devices and the one the config selects")
    common(sp)
    sp.set_defaults(fn=cmd_cameras)

    sp = sub.add_parser("status", help="queue, claims, last presence, config")
    common(sp)
    sp.set_defaults(fn=cmd_status)

    sp = sub.add_parser("abandon", help="return a claim's items to the queue")
    sp.add_argument("--claim", required=True)
    common(sp)
    sp.set_defaults(fn=cmd_abandon)

    sp = sub.add_parser("clear", help="drop pending items (maintenance)")
    common(sp)
    sp.set_defaults(fn=cmd_clear)

    sp = sub.add_parser("backlog", help="one-line backlog summary for a SessionStart hook")
    common(sp)
    sp.set_defaults(fn=cmd_backlog)

    sp = sub.add_parser("init", help="create the central store and config")
    common(sp)
    sp.set_defaults(fn=cmd_init)

    args = p.parse_args()
    cfg = load_config()
    # Every caller parses stdout as JSON; a traceback would leave it with nothing.
    try:
        args.fn(args, cfg)
    except SystemExit:
        raise
    except TimeoutError as exc:
        out({"ok": False, "error": str(exc), "verdict": "lock_timeout"}, 4)
    except OSError as exc:
        out({"ok": False, "error": str(exc), "verdict": "engine_error"}, 4)
    except Exception as exc:
        out({"ok": False, "error": f"{type(exc).__name__}: {exc}", "verdict": "engine_error"}, 5)


if __name__ == "__main__":
    main()

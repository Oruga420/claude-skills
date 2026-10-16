"""
Voice agent walkthrough capture (F47 to F52), for this project's voice-agent loop README.

Runs against the local dev server (APP_LOCAL=1, http://localhost:3410) with the real
ElevenLabs SDK connection expected to fail: POST /api/voice/token is mocked to return a fake
conversation token, so VoiceCall renders its popover and Orb normally, but the SDK's own
attempt to reach ElevenLabs with that fake token cannot succeed. The overlay (F50) is raised
directly through the dev-only window.__voiceDebugHook hook (src/lib/voice/callStore.ts) instead of
waiting on a real propose_* tool call, since no agent exists yet (gate 0.1 is blocked).

Each numbered step is wrapped in its own try/except so one failure never hides the others: the
script always attempts all six captures and prints what happened on each before the final
`ok N/6` line (N = shot files written that exist and are larger than 1 KB).
"""

import json
import os
import sys
import traceback

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3410"
SHOTS_DIR = os.path.join("walkthrough", "shots")
NAV_TIMEOUT_MS = 120_000
ACTION_TIMEOUT_MS = 120_000

FAKE_TOKEN_BODY = {
    "success": True,
    "data": {
        "conversation_token": "walkthrough-fake-token",
        "conversation_id": "walkthrough",
        "dynamic_variables": {
            "name": "Test User",
            "role": "admin",
            "assignedToMe": 0,
            "myOpenTickets": 0,
        },
        "expires_hint_minutes": 15,
    },
    "error": None,
}

PROPOSE_ACTION_JS = """
() => {
  const hook = window.__voiceDebugHook;
  if (!hook) {
    throw new Error('window.__voiceDebugHook is not installed (dev-only hook missing)');
  }
  const action = {
    toolName: 'propose_create_requirement',
    title: 'Creating ticket',
    lines: [
      'Category: Software',
      'Priority: High',
      'Description: I need a software license for the new designer',
    ],
    method: 'POST',
    path: '/api/requirements',
    body: {
      category: 'software',
      priority: 'high',
      description: 'I need a software license for the new designer',
    },
    speakOnSuccess: (result) => {
      const code = result && result.requirement && result.requirement.code;
      return code ? ('Filed ' + code + '.') : 'Filed the ticket.';
    },
  };
  const { proposalId } = hook.propose(action);
  window.__walkthroughProposalId = proposalId;
  return proposalId;
}
"""

STOP_PROPOSAL_JS = """
() => {
  const hook = window.__voiceDebugHook;
  const id = window.__walkthroughProposalId;
  if (hook && id) {
    hook.stop(id);
    return true;
  }
  return false;
}
"""


def shot_path(name):
    return os.path.join(SHOTS_DIR, name)


def main():
    os.makedirs(SHOTS_DIR, exist_ok=True)
    results = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        context.set_default_timeout(ACTION_TIMEOUT_MS)
        context.set_default_navigation_timeout(NAV_TIMEOUT_MS)

        def handle_token_route(route):
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(FAKE_TOKEN_BODY),
            )

        context.route("**/api/voice/token", handle_token_route)

        page = context.new_page()

        # Sign in as a test user and reuse the cookie for every later navigation.
        try:
            page.goto(BASE + "/login", wait_until="load", timeout=NAV_TIMEOUT_MS)
            resp = page.request.post(
                BASE + "/api/auth/local",
                data=json.dumps({"email": "voice-walkthrough@example.com"}),
                headers={"Content-Type": "application/json"},
            )
            if not resp.ok:
                raise RuntimeError(f"POST /api/auth/local answered {resp.status}")
            page.goto(BASE + "/", wait_until="load", timeout=NAV_TIMEOUT_MS)
            page.wait_for_timeout(3000)
            print("[setup] signed in as voice-walkthrough@example.com, on /")
        except Exception:
            print("[setup] FAILED")
            traceback.print_exc()
            # Nothing downstream can work without a session; still let the loop below run so
            # the per-step try/except blocks each report their own failure explicitly.

        # F47: the launcher pill, before it is opened.
        try:
            launcher = page.locator('[data-tour="voice-launcher"]')
            launcher.wait_for(state="visible", timeout=ACTION_TIMEOUT_MS)
            launcher.screenshot(path=shot_path("F47-voice-launcher.png"))
            results["F47"] = "ok"
        except Exception as exc:
            results["F47"] = f"FAILED: {exc}"
            traceback.print_exc()

        # Open the popover (click the launcher). This starts beginCall(), which mints the
        # mocked token above; the SDK's own connection to ElevenLabs is expected to fail
        # afterward, but the popover renders regardless of that outcome.
        try:
            page.locator('[data-tour="voice-launcher"]').click()
            page.locator('[data-testid="voice-popover"]').wait_for(state="visible", timeout=ACTION_TIMEOUT_MS)
            print("[nav] popover open")
        except Exception:
            print("[nav] FAILED to open popover")
            traceback.print_exc()

        # F48: the open popover.
        try:
            page.wait_for_timeout(1000)
            page.screenshot(path=shot_path("F48-voice-popover.png"))
            results["F48"] = "ok"
        except Exception as exc:
            results["F48"] = f"FAILED: {exc}"
            traceback.print_exc()

        # F49: zoom clip of the orb.
        try:
            orb = page.locator('[data-testid="voice-orb"]')
            orb.wait_for(state="visible", timeout=ACTION_TIMEOUT_MS)
            orb.screenshot(path=shot_path("F49-voice-orb.png"))
            results["F49"] = "ok"
        except Exception as exc:
            results["F49"] = f"FAILED: {exc}"
            traceback.print_exc()

        # F51: the transcript line, in its immediate surroundings. Captured with its parent
        # (the popover body: Orb, error notice, transcript, text row) rather than the bare
        # testid element, because the SDK never really connects here (no real agent utterance
        # ever lands), so the transcript div itself renders empty and a crop of just that div
        # is a near-blank sliver under 1 KB.
        try:
            transcript = page.locator('[data-testid="voice-transcript"]')
            transcript.wait_for(state="visible", timeout=ACTION_TIMEOUT_MS)
            transcript_area = transcript.locator("xpath=..")
            transcript_area.screenshot(path=shot_path("F51-voice-transcript.png"))
            results["F51"] = "ok"
        except Exception as exc:
            results["F51"] = f"FAILED: {exc}"
            traceback.print_exc()

        # Raise the overlay through the dev-only hook (no live agent exists to call a real
        # propose_* tool), then capture F50.
        proposal_raised = False
        try:
            proposal_id = page.evaluate(PROPOSE_ACTION_JS)
            print(f"[overlay] raised proposal {proposal_id}")
            page.locator('[data-testid="action-overlay"]').wait_for(state="visible", timeout=ACTION_TIMEOUT_MS)
            proposal_raised = True
        except Exception:
            print("[overlay] FAILED to raise")
            traceback.print_exc()

        try:
            if not proposal_raised:
                raise RuntimeError("action-overlay never became visible")
            page.wait_for_timeout(500)
            page.screenshot(path=shot_path("F50-voice-overlay.png"))
            results["F50"] = "ok"
        except Exception as exc:
            results["F50"] = f"FAILED: {exc}"
            traceback.print_exc()

        # Stop the proposal via the hook, end the call from the UI, then capture F52.
        try:
            if proposal_raised:
                page.evaluate(STOP_PROPOSAL_JS)
            end_button = page.locator('[data-testid="voice-end"]')
            end_button.wait_for(state="visible", timeout=ACTION_TIMEOUT_MS)
            if end_button.is_enabled():
                end_button.click()
            page.wait_for_timeout(1000)
            page.screenshot(path=shot_path("F52-voice-close.png"))
            results["F52"] = "ok"
        except Exception as exc:
            results["F52"] = f"FAILED: {exc}"
            traceback.print_exc()

        context.close()
        browser.close()

    expected = ["F47", "F48", "F49", "F50", "F51", "F52"]
    filenames = {
        "F47": "F47-voice-launcher.png",
        "F48": "F48-voice-popover.png",
        "F49": "F49-voice-orb.png",
        "F50": "F50-voice-overlay.png",
        "F51": "F51-voice-transcript.png",
        "F52": "F52-voice-close.png",
    }

    n_ok = 0
    for step in expected:
        path = shot_path(filenames[step])
        exists_and_sized = os.path.isfile(path) and os.path.getsize(path) > 1024
        step_note = results.get(step, "not attempted")
        print(f"{step}: {'file ok' if exists_and_sized else 'file MISSING/too small'} ({step_note})")
        if exists_and_sized:
            n_ok += 1

    print(f"ok {n_ok}/6")
    if n_ok < 6:
        sys.exit(1)


if __name__ == "__main__":
    main()

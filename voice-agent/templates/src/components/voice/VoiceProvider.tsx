'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import { DATA_CHANGED_EVENT, dispatchViewCommand, onViewCommand, type ViewCommand } from '@/lib/events';
import { VoiceCall } from './VoiceCall';
import { ActionOverlay } from './ActionOverlay';
import type { VoiceUser } from '@/lib/voice/tools/types';

interface MeResponse {
  user: { id: number; name: string; email: string; role: string };
}

/**
 * Mounted exactly once, in the root layout, after children. Every page renders its own
 * AppShell (nav rail, badge, tour), which remounts on every client-side navigation; a call
 * or an open write proposal mounted inside AppShell used to die with it. Living at the layout
 * level instead means this component itself is never remounted by routing, so React state
 * here (the open popover, the call status, the ElevenLabs conversation) survives every
 * navigation between Home, History and Admin, including a tool-driven `navigate`.
 *
 * It reads the session itself (the same /api/auth/me shape AppShell's refreshBadge already
 * reads) rather than having AppShell hand it down, since AppShell no longer outlives
 * navigation for that prop to be threaded through safely.
 */
export function VoiceProvider() {
  const pathname = usePathname();
  const router = useRouter();
  const [voiceUser, setVoiceUser] = useState<VoiceUser | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api<MeResponse>('/api/auth/me');
      setVoiceUser((prev) => {
        // Keep the same object reference when nothing the call cares about changed. VoiceCall
        // memoizes its ToolContext on `user`, which in turn decides whether the client tools
        // map is rebuilt; a fresh object on every badge-driven refresh would rebuild that for
        // no reason on an otherwise idle call.
        if (
          prev &&
          prev.id === res.user.id &&
          prev.name === res.user.name &&
          prev.email === res.user.email &&
          prev.role === res.user.role
        ) {
          return prev;
        }
        return {
          id: res.user.id,
          name: res.user.name,
          email: res.user.email,
          role: res.user.role as VoiceUser['role'],
        };
      });
    } catch {
      // No session (401), or a transient failure before one was ever established: either way
      // there is nothing to call as, so the launcher stays hidden until the next refresh.
      setVoiceUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser();
    window.addEventListener(DATA_CHANGED_EVENT, refreshUser);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, refreshUser);
  }, [refreshUser]);

  /**
   * The navigate half of every view command is performed HERE, once, because this provider is
   * mounted in the root layout and therefore listening on every page. Measured 2026-09-23 on a
   * real call: `navigate` to Admin answered ok twice and the screen never moved, because only
   * HomeClient and HistoryClient used to push the route and the person was on a page with no
   * subscriber. Filters that travel with a navigation are held until the target page is mounted
   * (pathname matches) and then re-dispatched without the navigate field, so a "filter History
   * to urgent" spoken from Home lands on History instead of being dropped by a page that was not
   * there yet.
   */
  const pendingFiltersRef = useRef<{ path: string; filters: NonNullable<ViewCommand['filters']> } | null>(null);
  useEffect(
    () =>
      onViewCommand((cmd) => {
        if (!cmd.navigate) return;
        const target = cmd.navigate.split('?')[0];
        if (cmd.filters) pendingFiltersRef.current = { path: target, filters: cmd.filters };
        // Compare the full location, query included. Measured 2026-09-23 17:43Z on a real call:
        // "/admin" to "/admin?tab=routing" was skipped because only the path was compared, so the
        // Admin tab never switched by voice.
        const current = window.location.pathname + window.location.search;
        if (cmd.navigate !== current) router.push(cmd.navigate);
      }),
    [router, pathname],
  );
  useEffect(() => {
    const pending = pendingFiltersRef.current;
    if (!pending || pending.path !== pathname) return;
    pendingFiltersRef.current = null;
    // Next tick: the page's own subscriber registers in its mount effect, after this one runs.
    const id = window.setTimeout(() => dispatchViewCommand({ filters: pending.filters }), 0);
    return () => window.clearTimeout(id);
  }, [pathname]);

  if (pathname === '/login' || !voiceUser) return null;

  return (
    <>
      <VoiceCall user={voiceUser} />
      <ActionOverlay />
    </>
  );
}

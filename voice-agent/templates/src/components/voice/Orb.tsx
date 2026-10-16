'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './voice.module.css';

export type OrbMode = 'connecting' | 'listening' | 'speaking' | 'reconnecting' | 'ended';

export interface OrbProps {
  mode: OrbMode;
  /** From useConversation()'s getOutputVolume (see node_modules/@elevenlabs/react conversation/useConversation.d.ts).
   *  Undefined outside an active session, in which case scale falls back to the mode alone. */
  getOutputVolume?: () => number;
  /** Human status line shown next to the orb and announced to screen readers. */
  statusLabel: string;
}

const POLL_MS = 100;
/** Volume from getOutputVolume is read as roughly 0..1; clamp the visual range so a quiet
 *  moment does not shrink the orb to nothing and a peak does not blow past the popover. */
const MIN_SCALE = 1;
const MAX_SCALE = 1.35;

function scaleFromVolume(volume: number): number {
  const clamped = Math.min(Math.max(volume, 0), 1);
  return MIN_SCALE + clamped * (MAX_SCALE - MIN_SCALE);
}

/**
 * The pulsing disc in the call popover: a Mist-to-Spark radial gradient circle.
 *
 * While speaking, the scale is driven by polling the SDK's getOutputVolume every 100ms
 * (see the useConversation return type: `getOutputVolume: () => number`). If the SDK is not
 * connected yet (no getter passed) the orb still shows a "speaking" look via the CSS
 * breathing class alone, since a mode without a volume source is the closer approximation.
 * While listening, a slow CSS breathe animation runs instead of volume polling because there
 * is no meaningful input-side scale to chase here (the mic level is the person's, not the
 * agent's, and pulsing to it would read as the orb reacting to the wrong speaker).
 */
export function Orb({ mode, getOutputVolume, statusLabel }: OrbProps) {
  const [scale, setScale] = useState(1);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = query.matches;
    function onChange() {
      reducedMotionRef.current = query.matches;
    }
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (reducedMotionRef.current || mode !== 'speaking' || !getOutputVolume) {
      setScale(1);
      return;
    }

    const id = setInterval(() => {
      if (reducedMotionRef.current) {
        setScale(1);
        return;
      }
      setScale(scaleFromVolume(getOutputVolume()));
    }, POLL_MS);

    return () => clearInterval(id);
  }, [mode, getOutputVolume]);

  const reduced = reducedMotionRef.current;
  const isListening = mode === 'listening' && !reduced;
  const orbClassName = [styles.orb, isListening ? styles.orbListening : '', reduced ? styles.orbStatic : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.orbRow}>
      <div
        className={orbClassName}
        style={reduced ? undefined : ({ '--orb-scale': scale } as React.CSSProperties)}
        data-testid="voice-orb"
        aria-hidden="true"
      />
      <span aria-live="polite" className={styles.statusText}>
        {statusLabel}
      </span>
    </div>
  );
}

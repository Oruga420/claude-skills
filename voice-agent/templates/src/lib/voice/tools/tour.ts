/**
 * EXAMPLE: replace with your app's own guided-tour and welcome-card tools.
 *
 * The seven tour and welcome-card voice tools.
 *
 * All seven are view tools: they never touch data, they only dispatch a TourCommand over the
 * window event bus in src/lib/events.ts and report back what happened. Tour.tsx subscribes only
 * while the tour is open, and AppShell subscribes always but declines welcome_start/welcome_skip
 * when the card is not showing, so dispatchTourCommand's return value tells these tools whether
 * anything actually happened. When nothing did, every one of them answers with the same short,
 * honest line rather than pretending it moved something that was not on screen.
 *
 * The take-the-tour tool is named tour_start rather than take_the_tour: another executor may add
 * a same-purpose tool under that name in lifecycle.ts, and two tools that both start the tour
 * would confuse the agent about which one to call.
 */

import { dispatchTourCommand, type TourCommandAction } from '../../events';
import {
  DEFAULT_RESPONSE_TIMEOUT_SECS,
  type JsonSchema,
  type ToolResult,
  type VoiceTool,
} from './types';

const NOT_OPEN_SPEAK = 'The tour is not open.';

const emptySchema: JsonSchema = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
};

/**
 * Every tool here takes no input and does exactly one thing: dispatch one TourCommand action
 * and speak one line, or the shared not-open line when dispatchTourCommand reports no one
 * acted on it.
 */
function tourCommandTool(
  name: string,
  title: string,
  description: string,
  action: TourCommandAction,
  speakOnHandled: string,
): VoiceTool<Record<string, never>, { action: TourCommandAction }> {
  return {
    name,
    title,
    description,
    kind: 'view',
    inputSchema: emptySchema,
    expectsResponse: true,
    responseTimeoutSecs: DEFAULT_RESPONSE_TIMEOUT_SECS,
    allowedRoles: 'everyone',
    annotations: { readOnlyHint: true, consequentialHint: false },
    async execute(): Promise<ToolResult<{ action: TourCommandAction }>> {
      const handled = dispatchTourCommand({ action });
      if (!handled) {
        return { ok: false, kind: 'error', speak: NOT_OPEN_SPEAK };
      }
      return { ok: true, data: { action }, speak: speakOnHandled };
    },
  };
}

export const tourStartTool = tourCommandTool(
  'tour_start',
  'Take the tour',
  'Call when the person asks to be shown around the app or to take the guided tour, from any page.',
  'start',
  'Starting the tour.',
);

export const tourNextTool = tourCommandTool(
  'tour_next',
  'Next tour step',
  'Call when the person wants to move to the next step of the guided tour that is currently open.',
  'next',
  'Moving to the next step.',
);

export const tourPreviousTool = tourCommandTool(
  'tour_previous',
  'Previous tour step',
  'Call when the person wants to go back a step in the guided tour that is currently open.',
  'previous',
  'Going back a step.',
);

export const tourSkipTool = tourCommandTool(
  'tour_skip',
  'Skip the tour',
  'Call when the person wants to close or skip the guided tour that is currently open.',
  'skip',
  'Skipping the tour.',
);

export const tourCompleteTool = tourCommandTool(
  'tour_complete',
  'Finish the tour',
  'Call when the person says they are done with the guided tour that is currently open.',
  'complete',
  'Finishing the tour.',
);

export const welcomeSkipTool = tourCommandTool(
  'welcome_skip',
  'Skip the welcome card',
  'Call when the person wants to dismiss the one-time welcome card without taking the tour.',
  'welcome_skip',
  'Skipping the welcome guide.',
);

export const welcomeStartTool = tourCommandTool(
  'welcome_start',
  'Start the tour from the welcome card',
  'Call when the person wants to dismiss the one-time welcome card by taking the tour it offers.',
  'welcome_start',
  'Showing you around.',
);

export const TOUR_TOOLS: readonly VoiceTool[] = [
  tourStartTool,
  tourNextTool,
  tourPreviousTool,
  tourSkipTool,
  tourCompleteTool,
  welcomeSkipTool,
  welcomeStartTool,
];

/**
 * See what the user is currently looking at on screen.
 *
 * Reads navigation + selection application state written by the UI screens
 * (app/lib/screen-tracking.ts) so the agent shares the user's context.
 *
 * Usage:
 *   pnpm action view-screen
 */

import { defineAction } from "@agent-native/core/action";
import { readAppState } from "@agent-native/core/application-state";
import { z } from "zod";

export default defineAction({
  description:
    "See what the user is currently looking at. Returns the navigation view and the selected entity (e.g. the open quote) from application state. Always call this first before taking any action.",
  schema: z.object({}),
  http: false,
  readOnly: true,
  run: async () => {
    const navigation = await readAppState("navigation");
    const selection = await readAppState("selection");

    const screen: Record<string, unknown> = {};
    if (navigation) screen.navigation = navigation;
    if (selection && (selection as { id?: string }).id) screen.selection = selection;

    if (Object.keys(screen).length === 0) {
      return "No application state found. Is the app running?";
    }
    return screen;
  },
});

import { useEffect } from "react";
import { startListeningTracker } from "../lib/listeningTracker";

/** Records plays into the local listening history for the app's lifetime. */
export function useListeningTracker(): void {
  useEffect(() => startListeningTracker(), []);
}

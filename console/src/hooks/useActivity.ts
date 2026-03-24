"use client";

import { useCallback, useState } from "react";
import type { ActivityEntry } from "../types/responses";

export type ActivityState = {
  activity: ActivityEntry[];
  loading: boolean;
  reload: () => Promise<void>;
};

export function useActivity(): ActivityState {
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/activity", {
        headers: { "x-console-request": "1" },
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { activity: ActivityEntry[] };
      setActivity(payload.activity ?? []);
    } catch {
      // silently fail — activity rail is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  return { activity, loading, reload };
}

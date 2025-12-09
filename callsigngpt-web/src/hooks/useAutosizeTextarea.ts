// /hooks/useAutosizeTextarea.ts
"use client";

import { useEffect } from "react";

type Opts = {
  maxPx?: number;
  minPx?: number;
};

export function useAutosizeTextarea(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  opts: Opts = {},
) {
  const MAX_INPUT_PX = opts.maxPx ?? 200;
  const MIN_INPUT_PX = opts.minPx ?? 48;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(Math.max(el.scrollHeight, MIN_INPUT_PX), MAX_INPUT_PX);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > MAX_INPUT_PX ? "auto" : "hidden";
  }, [ref, value, MAX_INPUT_PX, MIN_INPUT_PX]);
}

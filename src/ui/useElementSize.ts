import { useEffect, useState, type RefObject } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

// Observe the bounding-rect of an element. SSR-safe (returns {0, 0} until
// the first measurement) and uses ResizeObserver for cheap updates.
export function useElementSize<T extends HTMLElement>(
  ref: RefObject<T | null>,
): ElementSize {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      const { width, height } = e.contentRect;
      setSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
      );
    });
    observer.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  target: number;
  suffix?: string;
  label: string;
  prefix?: string;
  durationMs?: number;
}

export default function StatsCounter({
  target,
  suffix = "",
  label,
  prefix = "",
  durationMs = 1800,
}: Props) {
  const [value, setValue] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (hasAnimated || !ref.current) return;
    const el = ref.current;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          const start = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / durationMs);
            // easeOutCubic
            const eased = 1 - Math.pow(1 - t, 3);
            setValue(Math.round(eased * target));
            if (t < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [target, durationMs, hasAnimated]);

  return (
    <div ref={ref} style={{ textAlign: "left" }}>
      <div className="ty-stat-label" style={{ marginBottom: 14 }}>
        {label}
      </div>
      <div className="ty-stat-num">
        {prefix}
        {value}
        {suffix}
      </div>
    </div>
  );
}

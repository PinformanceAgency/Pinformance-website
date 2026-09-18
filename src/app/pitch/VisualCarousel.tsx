"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Meerdere beelden bij één sectie, als swipe: eerst wat we opzetten, dan wat
 * het oplevert. Alle slides hebben hetzelfde formaat, zodat er bij het
 * swipen niets verspringt.
 *
 * Swipen werkt met touch en trackpad (native scroll-snap), de pijlen en de
 * stippen zijn er voor wie presenteert met een muis. Geen labels op de
 * slides: de deck-regel is dat een beeld geen uitleg eronder krijgt.
 */
export default function VisualCarousel({
  slides,
  alt,
  onZoom,
}: {
  slides: string[];
  alt: string;
  onZoom: (z: { src: string; alt: string }) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () =>
      setActive(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const next = Math.max(0, Math.min(slides.length - 1, i));
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="vc">
      <div className="vc-track" ref={track}>
        {slides.map((src) => (
          <div className="vc-slide" key={src}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} onClick={() => onZoom({ src, alt })} />
          </div>
        ))}
      </div>

      <button
        type="button"
        className="vc-arrow prev"
        aria-label="Vorige"
        disabled={active === 0}
        onClick={() => go(active - 1)}
      >
        ‹
      </button>
      <button
        type="button"
        className="vc-arrow next"
        aria-label="Volgende"
        disabled={active === slides.length - 1}
        onClick={() => go(active + 1)}
      >
        ›
      </button>

      <div className="vc-dots">
        {slides.map((src, i) => (
          <button
            key={src}
            type="button"
            aria-label={`Beeld ${i + 1} van ${slides.length}`}
            className={i === active ? "on" : ""}
            onClick={() => go(i)}
          />
        ))}
      </div>
    </div>
  );
}

"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

interface Props {
  images: string[];
}

export default function ResultsCarousel({ images }: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const updateState = () => {
    const el = trackRef.current;
    if (!el) return;
    const slideWidth = el.clientWidth;
    const idx = Math.round(el.scrollLeft / slideWidth);
    setActiveIdx(idx);
    setCanPrev(el.scrollLeft > 8);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };

  useEffect(() => {
    updateState();
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () => updateState();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const scrollBy = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
  };

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div style={{ position: "relative", maxWidth: 980, margin: "0 auto" }}>
      <style>{`
        .rc-track {
          display: flex;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          scroll-behavior: smooth;
          gap: 0;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .rc-track::-webkit-scrollbar { display: none; }
        .rc-slide {
          flex: 0 0 100%;
          scroll-snap-align: center;
          scroll-snap-stop: always;
          padding: 0 8px;
          box-sizing: border-box;
        }
        .rc-slide-inner {
          background: #fff;
          border-radius: 14px;
          box-shadow: 0 1px 2px rgba(17,19,21,0.04), 0 6px 20px rgba(17,19,21,0.06);
          overflow: hidden;
        }
        .rc-arrow {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: #fff;
          border: 1px solid #ececec;
          box-shadow: 0 4px 14px rgba(17,19,21,0.1);
          color: #111315;
          display: grid;
          place-items: center;
          cursor: pointer;
          z-index: 2;
          transition: opacity .2s ease, transform .15s ease;
        }
        .rc-arrow:hover { transform: translateY(-50%) scale(1.06); }
        .rc-arrow[disabled] { opacity: 0.35; cursor: not-allowed; }
        .rc-arrow-prev { left: -8px; }
        .rc-arrow-next { right: -8px; }
        @media (min-width: 720px) {
          .rc-arrow-prev { left: -22px; }
          .rc-arrow-next { right: -22px; }
        }
        @media (max-width: 520px) {
          .rc-arrow { display: none; }
        }
        .rc-dots {
          display: flex;
          justify-content: center;
          gap: 8px;
          margin-top: 22px;
        }
        .rc-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #d0d3d6;
          border: 0;
          padding: 0;
          cursor: pointer;
          transition: background .2s ease, width .2s ease;
        }
        .rc-dot.active { background: #F0021A; width: 22px; border-radius: 4px; }
      `}</style>

      <button
        type="button"
        aria-label="Previous"
        className="rc-arrow rc-arrow-prev"
        onClick={() => scrollBy(-1)}
        disabled={!canPrev}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div ref={trackRef} className="rc-track" tabIndex={0} aria-roledescription="carousel">
        {images.map((file, i) => (
          <div key={file} className="rc-slide" aria-label={`Slide ${i + 1} of ${images.length}`}>
            <div className="rc-slide-inner">
              <Image
                src={`/ty-page/results/${file}`}
                alt={`Pinformance client result ${i + 1}`}
                width={1600}
                height={1000}
                sizes="(max-width: 980px) 100vw, 960px"
                style={{ width: "100%", height: "auto", display: "block", background: "#fff" }}
                priority={i < 2}
              />
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        aria-label="Next"
        className="rc-arrow rc-arrow-next"
        onClick={() => scrollBy(1)}
        disabled={!canNext}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      <div className="rc-dots" role="tablist">
        {images.map((_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-label={`Go to slide ${i + 1}`}
            aria-selected={i === activeIdx}
            className={`rc-dot${i === activeIdx ? " active" : ""}`}
            onClick={() => goTo(i)}
          />
        ))}
      </div>
    </div>
  );
}

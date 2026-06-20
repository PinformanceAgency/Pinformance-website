"use client";

import { useEffect, useRef, useState } from "react";

interface Review {
  name: string;
  role: string;
  text: string;
}

const REVIEWS: Review[] = [
  {
    name: "Bram Konings",
    role: "Founder",
    text:
      "I've been working together with the guys from Pinformance Agency for a while now, and it's honestly been a really nice collaboration. They have a lot of knowledge about Pinterest and a strong network within Pinterest itself. You notice that right away in how they think along, move fast, and optimize. They helped me a lot with scaling my brand, where we started working multichannel, including Pinterest. The media buying from Pinformance played a big role in reaching our niche. They actively think along and really understand both the “Pinterest user” persona and the main persona of our brand. What I really appreciate is that they don't just execute, but also share their knowledge. They take you through their strategy, think along on a content level, and make sure you actually understand what's happening. Because of that, you really learn as an entrepreneur instead of just outsourcing everything without insight.",
  },
  {
    name: "Khair Chraou",
    role: "Founder",
    text:
      "I've been working with Pinformance for almost a year and a half now, and I can honestly say I'm extremely satisfied with the collaboration. Month after month we've been consistently generating seven figure revenue with very healthy and sustainable profits coming directly from Pinterest. What really stands out is their communication and the way they truly think along with your brand. They don't just run campaigns, they actively look for opportunities to scale and help you grow long term. Whenever there are issues or challenges, they come back quickly with clear solutions, which gives a lot of confidence. If you're running a serious brand and truly want to scale, I believe Pinterest is a must-have channel. After working with Pinterest for a few months, we saw an increase in our blended ROAS. This wasn't only because of Pinterest's direct ROAS, but also because of the strength of a multichannel setup, with Pinterest helping to lift our Google ROAS as well. Pinformance is definitely a partner I would recommend. Besides the strong performance and consistency, it's also genuinely fun to advertise on Pinterest when you see how well it works and have a great connection with the team at Pinformance. Overall, a great experience and a strong recommendation. Thanks guys and keep on scaling 🚀",
  },
  {
    name: "Daniel Van Til",
    role: "Founder",
    text:
      "We came into contact with the owners of Pinformance about a year ago, recommended to us by a good friend. He said we should talk to these guys if we wanted to scale up on Pinterest, and he wasn't lying. Our brand is in a niche that Pinterest doesn't favor, but due to the experience and good contacts Pinformance has internal we still manage to get our ads through and help us with our creative strategy. The results are also strong; Pinterest is responsible for a large part of the total sales of our Brand. Thanks to Pinformance, the results have only gotten better.",
  },
  {
    name: "Karol Rosinski",
    role: "Founder",
    text:
      "Before working with Pinformance I have dabbled into Pinterest ads but saw no results and didn't have time to expand into a new channel. I regret not working with the guys sooner because as soon as we started working together, within 3 weeks Pinterest became my main platform, and had the highest and most stable roas across 4 different platforms. If you are already advertising on other platforms, and don't have time or knowledge to expand, work with the guys at Pinformance and Pinterest might just become your main platform.",
  },
  {
    name: "Kain Kolenbrander",
    role: "Founder",
    text:
      "We've been working with Thijmen and Tycho for several months now and are very pleased with the collaboration. For a brand, an omni-channel approach is one of the most important factors for growth, which is why we launched our Pinterest account and started working with Thijmen and Tycho. The results have been good, and we're very satisfied with the communication. If you have a brand and want to take the hassle out of managing Pinterest, I definitely recommend working with Thijmen and Tycho.",
  },
  {
    name: "Sinan Kaya",
    role: "Founder",
    text:
      "These guys are truly super passionate and work on e-commerce day in and day out. That's why they really understand the customer. I don't think you could find a better partner for Pinterest ads.",
  },
  {
    name: "Chris Borghouts",
    role: "Founder",
    text:
      "I've had the pleasure of working with these guys for well over a year now. The brand I'm heavily involved in originally moved over from being completely Meta-only to adding Pinterest as an extra platform. It ended up playing out a bit differently than planned, as we're now significantly outspending Meta on Pinterest, with substantial improvement in the brand's overall performance thanks to these guys. They really know everything there is to know about Pinterest, have strong connections there, and above all just an insane amount of expertise in media buying and what you specifically need to make Pinterest work successfully. If you don't get results you don't pay so there's really no reason not to give it a shot. I'm sure it could have a big impact for many other brand owners as well.",
  },
  {
    name: "Dante Merlin",
    role: "Founder",
    text:
      "Exceptional Pinterest Ads Partner — Highly Recommend. We've been working with this agency to manage all of our Pinterest advertising, and the experience has been outstanding from day one. We handle the creative assets, and they take everything else completely off our plate — campaign setup, targeting, optimization, ongoing management — all handled seamlessly. What really sets them apart is their communication. They're always responsive, proactive about updates, and easy to get ahold of when we have questions. We never have to wonder what's happening with our campaigns. Most importantly, the results speak for themselves. Our Pinterest ads have been performing consistently well, and we're seeing real returns on our investment. It's clear they know the platform inside and out. If you're looking for an agency that's professional, reliable, and actually delivers results, look no further. We couldn't be happier with the partnership.",
  },
];

const PREVIEW_CHARS = 220;

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Star() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="#FFB400"
      stroke="none"
      aria-hidden
      style={{ display: "block" }}
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export default function ReviewsCarousel() {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const updateState = () => {
    const el = trackRef.current;
    if (!el) return;
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
    const card = el.querySelector<HTMLElement>(".rv-card");
    const step = card ? card.offsetWidth + 16 : el.clientWidth * 0.9;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  const toggle = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <div style={{ position: "relative" }}>
      <style>{`
        .rv-track {
          display: flex;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          scroll-behavior: smooth;
          gap: 16px;
          padding: 4px 4px 4px 4px;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .rv-track::-webkit-scrollbar { display: none; }
        .rv-card {
          flex: 0 0 86%;
          max-width: 360px;
          scroll-snap-align: start;
          background: #1a1c1f;
          border: 1px solid #2a2d31;
          border-radius: 16px;
          padding: 22px;
          color: #fff;
          display: flex;
          flex-direction: column;
          min-height: 280px;
        }
        @media (min-width: 720px) {
          .rv-card { flex: 0 0 340px; }
        }
        .rv-stars { display: flex; gap: 3px; margin-bottom: 14px; }
        .rv-text {
          font-size: 14.5px;
          line-height: 1.55;
          color: #d8dadd;
          margin: 0 0 12px;
          white-space: pre-wrap;
        }
        .rv-readmore {
          background: none; border: 0; padding: 0;
          color: #F0021A;
          font-weight: 600;
          font-size: 14px;
          text-decoration: underline;
          cursor: pointer;
          align-self: flex-start;
          margin-bottom: 18px;
        }
        .rv-readmore:hover { color: #ff3349; }
        .rv-divider { height: 1px; background: #2a2d31; margin: auto 0 16px; }
        .rv-foot { display: flex; align-items: center; gap: 12px; }
        .rv-avatar {
          width: 40px; height: 40px;
          border-radius: 50%;
          background: #2a2d31;
          color: #fff;
          font-weight: 700;
          font-size: 13px;
          letter-spacing: 0.04em;
          display: grid; place-items: center;
          flex-shrink: 0;
        }
        .rv-name { font-size: 14.5px; font-weight: 700; color: #fff; line-height: 1.2; }
        .rv-role { font-size: 13px; color: #8a8e93; margin-top: 2px; }

        .rv-arrows { display: flex; gap: 12px; justify-content: center; margin-top: 28px; }
        .rv-arrow {
          width: 48px; height: 48px;
          border-radius: 50%;
          background: #F0021A;
          border: 0;
          color: #fff;
          display: grid; place-items: center;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(240,2,26,0.35);
          transition: background .15s ease, transform .15s ease, opacity .15s ease;
        }
        .rv-arrow:hover { background: #c80216; transform: translateY(-1px); }
        .rv-arrow[disabled] { opacity: 0.35; cursor: not-allowed; transform: none; background: #F0021A; }
      `}</style>

      <div ref={trackRef} className="rv-track" aria-roledescription="carousel">
        {REVIEWS.map((r, i) => {
          const isExpanded = expanded.has(i);
          const needsTruncate = r.text.length > PREVIEW_CHARS;
          const shown =
            !needsTruncate || isExpanded
              ? r.text
              : r.text.slice(0, PREVIEW_CHARS).trimEnd() + "…";
          return (
            <article key={r.name} className="rv-card">
              <div className="rv-stars" aria-label="5 out of 5 stars">
                <Star /><Star /><Star /><Star /><Star />
              </div>
              <p className="rv-text">{shown}</p>
              {needsTruncate && (
                <button
                  type="button"
                  className="rv-readmore"
                  onClick={() => toggle(i)}
                >
                  {isExpanded ? "Show less" : "Read more"}
                </button>
              )}
              <div className="rv-divider" />
              <div className="rv-foot">
                <div className="rv-avatar" aria-hidden>
                  {initials(r.name)}
                </div>
                <div>
                  <div className="rv-name">{r.name}</div>
                  <div className="rv-role">{r.role}</div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="rv-arrows">
        <button
          type="button"
          aria-label="Previous review"
          className="rv-arrow"
          onClick={() => scrollBy(-1)}
          disabled={!canPrev}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Next review"
          className="rv-arrow"
          onClick={() => scrollBy(1)}
          disabled={!canNext}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

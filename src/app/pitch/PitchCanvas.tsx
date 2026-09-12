"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CAT,
  CTA,
  HERO,
  HUB,
  LANE,
  LANES,
  NODE_SIZE,
  PHASE_HUBS,
  RESULTS_CARD,
  RESULTS_MORE,
  RESULTS_TITLE,
  ROADMAP_NODES,
  SECTIONS,
  SHOT,
  START_NODE,
  SUPPORT_CARD,
  SUPPORT_SHOTS,
  SUPPORT_TITLE,
  SYS,
  SYS_LABEL,
  TESTI,
  TESTIMONIALS,
  TOOLBAR_HINT,
  type RoadmapNode,
} from "./data";
import "./pitch.css";

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
interface Cam {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.12;
const MAX_SCALE = 2.4;
/** Horizontal padding is looser than vertical so wide sections don't over-zoom. */
const PAD_X = 150;
const PAD_Y = 120;

function fitBounds(
  b: { x: number; y: number; w: number; h: number },
  vw: number,
  vh: number
): Cam {
  const scale = Math.max(
    MIN_SCALE,
    Math.min((vw - PAD_X * 2) / b.w, (vh - PAD_Y * 2) / b.h, MAX_SCALE)
  );
  return {
    scale,
    x: vw / 2 - (b.x + b.w / 2) * scale,
    y: vh / 2 - (b.y + b.h / 2) * scale,
  };
}

// ---------------------------------------------------------------------------
// Edge geometry — a smooth spline through a list of points
// ---------------------------------------------------------------------------
function spline(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

const center = (n: { x: number; y: number }) => ({
  x: n.x + NODE_SIZE.w / 2,
  y: n.y + NODE_SIZE.h / 2,
});

// ---------------------------------------------------------------------------
// Layout helpers derived from the world coordinates
// ---------------------------------------------------------------------------
const TESTI_GAP = 24;
const TESTI_STRIDE = TESTI.w + TESTI_GAP;
const TESTI_ROW_Y = [2432, 2661, 2890];
const TESTI_LEFT = -798;

function testiPos(i: number) {
  // Rows of five, the remainder centred on the last row.
  const row = i < 5 ? 0 : i < 10 ? 1 : 2;
  const col = i - row * 5;
  const inRow = row === 2 ? TESTIMONIALS.length + 1 - 10 : 5;
  const rowW = inRow * TESTI.w + (inRow - 1) * TESTI_GAP;
  const left = row === 2 ? TESTI_LEFT + (1596 - rowW) / 2 : TESTI_LEFT;
  return { x: left + col * TESTI_STRIDE, y: TESTI_ROW_Y[row] };
}

const initials = (name: string) =>
  name
    .replace(/&/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

// ---------------------------------------------------------------------------

interface Stroke {
  d: string;
}

export default function PitchCanvas() {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState<Cam>({ x: 0, y: 0, scale: 0.44 });
  const [animating, setAnimating] = useState(false);
  const [active, setActive] = useState(0);
  const [tool, setTool] = useState<"pan" | "draw">("pan");
  const [openPhase, setOpenPhase] = useState<string | null>(null);
  const [detail, setDetail] = useState<RoadmapNode | null>(null);
  const [hintOpen, setHintOpen] = useState(true);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const drawing = useRef<{ pts: { x: number; y: number }[] } | null>(null);
  const [liveStroke, setLiveStroke] = useState<string>("");
  const panning = useRef<{ px: number; py: number } | null>(null);

  const camRef = useRef(cam);
  camRef.current = cam;

  // Fit a section and remember which tab is lit.
  const goTo = useCallback((i: number) => {
    const el = surfaceRef.current;
    if (!el) return;
    const next = fitBounds(SECTIONS[i].bounds, el.clientWidth, el.clientHeight);
    setActive(i);
    setAnimating(true);
    setCam(next);
    window.setTimeout(() => setAnimating(false), 760);
  }, []);

  // Initial fit, and refit on resize while the user hasn't panned manually.
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    setCam(fitBounds(SECTIONS[0].bounds, el.clientWidth, el.clientHeight));
  }, []);

  // --- Wheel zoom, anchored on the cursor ---------------------------------
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = camRef.current;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.0016);
      const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, c.scale * factor));
      const k = scale / c.scale;
      setAnimating(false);
      setCam({ scale, x: mx - (mx - c.x) * k, y: my - (my - c.y) * k });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // --- Keyboard: arrows move between sections, cmd/ctrl+Z undoes ink -------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDetail(null);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setStrokes((s) => s.slice(0, -1));
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t && /input|textarea/i.test(t.tagName)) return;
      if (e.key === "ArrowRight") goTo(Math.min(SECTIONS.length - 1, active + 1));
      if (e.key === "ArrowLeft") goTo(Math.max(0, active - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, goTo]);

  // --- Pointer: pan with right button (or left when not drawing) ----------
  const screenToWorld = useCallback((cx: number, cy: number) => {
    const el = surfaceRef.current!;
    const r = el.getBoundingClientRect();
    const c = camRef.current;
    return { x: (cx - r.left - c.x) / c.scale, y: (cy - r.top - c.y) / c.scale };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (tool === "draw" && e.button === 0) {
      const p = screenToWorld(e.clientX, e.clientY);
      drawing.current = { pts: [p] };
      setLiveStroke(`M ${p.x} ${p.y}`);
      (e.target as Element).setPointerCapture(e.pointerId);
      return;
    }
    // Left drag on empty canvas also pans — nodes stop propagation themselves.
    panning.current = { px: e.clientX, py: e.clientY };
    setAnimating(false);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (drawing.current) {
      const p = screenToWorld(e.clientX, e.clientY);
      drawing.current.pts.push(p);
      setLiveStroke(spline(drawing.current.pts));
      return;
    }
    const pan = panning.current;
    if (!pan) return;
    const dx = e.clientX - pan.px;
    const dy = e.clientY - pan.py;
    panning.current = { px: e.clientX, py: e.clientY };
    setCam((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
  };

  const onPointerUp = () => {
    if (drawing.current) {
      const d = spline(drawing.current.pts);
      if (drawing.current.pts.length > 1) setStrokes((s) => [...s, { d }]);
      drawing.current = null;
      setLiveStroke("");
    }
    panning.current = null;
  };

  const zoomBy = (k: number) => {
    const el = surfaceRef.current;
    if (!el) return;
    const c = camRef.current;
    const mx = el.clientWidth / 2;
    const my = el.clientHeight / 2;
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, c.scale * k));
    const f = scale / c.scale;
    setAnimating(false);
    setCam({ scale, x: mx - (mx - c.x) * f, y: my - (my - c.y) * f });
  };

  // --- Edges ---------------------------------------------------------------
  const edges = useMemo(() => {
    const chain = spline([
      { x: START_NODE.x + START_NODE.w / 2, y: START_NODE.y + START_NODE.h / 2 },
      ...ROADMAP_NODES.map(center),
    ]);
    // Each lane drops a feeder line down to the "more systems" label.
    const feeders = LANES.map((l) => {
      const cx = l.x + LANE.w / 2;
      return `M ${cx} ${LANE.h} L ${cx} ${SYS_LABEL.y - 40}`;
    });
    const spine = `M ${LANES[0].x + LANE.w / 2} ${SYS_LABEL.y - 40} L ${
      LANES[2].x + LANE.w / 2
    } ${SYS_LABEL.y - 40}`;
    return { chain, feeders, spine };
  }, []);

  const pct = Math.round(cam.scale * 100);

  return (
    <div className="pitch-root">
      <div
        ref={surfaceRef}
        className={`pitch-surface${panning.current ? " is-panning" : ""}${
          tool === "draw" ? " is-drawing" : ""
        }`}
        style={{
          backgroundSize: `auto, ${30 * cam.scale}px ${30 * cam.scale}px`,
          backgroundPosition: `50% -5%, ${cam.x}px ${cam.y}px`,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          className={`pitch-world${animating ? " animating" : ""}`}
          style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})` }}
        >
          {/* Edges ------------------------------------------------------- */}
          <svg className="pitch-edges" width={1} height={1}>
            <path
              d={edges.chain}
              fill="none"
              stroke="rgba(255,92,99,.42)"
              strokeWidth={2}
              strokeLinecap="round"
            />
            {edges.feeders.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="rgba(200,155,160,.18)"
                strokeWidth={1.5}
                strokeDasharray="5 7"
              />
            ))}
            <path
              d={edges.spine}
              fill="none"
              stroke="rgba(200,155,160,.18)"
              strokeWidth={1.5}
              strokeDasharray="5 7"
            />
          </svg>

          {/* Hero -------------------------------------------------------- */}
          <div
            className="n root"
            style={{ left: HERO.x, top: HERO.y, width: HERO.w, minHeight: HERO.h }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Pinformance" className="root-logo" />
            <h1>{HERO.title}</h1>
            <p>
              Jouw roadmap voor de komende <b>4 maanden</b>
              <br />
              van START naar schaalbaar — in <b>3 fases</b>
            </p>
          </div>

          {/* Start ------------------------------------------------------- */}
          <div
            className="n rmstart"
            style={{
              left: START_NODE.x,
              top: START_NODE.y,
              width: START_NODE.w,
              height: START_NODE.h,
            }}
          >
            <span className="lbl">{START_NODE.eyebrow}</span>
            <span className="ttl">{START_NODE.title}</span>
          </div>

          {/* Lanes ------------------------------------------------------- */}
          {LANES.map((l) => (
            <div
              key={l.n}
              className="n rmlane"
              style={{ left: l.x, top: LANE.y, width: LANE.w, height: LANE.h }}
            />
          ))}
          {LANES.map((l) => (
            <div
              key={`t-${l.n}`}
              className="n rmlanetitle"
              style={{ left: l.x, top: LANE.titleY, width: LANE.w, height: LANE.titleH }}
            >
              <span className="n0">{l.n}</span>
              <span className="t0">{l.title}</span>
              <span className="d0">{l.days}</span>
            </div>
          ))}

          {/* Roadmap nodes ----------------------------------------------- */}
          {ROADMAP_NODES.map((n) => (
            <button
              key={n.id}
              type="button"
              className="n rmnode"
              style={{ left: n.x, top: n.y, width: NODE_SIZE.w, height: NODE_SIZE.h }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setDetail(n)}
            >
              <span className="rmn-lbl">
                <i className="rmn-dot" />
                Systeem
              </span>
              <span className="rmn-name">{n.name}</span>
              <span className="rmn-cta">Klik om te bekijken →</span>
            </button>
          ))}

          {/* More-systems label ------------------------------------------ */}
          <div
            className="n syslbl"
            style={{
              left: SYS_LABEL.x,
              top: SYS_LABEL.y,
              width: SYS_LABEL.w,
              height: SYS_LABEL.h,
            }}
          >
            <span className="e">{SYS_LABEL.eyebrow}</span>
            <span className="t">{SYS_LABEL.title}</span>
            <span className="h">{SYS_LABEL.hint}</span>
          </div>

          {/* Phase hubs -------------------------------------------------- */}
          {PHASE_HUBS.map((h) => (
            <button
              key={h.key}
              type="button"
              className="n fhub"
              style={{ left: h.x, top: HUB.y, width: HUB.w, height: HUB.h }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setOpenPhase((p) => (p === h.key ? null : h.key))}
            >
              <span className="fhub-top">
                <span className="fhub-n">{h.n}</span>
                <span className="fhub-meta">{h.meta}</span>
              </span>
              <span className="fhub-title">{h.title}</span>
              <span className="fhub-desc">{h.desc}</span>
              <span className="fhub-stats">
                <span className="fhub-stat">
                  <span className="k">Wat je krijgt</span>
                  <span className="v">{h.count}</span>
                </span>
                <span className="fhub-stat">
                  <span className="k">Categorieën</span>
                  <span className="v">{h.cats.length}</span>
                </span>
                <span className="fhub-open">
                  {openPhase === h.key ? "▾ Sluit" : "▸ Klik voor alle systemen"}
                </span>
              </span>
            </button>
          ))}

          {/* Expanded phase detail --------------------------------------- */}
          {PHASE_HUBS.map((h) =>
            h.cats.map((c, ci) => {
              const x = h.catX + ci * 240;
              const on = openPhase === h.key;
              return (
                <div key={`${h.key}-${ci}`}>
                  <div
                    className={`n cat fdet${on ? " on" : ""}`}
                    style={{ left: x, top: CAT.y, width: CAT.w, height: CAT.h }}
                  >
                    <span className="cn">{c.name}</span>
                    <span className="cc">{c.systems.length}</span>
                  </div>
                  {c.systems.map((s, si) => (
                    <div
                      key={s + si}
                      className={`n sys fdet${on ? " on" : ""}`}
                      style={{
                        left: x,
                        top: SYS.y + si * SYS.stride,
                        width: SYS.w,
                        height: SYS.h,
                        transitionDelay: on ? `${si * 12}ms` : "0ms",
                      }}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              );
            })
          )}

          {/* Results ----------------------------------------------------- */}
          <div
            className="n testicard"
            style={{
              left: RESULTS_CARD.x,
              top: RESULTS_CARD.y,
              width: RESULTS_CARD.w,
              height: RESULTS_CARD.h,
            }}
          >
            <span className="card-title">{RESULTS_TITLE}</span>
            <span className="card-rule" />
          </div>
          {TESTIMONIALS.map((t, i) => {
            const p = testiPos(i);
            return (
              <div
                key={t.name}
                className="n testi"
                style={{ left: p.x, top: p.y, width: TESTI.w, height: TESTI.h }}
              >
                <span className="testi-badge">
                  {t.from} → {t.to} p/m
                </span>
                <span className="testi-face">
                  <span className="testi-initials">{initials(t.name)}</span>
                </span>
                <span className="testi-name">
                  {t.name}
                  {t.role && <span className="testi-role">{t.role}</span>}
                </span>
              </div>
            );
          })}
          {(() => {
            const p = testiPos(TESTIMONIALS.length);
            return (
              <div
                className="n testi more"
                style={{ left: p.x, top: p.y, width: TESTI.w, height: TESTI.h }}
              >
                <span className="plus">+</span>
                <span className="t">{RESULTS_MORE.title}</span>
                <span className="h">{RESULTS_MORE.hint}</span>
              </div>
            );
          })()}

          {/* Support ----------------------------------------------------- */}
          <div
            className="n supportcard"
            style={{
              left: SUPPORT_CARD.x,
              top: SUPPORT_CARD.y,
              width: SUPPORT_CARD.w,
              height: SUPPORT_CARD.h,
            }}
          >
            <span className="card-title">{SUPPORT_TITLE}</span>
            <span className="card-rule" />
          </div>
          {SUPPORT_SHOTS.map((s, i) => (
            <div
              key={s.title}
              className="n shotcard"
              style={{
                left: -798 + i * (SHOT.w + 30),
                top: SHOT.y,
                width: SHOT.w,
                height: SHOT.h,
              }}
            >
              <span className="shot-face">
                <span className="shot-initials">{initials(s.title)}</span>
              </span>
              <span className="shot-foot">
                <span className="t">{s.title}</span>
                <span className="r">{s.role}</span>
                {s.sub && <span className="s">{s.sub}</span>}
              </span>
            </div>
          ))}

          {/* CTA --------------------------------------------------------- */}
          <div
            className="n cta"
            style={{ left: CTA.x, top: CTA.y, width: CTA.w, minHeight: CTA.h }}
          >
            <span className="e">{CTA.eyebrow}</span>
            <span className="t">{CTA.title}</span>
            <span className="d">{CTA.desc}</span>
            <button
              type="button"
              className="b"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {CTA.button}
            </button>
          </div>

          {/* Ink layer --------------------------------------------------- */}
          <svg className="pitch-ink" width={1} height={1}>
            {strokes.map((s, i) => (
              <path
                key={i}
                d={s.d}
                fill="none"
                stroke="#ff5c63"
                strokeWidth={3 / cam.scale}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {liveStroke && (
              <path
                d={liveStroke}
                fill="none"
                stroke="#ff5c63"
                strokeWidth={3 / cam.scale}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
        </div>
      </div>

      {/* Tab bar ------------------------------------------------------- */}
      <nav className="pitch-tabs">
        {SECTIONS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`pitch-tab${i === active ? " on" : ""}`}
            onClick={() => goTo(i)}
          >
            <span className="ix">{s.index}</span>
            {s.label}
          </button>
        ))}
      </nav>

      <button
        type="button"
        className="pitch-arrow left"
        aria-label="Vorige"
        onClick={() => goTo(Math.max(0, active - 1))}
      >
        ‹
      </button>
      <button
        type="button"
        className="pitch-arrow right"
        aria-label="Volgende"
        onClick={() => goTo(Math.min(SECTIONS.length - 1, active + 1))}
      >
        ›
      </button>

      {/* Tools --------------------------------------------------------- */}
      <div className="pitch-tools">
        <button
          type="button"
          className={`pitch-tool${tool === "pan" ? " on" : ""}`}
          aria-label="Presenteren / navigeren"
          onClick={() => setTool("pan")}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 9V5h4M15 5h4v4M19 15v4h-4M9 19H5v-4" />
          </svg>
        </button>
        <button
          type="button"
          className={`pitch-tool${tool === "draw" ? " on" : ""}`}
          aria-label="Tekenen"
          onClick={() => setTool("draw")}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 19l7-7-4-4-7 7-1 5z" />
          </svg>
        </button>
      </div>

      {/* Hint ---------------------------------------------------------- */}
      {hintOpen && (
        <div className="pitch-hint">
          {TOOLBAR_HINT.map((h, i) => (
            <span key={h.k}>
              {i > 0 && <span className="sep">· </span>}
              <b>{h.k}</b> = {h.v}
            </span>
          ))}
          <button type="button" className="x" onClick={() => setHintOpen(false)}>
            ✕
          </button>
        </div>
      )}

      {/* Zoom ---------------------------------------------------------- */}
      <div className="pitch-zoom">
        <button type="button" aria-label="Uitzoomen" onClick={() => zoomBy(1 / 1.25)}>
          −
        </button>
        <span className="pct">{pct}%</span>
        <button type="button" aria-label="Inzoomen" onClick={() => zoomBy(1.25)}>
          +
        </button>
        <button type="button" aria-label="Alles in beeld" onClick={() => goTo(0)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
          </svg>
        </button>
      </div>

      {/* Detail modal --------------------------------------------------- */}
      {detail && (
        <div className="pitch-modal" onClick={() => setDetail(null)}>
          <div className="pitch-modal-panel" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="pitch-modal-close"
              aria-label="Sluiten"
              onClick={() => setDetail(null)}
            >
              ✕
            </button>
            <div className="pitch-modal-cat">{detail.cat}</div>
            <h2>{detail.name}</h2>
            <p className="pitch-modal-desc">{detail.desc}</p>

            <div className="pitch-demo">
              <div className="pitch-demo-left">
                <div className="pitch-demo-brand">Pinformance</div>
                <h3>Growth Partnership™</h3>
                <p>
                  Van waar je nu staat naar een agency/consulting-business die zónder
                  jou draait — in 120 dagen, done-with-you.
                </p>
                <ul className="pitch-demo-list">
                  <li>
                    <span className="chk">✓</span>15+ systemen geïnstalleerd &
                    geïntegreerd
                  </li>
                  <li>
                    <span className="chk">✓</span>Wekelijkse 1-op-1 met je vaste coach
                  </li>
                  <li>
                    <span className="chk">✓</span>Private Slack — reactie binnen 4 uur
                  </li>
                  <li>
                    <span className="chk">✓</span>Alle SOP&apos;s, templates, funnels &
                    scripts
                  </li>
                </ul>
              </div>
              <div className="pitch-demo-right">
                <span className="k">Investering</span>
                <span className="v">€12.500</span>
                <span className="s">of 3× €4.500</span>
                <button type="button" className="b">
                  Voorstel accepteren →
                </button>
                <span className="f">
                  Startdatum · deze week
                  <br />
                  Doorlooptijd · 120 dagen
                </span>
              </div>
            </div>

            <div className="pitch-result">
              <span className="k">Resultaat</span>
              <span className="v">{detail.result}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

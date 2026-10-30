/**
 * Title-screen SVG: an ivory body dashes along a cornered route in bursts while the
 * pale soul follows it slowly; the vermilion thread spans only the unpaid route
 * between them, and they meet in a gold flash. The premise, without words.
 */
import palette from '../content/palette.json';
import { DEMO_STATIC, demoFrame, type DemoFrame } from './title-demo';

const NS = 'http://www.w3.org/2000/svg';
const ROUTE = 'M 22 104 L 96 104 L 126 58 L 204 58 L 232 92 L 298 34';

function make<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  return node;
}

export interface TitleVignette {
  readonly svg: SVGSVGElement;
  start(): void;
  stop(): void;
  setReducedMotion(on: boolean): void;
}

export function createTitleVignette(): TitleVignette {
  const svg = make('svg', { viewBox: '0 0 320 132', class: 'oys-vignette-svg', role: 'img' });
  svg.setAttribute('aria-label', 'A fast ivory body dashes ahead along a red thread while its pale soul follows slowly behind.');

  const defs = make('defs', {});
  const glow = make('filter', { id: 'oys-soul-glow', x: '-120%', y: '-120%', width: '340%', height: '340%' });
  glow.appendChild(make('feGaussianBlur', { stdDeviation: 4 }));
  defs.appendChild(glow);
  svg.appendChild(defs);

  // Ground: a faint engraved railway line under the route, for place, not information.
  svg.appendChild(make('path', { d: 'M 6 122 H 314', stroke: palette.gold, 'stroke-opacity': 0.35, 'stroke-width': 1 }));
  svg.appendChild(make('path', { d: 'M 6 126 H 314', stroke: palette.gold, 'stroke-opacity': 0.18, 'stroke-width': 1, 'stroke-dasharray': '2 6' }));

  const routeShadow = make('path', { d: ROUTE, fill: 'none', stroke: palette.cobalt_deep, 'stroke-opacity': 0.55, 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', transform: 'translate(0 3)' });
  const ribbon = make('path', { d: ROUTE, fill: 'none', stroke: palette.vermilion, 'stroke-width': 4.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const sheen = make('path', { d: ROUTE, fill: 'none', stroke: '#ffd2b8', 'stroke-opacity': 0.55, 'stroke-width': 1.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const streak = make('line', { stroke: palette.ivory, 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-opacity': 0 });
  const ring = make('circle', { r: 10, fill: 'none', stroke: palette.gold, 'stroke-width': 2, opacity: 0 });

  const soulHalo = make('circle', { r: 9, fill: palette.soul_glow, opacity: 0.55, filter: 'url(#oys-soul-glow)' });
  const soul = make('circle', { r: 6, fill: palette.soul_core, stroke: '#ffffff', 'stroke-width': 1.2 });
  const body = make('g', {});
  body.appendChild(make('circle', { r: 7.5, fill: palette.ivory, stroke: palette.cobalt_deep, 'stroke-width': 1.2 }));
  body.appendChild(make('rect', { x: -4.5, y: -2.2, width: 9, height: 2.6, rx: 1.3, fill: palette.mask_black }));
  body.appendChild(make('path', { d: 'M -6 4 Q -12 9 -15 6', stroke: palette.vermilion, 'stroke-width': 2.4, fill: 'none', 'stroke-linecap': 'round' }));

  for (const node of [routeShadow, ribbon, sheen, streak, ring, soulHalo, soul, body]) svg.appendChild(node);

  let total = 0;
  let raf = 0;
  let running = false;
  let reduced = false;
  let t0 = 0;
  let lastBody = 0;

  function measure(): number {
    if (total > 0) return total;
    try {
      total = ribbon.getTotalLength();
    } catch {
      total = 0;
    }
    return total;
  }

  function draw(f: DemoFrame): void {
    const len = measure();
    if (len <= 0) return;
    const sb = f.body * len;
    const ss = f.soul * len;
    const span = Math.max(0, sb - ss);
    const dash = `0 ${ss} ${span} ${len * 2}`;
    ribbon.setAttribute('stroke-dasharray', dash);
    sheen.setAttribute('stroke-dasharray', dash);
    routeShadow.setAttribute('stroke-dasharray', dash);
    const pb = ribbon.getPointAtLength(sb);
    const ps = ribbon.getPointAtLength(ss);
    body.setAttribute('transform', `translate(${pb.x} ${pb.y})`);
    soul.setAttribute('cx', String(ps.x));
    soul.setAttribute('cy', String(ps.y - 3));
    soulHalo.setAttribute('cx', String(ps.x));
    soulHalo.setAttribute('cy', String(ps.y - 3));
    // Dash streak: only while the body is moving fast.
    const moved = sb - lastBody;
    lastBody = sb;
    if (moved > 1.5 && !reduced) {
      const back = ribbon.getPointAtLength(Math.max(ss, sb - Math.min(26, moved * 4)));
      streak.setAttribute('x1', String(back.x));
      streak.setAttribute('y1', String(back.y));
      streak.setAttribute('x2', String(pb.x));
      streak.setAttribute('y2', String(pb.y));
      streak.setAttribute('stroke-opacity', '0.5');
    } else {
      streak.setAttribute('stroke-opacity', '0');
    }
    ring.setAttribute('cx', String(pb.x));
    ring.setAttribute('cy', String(pb.y));
    ring.setAttribute('r', String(8 + (1 - f.reunion) * 18));
    ring.setAttribute('opacity', String(f.reunion * 0.9));
    svg.style.opacity = String(f.opacity);
  }

  function frame(now: number): void {
    if (!running) return;
    draw(demoFrame((now - t0) / 1000));
    raf = requestAnimationFrame(frame);
  }

  let visible = false;

  function halt(): void {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function begin(): void {
    halt();
    if (reduced) {
      draw(DEMO_STATIC);
      return;
    }
    running = true;
    t0 = performance.now();
    lastBody = 0;
    raf = requestAnimationFrame(frame);
  }

  return {
    svg,
    start(): void {
      if (visible) return;
      visible = true;
      begin();
    },
    stop(): void {
      visible = false;
      halt();
    },
    setReducedMotion(on: boolean): void {
      if (reduced === on) return;
      reduced = on;
      if (visible) begin();
    },
  };
}

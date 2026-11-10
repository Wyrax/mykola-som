/**
 * Рукотворні прикраси для часової лінії: нерівна пунктирна лінія, чорнильні плями, сліди від кави.
 * Усе генерується «випадково», але з фіксованим зерном — при кожному збиранні виходить те саме.
 */

type Point = [number, number];

/** Детермінований генератор випадкових чисел (mulberry32). */
export function random(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const between = (rand: () => number, a: number, b: number) => a + rand() * (b - a);

/** Кубічна крива Безьє: точка при t. */
function bezier(p0: Point, c1: Point, c2: Point, p1: Point, t: number): Point {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
    u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1],
  ];
}

/**
 * Плитка нерівної пунктирної лінії (SVG data URI) для mask-image з repeat-y.
 * Лінія звивається неоднаково; на початку й наприкінці вертикальна й по центру — стики плиток непомітні.
 */
export function wavyLineTile({
  seed = 7,
  width = 24,
  height = 960,
  amplitude = 7,
  dash = 5,
  gap = 10,
  stroke = 1.6,
} = {}): { uri: string; width: number; height: number } {
  const rand = random(seed);
  const cx = width / 2;
  const pts: Point[] = [[cx, 0]];
  for (let y = between(rand, 30, 90); y < height - 40; y += between(rand, 30, 130)) {
    pts.push([cx + between(rand, -1, 1) * amplitude * between(rand, 0.35, 1), y]);
  }
  pts.push([cx, height]);

  let d = `M${r1(pts[0]![0])} 0`;
  let length = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    // Catmull-Rom → Безьє; на кінцях плитки дотична вертикальна
    let c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    let c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    if (i === 0) c1 = [cx, p1[1] + (p2[1] - p1[1]) / 3];
    if (i === pts.length - 2) c2 = [cx, p2[1] - (p2[1] - p1[1]) / 3];
    d += `C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])}`;
    let prev = p1;
    for (let k = 1; k <= 24; k++) {
      const q = bezier(p1, c1, c2, p2, k / 24);
      length += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
      prev = q;
    }
  }
  // Ціла кількість «риска + проміжок» на плитку — пунктир не збивається на стиках.
  const period = dash + gap;
  const pathLength = Math.round(length / period) * period;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} ${height}'>` +
    `<path d='${d}' fill='none' stroke='black' stroke-width='${stroke}' stroke-linecap='round' ` +
    `stroke-dasharray='${dash} ${gap}' pathLength='${pathLength}'/></svg>`;
  return { uri: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, width, height };
}

/** Замкнена згладжена крива через точки (Catmull-Rom). */
function closedPath(pts: Point[]): string {
  const n = pts.length;
  let d = `M${r1(pts[0]![0])} ${r1(pts[0]![1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return `${d}Z`;
}

/** Неправильна «клякса» радіусом ~r з центром (cx, cy). */
function blobPath(rand: () => number, cx: number, cy: number, r: number, points = 10, roughness = 0.4): string {
  const pts: Point[] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2 + between(rand, -0.25, 0.25);
    const rr = r * between(rand, 1 - roughness, 1 + roughness * 0.5);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return closedPath(pts);
}

/** Чорнильна пляма: клякса з бризками навколо. Вміст SVG з viewBox «-50 -50 100 100». */
export function inkBlot(seed: number, { size = 18, drops = 6 } = {}): string {
  const rand = random(seed);
  let out = `<path d="${blobPath(rand, 0, 0, size, 11, 0.45)}"/>`;
  for (let i = 0; i < drops; i++) {
    const a = rand() * Math.PI * 2;
    const dist = size * between(rand, 1.35, 2.5);
    const r = size * between(rand, 0.05, 0.2);
    out += `<path d="${blobPath(rand, Math.cos(a) * dist, Math.sin(a) * dist, r, 6, 0.3)}"/>`;
  }
  return out;
}

/**
 * Півмісяць: частина кола радіуса R (центр — cx, cy), що лишається поза колом радіуса r,
 * зсунутим на d у напрямку angle. Найтовщий з протилежного боку, кінці гострі.
 */
function crescent(R: number, r: number, d: number, angle: number, cx = 0, cy = 0): string {
  const TAU = Math.PI * 2;
  const mod = (x: number) => ((x % TAU) + TAU) % TAU;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const a = (R * R - r * r + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, R * R - a * a));
  const p1: Point = [a * ux - h * uy, a * uy + h * ux];
  const p2: Point = [a * ux + h * uy, a * uy - h * ux];
  const far = angle + Math.PI;
  const pts: Point[] = [];
  // дуга навколо (ox, oy) з точки from у точку to — та, що проходить через дальній бік (far)
  const arc = (ox: number, oy: number, rad: number, from: Point, to: Point) => {
    const t1 = Math.atan2(from[1] - oy, from[0] - ox);
    const t2 = Math.atan2(to[1] - oy, to[0] - ox);
    const span = mod(far - t1) < mod(t2 - t1) ? mod(t2 - t1) : mod(t2 - t1) - TAU;
    for (let k = 0; k <= 36; k++) {
      const t = t1 + (span * k) / 36;
      pts.push([ox + Math.cos(t) * rad, oy + Math.sin(t) * rad]);
    }
  };
  arc(0, 0, R, p1, p2);
  arc(d * ux, d * uy, r, p2, p1);
  return `M${pts.map((q) => `${r1(q[0] + cx)} ${r1(q[1] + cy)}`).join('L')}Z`;
}

/**
 * Слід від кружки з кавою: світла середина, темніший край-півмісяць, розімкнене тонке коло
 * (кружку переставили) і часом ще один блідий півмісяць.
 * Вміст SVG з viewBox «-60 -60 120 120»; колір — currentColor, фільтр — #stain-rough.
 */
export function coffeeStain(seed: number): string {
  const rand = random(seed);
  const R = 44;
  const angle = rand() * Math.PI * 2;
  const rough = 'filter="url(#stain-rough)"';
  let out = `<circle r="${R - 2}" fill="currentColor" fill-opacity="0.05" ${rough}/>`;
  const main = crescent(R, R - between(rand, 1.2, 2.4), between(rand, 3, 6.5), angle);
  out += `<path d="${main}" fill="currentColor" fill-opacity="0.34" ${rough}/>`;
  const rr = R - between(rand, 0, 3);
  const circ = Math.PI * 2 * rr;
  const [ox, oy] = [between(rand, -9, 9), between(rand, -9, 9)];
  const dash = `${r1(circ * between(rand, 0.35, 0.65))} ${r1(circ)}`;
  out +=
    `<circle cx="${r1(ox)}" cy="${r1(oy)}" r="${r1(rr)}" fill="none" stroke="currentColor" ` +
    `stroke-width="${r1(between(rand, 1, 1.7))}" stroke-opacity="0.32" stroke-dasharray="${dash}" ` +
    `stroke-dashoffset="${r1(rand() * circ)}" ${rough}/>`;
  if (rand() < 0.6) {
    const extra = crescent(R - 2, R - 3.5, between(rand, 2.5, 4.5), angle + between(rand, 1.5, 3), between(rand, -8, 8), between(rand, -8, 8));
    out += `<path d="${extra}" fill="currentColor" fill-opacity="0.16" ${rough}/>`;
  }
  return out;
}

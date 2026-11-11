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

const TAU = Math.PI * 2;

/** Різниця кутів у межах (−π, π]. */
const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** Замкнений контур навколо (cx, cy), заданий радіусом як функцією кута. */
function polarPath(radius: (a: number) => number, n: number, cx = 0, cy = 0): string {
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const r = radius(a);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return closedPath(pts);
}

/** Повільне «хитання» краю (частка радіуса): кілька синусоїд з випадковими фазами. */
function wobble(rand: () => number, amount: number): (a: number) => number {
  const waves = [2, 3, 5].map((k) => ({ k, phase: rand() * TAU, amp: (amount * between(rand, 0.4, 1)) / Math.sqrt(k) }));
  return (a) => waves.reduce((sum, w) => sum + w.amp * Math.sin(w.k * a + w.phase), 0);
}

const dot = (x: number, y: number, r: number) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(Math.max(r, 0.5))}"/>`;
const drop = (rand: () => number, x: number, y: number, r: number) =>
  r < 1.4 ? dot(x, y, r) : `<path d="${blobPath(rand, x, y, r, 7, 0.25)}"/>`;

/**
 * Клякса, що впала з пера: нерівне тіло, від якого на всі боки розходяться тонкі «промені»
 * з краплями на кінцях, а далі за ними — бризки й дрібні цятки.
 */
function splat(rand: () => number): string {
  const r = between(rand, 5.5, 9);
  const wob = wobble(rand, 0.16);
  const arms = Array.from({ length: 2 + Math.floor(rand() * 5) }, () => ({
    a: rand() * TAU,
    len: r * between(rand, 0.45, 1.7),
    w: between(rand, 0.07, 0.2),
  }));
  const radius = (a: number) =>
    r * (1 + wob(a)) + arms.reduce((sum, m) => sum + m.len * Math.exp(-((angleDiff(a, m.a) / m.w) ** 2)), 0);
  let out = `<path d="${polarPath(radius, 120)}"/>`;
  for (const m of arms) {
    const tip = r + m.len;
    if (rand() < 0.7) out += dot(Math.cos(m.a) * tip, Math.sin(m.a) * tip, between(rand, 0.9, 1.9));
    let d = tip + between(rand, 2.5, 5);
    for (let k = 0, n = Math.floor(rand() * 3.2); k < n; k++) {
      const a = m.a + between(rand, -0.15, 0.15);
      out += drop(rand, Math.cos(a) * d, Math.sin(a) * d, between(rand, 0.6, 1.7) / Math.sqrt(k + 1));
      d += between(rand, 3, 7);
    }
  }
  for (let k = 0, n = Math.floor(between(rand, 0, 4)); k < n; k++) {
    const a = rand() * TAU;
    const d = r * between(rand, 1.8, 3.8);
    out += dot(Math.cos(a) * d, Math.sin(a) * d, between(rand, 0.5, 1.1));
  }
  return out;
}

/**
 * Чорнильна пляма — клякса з променями. Вміст SVG з viewBox «-50 -50 100 100», колір — fill елемента.
 * Перше випадкове число пропускаємо: з ним зерна дають ті самі форми, що в галереї, з якої
 * обирали вигляд плям (клякси 7, 8, 9, 12, 14, 15, 18, 19, 21, 23, 24).
 */
export function inkBlot(seed: number): string {
  const rand = random(seed);
  rand();
  return splat(rand);
}

/** Зерно з тексту (FNV-1a), наприклад з id книги: у кожної книги свої плями. */
export function seedFrom(text: string): number {
  let h = 0x811c9dc5;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0)!, 0x01000193);
  return h >>> 0;
}

/** Чорнильна пляма біля часової лінії: форма (seed), розмір, місце на лінії, кут, насиченість. */
export type InkMark = { seed: number; box: string; y: string; dx: number; rot: number; opacity: number };

/**
 * Зсув плями від лінії в px: не на самій лінії, а помітно збоку — ліворуч (30–56 px, там під роком
 * порожньо) або праворуч (22–34 px: пляма частково ховається під обкладинку, як під покладену на неї
 * книжку, але не зникає під нею зовсім). Одне випадкове число u ∈ [0, 1) задає і бік, і відстань.
 */
const sideOffset = (u: number) => Math.round(u < 0.5 ? -(30 + 26 * (1 - u / 0.5)) : 22 + 12 * ((u - 0.5) / 0.5));

/**
 * Плями біля однієї книги на часовій лінії — 0, 1 чи 2, кожна своєї форми, у випадковому місці
 * між цим роком і наступним (нижче за підпис року), трохи збоку від лінії, під випадковим кутом.
 * Якщо під обкладинкою слід кави, плями лише вгорі, щоб не лізти в каву.
 */
export function inkMarks(seed: number, { coffee = false } = {}): InkMark[] {
  const rand = random(seed);
  const count = rand() < 0.2 ? 0 : rand() < 0.25 ? 2 : 1;
  const top = coffee ? 0.35 : 1;
  const spots = count === 2 ? [between(rand, 0, top * 0.4), between(rand, top * 0.65, top)] : [between(rand, 0, top)];
  return spots.slice(0, count).map((t) => {
    const seedOf = Math.floor(rand() * 2 ** 31);
    const box = `${r1(between(rand, 3.5, 4.3))}rem`;
    const dx = sideOffset(rand());
    // Від низу підпису року до кінця блоку книги, де лінія доходить до наступного року.
    // Ліворуч пляма опиняється під стовпчиком років, тож там відступи більші — і від свого року,
    // і від року наступної книги.
    const [from, to] = dx < 0 ? [4.6, 1.8] : [3.6, 1];
    return {
      seed: seedOf,
      box,
      y: `calc(${from}rem + (100% - ${r1(from + to)}rem) * ${t.toFixed(2)})`,
      dx,
      rot: Math.round(rand() * 360),
      opacity: Number(between(rand, 0.78, 0.92).toFixed(2)),
    };
  });
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

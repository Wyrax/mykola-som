#!/usr/bin/env node
/**
 * Складання книги з розпізнаних сторінок скану (формат — _source/<книга>/INSTRUCTIONS.md)
 * у src/content/knyhy/<книга>/.
 *
 *   node scripts/assemble-pages.mjs --book peredaj-kodolu [--dry-run] [--force]
 *
 * Читає _source/<книга>/pages/NNN.md по порядку, ділить на розділи (#) і твори (##),
 * бере правильні назви творів і розділів зі змісту книги (сторінки після «ЗМІСТ»),
 * переносить присвяти, епіграфи, дати, примітки у frontmatter, вірші лишає рядками,
 * прозу — абзацами Markdown, цитати віршем у прозі — блоками ```verse.
 * Налаштування книги: scripts/import/<книга>.json (назва, рік, виправлення сумнівних слів).
 * Після складання основним джерелом стають .md-файли книги.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontmatter, slugify } from './lib/text.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const book = args[args.indexOf('--book') + 1];
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
if (!book || !/^[a-z0-9-]+$/.test(book)) {
  console.error('Використання: node scripts/assemble-pages.mjs --book <id> [--dry-run] [--force]');
  process.exit(1);
}

const pagesDir = path.join(ROOT, '_source', book, 'pages');
const configPath = path.join(ROOT, 'scripts', 'import', `${book}.json`);
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
const report = { joins: [], uncertain: [], unmatched: [], strippedItalic: [], warnings: [] };

// ---------------------------------------------------------------- допоміжне

/** Ключ для порівняння назв: лише літери й цифри, верхній регістр, без наголосів. */
const key = (s) =>
  s
    .replace(/́/g, '')
    .replace(/[ґҐ]/g, 'Г')
    .toLocaleUpperCase('uk')
    .replace(/[^\p{L}\p{N}]/gu, '');

const sentenceCase = (s) => {
  const lower = s.toLocaleLowerCase('uk');
  return lower.replace(/^([^\p{L}]*)(\p{L})/u, (_, a, c) => a + c.toLocaleUpperCase('uk'));
};

const nameCase = (s) =>
  s.toLocaleLowerCase('uk').replace(/(^|[\s-])(\p{L})/gu, (_, a, c) => a + c.toLocaleUpperCase('uk'));

/** Типографіка творів сайту: довге тире замість короткого, апостроф «’». */
const typography = (s) => s.replace(/–/g, '—').replace(/(\p{L})['ʼ`](\p{L})/gu, '$1’$2');

function applyFixes(text, where) {
  const out = replaceAll(text);
  for (const m of out.matchAll(/\[\?[^\]]*\]/g)) report.uncertain.push(`${where}: ${m[0]}`);
  return out;
}

/**
 * Курсив — пара зірочок навколо слів: «*Страхолісся*» (перед відкривною — пробіл або початок).
 * Зірочка виноски стоїть одразу після слова: «Василі*», «Ґалаґанів**».
 */
const ITALIC = /(^|[\s(«“—–-])\*([^*\s](?:[^*]*[^*\s])?)\*(?=$|[\s.,!?;:»”)…—–-])/g;
/** Курсив, жирний і жирний курсив (*…*, **…**, ***…***) у прозі. */
const EMPHASIS = /(^|[\s(«“—–-])(\*{1,3})([^*\s](?:[^*]*[^*\s])?)\2(?=$|[\s.,!?;:»”)…—–-])/g;

/** Проза: виділення лишаються Markdown-розміткою, зірочки виносок екрануються. */
function proseAsterisks(line) {
  const marks = [];
  const protectedLine = line.replace(EMPHASIS, (_, before, stars, inner) => {
    marks.push(`${stars}${inner}${stars}`);
    return `${before}\u0000${marks.length - 1}\u0000`;
  });
  return protectedLine.replace(/\*/g, '\\*').replace(/\u0000(\d+)\u0000/g, (_, n) => marks[Number(n)]);
}

// ---------------------------------------------------------------- сторінки

/** Виправлення з конфігу (наприклад, «´» → «ґ») — ще до розбору, щоб назви збігалися зі змістом. */
const replaceAll = (text) =>
  Object.entries(config.replacements ?? {}).reduce((t, [from, to]) => t.split(from).join(to), text);

// Сторінку, якої немає в скані (текст узято з іншого видання), кладуть файлом з літерою після
// номера: 092a.md стає одразу після 092.md.
const files = fs.readdirSync(pagesDir).filter((f) => /^\d{3}[a-z]?\.md$/.test(f)).sort();
const pages = files.map((file) => {
  const raw = replaceAll(fs.readFileSync(path.join(pagesDir, file), 'utf8').replace(/\r\n?/g, '\n'));
  const [first, ...rest] = raw.split('\n');
  const meta = /<!--\s*скан\s+(\d+)\s*·\s*с\.\s*([^\s·]+)(.*)-->/.exec(first);
  return {
    scan: file.replace(/\.md$/, ''),
    page: meta?.[2] ?? '?',
    // порожня сторінка або службова (обкладинка, титул, вихідні дані) — у текст книги не йде
    blank: /порожня|службова/.test(meta?.[3] ?? ''),
    lines: rest,
  };
});

const tocStart = pages.findIndex((p) => p.lines.some((l) => /^#{1,2}\s*ЗМІСТ\s*$/i.test(l.trim())));
const bodyPages = tocStart === -1 ? pages : pages.slice(0, tocStart);
const tocPages = tocStart === -1 ? [] : pages.slice(tocStart);

// ---------------------------------------------------------------- зміст

const toc = { sections: [], entries: [] }; // entries: { title, section, page, parts: [] }
{
  let section;
  for (const page of tocPages) {
    for (const line of page.lines) {
      if (!line.trim() || /^#{1,2}\s*ЗМІСТ\s*$/i.test(line.trim())) continue;
      const heading = /^#+\s*(.+?)\s*$/.exec(line);
      if (heading) {
        section = heading[1];
        toc.sections.push(section);
        continue;
      }
      const m = /^(\s*)(.+?)\s*\|\s*(\d*)\s*$/.exec(line);
      if (!m) continue;
      const entry = { title: m[2].trim(), page: m[3], section };
      if (m[1].length >= 2 && toc.entries.length) toc.entries.at(-1).parts.push(entry);
      else toc.entries.push({ ...entry, parts: [] });
    }
  }
}

// ---------------------------------------------------------------- потік рядків тексту

/** Усі рядки тексту книги з урахуванням переходів між сторінками. */
const stream = [];
for (const page of bodyPages) {
  if (page.blank) continue;
  const lines = [...page.lines];
  while (lines.length && !lines[0].trim()) lines.shift();
  const continuation = /^\[продовження( абзацу)?\]\s*$/.exec(lines[0] ?? '');
  if (continuation) {
    // Цитата віршем у прозі, розірвана сторінкою: «[/вірш]» наприкінці сторінки й «[вірш]» на
    // початку наступної — це один блок (зі строфою, що продовжується, або з новою строфою).
    const rest = lines.slice(1);
    while (rest.length && !rest[0].trim()) rest.shift();
    const lastText = [...stream].reverse().find((s) => s.text.trim());
    if (/^\[вірш\]\s*$/.test(rest[0] ?? '') && /^\[\/вірш\]\s*$/.test(lastText?.text.trim() ?? '')) {
      while (stream.length && !stream.at(-1).text.trim()) stream.pop();
      stream.pop(); // [/вірш]
      if (!continuation[1]) stream.push({ text: '', scan: page.scan });
      for (const text of rest.slice(1)) stream.push({ text, scan: page.scan });
      continue;
    }
  }
  if (/^\[продовження абзацу\]\s*$/.test(lines[0] ?? '')) {
    lines.shift();
    while (lines.length && !lines[0].trim()) lines.shift();
    // Виноска чи дата внизу попередньої сторінки не розриває абзац і строфу: відкладаємо її
    // й повертаємо після продовження (поля твору однаково йдуть у frontmatter).
    const held = [];
    while (stream.length && (!stream.at(-1).text.trim() || /^\[(примітка|дата)\]/.test(stream.at(-1).text.trim()))) {
      const s = stream.pop();
      if (s.text.trim()) held.unshift(s);
    }
    const prev = stream.at(-1);
    const next = lines[0];
    if (prev && next !== undefined && prev.text.length > 80 && !/^\s*\[/.test(next)) {
      // абзац прози продовжується на новій сторінці
      if (/\p{L}-$/u.test(prev.text) && /^\p{Ll}/u.test(next)) {
        report.joins.push(`скан ${page.scan}: «${prev.text.slice(-20)}» + «${next.slice(0, 20)}» → без дефіса`);
        prev.text = prev.text.slice(0, -1) + next;
      } else prev.text = `${prev.text} ${next}`;
      lines.shift();
    }
    // для віршів строфа просто продовжується без порожнього рядка
    stream.push(...held);
  } else if (/^\[продовження\]\s*$/.test(lines[0] ?? '')) {
    lines.shift();
    stream.push({ text: '', scan: page.scan });
  } else {
    stream.push({ text: '', scan: page.scan });
  }
  for (const text of lines) stream.push({ text, scan: page.scan });
}

// ---------------------------------------------------------------- твори

const works = [];
let currentSection;
let work = null;
let tocCursor = 0;

function matchTitle(caps) {
  // назва над твором може відрізнятися від рядка змісту («Ніхто і ніщо» / «Ніхто й ніщо»)
  const k = key(config.tocAliases?.[caps.trim()] ?? caps);
  // над твором назва буває повнішою, ніж у змісті («…письменників України, яке збільшує…»)
  const same = (t) => t === k || (Math.min(t.length, k.length) >= 10 && (k.startsWith(t) || t.startsWith(k)));
  for (let i = tocCursor; i < Math.min(toc.entries.length, tocCursor + 6); i++) {
    if (same(key(toc.entries[i].title))) {
      tocCursor = i + 1;
      return toc.entries[i];
    }
  }
  return null;
}

const isAllCaps = (s) => !/\p{Ll}/u.test(s.replace(/́/g, ''));

const UNTITLED = /^\*\s*\*\s*\*$/;

function startWork(heading, scan, firstLine) {
  // вірш без назви («## * * *»): у змісті — його перший рядок, на сторінці — зірочки
  if (UNTITLED.test(heading.trim())) {
    const line = (firstLine ?? '').trim().replace(/[\s,.;:!?…–—-]+$/, '');
    const entry = matchTitle(line);
    const title = entry?.title ?? line;
    if (!entry) report.unmatched.push(`скан ${scan}: * * * «${line}» → ${title}`);
    work = { title, untitled: true, section: currentSection, scan, fields: {}, lines: [], entry };
    works.push(work);
    return;
  }
  // назва над твором без кінцевого тире чи коми, які ведуть у текст («Всеволоду Нестайку –»)
  const printed = heading.trim().replace(/\s*[–—,:]\s*$/, '');
  const entry = matchTitle(printed);
  const override = config.titles?.[heading.trim()];
  // ВЕЛИКІ ЛІТЕРИ → назва зі змісту; звичайний регістр → як надруковано над твором
  const title = override ?? (isAllCaps(printed) ? (entry?.title ?? sentenceCase(printed)) : printed);
  if (!entry && !override) report.unmatched.push(`скан ${scan}: ${heading.trim()} → ${title}`);
  work = { title, section: currentSection, scan, fields: {}, lines: [], entry };
  works.push(work);
}

/** Перший рядок тексту твору після назви (без присвят, епіграфів, підзаголовків). */
function firstTextLine(from) {
  let inEpigraph = false;
  for (let j = from; j < stream.length; j++) {
    const t = stream[j].text.trim();
    if (/^\[епіграф\]/.test(t)) inEpigraph = true;
    else if (/^\[\/епіграф\]/.test(t)) inEpigraph = false;
    else if (t && !inEpigraph && !/^\[|^#/.test(t)) return t;
  }
  return undefined;
}

for (let i = 0; i < stream.length; i++) {
  const { text, scan } = stream[i];
  const line = text.replace(/\s+$/, '');
  const h1 = /^#\s+(.+)$/.exec(line);
  const h2 = /^##\s+(.+)$/.exec(line);
  const h3 = /^###\s+(.+)$/.exec(line);
  const h4 = /^####\s+(.+)$/.exec(line);
  if (h1) {
    const name = toc.sections.find((s) => key(s) === key(h1[1])) ?? h1[1].trim();
    currentSection = config.sections?.[name] ?? name;
    work = null;
    continue;
  }
  if (h2) {
    startWork(h2[1], scan, UNTITLED.test(h2[1].trim()) ? firstTextLine(i + 1) : undefined);
    continue;
  }
  if (!work) {
    if (line.trim()) report.warnings.push(`скан ${scan}: текст поза твором пропущено: «${line.slice(0, 60)}»`);
    continue;
  }
  if (h3 || h4) {
    const caps = (h3 ?? h4)[1].trim();
    // частина циклу: назва зі змісту (з урахуванням tocAliases); якщо її там немає — надрукована,
    // а надрукована ВЕЛИКИМИ ЛІТЕРАМИ — звичайним регістром
    const wanted = key(config.tocAliases?.[caps] ?? caps);
    const part = work.entry?.parts.find((p) => key(p.title) === wanted);
    const partTitle = part?.title ?? (h4 || !isAllCaps(caps) ? caps : sentenceCase(caps));
    if (h3 && !part) report.unmatched.push(`скан ${scan}: частина «${caps}» → ${partTitle}`);
    work.lines.push('', `${h3 ? '##' : '###'} ${partTitle}`, '');
    continue;
  }
  const field = /^\[(підзаголовок|присвята|дата|автор|примітка)\]\s*(.*)$/.exec(line);
  if (field) {
    const [, name, value] = field;
    const map = { підзаголовок: 'subtitle', присвята: 'dedication', дата: 'date', автор: 'author', примітка: 'note' };
    const keyName = map[name];
    // «Олесь ЖОЛДАК» → «Олесь Жолдак»: слова великими літерами в імені автора — лише в першому
    // рядку підпису (ім’я); у наступних (звання) абревіатури лишаються: «СРСР», «УРСР»
    const normalized =
      keyName === 'author' && !work.fields.author
        ? value.replace(/\p{L}+/gu, (w) => (w.length > 1 && w === w.toLocaleUpperCase('uk') ? nameCase(w) : w))
        : value;
    work.fields[keyName] = work.fields[keyName] ? `${work.fields[keyName]}\n${normalized}` : normalized;
    continue;
  }
  if (/^\[епіграф\]\s*$/.test(line)) {
    const epigraph = [];
    let source;
    for (i++; i < stream.length && !/^\[\/епіграф\]/.test(stream[i].text); i++) {
      const l = stream[i].text.trim();
      if (!l) continue;
      const src = /^\[джерело\]\s*(.*)$/.exec(l);
      if (src) source = src[1];
      else epigraph.push(l);
    }
    (work.epigraphs ??= []).push({ text: epigraph.join('\n'), source });
    continue;
  }
  // Текст після підпису [автор] (наприклад, «Від автора сеї книжки» під передмовою) — це вже не
  // частина твору: збираємо його в примітку, що показується під підписом.
  if (work.fields.author) {
    (work.postscript ??= []).push(text.trim());
    continue;
  }
  work.lines.push(text.replace(/\s+$/, ''));
}

for (const w of works) {
  if (!w.postscript) continue;
  const paragraphs = w.postscript
    .join('\n')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\n/g, ' ').replace(/\*+/g, '').trim())
    .filter(Boolean);
  if (paragraphs.length) w.fields.note = [w.fields.note, ...paragraphs].filter(Boolean).join('\n\n');
}

// ---------------------------------------------------------------- вид тексту й тіло

/** Виділення Markdown (*…*, **…**, ***…***) → HTML: для рядків, що йдуть у сирий HTML. */
const emphasisHtml = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(EMPHASIS, (_, before, stars, inner) => {
      const tags = { 1: ['<em>', '</em>'], 2: ['<strong>', '</strong>'], 3: ['<strong><em>', '</em></strong>'] }[stars.length];
      return `${before}${tags[0]}${inner}${tags[1]}`;
    });

function render(w) {
  // «poems»: твір у розділі прози, що весь є віршем («Хвала свині» серед придибенцій) — показуємо як вірш
  const forcedPoem = (config.poems ?? []).includes(w.title);
  const lines = forcedPoem ? w.lines.filter((l) => !/^\[\/?вірш\]\s*$/.test(l)) : w.lines;
  const isProse =
    !forcedPoem &&
    ((config.proseSections ?? []).includes(w.section) ||
      lines.some((l) => /^\[вірш\]/.test(l)) ||
      lines.some((l) => l.trim().length > 110));
  const kind = isProse ? 'prose' : 'poem';
  const out = [];
  let inVerse = false;
  // Рядки «[праворуч]» (підпис і дата під листом) — абзац, вирівняний праворуч; кілька рядків
  // поспіль — один абзац з переносами рядків.
  let right = [];
  const flushRight = () => {
    if (right.length) out.push('', `<p class="text-right">${right.map(emphasisHtml).join('<br />')}</p>`, '');
    right = [];
  };
  for (const raw of lines) {
    let l = raw;
    const rightLine = /^\s*\[праворуч\]\s*(.*)$/.exec(l);
    if (rightLine && kind === 'prose' && !inVerse) {
      right.push(rightLine[1].trim());
      continue;
    }
    flushRight();
    if (rightLine) {
      report.warnings.push(`${w.title}: [праворуч] у вірші — рядок з відступом 16 пробілів`);
      l = `${' '.repeat(16)}${rightLine[1].trim()}`;
    }
    if (/^\[вірш\]\s*$/.test(l)) {
      out.push('', '```verse');
      inVerse = true;
      continue;
    }
    if (/^\[\/вірш\]\s*$/.test(l)) {
      while (out.length && !out.at(-1).trim()) out.pop();
      out.push('```', '');
      inVerse = false;
      continue;
    }
    const source = /^\s*\[джерело\]\s*(.+)$/.exec(l);
    if (source && (kind === 'poem' || inVerse)) {
      // підпис автора під цитатою віршем — дрібний підпис у розмітці вірша
      out.push(`### ${source[1].trim()}`);
      continue;
    }
    if (kind === 'poem' || inVerse) {
      // вірш рендериться як простий текст: курсивні зірочки прибираємо, зірочки виносок лишаємо
      const plain = l.replace(ITALIC, '$1$2');
      if (plain !== l) report.strippedItalic.push(`${w.title}: ${l.trim().slice(0, 50)}`);
      // довгий абзац прози всередині вірша («poems»: довідка з енциклопедії у «Власовцях») —
      // прозовий абзац у розмітці вірша
      if (kind === 'poem' && !inVerse && plain.trim().length > 110) out.push('', `> ${plain.trim()}`, '');
      else out.push(plain);
    } else if (/^#{2,3} /.test(l)) {
      out.push(l);
    } else {
      out.push(l.trim() ? proseAsterisks(l.trim()) : '');
    }
  }
  flushRight();
  // не більше одного порожнього рядка поспіль
  const body = out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { kind, body };
}

const slugs = new Set();
const results = works.map((w, index) => {
  const { kind, body } = render(w);
  let slug = slugify(w.title);
  for (let n = 2; slugs.has(slug); n++) slug = `${slugify(w.title)}-${n}`;
  slugs.add(slug);
  const where = `${w.title} (скан ${w.scan})`;
  const clean = (v) => (v === undefined ? undefined : typography(applyFixes(v, where)));
  const fields = Object.fromEntries(Object.entries(w.fields).map(([k, v]) => [k, clean(v)]));
  const epigraphs = (w.epigraphs ?? []).map((e) => ({ text: clean(e.text), source: clean(e.source) }));
  if (epigraphs.length === 1) {
    fields.epigraph = epigraphs[0].text;
    fields.epigraphSource = epigraphs[0].source;
  }
  const data = {
    title: typography(w.title),
    kind,
    order: index + 1,
    untitled: w.untitled || undefined,
    // «noSection»: твори, що в змісті стоять наприкінці розділу, але до нього не належать
    // (наприклад, «Слово про автора» після «Мініатюр») — на сайті вони йдуть окремо, без розділу.
    section: w.section && !(config.noSection ?? []).includes(w.title) ? typography(w.section) : undefined,
    subtitle: fields.subtitle?.replace(/^\((.*)\)$/s, '$1'),
    dedication: fields.dedication,
    epigraph: fields.epigraph,
    epigraphSource: fields.epigraphSource,
    epigraphs: epigraphs.length > 1 ? epigraphs.map((e) => (e.source ? e : { text: e.text })) : undefined,
    date: fields.date,
    author: fields.author,
    note: fields.note,
  };
  return { slug, data, body: typography(applyFixes(body, where)) };
});

// ---------------------------------------------------------------- звіт

const bySection = new Map();
for (const r of results) bySection.set(r.data.section ?? '(без розділу)', (bySection.get(r.data.section ?? '(без розділу)') ?? 0) + 1);
const tocBySection = new Map();
for (const e of toc.entries) tocBySection.set(e.section ?? '(без розділу)', (tocBySection.get(e.section ?? '(без розділу)') ?? 0) + 1);

console.log(`Сторінок тексту: ${bodyPages.length}, змісту: ${tocPages.length}. Творів: ${results.length}, у змісті: ${toc.entries.length}.`);
for (const [section, n] of bySection) console.log(`  ${section}: ${n} (у змісті ${tocBySection.get(section) ?? '—'})`);
const show = (label, list) => list.length && console.log(`\n${label} (${list.length}):\n  ${list.join('\n  ')}`);
show('Назви, яких немає у змісті', report.unmatched);
show('Сумнівні місця [?]', report.uncertain);
show('Перенесення слова між сторінками', report.joins);
show('Курсив у віршах прибрано', report.strippedItalic);
show('Попередження', report.warnings);
const missing = toc.entries.filter((e) => !works.some((w) => w.entry === e));
show('Пункти змісту без твору', missing.map((e) => `${e.title} (с. ${e.page})`));

if (dryRun) {
  for (const r of results) console.log(`${String(r.data.order).padStart(3)}. [${r.data.kind}] ${r.data.section ? r.data.section + ' / ' : ''}${r.data.title}  → ${r.slug}`);
  process.exit(0);
}

// ---------------------------------------------------------------- запис

const dir = path.join(ROOT, 'src', 'content', 'knyhy', book);
fs.mkdirSync(dir, { recursive: true });
const existing = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
if (existing.length && !force) {
  console.error(`\nУ ${dir} уже є .md-файли (${existing.length}). Щоб перезаписати, додайте --force.`);
  process.exit(1);
}
for (const f of existing) fs.unlinkSync(path.join(dir, f));
const bookYaml = path.join(dir, 'book.yaml');
if (!fs.existsSync(bookYaml) && config.book) {
  const b = config.book;
  const yaml = Object.entries(b)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? JSON.stringify(v) : v}`)
    .join('\n');
  fs.writeFileSync(bookYaml, `${yaml}\n`);
}
for (const r of results) fs.writeFileSync(path.join(dir, `${r.slug}.md`), `${frontmatter(r.data)}\n\n${r.body}\n`);
console.log(`\nЗаписано ${results.length} файлів у ${path.relative(ROOT, dir)}.`);

#!/usr/bin/env node
/**
 * Імпорт книги з Word (.docx) у src/content/knyhy/<книга>/.
 *
 *   npm run import-docx -- --book vybrane _source/Vybrane.docx
 *
 * Параметри:
 *   --book <id>        назва папки книги (латиницею), обов'язково
 *   --kind <kind>      poetry (типово) або prose — основний вид текстів книги
 *   --title <назва>    назва книги для book.yaml (інакше — з першого рядка документа)
 *   --config <файл>    JSON з виправленнями назв: { "titles": { "НАЗВА В DOCX": "Назва" } }
 *                      (типово scripts/import/<книга>.json, якщо існує)
 *   --dry-run          лише показати звіт, нічого не записувати
 *   --force            перезаписати наявні .md книги (book.yaml не чіпається ніколи)
 *
 * Як скрипт розуміє документ (правила виведено з «Вибраного»):
 *   - назва твору — рядок ВЕЛИКИМИ ЛІТЕРАМИ після ≥2 порожніх абзаців;
 *   - цикл — назва, за якою одразу йде ще одна назва ВЕЛИКИМИ; частини циклу тривають
 *     до назви, перед якою ≥3 порожні абзаци;
 *   - рядок-номер («1», «2», «IV») — підзаголовок частини;
 *   - перший блок: рядок праворуч — посвята; цитата з підписом праворуч або в дужках — епіграф;
 *     рядок по центру одразу після назви — підзаголовок («Байка»);
 *   - останній блок, що починається з «*» або «____», — примітка;
 *   - рядки праворуч усередині вірша — зсув вправо («драбинка»);
 *   - твір з абзацами по ширині — проза (передмова): цитати віршів стають блоками ```verse,
 *     рядок праворуч наприкінці — автор.
 * Після імпорту .md-файли стають основним джерелом: правте їх, а не docx.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { frontmatter, slugify } from './lib/text.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LADDER = ' '.repeat(16);
const SHORT_LINE = 70;

// ---------------------------------------------------------------- аргументи

function parseArgs(argv) {
  const opts = { kind: 'poetry', force: false, dryRun: false };
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--book') opts.book = argv[++i];
    else if (arg === '--kind') opts.kind = argv[++i];
    else if (arg === '--title') opts.title = argv[++i];
    else if (arg === '--config') opts.config = argv[++i];
    else if (arg === '--force') opts.force = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else files.push(arg);
  }
  opts.file = files[0];
  if (!opts.book || !/^[a-z0-9-]+$/.test(opts.book) || !opts.file) {
    console.error('Використання: npm run import-docx -- --book <id-латиницею> <файл.docx> [--dry-run] [--force]');
    process.exit(1);
  }
  if (!['poetry', 'prose'].includes(opts.kind)) {
    console.error('--kind має бути poetry або prose');
    process.exit(1);
  }
  return opts;
}

// ---------------------------------------------------------------- читання docx

const decodeXml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

function cleanText(s) {
  return s
    .replace(/[­​﻿]/g, '') // м'які переноси, невидимі символи
    .replace(/[   ]/g, ' ') // нерозривні пробіли
    .replace(/(\p{L})['ʼ`](\p{L})/gu, '$1’$2'); // апостроф
}

/** Пробіли на початку рядка зберігаються, всередині — схлопуються, в кінці — прибираються. */
function tidyLine(s) {
  const [, lead, rest] = /^([ \t]*)(.*)$/s.exec(s);
  return lead + rest.replace(/[ \t]+/g, ' ').trimEnd();
}

const JC = { both: 'justify', distribute: 'justify', center: 'center', right: 'right', end: 'right' };

/** Абзаци документа як рядки: { text, md, jc, size, indent }. Розрив рядка всередині абзацу дає окремий рядок. */
async function readLines(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const xml = await zip.file('word/document.xml').async('string');
  const body = xml.slice(xml.indexOf('<w:body'));
  const lines = [];

  for (const p of body.matchAll(/<w:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:p>)/g)) {
    const inner = p[1] ?? '';
    const pPr = inner.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/)?.[1] ?? '';
    const jc = JC[pPr.match(/<w:jc w:val="([^"]+)"/)?.[1]] ?? 'left';
    const ind = pPr.match(/<w:ind\b([^>]*)\/>/)?.[1] ?? '';
    const indent =
      Math.max(0, Number(ind.match(/w:(?:left|start)="(-?\d+)"/)?.[1] ?? 0)) +
      Math.max(0, Number(ind.match(/w:firstLine="(-?\d+)"/)?.[1] ?? 0));

    // Рядки абзацу як послідовність сегментів { text, italic }.
    const parts = [[]];
    const sizes = new Map();
    for (const r of inner.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
      const rPr = r[1].match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? '';
      const italic = /<w:i(?: w:val="(?:1|true|on)")?\s*\/>/.test(rPr);
      const size = rPr.match(/<w:sz w:val="(\d+)"/)?.[1];
      for (const t of r[1].matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br(\s[^>]*)?\/>/g)) {
        if (t[0].startsWith('<w:br')) {
          if (!/w:type="page"/.test(t[2] ?? '')) parts.push([]);
          continue;
        }
        const text = t[0].startsWith('<w:tab') ? '\t' : cleanText(decodeXml(t[1]));
        if (!text) continue;
        parts.at(-1).push({ text, italic });
        if (size && text.trim()) sizes.set(size, (sizes.get(size) ?? 0) + text.length);
      }
    }
    const size = Number([...sizes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0) / 2 || undefined;
    for (const segments of parts) {
      const text = tidyLine(segments.map((s) => s.text).join(''));
      lines.push({ text, md: segmentsToMarkdown(segments), jc, size, indent });
    }
  }
  return lines;
}

// ---------------------------------------------------------------- Markdown для прози

const escapeMd = (s) => s.replace(/([\\`*_[\]<>])/g, '\\$1');

function segmentsToMarkdown(segments) {
  const merged = [];
  for (const s of segments) {
    const last = merged.at(-1);
    if (last && last.italic === s.italic) last.text += s.text;
    else merged.push({ ...s });
  }
  const md = merged
    .map(({ text, italic }) => {
      if (!italic || !text.trim()) return escapeMd(text);
      const [, lead, core, trail] = /^(\s*)(.*?)(\s*)$/s.exec(text);
      return `${lead}*${escapeMd(core)}*${trail}`;
    })
    .join('');
  // Початок абзацу, який Markdown сприйняв би як заголовок, список чи цитату.
  return tidyLine(md).replace(/^(\s*)([#>+-]|\d+[.)])(\s)/, '$1\\$2$3');
}

// ---------------------------------------------------------------- регістр назв і транслітерація

const isCaps = (s) => {
  const letters = s.replace(/[^\p{L}]/gu, '');
  return letters.length >= 2 && letters === letters.toLocaleUpperCase('uk') && letters !== letters.toLocaleLowerCase('uk');
};
const isNumberLine = (s) => /^\s*(\d{1,3}|[IVXLC]{1,6})\.?\s*$/.test(s);
const capitalize = (w) => w.charAt(0).toLocaleUpperCase('uk') + w.slice(1);

/** Слова, які в тексті трапляються з великої літери посеред рядка, — імовірно власні назви. */
function collectProperNouns(lines) {
  const proper = new Set();
  for (const { text } of lines) {
    if (isCaps(text)) continue;
    for (const m of text.matchAll(/(\S*)\s+(\p{Lu}\p{Ll}[\p{L}’-]*)/gu)) {
      const before = m[1];
      if (/[.!?…:“«„"(–—]$/.test(before) || before === '') continue;
      proper.add(m[2].toLocaleLowerCase('uk'));
    }
  }
  return proper;
}

function isProper(word, proper) {
  if (proper.has(word)) return true;
  if (word.length < 5) return false;
  for (const p of proper) {
    let common = 0;
    while (common < word.length && word[common] === p[common]) common++;
    if (common >= 5 && common >= Math.max(word.length, p.length) - 2) return true;
  }
  return false;
}

function titleCase(caps, proper, overrides) {
  const source = caps.trim().replace(/\*+$/, '').trim();
  if (overrides[source]) return { title: overrides[source], guessed: false };
  let guessed = false;
  let title = source.toLocaleLowerCase('uk');
  title = title.replace(/\p{L}[\p{L}’]*/gu, (word) => {
    if (!isProper(word, proper)) return word;
    guessed = true;
    return capitalize(word);
  });
  title = title.replace(/(^|[.!?…]\s+)([^\p{L}]*)(\p{L})/gu, (_, a, b, c) => a + b + c.toLocaleUpperCase('uk'));
  return { title, guessed };
}

const nameCase = (s) => s.toLocaleLowerCase('uk').replace(/(^|[\s-])(\p{L})/gu, (_, a, c) => a + c.toLocaleUpperCase('uk'));

// ---------------------------------------------------------------- структура документа

/** Непорожні рядки з кількістю порожніх абзаців перед ними. */
function toItems(lines) {
  const items = [];
  let blanks = Infinity;
  for (const line of lines) {
    if (!line.text.trim()) {
      blanks = blanks === Infinity ? Infinity : blanks + 1;
      continue;
    }
    items.push({ ...line, blanksBefore: blanks });
    blanks = 0;
  }
  return items;
}

const isHeading = (item) => isCaps(item.text) && item.blanksBefore >= 2 && item.jc !== 'right' && item.text.length < 100;

function splitSections(items) {
  const front = [];
  const sections = [];
  for (const item of items) {
    if (isHeading(item)) sections.push({ heading: item, items: [] });
    else (sections.at(-1)?.items ?? front).push(item);
  }

  // Цикли: назва, за якою одразу йде ще одна назва ВЕЛИКИМИ.
  const result = [];
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const first = section.items[0];
    const startsWithPartTitle = first && isCaps(first.text) && (section.items[1]?.blanksBefore ?? 1) >= 1;
    const nextIsPart = !first && sections[i + 1] && sections[i + 1].heading.blanksBefore < 3;
    if (!startsWithPartTitle && !nextIsPart) {
      result.push(section);
      continue;
    }
    const parts = [];
    if (first) parts.push({ heading: first, items: section.items.slice(1) });
    while (sections[i + 1] && sections[i + 1].heading.blanksBefore < 3) parts.push(sections[++i]);
    // Частини, що починаються з рядка ВЕЛИКИМИ після 1 порожнього, теж розділяємо.
    const flat = [];
    for (const part of parts) {
      let current = { heading: part.heading, items: [] };
      for (const item of part.items) {
        if (isCaps(item.text) && item.blanksBefore >= 1 && current.items.length) {
          flat.push(current);
          current = { heading: item, items: [] };
        } else current.items.push(item);
      }
      flat.push(current);
    }
    result.push({ heading: section.heading, items: [], parts: flat });
  }
  return { front, sections: result };
}

function toBlocks(items) {
  const blocks = [];
  for (const item of items) {
    if (!blocks.length || item.blanksBefore >= 1) blocks.push([item]);
    else blocks.at(-1).push(item);
  }
  return blocks;
}

const isNoteStart = (item) => (/^\*(?!\s*\*\s*\*)/.test(item.text.trim()) || /^_{3,}$/.test(item.text.trim()));

function takeNote(blocks) {
  const last = blocks.at(-1);
  if (!last || blocks.length < 2 || !isNoteStart(last[0])) return undefined;
  blocks.pop();
  return last
    .filter((item) => !/^_{3,}$/.test(item.text.trim()))
    .map((item) => item.text.trim())
    .join('\n');
}

const isQuoted = (s) => /^[“«„"]/.test(s.trim());
const isParenthesized = (s) => /^\(.*\)$/.test(s.trim());
const isNameLine = (s) => /^(\p{Lu}[\p{L}’.-]*\s*){1,4}$/u.test(s.trim());

function isEpigraphBlock(block) {
  if (block.length < 2) return false;
  const last = block.at(-1);
  const rights = block.filter((item) => item.jc === 'right').length;
  if (last.jc === 'right' && (rights === block.length || rights === 1)) return true;
  return isQuoted(block[0].text) && (isParenthesized(last.text) || isNameLine(last.text));
}

/**
 * Підзаголовок: короткий рядок одразу під назвою (без порожнього рядка), після якого
 * йде порожній рядок («Байка»), або рядок у дужках на початку твору.
 */
function takeSubtitle(items) {
  const first = items[0];
  if (!first) return undefined;
  const glued = first.blanksBefore === 0 && first.text.length < 60 && (items[1]?.blanksBefore ?? 1) >= 1;
  const parenthesized = isParenthesized(first.text) && first.text.length < 80;
  if (!glued && !parenthesized) return undefined;
  items.shift();
  if (items[0]) items[0].blanksBefore = Math.max(items[0].blanksBefore, 1);
  return first.text.trim().replace(/^\((.*)\)$/, '$1');
}

/** Підзаголовок, посвята, епіграф — з початку твору. */
function takeHeader(items) {
  const header = {};
  header.subtitle = takeSubtitle(items);
  const blocks = toBlocks(items);
  for (let round = 0; round < 2 && blocks.length >= 2; round++) {
    const block = blocks[0];
    if (!header.dedication && !header.epigraph && block.length === 1 && block[0].jc === 'right') {
      header.dedication = block[0].text.trim();
      blocks.shift();
    } else if (!header.epigraph && isEpigraphBlock(block)) {
      header.epigraph = block.slice(0, -1).map((item) => item.text.trim()).join('\n');
      header.epigraphSource = block.at(-1).text.trim().replace(/^\((.*)\)$/, '$1');
      blocks.shift();
    } else break;
  }
  return { header, blocks };
}

function poemLines(blocks, flags) {
  const hasLeft = blocks.flat().some((item) => item.jc !== 'right');
  const out = [];
  for (const block of blocks) {
    let stanza = [];
    const flush = () => {
      if (stanza.length) out.push(stanza.join('\n'));
      stanza = [];
    };
    for (const item of block) {
      if (isNumberLine(item.text)) {
        flush();
        out.push(`## ${item.text.trim().replace(/\.$/, '')}`);
        flags.add('частини');
        continue;
      }
      let line = item.text;
      if (item.indent > 0 && !/^\s/.test(line)) line = ' '.repeat(Math.round(item.indent / 70)) + line;
      if (item.jc === 'right' && hasLeft) {
        line = LADDER + line.trimStart();
        flags.add('драбинка');
      }
      if (line.trim().length > SHORT_LINE) flags.add('довгі рядки');
      stanza.push(line);
    }
    flush();
  }
  return out.join('\n\n');
}

function convertPoem(section, ctx) {
  const flags = new Set();
  const data = {};
  let body;
  if (section.parts) {
    flags.add(`цикл: ${section.parts.length}`);
    body = section.parts
      .map((part) => {
        const { title } = titleCase(part.heading.text, ctx.proper, ctx.overrides);
        const items = [...part.items];
        const subtitle = takeSubtitle(items);
        const blocks = toBlocks(items);
        const note = takeNote(blocks);
        if (note) data.note = data.note ? `${data.note}\n${note}` : note;
        return `## ${title}\n${subtitle ? `### ${subtitle}\n` : ''}\n${poemLines(blocks, flags)}`;
      })
      .join('\n\n');
  } else {
    const { header, blocks } = takeHeader([...section.items]);
    Object.assign(data, header);
    data.note = takeNote(blocks);
    body = poemLines(blocks, flags);
  }
  for (const key of ['subtitle', 'dedication', 'epigraph', 'note']) if (data[key]) flags.add(key);
  return { data, body, flags };
}

function convertProse(section) {
  const flags = new Set(['проза']);
  const data = {};
  const blocks = toBlocks([...section.items]);
  data.note = takeNote(blocks);
  const lastBlock = blocks.at(-1);
  const lastItem = lastBlock?.at(-1);
  if (lastItem && lastItem.jc === 'right' && lastItem.text.length < 60) {
    data.author = isCaps(lastItem.text) ? nameCase(lastItem.text.trim()) : lastItem.text.trim();
    lastBlock.pop();
    if (!lastBlock.length) blocks.pop();
  }
  const paragraphs = [];
  for (const block of blocks) {
    const isVerse = block.length >= 2 && block.every((item) => item.text.trim().length <= SHORT_LINE);
    if (isVerse) {
      paragraphs.push('```verse\n' + block.map((item) => item.text.trim()).join('\n') + '\n```');
      flags.add('вставки віршів');
    } else paragraphs.push(...block.map((item) => item.md.trim()));
  }
  for (const key of ['author', 'note']) if (data[key]) flags.add(key);
  return { data, body: paragraphs.join('\n\n'), flags };
}

// ---------------------------------------------------------------- запис

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const configPath = opts.config ?? path.join(ROOT, 'scripts', 'import', `${opts.book}.json`);
  const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
  const overrides = config.titles ?? {};

  const lines = await readLines(path.resolve(opts.file));
  const items = toItems(lines);

  let bookTitle = opts.title;
  if (items[0] && items[0].jc === 'center' && isCaps(items[0].text)) {
    const first = items.shift();
    bookTitle ??= capitalize(first.text.trim().toLocaleLowerCase('uk'));
    if (items[0]) items[0].blanksBefore = Math.max(items[0].blanksBefore, 2);
  }
  if (!bookTitle) {
    console.error('Не вдалося визначити назву книги: передайте --title "Назва".');
    process.exit(1);
  }

  const { front, sections } = splitSections(items);
  const ctx = { proper: collectProperNouns(lines), overrides };
  const defaultKind = opts.kind === 'poetry' ? 'poem' : 'prose';

  const slugs = new Set();
  const texts = sections.map((section, i) => {
    const bodyItems = section.parts ? section.parts.flatMap((p) => p.items) : section.items;
    const justified = bodyItems.filter((item) => item.jc === 'justify').length;
    const kind = opts.kind === 'prose' || justified > bodyItems.length / 2 ? 'prose' : 'poem';
    const { title, guessed } = titleCase(section.heading.text, ctx.proper, overrides);
    let slug = slugify(title);
    for (let n = 2; slugs.has(slug); n++) slug = `${slugify(title)}-${n}`;
    slugs.add(slug);
    const converted = kind === 'prose' ? convertProse(section) : convertPoem(section, ctx);
    if (guessed) converted.flags.add('назва: перевірити регістр');
    const data = {
      title,
      kind: kind === defaultKind ? undefined : kind,
      order: i + 1,
      ...converted.data,
    };
    return { slug, data, body: converted.body, flags: converted.flags, source: section.heading.text.trim() };
  });

  // ---- звіт
  console.log(`Книга: «${bookTitle}» → src/content/knyhy/${opts.book}/`);
  if (front.length) console.log(`! Пропущено ${front.length} рядків до першої назви: «${front[0].text.slice(0, 50)}…»`);
  for (const t of texts) {
    const flags = [...t.flags].join(', ');
    console.log(`${String(t.data.order).padStart(3)}. ${t.data.title}  [${t.slug}]${flags ? `  — ${flags}` : ''}`);
  }
  const poems = texts.filter((t) => (t.data.kind ?? defaultKind) === 'poem').length;
  console.log(`Разом: ${texts.length} текстів (віршів: ${poems}, прози: ${texts.length - poems}).`);
  if (opts.dryRun) return;

  // ---- запис
  const dir = path.join(ROOT, 'src', 'content', 'knyhy', opts.book);
  fs.mkdirSync(dir, { recursive: true });
  const existing = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  if (existing.length && !opts.force) {
    console.error(`\nУ ${dir} уже є ${existing.length} .md-файлів. Щоб перезаписати, додайте --force.`);
    process.exit(1);
  }
  for (const f of existing) fs.unlinkSync(path.join(dir, f));

  const bookYaml = path.join(dir, 'book.yaml');
  if (!fs.existsSync(bookYaml)) {
    fs.writeFileSync(bookYaml, `title: ${JSON.stringify(bookTitle)}\nkind: ${opts.kind}\norder: 1\n`);
  }
  for (const t of texts) {
    fs.writeFileSync(path.join(dir, `${t.slug}.md`), `${frontmatter(t.data)}\n\n${t.body}\n`);
  }
  console.log(`\nЗаписано ${texts.length} файлів у ${path.relative(ROOT, dir)}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

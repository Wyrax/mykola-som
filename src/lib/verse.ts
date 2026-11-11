/**
 * Вірш як простий текст:
 *   - строфи розділяє порожній рядок;
 *   - рядок «* * *» (або «***») — розділювач частин;
 *   - рядок «## Назва» — підзаголовок частини (номер частини, назва вірша в циклі);
 *   - рядок «### Байка» — дрібний підпис під підзаголовком частини;
 *   - рядок «> текст» — прозовий абзац усередині вірша (цитата, довідка);
 *   - пробіли на початку рядка зберігаються («драбинка»).
 * Одна й та сама розмітка використовується для віршів і для вставок ```verse у прозі.
 */
export type VerseBlock =
  | { type: 'stanza'; lines: string[] }
  | { type: 'heading'; text: string }
  | { type: 'subheading'; text: string }
  | { type: 'prose'; text: string }
  | { type: 'break' };

const BREAK_LINE = /^\s*\*(\s*\*){2}\s*$/;
const HEADING_LINE = /^\s*##\s+(.+?)\s*$/;
const SUBHEADING_LINE = /^\s*###\s+(.+?)\s*$/;
const PROSE_LINE = /^>\s+(.+?)\s*$/;

export function parseVerse(raw: string): VerseBlock[] {
  const blocks: VerseBlock[] = [];
  let lines: string[] = [];
  const flush = () => {
    if (lines.length) blocks.push({ type: 'stanza', lines });
    lines = [];
  };
  for (const rawLine of raw.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
    const line = rawLine.trimEnd();
    const heading = HEADING_LINE.exec(line);
    const subheading = SUBHEADING_LINE.exec(line);
    const prose = PROSE_LINE.exec(line);
    if (line.trim() === '') flush();
    else if (prose) {
      flush();
      blocks.push({ type: 'prose', text: prose[1]! });
    } else if (BREAK_LINE.test(line)) {
      flush();
      blocks.push({ type: 'break' });
    } else if (subheading) {
      flush();
      blocks.push({ type: 'subheading', text: subheading[1]! });
    } else if (heading) {
      flush();
      blocks.push({ type: 'heading', text: heading[1]! });
    } else lines.push(line);
  }
  flush();
  return blocks;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** HTML строф. `escaped: true` — текст уже екранований (вставка з готового HTML прози). */
export function verseHtml(blocks: VerseBlock[], { escaped = false } = {}): string {
  const text = (s: string) => (escaped ? s : escapeHtml(s));
  return blocks
    .map((block) => {
      if (block.type === 'break') return '<hr />';
      if (block.type === 'heading') return `<h2 class="verse-part">${text(block.text)}</h2>`;
      if (block.type === 'subheading') return `<p class="verse-part-subtitle">${text(block.text)}</p>`;
      if (block.type === 'prose') return `<p class="verse-prose">${text(block.text)}</p>`;
      return `<p class="stanza">${block.lines
        .map((line) => `<span class="line">${text(line)}</span>`)
        .join('\n')}</p>`;
    })
    .join('\n');
}

const VERSE_IN_PROSE = /<pre[^>]*>\s*<code[^>]*\blanguage-verse\b[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/g;

/** Замінює блоки ```verse у готовому HTML прози на розмітку вірша. */
export function transformVerseBlocks(html: string): string {
  return html.replace(
    VERSE_IN_PROSE,
    (_, inner: string) =>
      `<div class="verse verse--inset">${verseHtml(parseVerse(inner), { escaped: true })}</div>`,
  );
}

/**
 * Типографіка текстів книжок (джерела .md і book.yaml):
 *
 * 1. Тире «—» відокремлене пробілами з обох боків: «двоє—два» → «двоє — два», «мала.—» → «мала. —»,
 *    «ти,— питає» → «ти, — питає». Винятки: тире між цифрами («40—50-х»); пробіл не ставиться
 *    на початку й у кінці рядка, після відкривної лапки чи дужки («— Ой», ««— Ой синочку»)
 *    і перед закривною («є —»»).
 * 2. Тире в кінці рядка прив’язане до попереднього слова нерозривним пробілом: на вузькому екрані
 *    воно не перенесеться саме на наступний рядок.
 * 3. Знак виноски (*, **, ¹, ²…) стоїть впритул до слова: «Троєщино! *» → «Троєщино!*».
 */

const NBSP = ' ';
const OPENING = new Set(['«', '„', '(', '[']);
const CLOSING = new Set(['»', '“', '”', '"', ')', ']', '.', ',', ';', ':', '!', '?', '…']);

/** Зірочка (чи кілька) на позиції j відкриває виділення *курсив*, а не закриває його. */
function opensEmphasis(s, j) {
  let k = j;
  while (k > 0 && s[k - 1] === '*') k--;
  return k === 0 || /\s/.test(s[k - 1]);
}

/** Зірочка (чи кілька) на позиції j закриває виділення або є знаком виноски. */
function closesEmphasis(s, j) {
  let e = j;
  while (e < s.length && s[e] === '*') e++;
  return e === s.length || /[\s.,;:!?»“”")\]…]/.test(s[e]);
}

/** Правило 3: знак виноски впритул до слова. «* * *» і *виділення* не зачіпаються. */
const FOOTNOTE = /([\p{L}\p{N}́.,;:!?»“”)\]…])[  ]+((?:\\?\*)+|[¹²³⁴⁵⁶⁷⁸⁹⁰]+)(?=[\s.,;:!?»“”)\]…—]|$)/gu;

/** Правило 1: пробіли навколо тире. */
function spaceDashes(line) {
  return line.replace(/—/g, (dash, i, s) => {
    const prev = s[i - 1];
    const next = s[i + 1];
    if (prev !== undefined && next !== undefined && /\d/.test(prev) && /\d/.test(next)) return dash;
    const noBefore =
      prev === undefined || /\s/.test(prev) || OPENING.has(prev) || (prev === '*' && opensEmphasis(s, i - 1));
    const noAfter =
      next === undefined || /\s/.test(next) || CLOSING.has(next) || (next === '*' && closesEmphasis(s, i + 1));
    return `${noBefore ? '' : ' '}${dash}${noAfter ? '' : ' '}`;
  });
}

/** Правило 2: тире в кінці рядка (можливо, з закривною лапкою чи дужкою) — нерозривний пробіл перед ним. */
const LINE_END_DASH = /[  ]+(—[»“”")\]…]*)(?=[ \t]*$)/u;

/** Один рядок тексту (рядок вірша, абзац прози, рядок значення поля). */
export function fixLine(line) {
  return spaceDashes(line.replace(FOOTNOTE, '$1$2')).replace(LINE_END_DASH, `${NBSP}$1`);
}

/** Текст з кількома рядками (значення поля з \n всередині). */
export const fixText = (text) => text.split('\n').map(fixLine).join('\n');

/** Рекурсивно для рядків усередині значення поля (масив епіграфів тощо). */
const fixValue = (v) =>
  typeof v === 'string'
    ? fixText(v)
    : Array.isArray(v)
      ? v.map(fixValue)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fixValue(x)]))
        : v;

/**
 * Рядок YAML «ключ: значення»: значення в JSON-записі (так його пишуть скрипти імпорту —
 * це водночас валідний YAML) розбирається й записується назад лише тоді, коли щось змінилося.
 * Інші записи (числа, шляхи, YAML без лапок) лишаються як є.
 */
function fixYamlLine(line) {
  const m = /^(\s*(?:- )?(?:[\p{L}\p{N}_-]+|"[^"]*"):[ \t]+)([["{].*?)\s*$/u.exec(line);
  if (!m) return line;
  let value;
  try {
    value = JSON.parse(m[2]);
  } catch {
    return line;
  }
  const fixed = fixValue(value);
  return JSON.stringify(fixed) === JSON.stringify(value) ? line : `${m[1]}${JSON.stringify(fixed)}`;
}

export const fixYaml = (text) => text.split('\n').map(fixYamlLine).join('\n');

/** Файл твору: frontmatter — як YAML, текст — порядково. */
export function fixMarkdown(text) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text);
  const head = fm ? `---\n${fixYaml(fm[1])}\n---${fm[2]}` : '';
  const body = fm ? text.slice(fm[0].length) : text;
  return head + body.split('\n').map((l) => (/^\s*```/.test(l) ? l : fixLine(l))).join('\n');
}

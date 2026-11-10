import { getCollection, type CollectionEntry } from 'astro:content';
import { plural, TEXT_FORMS } from './plural';
import { BOOK_KIND_LABEL } from '../site';

export type Book = CollectionEntry<'books'>;
export type Text = CollectionEntry<'texts'>;
export type TextKind = 'poem' | 'prose';

export interface LibraryBook {
  book: Book;
  texts: Text[];
}

const SHOW_DRAFTS = import.meta.env.DEV;

export const textBookId = (text: Text): string => text.id.split('/')[0]!;
export const textSlug = (text: Text): string => text.id.split('/').slice(1).join('/');

/** Вид тексту: явно з frontmatter або успадкований від книги. */
export function textKind(text: Text, book: Book): TextKind {
  if (text.data.kind) return text.data.kind;
  if (book.data.kind === 'poetry') return 'poem';
  if (book.data.kind === 'prose') return 'prose';
  throw new Error(`Текст «${text.id}» у змішаній книзі має вказати kind: poem або prose.`);
}

const byOrder = (a: Text, b: Text) =>
  a.data.order - b.data.order || a.data.title.localeCompare(b.data.title, 'uk');

/** Книги — за роком видання; без року — наприкінці. Однаковий рік (чи його немає) — за `order`. */
const yearOf = (book: Book): number => {
  const year = parseInt(String(book.data.year ?? ''), 10); // «1957» або «1957–1960» → 1957
  return Number.isNaN(year) ? Infinity : year;
};
const byYear = (a: Book, b: Book) =>
  (yearOf(a) === yearOf(b) ? 0 : yearOf(a) - yearOf(b)) ||
  a.data.order - b.data.order ||
  a.data.title.localeCompare(b.data.title, 'uk');

let cache: Promise<LibraryBook[]> | undefined;

/** Усі книги (без чернеток у продакшн-збірці) з упорядкованими текстами. */
export function getLibrary(): Promise<LibraryBook[]> {
  cache ??= (async () => {
    const allBooks = await getCollection('books');
    const allTexts = await getCollection('texts');

    const known = new Set(allBooks.map((b) => b.id));
    for (const text of allTexts) {
      if (!known.has(textBookId(text))) {
        throw new Error(`Текст «${text.id}» лежить у папці без book.yaml.`);
      }
    }

    return allBooks
      .filter((book) => SHOW_DRAFTS || !book.data.draft)
      .sort(byYear)
      .map((book) => {
        const texts = allTexts.filter((t) => textBookId(t) === book.id).sort(byOrder);
        texts.forEach((t) => textKind(t, book)); // ранній контроль kind для змішаних книг
        return { book, texts };
      });
  })();
  return cache;
}

/** Рядок над назвою книги: «Поезія · 1978 · 50 віршів». */
export function bookMeta(book: Book, texts: Text[], { year = true } = {}): string {
  const { kind } = book.data;
  return [BOOK_KIND_LABEL[kind], year && book.data.year, plural(mainTextCount(book, texts), TEXT_FORMS[kind])]
    .filter(Boolean)
    .join(' · ');
}

/** Кількість «основних» текстів книги: віршів у поезії, текстів у прозі (без передмов тощо). */
export function mainTextCount(book: Book, texts: Text[]): number {
  // у змішаній книзі — усі твори самого автора (передмова іншого автора не рахується)
  if (book.data.kind === 'mixed') return texts.filter((text) => !text.data.author).length;
  const main: TextKind = book.data.kind === 'poetry' ? 'poem' : 'prose';
  return texts.filter((text) => textKind(text, book) === main).length;
}

/** Зміст за розділами: послідовні тексти з однаковим `section` — одна група (без розділу — section undefined). */
export function groupBySection(texts: Text[]): { section?: string; texts: Text[] }[] {
  const groups: { section?: string; texts: Text[] }[] = [];
  for (const text of texts) {
    const last = groups.at(-1);
    if (last && last.section === text.data.section) last.texts.push(text);
    else groups.push({ section: text.data.section, texts: [text] });
  }
  return groups;
}

/** Алфавітний покажчик: групи за першою літерою, порядок української абетки. */
export function alphabeticalIndex(texts: Text[]): { letter: string; texts: Text[] }[] {
  const sorted = [...texts].sort((a, b) =>
    sortKey(a.data.title).localeCompare(sortKey(b.data.title), 'uk'),
  );
  const groups = new Map<string, Text[]>();
  for (const text of sorted) {
    const letter = sortKey(text.data.title).charAt(0).toLocaleUpperCase('uk') || '#';
    const group = groups.get(letter) ?? [];
    group.push(text);
    groups.set(letter, group);
  }
  return [...groups].map(([letter, texts]) => ({ letter, texts }));
}

/** Назва без початкових лапок, дужок, тире, щоб «„Слово“» стояло на «С». */
function sortKey(title: string): string {
  return title.replace(/^[^\p{L}\p{N}]+/u, '');
}

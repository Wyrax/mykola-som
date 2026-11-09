/**
 * Перевірка результатів пошуку Pagefind.
 *
 * Якщо слова з запиту немає в жодному тексті, Pagefind не повертає порожній результат,
 * а шукає коротше слово, з якого запит починається: «приходько» знаходить «при».
 * Тому результат лишаємо, лише якщо кожне слово запиту — початок якогось слова тексту:
 * «карас» знаходить «карась» і «карасів», а «приходько» не знаходить нічого.
 */

const APOSTROPHES = /['ʼ`‘]/g;
const WORD_SEPARATOR = /[^\p{L}\p{N}’-]+/u;
const EDGE_MARKS = /^[-’]+|[-’]+$/g;

/** Нижній регістр і єдиний апостроф «’». */
export const normalize = (text: string): string =>
  text.toLocaleLowerCase('uk').replace(APOSTROPHES, '’');

const words = (text: string): string[] =>
  normalize(text)
    .split(WORD_SEPARATOR)
    .map((word) => word.replace(EDGE_MARKS, ''))
    .filter(Boolean);

/** Слова запиту (лапки точного пошуку ігноруються). */
export const queryTerms = (query: string): string[] => words(query.replace(/"/g, ' '));

/** Усі слова тексту, а для слів через дефіс — ще й їхні частини («плащ-палатки» → «плащ», «палатки»). */
export function textWords(text: string): Set<string> {
  const result = new Set<string>();
  for (const word of words(text)) {
    result.add(word);
    if (word.includes('-')) word.split('-').forEach((part) => part && result.add(part));
  }
  return result;
}

/** Кожне слово запиту є початком хоча б одного слова тексту. */
export function matchesAllTerms(terms: string[], textWordSet: Set<string>): boolean {
  return terms.every((term) => {
    for (const word of textWordSet) if (word.startsWith(term)) return true;
    return false;
  });
}

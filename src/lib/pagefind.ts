/** Значення для data-pagefind-filter / data-pagefind-meta: кома розділяє записи, тож її екрануємо. */
export const pagefindValue = (key: string, value: string): string =>
  `${key}:${value.replace(/,/g, '\,')}`;

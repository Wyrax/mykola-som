/** Спільні помічники для скриптів імпорту книг. */

// Транслітерація за постановою КМУ №55 від 27.01.2010.
const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: ['ye', 'ie'], ж: 'zh', з: 'z', и: 'y',
  і: 'i', ї: ['yi', 'i'], й: ['y', 'i'], к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: ['yu', 'iu'],
  я: ['ya', 'ia'], '’': '', "'": '', ы: 'y', э: 'e', ё: 'yo', ъ: '',
};

/** Адреса твору з назви: «Не я б’ю – верба б’є» → ne-ya-biu-verba-bie. */
export function slugify(title) {
  const lower = title
    .replace(/́/g, '') // наголоси
    .toLocaleLowerCase('uk')
    .replace(/зг/g, 'zgh');
  let out = '';
  let wordStart = true;
  for (const ch of lower) {
    const t = TRANSLIT[ch];
    if (t === undefined) {
      out += /[a-z0-9]/.test(ch) ? ch : '-';
      wordStart = !/[a-z0-9]/.test(ch);
      continue;
    }
    out += Array.isArray(t) ? t[wordStart ? 0 : 1] : t;
    wordStart = false;
  }
  out = out.replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (out.length > 60) out = out.slice(0, 60).replace(/-[^-]*$/, '');
  return out || 'tekst';
}

/** YAML-frontmatter: рядки як JSON-рядки (валідний YAML), порожні значення пропускаються. */
export function frontmatter(data) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    // рядки, масиви й об’єкти — у JSON-записі, який є валідним YAML
    lines.push(`${key}: ${typeof value === 'object' || typeof value === 'string' ? JSON.stringify(value) : value}`);
  }
  lines.push('---');
  return lines.join('\n');
}

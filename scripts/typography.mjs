/**
 * Типографіка всіх книжок: тире з пробілами, тире в кінці рядка з нерозривним пробілом,
 * знаки виносок впритул до слова (правила — у scripts/lib/typography.mjs).
 *
 *   node scripts/typography.mjs           — виправити файли в src/content/knyhy/
 *   node scripts/typography.mjs --check   — лише показати, що змінилося б (код виходу 1, якщо є що міняти)
 *
 * Запускається й автоматично перед кожним `npm run build` (prebuild у package.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixMarkdown, fixYaml } from './lib/typography.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOKS = path.join(ROOT, 'src', 'content', 'knyhy');
const check = process.argv.includes('--check');

const changed = [];
for (const book of fs.readdirSync(BOOKS)) {
  const dir = path.join(BOOKS, book);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const file of fs.readdirSync(dir)) {
    const fix = file.endsWith('.md') ? fixMarkdown : file.endsWith('.yaml') ? fixYaml : null;
    if (!fix) continue;
    const full = path.join(dir, file);
    const before = fs.readFileSync(full, 'utf8');
    const after = fix(before);
    if (after === before) continue;
    const lines = before.split('\n');
    const diff = after.split('\n').filter((l, i) => l !== lines[i]).length;
    changed.push(`${book}/${file} (${diff} ${diff === 1 ? 'рядок' : 'рядки'})`);
    if (!check) fs.writeFileSync(full, after);
  }
}

if (!changed.length) console.log('Типографіка: усе гаразд.');
else {
  console.log(`Типографіка: ${check ? 'треба виправити' : 'виправлено'} ${changed.length} файл(ів):`);
  for (const c of changed) console.log(`  ${c}`);
  if (check) process.exitCode = 1;
}

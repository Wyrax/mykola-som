#!/usr/bin/env node
/**
 * Обкладинка книги: npm run add-cover -- --book <назва-латиницею> <файл.png|.jpg>
 *
 * Зменшує скан обкладинки (до 1600 px заввишки), зберігає як src/content/knyhy/<книга>/cover.jpg
 * і прописує `cover: ./cover.jpg` у book.yaml. Сайт сам робить із неї зменшені копії потрібних розмірів.
 * Повторний запуск замінює обкладинку.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const bookIdx = args.indexOf('--book');
const book = bookIdx >= 0 ? args[bookIdx + 1] : undefined;
const file = args.find((a, i) => !a.startsWith('--') && i !== bookIdx + 1);

if (!book || !file) {
  console.error('Використання: npm run add-cover -- --book <назва-латиницею> <файл.png|.jpg>');
  process.exit(1);
}
const dir = path.join(ROOT, 'src', 'content', 'knyhy', book);
const bookYaml = path.join(dir, 'book.yaml');
if (!fs.existsSync(bookYaml)) {
  console.error(`Немає ${path.relative(ROOT, bookYaml)}: спершу створіть книгу.`);
  process.exit(1);
}

const out = path.join(dir, 'cover.jpg');
const info = await sharp(file)
  .rotate()
  .resize({ height: 1600, withoutEnlargement: true })
  .flatten({ background: '#ffffff' })
  .toColorspace('srgb')
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile(out);

const yaml = fs.readFileSync(bookYaml, 'utf8');
const line = 'cover: ./cover.jpg';
const updated = /^cover:.*$/m.test(yaml)
  ? yaml.replace(/^cover:.*$/m, line)
  : `${yaml.replace(/\s*$/, '')}\n${line}\n`;
fs.writeFileSync(bookYaml, updated);

console.log(
  `${path.relative(ROOT, out)}: ${info.width}×${info.height}, ${Math.round(info.size / 1024)} КБ; book.yaml оновлено.`,
);

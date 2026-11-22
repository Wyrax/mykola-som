/**
 * Типографіка готових сторінок: нерозривні пробіли там, де розрив рядка недоречний.
 * У файлах творів пишуть звичайні пробіли — правила застосовуються до HTML під час збирання (src/middleware.ts).
 */
const NBSP = ' ';

/**
 * Ініціали не відриваються від прізвища й одне від одного: «О. П. Довженка», «Т. Г. Шевченка»
 * не розбиваються між рядками. Ініціал — одна велика кирилична літера з крапкою, перед якою
 * немає іншої літери чи цифри; після неї — пробіл і знову велика літера.
 */
const INITIAL = /(?<![\p{L}\p{N}])([А-ЯҐЄІЇ]\.) (?=[А-ЯҐЄІЇ])/gu;

/**
 * Число не відривається від слова після нього: «8 Березня», «13 листопада 1969 р.», «1991 року» —
 * число не лишається саме наприкінці рядка. Лише звичайні цифри 0–9: надрядкові знаки виносок (¹²)
 * не чіпаються.
 */
const NUMBER_WORD = /(?<=[0-9]) (?=\p{L})/gu;

export const bindInitials = (text: string): string => text.replace(INITIAL, `$1${NBSP}`);
export const bindNumbers = (text: string): string => text.replace(NUMBER_WORD, NBSP);
export const typographText = (text: string): string => bindNumbers(bindInitials(text));

/**
 * Те саме для HTML сторінки: змінюється лише текст між тегами, а теги з атрибутами
 * та вміст <script>, <style>, <pre>, <textarea> лишаються як є.
 */
const HTML_PARTS = /(<(script|style|pre|textarea)\b[\s\S]*?<\/\2\s*>)|(<!--[\s\S]*?-->|<[^>]*>)|([^<]+)/gi;

export const typographHtml = (html: string): string =>
  html.replace(HTML_PARTS, (part, _raw, _rawTag, _tag, text) => (text ? typographText(text) : part));

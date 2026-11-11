/**
 * Типографіка готових сторінок.
 *
 * Ініціали не відриваються від прізвища й одне від одного: «О. П. Довженка», «Т. Г. Шевченка»
 * не розбиваються між рядками. Ініціал — одна велика кирилична літера з крапкою, перед якою
 * немає іншої літери чи цифри; після неї — пробіл і знову велика літера.
 */
const INITIAL = /(?<![\p{L}\p{N}])([А-ЯҐЄІЇ]\.) (?=[А-ЯҐЄІЇ])/gu;

export const bindInitials = (text: string): string => text.replace(INITIAL, '$1 ');

/**
 * Те саме для HTML сторінки: змінюється лише текст між тегами, а теги з атрибутами
 * та вміст <script>, <style>, <pre>, <textarea> лишаються як є.
 */
const HTML_PARTS = /(<(script|style|pre|textarea)\b[\s\S]*?<\/\2\s*>)|(<!--[\s\S]*?-->|<[^>]*>)|([^<]+)/gi;

export const bindInitialsInHtml = (html: string): string =>
  html.replace(HTML_PARTS, (part, _raw, _rawTag, _tag, text) => (text ? bindInitials(text) : part));

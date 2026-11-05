/** Усі внутрішні посилання будуються тут, щоб сайт працював під підшляхом (base). */
const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');

export const url = (path = ''): string => BASE + path.replace(/^\/+/, '');
export const bookUrl = (bookId: string): string => url(`knyhy/${bookId}/`);
export const textUrl = (bookId: string, slug: string): string => url(`knyhy/${bookId}/${slug}/`);

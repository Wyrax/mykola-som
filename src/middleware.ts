import { defineMiddleware } from 'astro:middleware';
import { bindInitialsInHtml } from './lib/typography';

/**
 * Типографіка всіх сторінок сайту в одному місці: тексти творів, епіграфи, присвяти, примітки,
 * описи книг, «Про автора» — усе, що потрапляє в HTML. Сторінки статичні, тож це відбувається
 * один раз під час збирання (а в npm run dev — під час кожного відкриття сторінки).
 */
export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  if (!response.headers.get('content-type')?.includes('text/html')) return response;
  const html = bindInitialsInHtml(await response.text());
  return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
});

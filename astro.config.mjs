// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // Сайт публікується на GitHub Pages: https://wyrax.github.io/mykola-som/
  site: 'https://wyrax.github.io',
  base: '/mykola-som',
  markdown: {
    // Блоки ```verse у прозі перетворюються на вірш (див. src/lib/verse.ts),
    // тому підсвічування коду вимкнено: воно не потрібне і заважало б.
    syntaxHighlight: false,
  },
});

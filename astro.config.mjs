// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Сайт публікується на GitHub Pages: https://wyrax.github.io/mykola-som/
  site: 'https://wyrax.github.io',
  base: '/mykola-som',
  integrations: [
    // Карта сайту для пошуковиків: https://wyrax.github.io/mykola-som/sitemap-index.xml
    // Сторінку пошуку не включаємо: це форма, а не вміст. Варіанти головної — тимчасові.
    sitemap({ filter: (page) => !/\/poshuk\/$/.test(page) && !/\/varianty\//.test(page) }),
  ],
  markdown: {
    // Блоки ```verse у прозі перетворюються на вірш (див. src/lib/verse.ts),
    // тому підсвічування коду вимкнено: воно не потрібне і заважало б.
    syntaxHighlight: false,
  },
});

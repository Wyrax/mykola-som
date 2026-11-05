// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // site: 'https://<логін>.github.io' — додається на кроці публікації
  base: '/mykola-som',
  markdown: {
    // Блоки ```verse у прозі перетворюються на вірш (див. src/lib/verse.ts),
    // тому підсвічування коду вимкнено: воно не потрібне і заважало б.
    syntaxHighlight: false,
  },
});

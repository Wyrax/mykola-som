import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Кожна книга — окрема папка в src/content/knyhy/<книга>/:
 *   book.yaml  — опис книги (колекція `books`, id = назва папки);
 *   *.md       — твори книги (колекція `texts`, id = "<книга>/<файл>").
 */
const ROOT = './src/content/knyhy';

const books = defineCollection({
  loader: glob({
    pattern: '*/book.yaml',
    base: ROOT,
    generateId: ({ entry }) => entry.split('/')[0]!,
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      kind: z.enum(['poetry', 'prose', 'mixed']),
      order: z.number(),
      subtitle: z.string().optional(),
      year: z.union([z.number(), z.string()]).optional(),
      description: z.string().optional(),
      cover: image().optional(),
      draft: z.boolean().default(false),
      /** Епіграфи розділів: назва розділу → епіграфи; на сторінці книги — під назвою розділу в змісті. */
      sectionEpigraphs: z
        .record(z.string(), z.array(z.object({ text: z.string(), source: z.string().optional() })))
        .optional(),
    }),
});

const texts = defineCollection({
  loader: glob({
    pattern: '*/*.md',
    base: ROOT,
    generateId: ({ entry }) => entry.replace(/\.md$/, ''),
  }),
  schema: z.object({
    title: z.string(),
    kind: z.enum(['poem', 'prose']).optional(),
    order: z.number(),
    /** Розділ книги («Йду на побачення», «Епітафії»…); зміст групується за розділами. */
    section: z.string().optional(),
    untitled: z.boolean().default(false),
    subtitle: z.string().optional(),
    /** Автор, якщо текст написав не Микола Сом (наприклад, передмова). */
    author: z.string().optional(),
    dedication: z.string().optional(),
    epigraph: z.string().optional(),
    epigraphSource: z.string().optional(),
    /** Кілька епіграфів (замість epigraph/epigraphSource). */
    epigraphs: z.array(z.object({ text: z.string(), source: z.string().optional() })).optional(),
    date: z.union([z.string(), z.number()]).optional(),
    place: z.string().optional(),
    /** Примітка під текстом (виноска «*…»). */
    note: z.string().optional(),
  }),
});

export const collections = { books, texts };

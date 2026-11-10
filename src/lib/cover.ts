import { getImage } from 'astro:assets';
import type { Book } from './library';

/** Повна адреса обкладинки для прев’ю в соцмережах (og:image); без обкладинки — undefined. */
export async function coverShareImage(book: Book, site: URL | undefined): Promise<string | undefined> {
  const { cover } = book.data;
  if (!cover || !site) return undefined;
  const image = await getImage({ src: cover, width: Math.min(800, cover.width), format: 'jpg' });
  return new URL(image.src, site).href;
}

/**
 * Кількість переглядів сайту (GoatCounter), число з позначками тисяч — наприклад, «12 345».
 * Запитується один раз під час збирання сайту (а не в браузері відвідувача, щоб не впертися
 * в CORS і не нести англомовний напис GoatCounter) і вшивається в HTML як звичайний текст.
 * Поки на wyrax.goatcounter.com не ввімкнено «Allow adding visitor counts on your website»,
 * запит повертає помилку — рядок на сайті просто не показується.
 */
let cache: Promise<string | undefined> | undefined;

export function getVisitCount(): Promise<string | undefined> {
  return (cache ??= (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch('https://wyrax.goatcounter.com/counter/TOTAL.json', { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return undefined;
      const { count } = (await res.json()) as { count?: string };
      return count?.replace(/,/g, ' ') || undefined;
    } catch {
      return undefined;
    }
  })());
}

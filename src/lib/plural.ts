const rules = new Intl.PluralRules('uk');

type Forms = { one: string; few: string; many: string };

/** plural(5, { one: 'вірш', few: 'вірші', many: 'віршів' }) → «5 віршів». */
export function plural(n: number, forms: Forms): string {
  const category = rules.select(n);
  const word = category === 'one' ? forms.one : category === 'few' ? forms.few : forms.many;
  return `${n} ${word}`;
}

export const TEXT_FORMS = {
  poetry: { one: 'вірш', few: 'вірші', many: 'віршів' },
  prose: { one: 'твір', few: 'твори', many: 'творів' },
  mixed: { one: 'твір', few: 'твори', many: 'творів' },
} as const;

export const languageOptions = [
  { number: 1, code: 'en', name: 'English' },
  { number: 2, code: 'sn', name: 'Shona' },
  { number: 3, code: 'nd', name: 'Ndebele' },
  { number: 4, code: 'fr', name: 'French' },
  { number: 5, code: 'pt', name: 'Portuguese' },
  { number: 6, code: 'es', name: 'Spanish' },
  { number: 7, code: 'sw', name: 'Swahili' },
  { number: 8, code: 'zu', name: 'Zulu' }
];

export function languageMenu() {
  return languageOptions.map(x => `${x.number}. ${x.name}`).join('\n');
}

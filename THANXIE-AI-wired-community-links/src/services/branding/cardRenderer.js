import { getActiveBrandImage } from './brandingService.js';

function card(title, body) {
  const brand = getActiveBrandImage();
  return {
    brand: {
      name: 'THANXIE AI',
      developer: 'THANXIE DEV',
      theme: brand.theme,
      primary: brand.primary,
      accent: brand.accent,
      background: brand.background,
      text: brand.text,
      image: brand.mediaId || brand.url || brand.path,
    },
    title: `🤖 THANXIE AI • ${title}`,
    body,
    image: brand.mediaId || brand.url || brand.path,
    fallback: 'text-only',
  };
}
export const createWelcomeCard = data => card('WELCOME', data);
export const createPremiumCard = data => card('PREMIUM', data);
export const createQuoteCard = data => card('QUOTE', data);
export const createJokeCard = data => card('JOKE', data);
export const createQuizCard = data => card('QUIZ', data);
export const createQuestionCard = data => card('QUESTION', data);
export const createProfileCard = data => card('PROFILE', data);
export const createAnnouncementCard = data => card('ANNOUNCEMENT', data);
export const createSupportCard = data => card('SUPPORT', data);

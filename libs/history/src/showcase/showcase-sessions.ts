import { ShowcaseAuthor } from './showcase-authors';

export type ShowcaseSession = { day: number; startMinute: number; durationMinutes: number; authors: ShowcaseAuthor[] };

const { Ana, Bruno, Caio, Dani } = ShowcaseAuthor;

export const SHOWCASE_SESSIONS: ShowcaseSession[] = [
  { day: 0, startMinute: 540, durationMinutes: 165, authors: [Ana, Bruno, Caio] },
  { day: 0, startMinute: 780, durationMinutes: 160, authors: [Bruno, Dani, Ana] },
  { day: 1, startMinute: 545, durationMinutes: 170, authors: [Caio, Dani, Ana] },
  { day: 1, startMinute: 785, durationMinutes: 165, authors: [Bruno, Caio] },
  { day: 2, startMinute: 535, durationMinutes: 160, authors: [Dani, Bruno, Ana] },
  { day: 2, startMinute: 785, durationMinutes: 170, authors: [Caio, Dani, Bruno] },
  { day: 3, startMinute: 540, durationMinutes: 175, authors: [Ana, Caio] },
  { day: 3, startMinute: 775, durationMinutes: 160, authors: [Dani, Ana, Bruno] },
  { day: 4, startMinute: 540, durationMinutes: 165, authors: [Bruno, Caio, Dani] },
  { day: 4, startMinute: 785, durationMinutes: 150, authors: [Ana, Dani, Caio] },
];

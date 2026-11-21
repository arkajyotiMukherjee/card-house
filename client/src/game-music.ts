export const MUSIC_ARTIST = 'flowerhead';
export const MUSIC_ARTIST_URL = 'https://flowerheadmusic.com/';

export function openMusicCredit(): void {
  window.open(MUSIC_ARTIST_URL, '_blank', 'noopener,noreferrer');
}

export const MENU_TRACK = {
  title: 'Brain Empty',
  file: 'brain-empty',
} as const;

export const CASINO_RECORDS = [
  { title: '7pm', file: '7pm', color: '#b98152' },
  { title: 'Between The Dunes', file: 'between-the-dunes', color: '#b86571' },
  { title: "Bird's Song", file: 'birds-song', color: '#73a18a' },
  { ...MENU_TRACK, color: '#a89b72' },
  {
    title: 'Lo-Fi Beats To Ride Dragons With',
    file: 'lo-fi-beats-to-ride-dragons-with',
    color: '#aa8a5e',
  },
  {
    title: 'Observatory and chill 2',
    file: 'observatory-and-chill-2',
    color: '#8c8aaa',
  },
  { title: 'Rainy Day', file: 'rainy-day', color: '#7396ae' },
  { title: 'Summer 2', file: 'summer-2', color: '#c8a25e' },
  { title: 'Tapered out', file: 'tapered-out', color: '#a17583' },
] as const;

export function musicUrl(file: string): string {
  return `/assets/music/${file}.m4a`;
}

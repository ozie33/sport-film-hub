/**
 * Imperative surface every provider player exposes. Film Room, Mark Play and
 * Player Cut talk to this handle only — never to a provider SDK directly.
 */
export type FilmPlayerHandle = {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  setPlaybackRate: (rate: number) => void;
  isReady: () => boolean;
};

export const NOOP_PLAYER_HANDLE: FilmPlayerHandle = {
  play: () => {},
  pause: () => {},
  togglePlay: () => {},
  seek: () => {},
  getCurrentTime: () => 0,
  getDuration: () => 0,
  setPlaybackRate: () => {},
  isReady: () => false,
};
// The desktop's windows, and the session key that remembers the visitor unlocked. Apart from wm.ts, which touches the
// DOM at import, so index.astro can read them on the server for its head script.

export interface AppDef {
  title: string;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  /** Sticky windows float above the rest and follow you across workspaces. */
  sticky?: boolean;
}

export const APPS: Record<string, AppDef> = {
  terminal: { title: 'tanner@billings: ~', w: 800, h: 480, minW: 380, minH: 220 },
  disdubs: { title: 'DisDubs', w: 780, h: 700 },
  gridiron: { title: 'Gridiron Duels', w: 700, h: 560 },
  mothership: { title: 'DnD Mothership', w: 620, h: 400 },
  work: { title: 'Work history', w: 700, h: 660 },
  side: { title: 'Side projects', w: 660, h: 640 },
  writing: { title: 'Writing', w: 660, h: 580 },
  chess: { title: 'Chess', w: 900, h: 640, minW: 560, minH: 420 },
  synth: { title: 'Synth', w: 620, h: 440, minW: 420, minH: 320 },
  guestbook: { title: 'Sticky notes', w: 720, h: 560, minW: 360, minH: 360 },
  radio: { title: 'lofi radio', w: 480, h: 380, minW: 320, minH: 240, sticky: true },
  sayhi: { title: 'Say hi', w: 440, h: 290, minW: 320, minH: 250, sticky: true },
};

export const LOCK_KEY = 'bigsky-unlocked';

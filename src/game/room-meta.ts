/**
 * Display text for room templates on route choices and intro cards. Gameplay data lives
 * in src/content/rooms; this is presentation only.
 */
export interface RoomMeta {
  readonly name: string;
  /** One-line decision signature shown when choosing a branch. */
  readonly blurb: string;
  readonly tags: readonly string[];
}

export const ROOM_META: Readonly<Record<string, RoomMeta>> = {
  departure_court: { name: 'Departure Court', blurb: 'Open stone and an obvious gate. Learn to leave yourself behind.', tags: ['teaching'] },
  needle_gallery: { name: 'Needle Gallery', blurb: 'Cover splits a straight firing line from a longer flank.', tags: ['needlers', 'cover'] },
  silk_cloister: { name: 'Silk Cloister', blurb: 'Close as the crow flies, far along the thread.', tags: ['corners', 'return'] },
  glass_crossing: { name: 'Glass Crossing', blurb: 'Funeral light sweeps the court. Your soul crosses later than you do.', tags: ['lane', 'timing'] },
  mourners_garden: { name: "Mourner's Garden", blurb: 'Sentries ring a guarded centre. Choose where you meet.', tags: ['warden', 'reunion'] },
  last_platform: { name: 'Last Platform', blurb: 'Every role at once around one narrow opening.', tags: ['mixed'] },
  last_warden: { name: 'The Last Warden', blurb: 'It is fast too. Its heart is not.', tags: ['boss'] },
};

export function roomMeta(id: string): RoomMeta {
  return ROOM_META[id] ?? { name: id.replace(/_/g, ' '), blurb: '', tags: [] };
}

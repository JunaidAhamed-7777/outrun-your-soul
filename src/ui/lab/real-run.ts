/**
 * Lab-only walkthrough of a real expedition: the actual Director, run state machine,
 * room registry and view builders, with in-memory storage and room victories faked
 * (no play). Checks the panels against real data shapes, not hand-made fixtures.
 */
import { DEPARTURE_COURT, roomFor } from '../../content/rooms';
import { Director, type Screen } from '../../game/director';
import { roomMeta } from '../../game/room-meta';
import { draftView, endingView, loadoutChips, routeChoices, starterOptions } from '../../game/views';
import { ProgressStore, type RelicId, type StarterId } from '../../run';
import { CheckpointStore } from '../../save/checkpoint';
import { createSim } from '../../sim';
import type { GameUI } from '../ui';
import { BOSS_INTRO_SUBTITLE } from '../hints';

function memoryStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void } {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

export interface RealRunHooks {
  /** Called with the panel kind each time a new screen is presented. */
  onScreen(kind: Screen['kind'] | 'result', detail: string): void;
}

export function startRealRun(ui: GameUI, hooks: RealRunHooks, seed = 4242): Director {
  const mem = memoryStorage();
  const director = new Director({
    checkpoints: new CheckpointStore(mem),
    progress: new ProgressStore(mem),
    resolveRoom: (id, variant) => {
      try {
        return roomFor(id, variant);
      } catch {
        return DEPARTURE_COURT;
      }
    },
  });

  function present(screen: Screen): void {
    switch (screen.kind) {
      case 'room': {
        const meta = roomMeta(screen.entry.roomId);
        ui.hideChoice();
        ui.showHud(screen.room);
        ui.setLoadout(loadoutChips(director.run, null));
        const boss = screen.entry.roomId === 'last_warden';
        ui.setBoss(boss ? { name: 'The Last Warden', heartHp: 3, heartMax: 3, stage: 0, stages: 3 } : null);
        ui.showRoomIntro(screen.room.name || meta.name, boss ? BOSS_INTRO_SUBTITLE : meta.blurb, `${screen.label} · stop ${screen.depth + 1} of 7`);
        const sim = createSim(screen.room, { seed });
        sim.outcome = 'victory';
        sim.time = 38 + screen.depth * 9.3;
        sim.stats.kills = screen.room.enemies.length;
        hooks.onScreen('room', `${screen.entry.roomId} (${screen.label})`);
        ui.showResult('victory', sim, { primaryLabel: 'Onward', onPrimary: () => present(director.roomVictory(sim)) });
        hooks.onScreen('result', 'victory');
        return;
      }
      case 'route':
        ui.hideHud();
        ui.showRouteChoice('Choose your line', routeChoices(screen.choices), (id) => present(director.chooseRoute(id)));
        hooks.onScreen('route', screen.choices.map((c) => c.id).join(' | '));
        return;
      case 'station':
        ui.hideHud();
        ui.showDraft(draftView(screen), (pick, replaceIndex) => present(director.takeDraft(pick as RelicId | null, replaceIndex)));
        hooks.onScreen('station', `${screen.label}: ${screen.draft.offer.join(', ')} / carried ${screen.run.loadout.join(', ')}`);
        return;
      case 'ending':
        ui.hideHud();
        ui.setBoss(null);
        ui.showEnding(endingView(screen.run, director.progressAtStart ?? director.progress, director.progress), () => hooks.onScreen('ending', 'again'));
        hooks.onScreen('ending', screen.escaped ? 'escaped' : 'failed');
        return;
    }
  }

  ui.showStarterSelect(starterOptions(director.progress), (id) => present(director.newRun(seed, id as StarterId)));
  hooks.onScreen('route', 'starter select');
  return director;
}

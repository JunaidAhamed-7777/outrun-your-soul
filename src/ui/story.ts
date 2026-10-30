/**
 * Story interstitial: one sentence fades in over a dark screen, holds, and fades out
 * before a level begins. Tap (or any key) skips. Reduced motion uses short cross-fades.
 */
export interface StoryOverlay {
  /** Resolves when the sentence has faded out (or was skipped). */
  play(text: string, reducedMotion: boolean): Promise<void>;
}

/** Timings in ms: fade in, hold, fade out. */
export const STORY_TIMING = { fadeIn: 900, hold: 2600, fadeOut: 800 } as const;

const CSS = `
.oys-story {
  position: absolute; inset: 0; z-index: 4; display: grid; place-items: center; padding: 0 28px;
  background: radial-gradient(110% 70% at 50% 45%, #14215a 0%, #0b1236 70%, #070b24 100%);
  opacity: 0; pointer-events: none; transition: opacity 400ms ease;
}
.oys-story.is-on { opacity: 1; pointer-events: auto; cursor: pointer; }
.oys-story p {
  margin: 0; max-width: 420px; text-align: center; color: var(--ivory);
  font: italic 24px/1.4 var(--font-display); letter-spacing: 0.01em;
  opacity: 0; transform: translateY(6px); transition-property: opacity, transform; transition-timing-function: ease;
}
.oys-story p.is-shown { opacity: 1; transform: none; }
.oys-story .skip { position: absolute; bottom: calc(var(--safe-bottom) + 10px); left: 0; right: 0; text-align: center; font: 12px var(--font-ui); letter-spacing: 0.18em; text-transform: uppercase; color: var(--ivory-dim); opacity: 0.7; }
`;

export function createStoryOverlay(root: HTMLElement): StoryOverlay {
  const doc = root.ownerDocument;
  const style = doc.createElement('style');
  style.textContent = CSS;
  doc.head.appendChild(style);
  const layer = doc.createElement('div');
  layer.className = 'oys-story';
  layer.setAttribute('role', 'status');
  layer.setAttribute('aria-live', 'polite');
  const line = doc.createElement('p');
  const skip = doc.createElement('div');
  skip.className = 'skip';
  skip.textContent = 'Tap to continue';
  layer.append(line, skip);
  root.appendChild(layer);

  return {
    play(text, reducedMotion) {
      const fadeIn = reducedMotion ? 200 : STORY_TIMING.fadeIn;
      const fadeOut = reducedMotion ? 200 : STORY_TIMING.fadeOut;
      return new Promise<void>((resolve) => {
        let finished = false;
        const timers: ReturnType<typeof setTimeout>[] = [];
        const finish = () => {
          if (finished) return;
          finished = true;
          for (const t of timers) clearTimeout(t);
          layer.removeEventListener('pointerdown', onSkip);
          doc.removeEventListener('keydown', onSkip);
          line.classList.remove('is-shown');
          layer.classList.remove('is-on');
          // Let the layer fade before the level is revealed.
          setTimeout(resolve, 250);
        };
        const onSkip = (e: Event) => {
          e.preventDefault();
          finish();
        };
        line.textContent = text;
        line.style.transitionDuration = `${fadeIn}ms`;
        layer.classList.add('is-on');
        layer.addEventListener('pointerdown', onSkip);
        doc.addEventListener('keydown', onSkip);
        timers.push(setTimeout(() => line.classList.add('is-shown'), 120));
        timers.push(
          setTimeout(() => {
            line.style.transitionDuration = `${fadeOut}ms`;
            line.classList.remove('is-shown');
          }, 120 + fadeIn + STORY_TIMING.hold),
        );
        timers.push(setTimeout(finish, 120 + fadeIn + STORY_TIMING.hold + fadeOut));
      });
    },
  };
}

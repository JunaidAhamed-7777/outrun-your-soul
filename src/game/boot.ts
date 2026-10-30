/**
 * Boot (loading) screen: the #boot markup in index.html renders before any script runs;
 * this drives its thread-shaped progress bar and removes it once the title is ready.
 * Tolerates the markup being absent (tests, embeds).
 */

/** Fraction of the bar reserved for script start-up before model loading reports in. */
export const SCRIPT_SHARE = 0.12;

/** Map model-loading progress to the bar: script start-up first, then models. */
export function bootFraction(loaded: number, total: number): number {
  if (total <= 0) return 1;
  const models = Math.min(1, Math.max(0, loaded / total));
  return SCRIPT_SHARE + (1 - SCRIPT_SHARE) * models;
}

export interface BootScreen {
  progress(fraction: number, status?: string): void;
  /** Fade out and remove. Safe to call more than once. */
  done(): void;
}

export function bootScreen(doc: Document = document): BootScreen {
  const root = doc.getElementById('boot');
  const thread = root?.querySelector<HTMLElement>('.thread');
  const body = root?.querySelector<HTMLElement>('.body');
  const soul = root?.querySelector<HTMLElement>('.soul');
  const status = root?.querySelector<HTMLElement>('.status');
  let finished = false;
  return {
    progress(fraction, text) {
      if (!root || finished) return;
      const pct = `${(Math.min(1, Math.max(0, fraction)) * 100).toFixed(1)}%`;
      if (thread) thread.style.width = pct;
      if (body) body.style.left = pct;
      // The soul's longer CSS transition makes it trail the body along the thread.
      if (soul) soul.style.left = pct;
      if (text && status) status.textContent = text;
    },
    done() {
      if (!root || finished) return;
      finished = true;
      root.classList.add('is-done');
      root.setAttribute('aria-busy', 'false');
      setTimeout(() => root.remove(), 600);
    },
  };
}

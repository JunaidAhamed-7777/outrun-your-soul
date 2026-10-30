import { startGame } from './game/game';

// Tells the inline watchdog in index.html that the game script did start.
(window as unknown as { __oysScriptStarted?: boolean }).__oysScriptStarted = true;

const app = document.getElementById('app');
if (app) {
  void startGame(app).catch((err: unknown) => {
    console.error(err);
    document.getElementById('boot')?.remove();
    app.textContent = 'Outrun Your Soul could not start. Please reload the page.';
  });
}

import { startGame } from './game/game';

const app = document.getElementById('app');
if (app) {
  void startGame(app).catch((err: unknown) => {
    console.error(err);
    app.textContent = 'Outrun Your Soul could not start. Please reload the page.';
  });
}

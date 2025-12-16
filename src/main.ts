import { Game } from './core/Game';

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const game = new Game(canvas);

game.init().then(() => {
    game.run();
});

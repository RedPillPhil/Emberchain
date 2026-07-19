import Phaser from 'phaser';
import { PreloadScene }  from './scenes/PreloadScene';
import { MenuScene }     from './scenes/MenuScene';
import { GameScene }     from './scenes/GameScene';
import { LevelEndScene } from './scenes/LevelEndScene';

export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2x for performance

  return {
    type: Phaser.AUTO,    // WebGL when available, Canvas fallback
    parent,
    width:  854,
    height: 480,
    backgroundColor: '#2A0018',
    antialias: true,
    antialiasGL: true,
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: 900 }, debug: false },
    },
    scale: {
      mode:       Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      zoom:       dpr,               // render at native pixel density
    },
    scene: [PreloadScene, MenuScene, GameScene, LevelEndScene],
  };
}

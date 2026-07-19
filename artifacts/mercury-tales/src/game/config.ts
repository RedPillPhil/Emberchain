import Phaser from 'phaser';
import { PreloadScene }  from './scenes/PreloadScene';
import { MenuScene }     from './scenes/MenuScene';
import { GameScene }     from './scenes/GameScene';
import { LevelEndScene } from './scenes/LevelEndScene';

export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: 854,
    height: 480,
    backgroundColor: '#B83A00',   // matches vivid sky top band
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: 900 }, debug: false },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [PreloadScene, MenuScene, GameScene, LevelEndScene],
  };
}

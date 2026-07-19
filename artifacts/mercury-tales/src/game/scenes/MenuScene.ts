import Phaser from 'phaser';
import { TEX } from '../constants';

export class MenuScene extends Phaser.Scene {
  constructor() { super({ key: 'MenuScene' }); }

  create() {
    const { width: W, height: H } = this.scale;

    // Sky background
    this.add.image(W / 2, H / 2, TEX.BG_SKY).setDisplaySize(W, H);

    // Far mountains (multiple overlapping)
    for (let x = -400; x < W + 400; x += 400) {
      this.add.image(x + 200, H - 100, TEX.BG_FAR).setOrigin(0.5, 1).setAlpha(0.8);
    }
    for (let x = -600; x < W + 600; x += 600) {
      this.add.image(x + 300, H - 20, TEX.BG_NEAR).setOrigin(0.5, 1);
    }

    // Animated lava strip at bottom
    const lavaGfx = this.add.graphics();
    let lavaPhase = 0;
    this.time.addEvent({ delay: 16, loop: true, callback: () => {
      lavaPhase += 0.04;
      lavaGfx.clear();
      lavaGfx.fillStyle(0xff4400, 0.85 + Math.sin(lavaPhase) * 0.15);
      lavaGfx.fillRect(0, H - 28, W, 28);
      lavaGfx.fillStyle(0xff8800, 0.5 + Math.sin(lavaPhase * 1.3) * 0.2);
      for (let bx = 30; bx < W; bx += 90) {
        const size = 8 + Math.sin(lavaPhase + bx * 0.05) * 5;
        lavaGfx.fillCircle(bx, H - 14, size);
      }
    }});

    // Title glow bg
    const titleGlow = this.add.graphics();
    titleGlow.fillStyle(0xff4400, 0.12);
    titleGlow.fillRoundedRect(W / 2 - 260, 55, 520, 110, 20);
    titleGlow.lineStyle(1, 0xff6600, 0.4);
    titleGlow.strokeRoundedRect(W / 2 - 260, 55, 520, 110, 20);

    // Title
    this.add.text(W / 2, 90, 'MERCURY TALES', {
      fontFamily: 'Georgia, serif',
      fontSize: '54px',
      color: '#ff8844',
      stroke: '#550000',
      strokeThickness: 6,
      shadow: { blur: 20, color: '#ff4400', fill: true },
    }).setOrigin(0.5);

    // Planet subtitle
    this.add.text(W / 2, 148, '— Planet Scoria —', {
      fontFamily: 'Georgia, serif',
      fontSize: '20px',
      color: '#cc6633',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    // Portal decoration (left and right of title)
    const portalL = this.add.image(W / 2 - 300, 105, TEX.PORTAL).setAlpha(0.4).setScale(0.6);
    const portalR = this.add.image(W / 2 + 300, 105, TEX.PORTAL).setAlpha(0.4).setScale(0.6).setFlipX(true);
    this.tweens.add({ targets: [portalL, portalR], alpha: { from: 0.3, to: 0.7 }, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // Lore blurb
    const loreText = [
      'Deep in the solar system lies SCORIA — a planet of fire and volcanic rock.',
      'Its most precious resource: Iridium, forged in the planet\'s burning core.',
      'Baron Cinder and his Char Collectors prey on lone adventurers.',
      'Will you survive the Ember Realm?',
    ].join('\n');
    this.add.text(W / 2, 220, loreText, {
      fontFamily: 'Georgia, serif',
      fontSize: '13px',
      color: '#c47a4a',
      align: 'center',
      lineSpacing: 6,
    }).setOrigin(0.5);

    // START BUTTON
    const btnBg = this.add.graphics();
    const drawBtn = (hover: boolean) => {
      btnBg.clear();
      btnBg.fillStyle(hover ? 0x991100 : 0x660d00);
      btnBg.fillRoundedRect(W / 2 - 130, 308, 260, 52, 10);
      btnBg.lineStyle(2, hover ? 0xff6600 : 0xff3300, 1);
      btnBg.strokeRoundedRect(W / 2 - 130, 308, 260, 52, 10);
    };
    drawBtn(false);

    const btnText = this.add.text(W / 2, 334, '▶  BEGIN ADVENTURE', {
      fontFamily: 'Georgia, serif',
      fontSize: '20px',
      color: '#ffcc88',
      stroke: '#330000',
      strokeThickness: 3,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btnText.on('pointerover',  () => { drawBtn(true);  btnText.setColor('#ffffff'); });
    btnText.on('pointerout',   () => { drawBtn(false); btnText.setColor('#ffcc88'); });
    btnText.on('pointerdown',  () => this.startGame());

    // Pulsing START button
    this.tweens.add({ targets: btnText, scaleX: 1.03, scaleY: 1.03, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // Character roster tease
    this.add.text(W / 2, 390, '10 Genesis NFT Characters — Own Your Adventure', {
      fontFamily: 'Georgia, serif',
      fontSize: '13px',
      color: '#886644',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    // Free character notice
    this.add.text(W / 2, 415, 'Playing as: Ember Apprentice (Free)  •  Connect wallet to use NFT Characters', {
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      color: '#664422',
    }).setOrigin(0.5);

    // Controls hint
    this.add.text(W / 2, 460, '← → Arrow Keys / WASD to move  •  Space / ↑ to jump', {
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      color: '#553322',
    }).setOrigin(0.5);

    // Floating coin decorations
    for (let i = 0; i < 8; i++) {
      const cx = 60 + Math.random() * (W - 120);
      const cy = 460 + Math.random() * 30;
      const coin = this.add.image(cx, cy, TEX.COIN).setScale(0.9).setAlpha(0.4);
      this.tweens.add({ targets: coin, y: cy - 8, duration: 1000 + Math.random() * 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Math.random() * 1000 });
    }
  }

  private startGame() {
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameScene'));
  }
}

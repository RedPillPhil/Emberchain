import Phaser from 'phaser';
import { TEX } from '../constants';

const F_TITLE = '"Fredoka One", "Nunito", sans-serif';
const F_BODY  = '"Nunito", sans-serif';

export class MenuScene extends Phaser.Scene {
  constructor() { super({ key: 'MenuScene' }); }

  create() {
    const { width: W, height: H } = this.scale;

    // ── Background layers ───────────────────────────────────────────────────
    this.add.image(W / 2, H / 2, TEX.BG_SKY).setDisplaySize(W, H);

    const clouds = this.add.tileSprite(W / 2, 68, W, 100, TEX.BG_CLOUDS).setOrigin(0.5, 0.5);
    this.time.addEvent({ delay: 50, loop: true, callback: () => { clouds.tilePositionX += 0.22; } });

    for (let x = -650; x < W + 650; x += 650) {
      this.add.image(x + 325, H - 50, TEX.BG_FAR).setOrigin(0.5, 1);
    }
    for (let x = -820; x < W + 820; x += 820) {
      this.add.image(x + 410, H - 28, TEX.BG_MID).setOrigin(0.5, 1);
    }
    for (let x = -700; x < W + 700; x += 700) {
      this.add.image(x + 350, H - 18, TEX.BG_NEAR).setOrigin(0.5, 1);
    }

    // Animated lava strip
    const lavaGfx = this.add.graphics();
    let lavaPhase = 0;
    this.time.addEvent({ delay: 16, loop: true, callback: () => {
      lavaPhase += 0.05;
      lavaGfx.clear();
      lavaGfx.fillStyle(0xFF2200, 1.0); lavaGfx.fillRect(0, H - 28, W, 28);
      lavaGfx.fillStyle(0xFF6600, 1.0); lavaGfx.fillRect(0, H - 28, W, 7);
      lavaGfx.fillStyle(0xFFCC00, 0.45 + Math.sin(lavaPhase) * 0.2); lavaGfx.fillRect(0, H - 28, W, 3);
      lavaGfx.fillStyle(0xFF8800, 0.8);
      for (let bx = 40; bx < W; bx += 105) {
        const sz = 7 + Math.sin(lavaPhase + bx * 0.04) * 5;
        lavaGfx.fillCircle(bx, H - 16, sz);
        lavaGfx.fillStyle(0xFFDD00, 0.6); lavaGfx.fillCircle(bx, H - 16, sz * 0.42);
        lavaGfx.fillStyle(0xFF8800, 0.8);
      }
    }});

    // ── Title card ──────────────────────────────────────────────────────────
    // Dark backing with vivid orange border
    const titleBg = this.add.graphics();
    titleBg.fillStyle(0x0A0018, 0.78);
    titleBg.fillRoundedRect(W / 2 - 285, 48, 570, 128, 20);
    // Vivid gradient border (approximate with layered strokes)
    titleBg.lineStyle(3, 0xFF6600, 1.0);
    titleBg.strokeRoundedRect(W / 2 - 285, 48, 570, 128, 20);
    titleBg.lineStyle(1.5, 0xFFCC44, 0.6);
    titleBg.strokeRoundedRect(W / 2 - 281, 52, 562, 120, 17);

    // Title text — Fredoka One for that friendly-bold game feel
    this.add.text(W / 2, 88, 'MERCURY TALES', {
      fontFamily: F_TITLE,
      fontSize: '56px',
      color: '#FF8800',
      stroke: '#1A0000',
      strokeThickness: 6,
      shadow: { blur: 20, color: '#FF4400', fill: true, offsetX: 0, offsetY: 2 },
    }).setOrigin(0.5);

    this.add.text(W / 2, 148, '— Planet Scoria —', {
      fontFamily: F_BODY,
      fontStyle: 'bold italic',
      fontSize: '19px',
      color: '#FFDD88',
      stroke: '#2A0800',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // Portal decorations
    const portalL = this.add.image(W / 2 - 316, 104, TEX.PORTAL).setAlpha(0.5).setScale(0.65);
    const portalR = this.add.image(W / 2 + 316, 104, TEX.PORTAL).setAlpha(0.5).setScale(0.65).setFlipX(true);
    this.tweens.add({ targets: [portalL, portalR], alpha: { from: 0.35, to: 0.75 }, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ── Lore blurb ──────────────────────────────────────────────────────────
    const lorePanel = this.add.graphics();
    lorePanel.fillStyle(0x0A0010, 0.60);
    lorePanel.fillRoundedRect(W / 2 - 262, 194, 524, 92, 12);
    lorePanel.lineStyle(1, 0xFF6600, 0.35);
    lorePanel.strokeRoundedRect(W / 2 - 262, 194, 524, 92, 12);

    const loreText = [
      'Deep in the solar system lies SCORIA — a planet of fire and volcanic rock.',
      'Its most precious resource: Iridium, forged in the planet\'s burning core.',
      'Baron Cinder and his Char Collectors prey on lone adventurers.',
      'Will you survive the Ember Realm?',
    ].join('\n');
    this.add.text(W / 2, 220, loreText, {
      fontFamily: F_BODY,
      fontStyle: 'bold',
      fontSize: '13px',
      color: '#FFEECC',
      align: 'center',
      lineSpacing: 8,
      stroke: '#0A0010',
      strokeThickness: 2,
    }).setOrigin(0.5);

    // ── START BUTTON ────────────────────────────────────────────────────────
    const btnW = 292, btnH = 58, btnX = W / 2 - btnW / 2, btnY = 306;
    const btnBg = this.add.graphics();

    const drawBtn = (hover: boolean) => {
      btnBg.clear();
      // Drop shadow
      btnBg.fillStyle(0x000000, 0.35);
      btnBg.fillRoundedRect(btnX + 3, btnY + 4, btnW, btnH, 14);
      // Main button body
      btnBg.fillStyle(hover ? 0xEE2A00 : 0xCC1800);
      btnBg.fillRoundedRect(btnX, btnY, btnW, btnH, 14);
      // Top highlight (lighter)
      btnBg.fillStyle(hover ? 0xFF7744 : 0xFF5533, 0.45);
      btnBg.fillRoundedRect(btnX + 3, btnY + 2, btnW - 6, btnH / 2, 12);
      // Border
      btnBg.lineStyle(2.5, hover ? 0xFFCC44 : 0xFF8800, 1.0);
      btnBg.strokeRoundedRect(btnX, btnY, btnW, btnH, 14);
    };
    drawBtn(false);

    const btnText = this.add.text(W / 2, btnY + btnH / 2, '▶  BEGIN ADVENTURE', {
      fontFamily: F_TITLE,
      fontSize: '23px',
      color: '#FFEE88',
      stroke: '#440000',
      strokeThickness: 4,
      shadow: { blur: 8, color: '#FF4400', fill: true, offsetX: 0, offsetY: 1 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btnText.on('pointerover',  () => { drawBtn(true);  btnText.setColor('#FFFFFF'); });
    btnText.on('pointerout',   () => { drawBtn(false); btnText.setColor('#FFEE88'); });
    btnText.on('pointerdown',  () => this.startGame());

    this.tweens.add({ targets: [btnBg, btnText], y: `+=3`, duration: 950, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ── Controls hint ───────────────────────────────────────────────────────
    const footerBg = this.add.graphics();
    footerBg.fillStyle(0x050010, 0.55);
    footerBg.fillRoundedRect(W / 2 - 228, 378, 456, 64, 10);
    footerBg.lineStyle(1, 0xFF5500, 0.28);
    footerBg.strokeRoundedRect(W / 2 - 228, 378, 456, 64, 10);

    this.add.text(W / 2, 392, '10 Genesis NFT Characters — Own Your Adventure', {
      fontFamily: F_BODY, fontStyle: 'bold italic', fontSize: '13px',
      color: '#FFBB55', stroke: '#050010', strokeThickness: 2,
    }).setOrigin(0.5);

    this.add.text(W / 2, 414, 'Playing as: Ember Apprentice (Free)  •  Connect wallet to use NFT Characters', {
      fontFamily: F_BODY, fontStyle: 'bold', fontSize: '11px',
      color: '#CC8840', stroke: '#050010', strokeThickness: 2,
    }).setOrigin(0.5);

    this.add.text(W / 2, 452, '← → Arrow Keys / WASD to move  •  Space / ↑ to jump  •  Double-jump mid-air!', {
      fontFamily: F_BODY, fontStyle: 'bold', fontSize: '11px',
      color: '#FFDD88', stroke: '#050010', strokeThickness: 2,
    }).setOrigin(0.5);

    // Floating coins
    for (let i = 0; i < 10; i++) {
      const cx = 38 + Math.random() * (W - 76);
      const cy = 462 + Math.random() * 20;
      const coin = this.add.image(cx, cy, TEX.COIN).setScale(0.85).setAlpha(0.55);
      this.tweens.add({
        targets: coin, y: cy - 10,
        duration: 900 + Math.random() * 700,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        delay: Math.random() * 1200,
      });
    }
  }

  private startGame() {
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameScene'));
  }
}

import Phaser from 'phaser';
import { TEX } from '../constants';

export class MenuScene extends Phaser.Scene {
  constructor() { super({ key: 'MenuScene' }); }

  create() {
    const { width: W, height: H } = this.scale;

    // ── Background — vivid Scoria sky ──────────────────────────────────────
    this.add.image(W / 2, H / 2, TEX.BG_SKY).setDisplaySize(W, H);

    // Clouds layer
    const clouds = this.add.tileSprite(W / 2, 70, W, 100, TEX.BG_CLOUDS).setOrigin(0.5, 0.5);
    this.time.addEvent({ delay: 50, loop: true, callback: () => { clouds.tilePositionX += 0.2; } });

    // Far colourful volcanic formations
    for (let x = -500; x < W + 500; x += 500) {
      this.add.image(x + 250, H - 50, TEX.BG_FAR).setOrigin(0.5, 1);
    }
    // Mid formations
    for (let x = -700; x < W + 700; x += 700) {
      this.add.image(x + 350, H - 30, TEX.BG_MID).setOrigin(0.5, 1);
    }
    // Near grass strip
    for (let x = -600; x < W + 600; x += 600) {
      this.add.image(x + 300, H - 20, TEX.BG_NEAR).setOrigin(0.5, 1);
    }

    // ── Bright animated lava strip at bottom ───────────────────────────────
    const lavaGfx = this.add.graphics();
    let lavaPhase = 0;
    this.time.addEvent({ delay: 16, loop: true, callback: () => {
      lavaPhase += 0.05;
      lavaGfx.clear();
      // Base lava
      lavaGfx.fillStyle(0xFF3300, 1.0);
      lavaGfx.fillRect(0, H - 28, W, 28);
      // Bright surface
      lavaGfx.fillStyle(0xFF6600, 1.0);
      lavaGfx.fillRect(0, H - 28, W, 6);
      // Golden shimmer
      lavaGfx.fillStyle(0xFFCC00, 0.45 + Math.sin(lavaPhase) * 0.2);
      lavaGfx.fillRect(0, H - 28, W, 3);
      // Bubble hotspots
      lavaGfx.fillStyle(0xFF8800, 0.8);
      for (let bx = 40; bx < W; bx += 110) {
        const sz = 7 + Math.sin(lavaPhase + bx * 0.04) * 5;
        lavaGfx.fillCircle(bx, H - 16, sz);
        lavaGfx.fillStyle(0xFFDD00, 0.55);
        lavaGfx.fillCircle(bx, H - 16, sz * 0.45);
        lavaGfx.fillStyle(0xFF8800, 0.8);
      }
    }});

    // ── Title card — bold panel over vibrant background ────────────────────
    // Dark translucent backing so text pops against bright sky
    const titleBg = this.add.graphics();
    titleBg.fillStyle(0x1A0800, 0.72);
    titleBg.fillRoundedRect(W / 2 - 280, 50, 560, 130, 18);
    titleBg.lineStyle(2, 0xFF8C00, 0.9);
    titleBg.strokeRoundedRect(W / 2 - 280, 50, 560, 130, 18);
    // Inner glow line
    titleBg.lineStyle(1, 0xFFCC40, 0.4);
    titleBg.strokeRoundedRect(W / 2 - 276, 54, 552, 122, 15);

    // Title text
    this.add.text(W / 2, 92, 'MERCURY TALES', {
      fontFamily: 'Georgia, serif',
      fontSize: '54px',
      color: '#FF9933',
      stroke: '#4A1000',
      strokeThickness: 7,
      shadow: { blur: 24, color: '#FF6600', fill: true },
    }).setOrigin(0.5);

    // Planet subtitle
    this.add.text(W / 2, 150, '— Planet Scoria —', {
      fontFamily: 'Georgia, serif',
      fontSize: '20px',
      color: '#FFCC66',
      fontStyle: 'italic',
      stroke: '#4A1000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // Portal decorations
    const portalL = this.add.image(W / 2 - 310, 107, TEX.PORTAL).setAlpha(0.55).setScale(0.65);
    const portalR = this.add.image(W / 2 + 310, 107, TEX.PORTAL).setAlpha(0.55).setScale(0.65).setFlipX(true);
    this.tweens.add({ targets: [portalL, portalR], alpha: { from: 0.4, to: 0.8 }, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ── Lore blurb ─────────────────────────────────────────────────────────
    const lorePanel = this.add.graphics();
    lorePanel.fillStyle(0x200800, 0.55);
    lorePanel.fillRoundedRect(W / 2 - 260, 196, 520, 94, 10);
    const loreText = [
      'Deep in the solar system lies SCORIA — a planet of fire and volcanic rock.',
      'Its most precious resource: Iridium, forged in the planet\'s burning core.',
      'Baron Cinder and his Char Collectors prey on lone adventurers.',
      'Will you survive the Ember Realm?',
    ].join('\n');
    this.add.text(W / 2, 222, loreText, {
      fontFamily: 'Georgia, serif',
      fontSize: '13px',
      color: '#FFDD99',
      align: 'center',
      lineSpacing: 7,
      stroke: '#200800',
      strokeThickness: 2,
    }).setOrigin(0.5);

    // ── START BUTTON ───────────────────────────────────────────────────────
    const btnBg = this.add.graphics();
    const drawBtn = (hover: boolean) => {
      btnBg.clear();
      btnBg.fillStyle(hover ? 0xCC2200 : 0x991500);
      btnBg.fillRoundedRect(W / 2 - 140, 308, 280, 56, 12);
      btnBg.lineStyle(3, hover ? 0xFF8800 : 0xFF5500, 1);
      btnBg.strokeRoundedRect(W / 2 - 140, 308, 280, 56, 12);
      btnBg.lineStyle(1, 0xFFCC40, 0.5);
      btnBg.strokeRoundedRect(W / 2 - 136, 312, 272, 48, 10);
    };
    drawBtn(false);

    const btnText = this.add.text(W / 2, 336, '▶  BEGIN ADVENTURE', {
      fontFamily: 'Georgia, serif',
      fontSize: '22px',
      color: '#FFE080',
      stroke: '#4A0800',
      strokeThickness: 4,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btnText.on('pointerover',  () => { drawBtn(true);  btnText.setColor('#FFFFFF'); });
    btnText.on('pointerout',   () => { drawBtn(false); btnText.setColor('#FFE080'); });
    btnText.on('pointerdown',  () => this.startGame());

    this.tweens.add({ targets: btnText, scaleX: 1.04, scaleY: 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ── Character / NFT footer ─────────────────────────────────────────────
    const footerBg = this.add.graphics();
    footerBg.fillStyle(0x200800, 0.5);
    footerBg.fillRoundedRect(W / 2 - 220, 382, 440, 60, 8);

    this.add.text(W / 2, 395, '10 Genesis NFT Characters — Own Your Adventure', {
      fontFamily: 'Georgia, serif',
      fontSize: '13px',
      color: '#FFB840',
      fontStyle: 'italic',
      stroke: '#200800',
      strokeThickness: 2,
    }).setOrigin(0.5);

    this.add.text(W / 2, 418, 'Playing as: Ember Apprentice (Free)  •  Connect wallet to use NFT Characters', {
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      color: '#CC8830',
      stroke: '#200800',
      strokeThickness: 2,
    }).setOrigin(0.5);

    // Controls hint
    this.add.text(W / 2, 458, '← → Arrow Keys / WASD to move  •  Space / ↑ to jump', {
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      color: '#FFDD88',
      stroke: '#200800',
      strokeThickness: 2,
    }).setOrigin(0.5);

    // Floating coin decorations along bottom
    for (let i = 0; i < 10; i++) {
      const cx = 40 + Math.random() * (W - 80);
      const cy = 460 + Math.random() * 22;
      const coin = this.add.image(cx, cy, TEX.COIN).setScale(0.85).setAlpha(0.6);
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

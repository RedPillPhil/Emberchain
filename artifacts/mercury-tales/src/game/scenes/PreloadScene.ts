import Phaser from 'phaser';
import { TEX } from '../constants';

export class PreloadScene extends Phaser.Scene {
  constructor() { super({ key: 'PreloadScene' }); }

  preload() {
    // Player spritesheets only — enemies and ground are generated procedurally
    this.load.spritesheet('player-run-r',  'assets/player-run-r.png',  { frameWidth: 85,  frameHeight: 100 });
    this.load.spritesheet('player-run-l',  'assets/player-run-l.png',  { frameWidth: 85,  frameHeight: 100 });
    this.load.spritesheet('player-idle-r', 'assets/player-idle-r.png', { frameWidth: 45,  frameHeight: 100 });
    this.load.spritesheet('player-idle-l', 'assets/player-idle-l.png', { frameWidth: 45,  frameHeight: 100 });
  }

  create() {
    this.createSkyTexture();
    this.createCloudsTexture();
    this.createFarBgTexture();
    this.createMidBgTexture();
    this.createNearBgTexture();
    this.createPlatformTextures();
    this.createCoinTextures();
    this.createPortalTexture();
    this.createCollectorTexture();
    this.createGeyserTexture();
    this.createGroundTexture();      // volcanic basalt tile
    this.createEmberSalamander();    // procedural flame lizard enemy

    // ── Animations ────────────────────────────────────────────────────────────
    this.anims.create({ key: 'ember-run-r',  frames: this.anims.generateFrameNumbers('player-run-r',  { start: 0, end: 29 }), frameRate: 22, repeat: -1 });
    this.anims.create({ key: 'ember-run-l',  frames: this.anims.generateFrameNumbers('player-run-l',  { start: 0, end: 29 }), frameRate: 22, repeat: -1 });
    this.anims.create({ key: 'ember-idle-r', frames: this.anims.generateFrameNumbers('player-idle-r', { start: 0, end: 29 }), frameRate: 14, repeat: -1 });
    this.anims.create({ key: 'ember-idle-l', frames: this.anims.generateFrameNumbers('player-idle-l', { start: 0, end: 29 }), frameRate: 14, repeat: -1 });

    // Enemy walk — 2 custom frames from the generated texture
    this.anims.create({
      key: 'cinderslug-walk',
      frames: [{ key: TEX.SLUG, frame: 0 }, { key: TEX.SLUG, frame: 1 }],
      frameRate: 5,
      repeat: -1,
    });

    this.scene.start('MenuScene');
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  private g(): Phaser.GameObjects.Graphics {
    return this.make.graphics({ x: 0, y: 0, add: false });
  }

  private lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

  private lerpColor(c1: number, c2: number, t: number): number {
    const r = Math.round(this.lerp((c1 >> 16) & 0xff, (c2 >> 16) & 0xff, t));
    const g = Math.round(this.lerp((c1 >> 8)  & 0xff, (c2 >> 8)  & 0xff, t));
    const b = Math.round(this.lerp( c1        & 0xff,  c2        & 0xff,  t));
    return (r << 16) | (g << 8) | b;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  GROUND TILE — 32×32 volcanic basalt (NOT Mario bricks)
  // ─────────────────────────────────────────────────────────────────────────────
  private createGroundTexture() {
    const W = 32, H = 32;
    const gfx = this.g();

    // Base: dark warm charcoal rock
    gfx.fillStyle(0x1C0C06); gfx.fillRect(0, 0, W, H);

    // Rock mass variation bands
    gfx.fillStyle(0x240E08, 0.5); gfx.fillRect(0,  8, W, 5);
    gfx.fillStyle(0x160804, 0.4); gfx.fillRect(0, 20, W, 4);

    // Lava crack network — orange veins
    gfx.lineStyle(1, 0xFF3300, 0.70);
    gfx.beginPath();
    gfx.moveTo(4, 0);  gfx.lineTo(8, 6);   gfx.lineTo(5, 12);
    gfx.moveTo(5, 12); gfx.lineTo(10, 18); gfx.lineTo(7, 26); gfx.lineTo(10, 32);
    gfx.strokePath();

    gfx.lineStyle(1, 0xFF5500, 0.55);
    gfx.beginPath();
    gfx.moveTo(20, 0);  gfx.lineTo(18, 8);  gfx.lineTo(24, 16);
    gfx.moveTo(24, 16); gfx.lineTo(22, 24); gfx.lineTo(26, 32);
    gfx.strokePath();

    gfx.lineStyle(1, 0xFF7700, 0.40);
    gfx.beginPath();
    gfx.moveTo(0, 14); gfx.lineTo(8, 16);  gfx.lineTo(14, 12); gfx.lineTo(22, 15); gfx.lineTo(32, 13);
    gfx.strokePath();

    // Lava glow around cracks (inner glow effect with filled dots)
    gfx.fillStyle(0xFF4400, 0.18);
    gfx.fillCircle(8,  6,  4); gfx.fillCircle(5,  12, 3);
    gfx.fillCircle(10, 18, 3); gfx.fillCircle(24, 16, 4);

    // Rock mineral flecks (dark)
    gfx.fillStyle(0x0E0604, 0.8);
    gfx.fillRect(12, 3, 3, 3); gfx.fillRect(26, 9, 3, 3);
    gfx.fillRect(3, 22, 3, 3); gfx.fillRect(18, 27, 3, 3);

    // TOP surface highlight — bright amber edge (where player stands)
    gfx.fillStyle(0xD85C20); gfx.fillRect(0, 0, W, 5);
    gfx.fillStyle(0xFF8830); gfx.fillRect(0, 0, W, 2);
    gfx.fillStyle(0xFFCC60); gfx.fillRect(0, 0, W, 1);

    gfx.generateTexture(TEX.GROUND, W, H);
    gfx.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  EMBER SALAMANDER — 2-frame procedural flame lizard (NOT a mushroom)
  //  Wide, low body. Dorsal spines. Slit orange eyes. Lava crack skin.
  //  Each frame: 44px wide × 28px tall.  Total texture: 88 × 28.
  // ─────────────────────────────────────────────────────────────────────────────
  private createEmberSalamander() {
    const FW = 44, FH = 28;
    const gfx = this.g();

    const drawFrame = (ox: number, legPhase: number) => {
      // ── Tail — tapers behind the body ─────────────────────────────────────
      gfx.fillStyle(0x120402);
      gfx.fillEllipse(ox + 38, 20, 14, 6);   // main tail segment
      gfx.fillEllipse(ox + 43, 20, 6,  4);   // thin tip
      // Lava seam through tail
      gfx.lineStyle(1, 0xFF3300, 0.5);
      gfx.beginPath(); gfx.moveTo(ox+32, 20); gfx.lineTo(ox+43, 20); gfx.strokePath();
      // Glowing tail tip
      gfx.fillStyle(0xFF4400, 0.65); gfx.fillCircle(ox + 44, 20, 2.5);
      gfx.fillStyle(0xFF8800, 0.8);  gfx.fillCircle(ox + 44, 20, 1.2);

      // ── Body — wide flat oval, dark obsidian ──────────────────────────────
      gfx.fillStyle(0x180604);
      gfx.fillEllipse(ox + 22, 17, 30, 14);
      // Upper highlight — subtle lighter band
      gfx.fillStyle(0x2C1008, 0.55);
      gfx.fillEllipse(ox + 22, 14, 22, 6);

      // ── Dorsal spines — 3 triangular ridges along the back ───────────────
      gfx.fillStyle(0x2A100A);
      gfx.fillTriangle(ox+14, 11, ox+16,  5, ox+18, 11);  // front spine
      gfx.fillTriangle(ox+20, 10, ox+22,  4, ox+24, 10);  // mid spine
      gfx.fillTriangle(ox+26, 11, ox+28,  5, ox+30, 11);  // rear spine
      // Spine lava glow
      gfx.fillStyle(0xFF4400, 0.35);
      gfx.fillCircle(ox+16, 6, 2.5); gfx.fillCircle(ox+22, 5, 2.5); gfx.fillCircle(ox+28, 6, 2.5);

      // ── Lava crack network across the body ────────────────────────────────
      gfx.lineStyle(1, 0xFF4400, 0.60);
      gfx.beginPath();
      gfx.moveTo(ox+15, 16); gfx.lineTo(ox+20, 14); gfx.lineTo(ox+26, 16); gfx.lineTo(ox+30, 14);
      gfx.strokePath();
      gfx.lineStyle(1, 0xFF7700, 0.45);
      gfx.beginPath();
      gfx.moveTo(ox+20, 18); gfx.lineTo(ox+25, 20); gfx.moveTo(ox+27, 15); gfx.lineTo(ox+30, 17);
      gfx.strokePath();
      // Hot glow spots at crack intersections
      gfx.fillStyle(0xFF6600, 0.30);
      gfx.fillCircle(ox+20, 14, 3); gfx.fillCircle(ox+26, 16, 3);

      // ── Neck — connects head to body ──────────────────────────────────────
      gfx.fillStyle(0x1A0806);
      gfx.fillEllipse(ox + 9, 16, 12, 10);

      // ── Head — flattened oval snout (NOT round mushroom) ──────────────────
      gfx.fillStyle(0x1C0806);
      gfx.fillEllipse(ox + 6, 14, 16, 11);  // cranium
      gfx.fillStyle(0x160604);
      gfx.fillEllipse(ox + 2, 16, 9,  7);   // flattened snout
      // Nostril
      gfx.fillStyle(0xFF2200, 0.75); gfx.fillCircle(ox + 0.5, 15, 1.8);

      // ── Eyes — vertical slit pupils, orange glow ──────────────────────────
      // Glow halo
      gfx.fillStyle(0xFF7700, 0.45);
      gfx.fillCircle(ox + 6, 10, 4.5); gfx.fillCircle(ox + 11, 10, 4.5);
      // Iris (orange)
      gfx.fillStyle(0xFF6600);
      gfx.fillCircle(ox + 6, 10, 3); gfx.fillCircle(ox + 11, 10, 3);
      // Slit pupil (dark vertical bar)
      gfx.fillStyle(0x1A0000);
      gfx.fillRect(ox + 5, 8, 2, 4); gfx.fillRect(ox + 10, 8, 2, 4);
      // Shine
      gfx.fillStyle(0xFFDD00, 0.9);
      gfx.fillCircle(ox + 7, 9, 1); gfx.fillCircle(ox + 12, 9, 1);

      // ── Legs — 4 wide stubby clawed feet ─────────────────────────────────
      // Front pair: alternate between phases
      const yA = 23 + legPhase;    // leg set A y position
      const yB = 23 - legPhase;    // leg set B y position
      gfx.fillStyle(0x1E0806);
      // Front-left
      gfx.fillEllipse(ox +  9, yA, 8, 5);
      gfx.fillRect(ox +  5, yA+1, 3, 2); gfx.fillRect(ox +  8, yA+1, 3, 2);  // claws
      // Front-right
      gfx.fillEllipse(ox + 16, yB, 8, 5);
      gfx.fillRect(ox + 12, yB+1, 3, 2); gfx.fillRect(ox + 15, yB+1, 3, 2);
      // Back-left
      gfx.fillEllipse(ox + 26, yB, 8, 5);
      gfx.fillRect(ox + 22, yB+1, 3, 2); gfx.fillRect(ox + 25, yB+1, 3, 2);
      // Back-right
      gfx.fillEllipse(ox + 33, yA, 8, 5);
      gfx.fillRect(ox + 29, yA+1, 3, 2); gfx.fillRect(ox + 32, yA+1, 3, 2);
    };

    drawFrame(0,  0);  // frame 1: neutral
    drawFrame(FW, 2);  // frame 2: legs shifted (walking cycle)

    gfx.generateTexture(TEX.SLUG, FW * 2, FH);
    gfx.destroy();

    // Register sliced frame data on the generated texture
    const tex = this.textures.get(TEX.SLUG);
    tex.add(0, 0,    0, 0, FW, FH);  // frame 0
    tex.add(1, 0, FW, 0, FW, FH);  // frame 1
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  SKY — vivid volcanic atmosphere
  // ─────────────────────────────────────────────────────────────────────────────
  private createSkyTexture() {
    const W = 854, H = 480;
    const gfx = this.g();

    const stops: Array<[number, number]> = [
      [0,   0x1E0030], [50,  0x540038], [110, 0x8C0040],
      [180, 0xC01828], [250, 0xE03810], [320, 0xF05C00],
      [390, 0xF88000], [440, 0xFCA400], [480, 0xFFBE00],
    ];
    for (let i = 0; i < stops.length - 1; i++) {
      const [y1, c1] = stops[i]; const [y2, c2] = stops[i + 1];
      const segH = y2 - y1; const steps = Math.ceil(segH / 2);
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        gfx.fillStyle(this.lerpColor(c1, c2, t));
        gfx.fillRect(0, Math.floor(y1 + segH * t), W, Math.ceil(segH / steps) + 1);
      }
    }

    // Primary sun
    const [s1x, s1y] = [155, 95];
    gfx.fillStyle(0xFF8800, 0.12); gfx.fillCircle(s1x, s1y, 90);
    gfx.fillStyle(0xFFCC00, 0.22); gfx.fillCircle(s1x, s1y, 66);
    gfx.fillStyle(0xFFEE88, 0.45); gfx.fillCircle(s1x, s1y, 46);
    gfx.fillStyle(0xFFFACC, 0.80); gfx.fillCircle(s1x, s1y, 28);
    gfx.fillStyle(0xFFFFFF, 1.00); gfx.fillCircle(s1x, s1y, 15);

    // Corona rays
    gfx.lineStyle(2, 0xFFEE88, 0.18);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      gfx.beginPath();
      gfx.moveTo(s1x + Math.cos(a)*50, s1y + Math.sin(a)*50);
      gfx.lineTo(s1x + Math.cos(a)*84, s1y + Math.sin(a)*84);
      gfx.strokePath();
    }

    // Secondary sun
    const [s2x, s2y] = [700, 65];
    gfx.fillStyle(0xFF3300, 0.15); gfx.fillCircle(s2x, s2y, 52);
    gfx.fillStyle(0xFF7700, 0.30); gfx.fillCircle(s2x, s2y, 36);
    gfx.fillStyle(0xFFAA55, 0.65); gfx.fillCircle(s2x, s2y, 22);
    gfx.fillStyle(0xFFDDAA, 0.92); gfx.fillCircle(s2x, s2y, 12);
    gfx.fillStyle(0xFFFFEE, 1.00); gfx.fillCircle(s2x, s2y,  6);

    // Stars
    const rng = Phaser.Math.RND; rng.sow(['scoria-v2']);
    for (let i = 0; i < 55; i++) {
      gfx.fillStyle(0xFFEEFF, rng.realInRange(0.15, 0.55));
      gfx.fillCircle(rng.integerInRange(0, W), rng.integerInRange(0, 170), rng.realInRange(0.4, 1.8));
    }

    gfx.generateTexture(TEX.BG_SKY, W, H);
    gfx.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  CLOUDS
  // ─────────────────────────────────────────────────────────────────────────────
  private createCloudsTexture() {
    const W = 900, H = 100;
    const gfx = this.g();

    const drawCloud = (cx: number, cy: number, sc: number, warm: boolean) => {
      const [shadow, body, hi, shine] = warm
        ? [0xAA3010, 0xFF6020, 0xFF9840, 0xFFDD80]
        : [0x882040, 0xCC3A70, 0xFF6090, 0xFFAACC];
      gfx.fillStyle(shadow, 0.55);
      gfx.fillEllipse(cx, cy+9*sc, 56*sc, 26*sc); gfx.fillEllipse(cx+22*sc, cy+11*sc, 42*sc, 22*sc); gfx.fillEllipse(cx-20*sc, cy+11*sc, 38*sc, 20*sc);
      gfx.fillStyle(body);
      gfx.fillEllipse(cx, cy, 52*sc, 30*sc); gfx.fillEllipse(cx+20*sc, cy+6*sc, 40*sc, 26*sc); gfx.fillEllipse(cx-18*sc, cy+6*sc, 36*sc, 22*sc);
      gfx.fillStyle(hi);
      gfx.fillEllipse(cx-5*sc, cy-6*sc, 26*sc, 14*sc); gfx.fillEllipse(cx+16*sc, cy-3*sc, 20*sc, 11*sc);
      gfx.fillStyle(shine, 0.75);
      gfx.fillEllipse(cx-7*sc, cy-9*sc, 12*sc, 7*sc);
    };
    drawCloud(100, 58, 1.00, true); drawCloud(350, 42, 1.25, false);
    drawCloud(620, 60, 0.90, true); drawCloud(850, 48, 1.10, false);
    gfx.generateTexture(TEX.BG_CLOUDS, W, H);
    gfx.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  FAR BG — smooth rounded mountain silhouettes
  // ─────────────────────────────────────────────────────────────────────────────
  private createFarBgTexture() {
    const W = 650, H = 240;
    const gfx = this.g();

    const drawMt = (cx: number, w: number, h: number, color: number, hi: number) => {
      const base = H;
      const pts: Phaser.Types.Math.Vector2Like[] = [
        { x: cx-w/2, y: base }, { x: cx-w*0.47, y: base-h*0.08 }, { x: cx-w*0.43, y: base-h*0.18 },
        { x: cx-w*0.38, y: base-h*0.32 }, { x: cx-w*0.32, y: base-h*0.47 }, { x: cx-w*0.24, y: base-h*0.62 },
        { x: cx-w*0.15, y: base-h*0.77 }, { x: cx-w*0.07, y: base-h*0.91 }, { x: cx, y: base-h },
        { x: cx+w*0.07, y: base-h*0.91 }, { x: cx+w*0.15, y: base-h*0.77 }, { x: cx+w*0.24, y: base-h*0.62 },
        { x: cx+w*0.32, y: base-h*0.47 }, { x: cx+w*0.38, y: base-h*0.32 }, { x: cx+w*0.43, y: base-h*0.18 },
        { x: cx+w*0.47, y: base-h*0.08 }, { x: cx+w/2, y: base },
      ];
      gfx.fillStyle(color); gfx.fillPoints(pts, true);
      gfx.fillStyle(hi, 0.22); gfx.fillPoints(pts.slice(0, 9).concat([{ x: cx-w*0.08, y: base-h*0.45 }]), true);
      gfx.fillStyle(0xFF4400, 0.6); gfx.fillCircle(cx, base-h+5, 9);
      gfx.fillStyle(0xFF9900, 0.8); gfx.fillCircle(cx, base-h+5, 5);
      gfx.fillStyle(0xFFDD00, 1.0); gfx.fillCircle(cx, base-h+5, 2);
    };

    drawMt( 80, 210, 185, 0x38084A, 0xFF88FF); drawMt(250, 240, 210, 0x44094E, 0xFF88FF);
    drawMt(420, 220, 192, 0x3C0848, 0xFF88FF); drawMt(600, 210, 178, 0x42094C, 0xFF88FF);
    drawMt(110, 190, 162, 0x8C1050, 0xFFBBDD); drawMt(300, 220, 185, 0x9E1858, 0xFFBBDD);
    drawMt(480, 200, 170, 0x921450, 0xFFBBDD); drawMt(640, 185, 158, 0x880E4C, 0xFFBBDD);
    drawMt( 55, 175, 145, 0xC82040, 0xFFCCCC); drawMt(210, 205, 172, 0xD82848, 0xFFCCCC);
    drawMt(395, 190, 158, 0xCC2040, 0xFFCCCC); drawMt(570, 178, 148, 0xC41E3C, 0xFFCCCC);

    gfx.fillStyle(0xFF2200, 0.28); gfx.fillRect(0, H-24, W, 24);
    gfx.fillStyle(0xFF7700, 0.22); gfx.fillRect(0, H-12, W, 12);
    gfx.generateTexture(TEX.BG_FAR, W, H);
    gfx.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  MID BG — volcanic spires
  // ─────────────────────────────────────────────────────────────────────────────
  private createMidBgTexture() {
    const W = 820, H = 200;
    const gfx = this.g();

    const drawSpire = (cx: number, w: number, h: number, color: number, hi: number) => {
      const base = H;
      const pts: Phaser.Types.Math.Vector2Like[] = [
        { x: cx-w/2, y: base }, { x: cx-w*0.45, y: base-h*0.20 }, { x: cx-w*0.38, y: base-h*0.40 },
        { x: cx-w*0.28, y: base-h*0.58 }, { x: cx-w*0.17, y: base-h*0.74 }, { x: cx-w*0.08, y: base-h*0.88 },
        { x: cx, y: base-h },
        { x: cx+w*0.08, y: base-h*0.88 }, { x: cx+w*0.17, y: base-h*0.74 }, { x: cx+w*0.28, y: base-h*0.58 },
        { x: cx+w*0.38, y: base-h*0.40 }, { x: cx+w*0.45, y: base-h*0.20 }, { x: cx+w/2, y: base },
      ];
      gfx.fillStyle(color); gfx.fillPoints(pts, true);
      gfx.fillStyle(hi, 0.28); gfx.fillPoints(pts.slice(0, 7).concat([{ x: cx-w*0.12, y: base-h*0.35 }]), true);
      gfx.fillStyle(0x000000, 0.18); gfx.fillPoints([{ x: cx, y: base-h }, ...pts.slice(7)], true);
      gfx.fillStyle(0xFF3300, 0.75); gfx.fillCircle(cx, base-h+5, 8);
      gfx.fillStyle(0xFF8800, 0.90); gfx.fillCircle(cx, base-h+5, 5);
      gfx.fillStyle(0xFFCC00, 1.00); gfx.fillCircle(cx, base-h+5, 2.5);
      gfx.lineStyle(2, 0xFF6600, 0.45);
      gfx.beginPath(); gfx.moveTo(cx+2, base-h+10); gfx.lineTo(cx+6, base-h*0.65); gfx.lineTo(cx+4, base-h*0.38); gfx.strokePath();
    };

    drawSpire( 50,  82,155, 0xAA2C14, 0xFF9966); drawSpire(175, 100,180, 0xB83018, 0xFF9966);
    drawSpire(310,  90,165, 0xAA2C14, 0xFF9966); drawSpire(450, 105,188, 0xB43018, 0xFF9966);
    drawSpire(595,  88,158, 0xAA2C14, 0xFF9966); drawSpire(735,  98,170, 0xB23018, 0xFF9966);
    drawSpire(112,  72,128, 0xE84424, 0xFFCC88); drawSpire(248,  85,148, 0xF04C28, 0xFFCC88);
    drawSpire(385,  78,135, 0xE84020, 0xFFCC88); drawSpire(520,  90,152, 0xEC4824, 0xFFCC88);
    drawSpire(660,  80,140, 0xE84020, 0xFFCC88); drawSpire(800,  68,118, 0xE03C1C, 0xFFCC88);

    gfx.fillStyle(0xFF3300, 0.32); gfx.fillRect(0, H-14, W, 14);
    gfx.fillStyle(0xFF7700, 0.28); gfx.fillRect(0, H- 6, W,  6);
    gfx.generateTexture(TEX.BG_MID, W, H);
    gfx.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  NEAR BG — ember grass strip
  // ─────────────────────────────────────────────────────────────────────────────
  private createNearBgTexture() {
    const W = 700, H = 72;
    const gfx = this.g();

    gfx.fillStyle(0xCC3A10); gfx.fillRect(0, 24, W, H);
    for (let x = 0; x < W; x += 4) {
      const bump = Math.sin(x*0.06)*4 + Math.sin(x*0.17)*2;
      gfx.fillStyle(0xE85020); gfx.fillRect(x, 16+Math.floor(bump), 4, 14);
    }
    gfx.fillStyle(0xFF7030); gfx.fillRect(0, 14, W, 5);
    gfx.fillStyle(0xFF9840); gfx.fillRect(0, 12, W, 3);
    gfx.fillStyle(0xFFDD80); gfx.fillRect(0, 11, W, 2);

    for (let x = 2; x < W-10; x += 16) {
      const h = 10 + ((x*11)%5)*2;
      gfx.fillStyle(0x9A1C08, 0.6); gfx.fillTriangle(x+3, 13, x+7, 13-h+2, x+13, 13);
      gfx.fillStyle(0xFF5510);      gfx.fillTriangle(x, 13, x+5, 13-h, x+11, 13);
      gfx.fillStyle(0xFFBB30);      gfx.fillTriangle(x+1, 13-h+5, x+5, 13-h-2, x+9, 13-h+5);
      if ((x*11)%5 > 1) { gfx.fillStyle(0xFFFF80, 0.9); gfx.fillCircle(x+5, 13-h-2, 1.8); }
    }
    for (let x = 40; x < W-20; x += 88) {
      gfx.fillStyle(0x2A0A04); gfx.fillEllipse(x+(x%19), 20, 14+(x%8), 9);
    }
    for (let x = 32; x < W-10; x += 66) {
      gfx.fillStyle(0x88EEFF); gfx.fillTriangle(x, 4, x-5, 14, x+5, 14); gfx.fillTriangle(x+7, 6, x+3, 14, x+12, 14);
      gfx.fillStyle(0xFFFFFF, 0.9); gfx.fillTriangle(x-1, 6, x+1, 4, x+2, 7);
      gfx.fillStyle(0x66DDFF, 0.45); gfx.fillCircle(x+4, 15, 6);
    }
    gfx.generateTexture(TEX.BG_NEAR, W, H);
    gfx.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  PLATFORMS — volcanic rock LEDGE (top surface only, 24px tall)
  //  Boulder base is drawn live in GameScene.buildPlatforms()
  // ─────────────────────────────────────────────────────────────────────────────
  private createPlatformTextures() {
    const drawLedge = (w: number, key: string, isHigh = false) => {
      const H = 24;
      const gfx = this.g();

      if (isHigh) {
        // Crystal iridium ledge
        gfx.fillStyle(0x2820B0); gfx.fillRect(0, 0, w, H);
        gfx.fillStyle(0x1818A0); gfx.fillRect(2, 6, w-4, H-8);
        gfx.fillStyle(0x5080E8); gfx.fillRect(0, 0, w, 6);
        gfx.fillStyle(0x88BBFF); gfx.fillRect(0, 0, w, 2);
        for (let x = 10; x < w-8; x += 18) {
          gfx.fillStyle(0xBBDDFF, 0.8); gfx.fillTriangle(x, 0, x+9, 0, x+4, 8);
          gfx.fillStyle(0xFFFFFF, 0.6); gfx.fillTriangle(x+1, 0, x+4, 0, x+2, 3);
        }
        gfx.fillStyle(0x4466DD, 0.7); gfx.fillRect(0, H-4, w, 4);
        gfx.fillStyle(0x99BBFF, 0.5); gfx.fillRect(0, H-2, w, 2);
        gfx.generateTexture(key, w, H); gfx.destroy(); return;
      }

      // ── Volcanic rock ledge top surface ──────────────────────────────────
      // Main rock body
      gfx.fillStyle(0x6A2A0E); gfx.fillRect(0, 0, w, H);

      // Rock strata bands
      gfx.fillStyle(0x7C3418, 0.6); gfx.fillRect(0,  4, w, 3);
      gfx.fillStyle(0x5A1E0A, 0.5); gfx.fillRect(0, 14, w, 3);

      // Standing surface — bright, well-lit rock top
      // This is the most important part — where the player lands
      gfx.fillStyle(0xC85C28); gfx.fillRect(0, 0, w, 8);

      // Rough pebble bumps on top surface
      for (let x = 8; x < w-4; x += 10) {
        const h = 2 + (x % 3);
        gfx.fillStyle(0xB04C20); gfx.fillRect(x, 8-h, 7, h);
        gfx.fillStyle(0xE07840); gfx.fillRect(x, 8-h, 7, 1);
      }

      // TOP EDGE — bright amber gleam (the "step on me" line)
      gfx.fillStyle(0xFF9840); gfx.fillRect(0, 0, w, 3);
      gfx.fillStyle(0xFFEE88); gfx.fillRect(0, 0, w, 1);

      // Iridium crystal deposits — vivid cyan
      for (let x = 16; x < w-12; x += 36) {
        gfx.fillStyle(0x88EEFF);
        gfx.fillRect(x,   1, 3, 5); gfx.fillRect(x+4, 2, 2, 3);
        gfx.fillStyle(0xFFFFFF, 0.9); gfx.fillRect(x, 1, 3, 1);
      }

      // Lava seam at bottom (drips into the boulder mass below)
      gfx.fillStyle(0xFF2200, 0.75); gfx.fillRect(0, H-4, w, 4);
      gfx.fillStyle(0xFF7700, 0.65); gfx.fillRect(0, H-2, w, 2);
      gfx.fillStyle(0xFFCC00, 0.45); gfx.fillRect(0, H-1, w, 1);

      gfx.generateTexture(key, w, H);
      gfx.destroy();
    };

    drawLedge(96,  TEX.PLAT_S);
    drawLedge(192, TEX.PLAT_M);
    drawLedge(288, TEX.PLAT_L);
    drawLedge(192, TEX.PLAT_HIGH, true);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  COINS / PORTAL / COLLECTOR / GEYSER  (unchanged design)
  // ─────────────────────────────────────────────────────────────────────────────
  private createCoinTextures() {
    const drawCoin = (key: string, glowColor: number, outerColor: number) => {
      const gfx = this.g();
      gfx.fillStyle(glowColor, 0.30); gfx.fillCircle(10, 10, 10);
      gfx.fillStyle(outerColor);      gfx.fillCircle(10, 10, 8);
      gfx.fillStyle(0xf6f6fc);        gfx.fillCircle(10, 10, 6);
      gfx.fillStyle(0xffffff);        gfx.fillCircle( 8,  8, 3);
      gfx.fillStyle(0xaabbd0, 0.9);   gfx.fillRect(9, 5, 2, 9);
      gfx.generateTexture(key, 20, 20); gfx.destroy();
    };
    drawCoin(TEX.COIN,      0x88AAFF, 0xCCCCE8);
    drawCoin(TEX.COIN_HIGH, 0xBB44FF, 0xCC88FF);
  }

  private createPortalTexture() {
    const gfx = this.g();
    gfx.fillStyle(0x3d1a0a); gfx.fillRect(0, 10, 8, 70); gfx.fillRect(40, 10, 8, 70);
    gfx.fillStyle(0x4c1d95, 0.75); gfx.fillRect(8, 5, 32, 75);
    gfx.fillStyle(0x7c3aed, 0.85); gfx.fillEllipse(24, 42, 30, 60);
    gfx.fillStyle(0xa78bfa, 0.75); gfx.fillEllipse(24, 42, 22, 46);
    gfx.fillStyle(0xc4b5fd, 0.85); gfx.fillEllipse(24, 42, 14, 30);
    gfx.fillStyle(0xffffff, 0.92); gfx.fillEllipse(24, 42, 6, 14);
    gfx.fillStyle(0x3d1a0a);  gfx.fillRect(0, 0, 48, 12);
    gfx.fillStyle(0x8b2e0e);  gfx.fillRect(4, 2, 40, 6);
    gfx.fillStyle(0x5a1e08);  gfx.fillRect(0, 0, 12, 12); gfx.fillRect(36, 0, 12, 12);
    gfx.generateTexture(TEX.PORTAL, 48, 80); gfx.destroy();
  }

  private createCollectorTexture() {
    const gfx = this.g();
    gfx.fillStyle(0x100505); gfx.fillRect(4, 16, 40, 48);
    gfx.fillStyle(0x1e0a0a); gfx.fillRect(8, 20, 32, 42);
    gfx.fillStyle(0x4a0808); gfx.fillRect(2, 16, 12, 14); gfx.fillRect(34, 16, 12, 14);
    gfx.lineStyle(1, 0x990000); gfx.strokeRect(2, 16, 12, 14); gfx.strokeRect(34, 16, 12, 14);
    gfx.fillStyle(0x1a0808); gfx.fillRect(10, 4, 28, 18);
    gfx.fillStyle(0x3d0a0a); gfx.fillRect(12, 2, 24, 8);
    gfx.fillStyle(0xff0000); gfx.fillCircle(18, 12, 4); gfx.fillCircle(30, 12, 4);
    gfx.fillStyle(0xff6666); gfx.fillCircle(18, 11, 2); gfx.fillCircle(30, 11, 2);
    gfx.fillStyle(0x8b6914); gfx.fillCircle(34, 50, 10);
    gfx.fillStyle(0xffd700, 0.6); gfx.fillCircle(34, 48, 7);
    gfx.fillStyle(0x5a3800); gfx.fillRect(30, 40, 8, 6);
    gfx.fillStyle(0x100505);
    for (let x = 4; x < 44; x += 8) gfx.fillTriangle(x, 64, x+4, 58, x+8, 64);
    gfx.generateTexture(TEX.COLLECTOR, 48, 64); gfx.destroy();
  }

  private createGeyserTexture() {
    const gfx = this.g();
    gfx.fillStyle(0x2A0800); gfx.fillEllipse(16, 36, 30, 12);
    gfx.fillStyle(0xFF2200, 0.80); gfx.fillEllipse(16, 36, 20, 7);
    gfx.fillStyle(0xFF8800, 0.95); gfx.fillEllipse(16, 36, 11, 4);
    gfx.fillStyle(0xFFDD00, 1.00); gfx.fillEllipse(16, 36,  5, 2);
    gfx.lineStyle(1, 0xFF5500, 0.65);
    gfx.beginPath();
    gfx.moveTo(4, 32); gfx.lineTo(10, 36); gfx.moveTo(28, 31); gfx.lineTo(22, 36);
    gfx.moveTo(14, 28); gfx.lineTo(13, 34); gfx.strokePath();
    gfx.generateTexture('geyser-base', 32, 40); gfx.destroy();
  }
}

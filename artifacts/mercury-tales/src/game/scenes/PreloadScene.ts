import Phaser from 'phaser';
import { TEX } from '../constants';

export class PreloadScene extends Phaser.Scene {
  constructor() { super({ key: 'PreloadScene' }); }

  preload() {
    // Alex character — 5×5 grid, each frame 256×256
    this.load.spritesheet('alex-run',  'assets/alex-run.png',  { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('alex-jump', 'assets/alex-jump.png', { frameWidth: 256, frameHeight: 256 });
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

    // ── Alex animations ────────────────────────────────────────────────────────
    // alex-run.png  = 5×5 grid, 25 frames, all running
    // alex-jump.png = 5×5 grid: rows 0-1 run/launch, row 2 air, row 3 land, row 4 idle
    this.anims.create({ key: 'alex-run',  frames: this.anims.generateFrameNumbers('alex-run',  { start: 0, end: 24 }), frameRate: 18, repeat: -1 });
    this.anims.create({ key: 'alex-idle', frames: this.anims.generateFrameNumbers('alex-jump', { start: 20, end: 24 }), frameRate: 8,  repeat: -1 });
    this.anims.create({ key: 'alex-air',  frames: this.anims.generateFrameNumbers('alex-jump', { start: 10, end: 14 }), frameRate: 8,  repeat: -1 });

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
  //  SKY — naturalistic volcanic atmosphere (inspired by the depth-of-field
  //  "low-poly 3D" look from the reference screenshot, remapped to fire planet)
  // ─────────────────────────────────────────────────────────────────────────────
  private createSkyTexture() {
    const W = 854, H = 480;
    const gfx = this.g();

    // Gradient: almost-black volcanic night sky → deep burgundy → rich
    // crimson-red → warm amber at the lava-lit horizon
    const stops: Array<[number, number]> = [
      [0,   0x0C0100],
      [60,  0x200402],
      [140, 0x4E0C06],
      [230, 0x8A1608],
      [310, 0xBD2A0C],
      [380, 0xD84810],
      [440, 0xEC6A18],
      [480, 0xF88820],
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

    // Volcanic sun — large, muted amber-white (no neon corona)
    const [sx, sy] = [680, 88];
    gfx.fillStyle(0xFF7010, 0.08); gfx.fillCircle(sx, sy, 110);
    gfx.fillStyle(0xFF8820, 0.14); gfx.fillCircle(sx, sy, 80);
    gfx.fillStyle(0xFFAA40, 0.28); gfx.fillCircle(sx, sy, 56);
    gfx.fillStyle(0xFFCC80, 0.60); gfx.fillCircle(sx, sy, 36);
    gfx.fillStyle(0xFFEECC, 0.88); gfx.fillCircle(sx, sy, 20);
    gfx.fillStyle(0xFFFDF8, 1.00); gfx.fillCircle(sx, sy, 10);

    // Atmospheric haze band near horizon (the warm glow that backlights everything)
    gfx.fillStyle(0xE86010, 0.12); gfx.fillRect(0, 370, W, 110);
    gfx.fillStyle(0xFF7820, 0.10); gfx.fillRect(0, 420, W, 60);
    gfx.fillStyle(0xFF9030, 0.08); gfx.fillRect(0, 455, W, 25);

    // A handful of faint volcanic "stars" (embers high in atmosphere)
    const rng = Phaser.Math.RND; rng.sow(['scoria-sky-v3']);
    for (let i = 0; i < 30; i++) {
      gfx.fillStyle(0xFFCCAA, rng.realInRange(0.08, 0.30));
      gfx.fillCircle(rng.integerInRange(0, W), rng.integerInRange(0, 140), rng.realInRange(0.5, 1.6));
    }

    gfx.generateTexture(TEX.BG_SKY, W, H);
    gfx.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  CLOUDS — heavy ash/smoke formations (muted, naturalistic)
  // ─────────────────────────────────────────────────────────────────────────────
  private createCloudsTexture() {
    const W = 900, H = 110;
    const gfx = this.g();

    // Each cloud is layered ellipses with soft edges → simulates the blurry
    // depth-of-field look from the reference screenshot
    const drawAshCloud = (cx: number, cy: number, sc: number) => {
      // Outermost soft halo (deepest blur)
      gfx.fillStyle(0x3A1006, 0.18); gfx.fillEllipse(cx, cy+8*sc, 72*sc, 32*sc);
      // Shadow underside
      gfx.fillStyle(0x280A04, 0.55); gfx.fillEllipse(cx, cy+10*sc, 60*sc, 26*sc);
      gfx.fillStyle(0x280A04, 0.55); gfx.fillEllipse(cx+24*sc, cy+12*sc, 44*sc, 22*sc);
      gfx.fillStyle(0x280A04, 0.55); gfx.fillEllipse(cx-22*sc, cy+12*sc, 40*sc, 20*sc);
      // Main body — warm charcoal with red-orange hue
      gfx.fillStyle(0x4A1A0C); gfx.fillEllipse(cx, cy, 58*sc, 32*sc);
      gfx.fillStyle(0x4A1A0C); gfx.fillEllipse(cx+22*sc, cy+6*sc, 44*sc, 28*sc);
      gfx.fillStyle(0x4A1A0C); gfx.fillEllipse(cx-20*sc, cy+7*sc, 40*sc, 24*sc);
      // Lit upper face (backlit by lava glow below the horizon)
      gfx.fillStyle(0x8A3010, 0.60); gfx.fillEllipse(cx-4*sc, cy-5*sc, 28*sc, 14*sc);
      gfx.fillStyle(0x8A3010, 0.60); gfx.fillEllipse(cx+18*sc, cy-3*sc, 22*sc, 12*sc);
      // Bright top highlight (lava-glow bounce light)
      gfx.fillStyle(0xC04818, 0.35); gfx.fillEllipse(cx-6*sc, cy-8*sc, 14*sc, 7*sc);
    };

    drawAshCloud(110, 68, 1.00);
    drawAshCloud(380, 50, 1.20);
    drawAshCloud(640, 70, 0.95);
    drawAshCloud(870, 55, 1.08);

    gfx.generateTexture(TEX.BG_CLOUDS, W, H);
    gfx.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  FAR BG — "blurry" volcanic rock column silhouettes
  //  Mimics the depth-of-field tree trunks from the reference, recast as
  //  dark volcanic rock pillars fading into atmospheric haze.
  // ─────────────────────────────────────────────────────────────────────────────
  private createFarBgTexture() {
    const W = 720, H = 260;
    const gfx = this.g();

    // Simulate depth blur: draw each column as concentric low-alpha ellipses
    // stacked outward from the core — the more rings, the "blurrier" it looks.
    const drawColumn = (cx: number, topY: number, coreW: number, totalH: number, blurLevels: number) => {
      for (let b = blurLevels; b >= 0; b--) {
        const expansion = b * 6;
        const alpha     = b === 0 ? 0.92 : 0.08 / b;
        const color     = b === 0 ? 0x1C0602 : 0x3A1008;
        gfx.fillStyle(color, alpha);
        gfx.fillRect(cx - coreW / 2 - expansion, topY + expansion * 0.5, coreW + expansion * 2, totalH - expansion);
        // Rounded top cap
        gfx.fillEllipse(cx, topY + expansion, coreW + expansion * 2, (coreW + expansion * 2) * 0.55);
      }
    };

    // Back row — tallest, most blurred (furthest distance)
    drawColumn( 60, 18, 28, 242, 5); drawColumn(185, 10, 32, 250, 5);
    drawColumn(320, 22, 26, 238, 5); drawColumn(455,  8, 34, 252, 5);
    drawColumn(590, 16, 28, 244, 5); drawColumn(710, 14, 30, 246, 5);

    // Mid row — slightly shorter, less blur
    drawColumn(120, 40, 22, 220, 3); drawColumn(255, 34, 24, 226, 3);
    drawColumn(400, 46, 20, 214, 3); drawColumn(530, 38, 22, 218, 3);
    drawColumn(665, 42, 22, 218, 3);

    // Rock rubble at the base of each column
    for (let rx = 20; rx < W - 10; rx += 44) {
      gfx.fillStyle(0x281006, 0.55);
      gfx.fillEllipse(rx, H - 8, 32 + ((rx * 7) % 18), 14);
    }

    // Atmospheric haze overlay — warm fog that desaturates distance
    gfx.fillStyle(0x9C3010, 0.10); gfx.fillRect(0, 0, W, H);
    gfx.fillStyle(0xC05018, 0.08); gfx.fillRect(0, H - 60, W, 60);

    // Ground strip — dark basalt
    gfx.fillStyle(0x1A0804); gfx.fillRect(0, H - 20, W, 20);
    gfx.fillStyle(0xFF4400, 0.18); gfx.fillRect(0, H - 20, W, 4);

    gfx.generateTexture(TEX.BG_FAR, W, H);
    gfx.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  MID BG — clearer volcanic rock spires with lava accent bases
  //  Same "tree trunk mid-layer" as reference — but obsidian columns.
  // ─────────────────────────────────────────────────────────────────────────────
  private createMidBgTexture() {
    const W = 860, H = 210;
    const gfx = this.g();

    // Slightly blurred rear spires (less blur than far layer)
    const drawSpire = (cx: number, topY: number, w: number, totalH: number, color: number, hiColor: number, blur: number) => {
      for (let b = blur; b >= 0; b--) {
        const exp = b * 4;
        gfx.fillStyle(b === 0 ? color : 0x3C1208, b === 0 ? 1 : 0.06 / b);
        gfx.fillRect(cx - w / 2 - exp, topY + exp, w + exp * 2, totalH - topY - exp);
        gfx.fillEllipse(cx, topY + exp, w + exp * 2, (w + exp * 2) * 0.5);
      }
      // Lit edge highlight
      gfx.fillStyle(hiColor, 0.30);
      gfx.fillRect(cx - w / 2, topY + 4, Math.max(4, w * 0.3), totalH - topY - 4);
      // Lava glow at base
      gfx.fillStyle(0xFF4400, 0.50); gfx.fillEllipse(cx, totalH - 6, w * 1.8, 14);
      gfx.fillStyle(0xFF8800, 0.70); gfx.fillEllipse(cx, totalH - 4, w * 1.1, 8);
      // Volcanic cap at tip
      gfx.fillStyle(0xFF3300, 0.70); gfx.fillCircle(cx, topY + 3, w * 0.45);
      gfx.fillStyle(0xFF9900, 0.85); gfx.fillCircle(cx, topY + 3, w * 0.25);
      gfx.fillStyle(0xFFDD00, 1.00); gfx.fillCircle(cx, topY + 3, w * 0.12);
    };

    // Rear row — taller, more blurred
    drawSpire( 55, 22, 28, H, 0x381008, 0x703020, 2);
    drawSpire(190, 15, 32, H, 0x3C1008, 0x703020, 2);
    drawSpire(335, 28, 26, H, 0x381008, 0x703020, 2);
    drawSpire(480, 12, 30, H, 0x3C1008, 0x703020, 2);
    drawSpire(625, 20, 28, H, 0x381008, 0x703020, 2);
    drawSpire(780, 18, 30, H, 0x3C1008, 0x703020, 2);

    // Front row — shorter, sharper, warmer
    drawSpire(120, 44, 24, H, 0x5A1C0A, 0x9A3A18, 1);
    drawSpire(265, 36, 26, H, 0x601E0C, 0x9A3A18, 1);
    drawSpire(410, 50, 22, H, 0x5A1C0A, 0x9A3A18, 1);
    drawSpire(555, 40, 24, H, 0x5C1C0A, 0x9A3A18, 1);
    drawSpire(700, 46, 22, H, 0x5A1C0A, 0x9A3A18, 1);
    drawSpire(840, 34, 26, H, 0x601E0C, 0x9A3A18, 1);

    // Small obsidian crystal formations at base level
    for (let cx = 30; cx < W; cx += 56) {
      const ch = 16 + ((cx * 11) % 18);
      gfx.fillStyle(0x0E0402);
      gfx.fillTriangle(cx - 5, H, cx, H - ch, cx + 5, H);
      gfx.fillStyle(0xFF5500, 0.55);
      gfx.fillCircle(cx, H - ch, 2.5);
    }

    // Ground strip
    gfx.fillStyle(0x200806); gfx.fillRect(0, H - 16, W, 16);
    gfx.fillStyle(0xFF3300, 0.22); gfx.fillRect(0, H - 16, W, 4);
    gfx.fillStyle(0xFF8800, 0.30); gfx.fillRect(0, H - 6, W, 6);

    gfx.generateTexture(TEX.BG_MID, W, H);
    gfx.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  NEAR BG — foreground volcanic "vegetation" strip
  //  Reference shows a strip of varied-height flora at the ground edge.
  //  Here: obsidian crystal spires, ember clusters, lava rock mounds.
  // ─────────────────────────────────────────────────────────────────────────────
  private createNearBgTexture() {
    const W = 740, H = 90;
    const gfx = this.g();

    // Base ground strip — dark basalt
    gfx.fillStyle(0x160604); gfx.fillRect(0, 40, W, 50);

    // Lava-glowing top edge of the near ground (like the grass-dirt boundary)
    gfx.fillStyle(0xC03408); gfx.fillRect(0, 38, W, 6);
    gfx.fillStyle(0xFF5510); gfx.fillRect(0, 36, W, 4);
    gfx.fillStyle(0xFF8030); gfx.fillRect(0, 34, W, 3);
    gfx.fillStyle(0xFFCC60); gfx.fillRect(0, 33, W, 2);
    gfx.fillStyle(0xFFFFAA); gfx.fillRect(0, 32, W, 1);

    // Varied-height obsidian crystal spires (the "grass blades" of Planet Scoria)
    for (let x = 4; x < W - 8; x += 12) {
      const h  = 12 + ((x * 13) % 22);  // varies 12–33px
      const w2 = 2 + ((x * 7) % 3);     // 2–4px wide
      // Dark obsidian body
      gfx.fillStyle(0x100402);
      gfx.fillTriangle(x - w2, 33, x, 33 - h, x + w2, 33);
      // Side highlight (catches lava light)
      gfx.fillStyle(0x4A1408, 0.80);
      gfx.fillTriangle(x - w2, 33, x - 1, 33 - h * 0.6, x, 33 - h);
      // Glowing ember tip
      if ((x * 13) % 5 !== 0) {
        gfx.fillStyle(0xFF4400, 0.80); gfx.fillCircle(x, 33 - h, 2.2);
        gfx.fillStyle(0xFF9900, 0.90); gfx.fillCircle(x, 33 - h, 1.1);
      } else {
        // Occasional brighter crystal tip
        gfx.fillStyle(0xFFCC44, 0.95); gfx.fillCircle(x, 33 - h, 2.8);
        gfx.fillStyle(0xFFFFAA, 1.00); gfx.fillCircle(x, 33 - h, 1.4);
      }
    }

    // Larger boulder / mound shapes (like the bigger bushes in the reference)
    for (let x = 50; x < W - 20; x += 95) {
      const mh = 18 + ((x * 11) % 12);
      // Dark volcanic boulder
      gfx.fillStyle(0x1C0804);
      gfx.fillEllipse(x, 33 - mh * 0.3, 28, mh * 0.8);
      gfx.fillEllipse(x + 12, 33 - mh * 0.2, 22, mh * 0.6);
      // Lava crack through the boulder
      gfx.lineStyle(1, 0xFF4400, 0.50);
      gfx.beginPath(); gfx.moveTo(x - 4, 33 - mh * 0.1); gfx.lineTo(x, 33 - mh * 0.5); gfx.strokePath();
      // Glow at cracks
      gfx.fillStyle(0xFF6600, 0.35); gfx.fillCircle(x, 33 - mh * 0.4, 4);
    }

    // Small lava pool patches along the ground (like dirt patches in reference)
    for (let x = 20; x < W - 20; x += 130) {
      gfx.fillStyle(0xFF2200, 0.60); gfx.fillEllipse(x + 15, 42, 30 + ((x * 3) % 16), 9);
      gfx.fillStyle(0xFF7700, 0.80); gfx.fillEllipse(x + 15, 41, 18 + ((x * 3) % 10), 5);
      gfx.fillStyle(0xFFCC00, 0.70); gfx.fillEllipse(x + 15, 41, 8,                   3);
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

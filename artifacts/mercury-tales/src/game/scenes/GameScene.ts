import Phaser from 'phaser';
import { TEX, WORLD_WIDTH, WORLD_HEIGHT, GROUND_Y, PLAYER_SPEED, PLAYER_JUMP } from '../constants';

// ── Player animation ──────────────────────────────────────────────────────────
const PLAYER_SCALE = 0.75;  // 85×100 run frame → 64×75 displayed
type PlayerAnimState = 'idle-r' | 'idle-l' | 'run-r' | 'run-l';

// ── Movement feel ─────────────────────────────────────────────────────────────
const GROUND_ACCEL = 2800;   // px/s² on ground
const AIR_ACCEL    = 1400;   // px/s² in air (less snappy)
const GROUND_DRAG  = 16;     // multiplier for on-ground deceleration
const AIR_DRAG     = 2.2;    // multiplier for air drift

// ── Level layout ──────────────────────────────────────────────────────────────
interface PlatDef  { cx: number; cy: number; w: number; high?: true }
interface CoinDef  { x: number; y: number; high?: true }
interface EnemyDef { x: number; y: number; left: number; right: number; fast?: true }
interface GeyserDef { x: number; offset: number } // offset staggers eruption timing

const PLATFORMS: PlatDef[] = [
  // Section 1 — easy intro
  { cx: 280,  cy: 407, w: 160 },
  { cx: 500,  cy: 352, w: 128 },
  { cx: 720,  cy: 302, w: 128 },
  // Over first gap
  { cx: 980,  cy: 437, w: 96  },
  // Section 2
  { cx: 1270, cy: 382, w: 192 },
  { cx: 1530, cy: 332, w: 160 },
  { cx: 1760, cy: 392, w: 128 },
  // Section 3
  { cx: 2090, cy: 352, w: 256 },
  { cx: 2420, cy: 307, w: 192 },
  { cx: 2710, cy: 362, w: 160 },
  // Section 4
  { cx: 3010, cy: 382, w: 256 },
  { cx: 3320, cy: 332, w: 192 },
  { cx: 3570, cy: 392, w: 128 },
  { cx: 3800, cy: 352, w: 192 },
  // Final section
  { cx: 4090, cy: 302, w: 256 },
  { cx: 4420, cy: 357, w: 160 },
  { cx: 4660, cy: 307, w: 192 },
  // High/unreachable sky platforms
  { cx: 400,  cy: 215, w: 192, high: true },
  { cx: 1430, cy: 195, w: 160, high: true },
  { cx: 2580, cy: 175, w: 192, high: true },
  { cx: 3680, cy: 195, w: 160, high: true },
];

const GROUND_GAPS: [number, number][] = [[900, 1100], [1750, 1900]];

const COINS: CoinDef[] = [
  { x:  90, y: 430 }, { x: 150, y: 430 }, { x: 210, y: 430 },
  { x: 420, y: 430 }, { x: 490, y: 430 },
  { x: 250, y: 377 }, { x: 310, y: 377 },
  { x: 475, y: 323 }, { x: 535, y: 323 },
  { x: 720, y: 274 },
  { x: 980, y: 417 },
  { x:1240, y: 357 }, { x:1300, y: 357 }, { x:1360, y: 357 },
  { x:1510, y: 307 }, { x:1565, y: 307 },
  { x:1760, y: 367 },
  { x:2060, y: 327 }, { x:2120, y: 327 },
  { x:2400, y: 282 }, { x:2455, y: 282 },
  { x:2710, y: 337 },
  { x:2980, y: 357 }, { x:3040, y: 357 },
  { x:3295, y: 307 }, { x:3360, y: 307 },
  { x:3570, y: 367 },
  { x:3770, y: 327 }, { x:3835, y: 327 },
  { x:4065, y: 277 }, { x:4125, y: 277 },
  { x:4420, y: 332 },
  { x:4635, y: 277 }, { x:4700, y: 277 },
  { x:4820, y: 430 }, { x:4900, y: 430 },
  // High / unreachable
  { x: 350, y: 188, high: true }, { x: 405, y: 188, high: true },
  { x: 455, y: 188, high: true }, { x: 510, y: 188, high: true },
  { x:1380, y: 168, high: true }, { x:1435, y: 168, high: true },
  { x:1490, y: 168, high: true }, { x:1545, y: 168, high: true },
  { x:2525, y: 148, high: true }, { x:2580, y: 148, high: true },
  { x:2635, y: 148, high: true }, { x:2690, y: 148, high: true },
  { x:3625, y: 168, high: true }, { x:3685, y: 168, high: true },
  { x:3740, y: 168, high: true },
];

const ENEMIES: EnemyDef[] = [
  { x:  610, y: 437, left:  450, right:  870 },
  { x: 1600, y: 437, left: 1350, right: 1740 },
  { x: 3200, y: 437, left: 3000, right: 3450 },
  { x: 4500, y: 437, left: 4250, right: 4700 },
  { x: 2100, y: 329, left: 1970, right: 2210 },
  { x: 3325, y: 309, left: 3225, right: 3415 },
  { x: 4095, y: 279, left: 3965, right: 4215 },
];

// Geyser eruption hazards — placed along open ground stretches
const GEYSERS: GeyserDef[] = [
  { x:  460, offset:    0 },
  { x: 1830, offset: 1500 },
  { x: 2560, offset:  800 },
  { x: 3760, offset: 1200 },
  { x: 4320, offset:  400 },
];
const GEYSER_COOL_MS  = 3200;
const GEYSER_WARN_MS  =  650;
const GEYSER_ERUPT_MS = 1350;

const END_PORTAL_X = 5050;
const END_PORTAL_Y = 408;

// ── Geyser runtime state ──────────────────────────────────────────────────────
interface GeyserState {
  x:       number;
  phase:   'cool' | 'warn' | 'erupt';
  elapsed: number;   // ms in current phase
  zone:    Phaser.GameObjects.Zone;
  zBody:   Phaser.Physics.Arcade.StaticBody;
}

// ── Scene ─────────────────────────────────────────────────────────────────────
export class GameScene extends Phaser.Scene {
  // physics groups
  private groundGroup!: Phaser.Physics.Arcade.StaticGroup;
  private platGroup!:   Phaser.Physics.Arcade.StaticGroup;
  private coinGroup!:   Phaser.Physics.Arcade.StaticGroup;
  private highCoins!:   Phaser.GameObjects.Group;
  private enemyGroup!:  Phaser.Physics.Arcade.Group;

  // player
  private player!:    Phaser.Physics.Arcade.Sprite;
  private cursors!:   Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys!:  { up: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };

  // game state
  private iridiumCount  = 0;
  private iridiumText!:  Phaser.GameObjects.Text;
  private levelComplete  = false;

  // jump / movement feel
  private coyoteTimer   = 0;
  private jumpBuffer    = 0;
  private isOnGround    = false;
  private wasOnGround   = false;
  private airJumpsLeft  = 1;       // allows one mid-air double jump
  private prevVelY      = 0;       // track fall speed for landing shake

  // player animation state
  private playerFacing: 'r' | 'l' = 'r';
  private playerAnimState: PlayerAnimState | '' = '';

  // run trail throttle
  private runTrailTimer = 0;

  // bg parallax
  private bgClouds!: Phaser.GameObjects.TileSprite;
  private bgFar!:    Phaser.GameObjects.TileSprite;
  private bgMid!:    Phaser.GameObjects.TileSprite;
  private bgNear!:   Phaser.GameObjects.TileSprite;
  private lavaGfx!:  Phaser.GameObjects.Graphics;

  // geysers
  private geysers:    GeyserState[] = [];
  private geyserGfx!: Phaser.GameObjects.Graphics;

  constructor() { super({ key: 'GameScene' }); }

  create() {
    this.levelComplete  = false;
    this.iridiumCount   = 0;
    this.coyoteTimer    = 0;
    this.jumpBuffer     = 0;
    this.airJumpsLeft   = 1;
    this.runTrailTimer  = 0;
    this.prevVelY       = 0;
    this.geysers        = [];

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this.buildBackground();
    this.buildGround();
    this.buildPlatforms();
    this.buildCoins();
    this.buildEnemies();
    this.buildPlayer();
    this.buildGeysers();
    this.buildPortal();
    this.buildHUD();
    this.setupCamera();
    this.setupControls();
    this.setupCollisions();
    this.setupLavaAnim();

    this.cameras.main.fadeIn(500, 0, 0, 0);
  }

  // ── Build helpers ───────────────────────────────────────────────────────────

  private buildBackground() {
    const { width: W, height: H } = this.scale;

    this.add.image(W / 2, H / 2, TEX.BG_SKY)
      .setScrollFactor(0).setDisplaySize(W, H).setDepth(-5);

    this.bgClouds = this.add.tileSprite(W / 2, 75, W, 110, TEX.BG_CLOUDS)
      .setScrollFactor(0).setOrigin(0.5, 0.5).setDepth(-4);

    this.bgFar = this.add.tileSprite(W / 2, H - 60, W, 240, TEX.BG_FAR)
      .setScrollFactor(0).setOrigin(0.5, 1).setDepth(-3);

    this.bgMid = this.add.tileSprite(W / 2, H - 44, W, 200, TEX.BG_MID)
      .setScrollFactor(0).setOrigin(0.5, 1).setDepth(-2);

    this.bgNear = this.add.tileSprite(W / 2, H - 24, W, 70, TEX.BG_NEAR)
      .setScrollFactor(0).setOrigin(0.5, 1).setDepth(-1);

    this.lavaGfx    = this.add.graphics().setDepth(-0.5);
    this.geyserGfx  = this.add.graphics().setDepth(2);
  }

  private buildGround() {
    this.groundGroup = this.physics.add.staticGroup();
    const tileW = 32;
    const segments: [number, number][] = [
      [0,                  GROUND_GAPS[0][0]],
      [GROUND_GAPS[0][1],  GROUND_GAPS[1][0]],
      [GROUND_GAPS[1][1],  WORLD_WIDTH],
    ];
    for (const [start, end] of segments) {
      for (let x = start + tileW / 2; x < end; x += tileW) {
        this.groundGroup.create(x, GROUND_Y + 16, TEX.GROUND);
      }
    }
    this.groundGroup.refresh();
  }

  private platTex(w: number): string {
    if (w <= 96)  return TEX.PLAT_S;
    if (w <= 192) return TEX.PLAT_M;
    return TEX.PLAT_L;
  }

  private buildPlatforms() {
    this.platGroup = this.physics.add.staticGroup();

    // Graphics layer for boulder bases and lava drips (drawn behind player)
    const rockGfx = this.add.graphics().setDepth(0.8);

    for (const p of PLATFORMS) {
      if (p.high) {
        const img = this.add.image(p.cx, p.cy, TEX.PLAT_HIGH);
        img.setDisplaySize(p.w, 24);
        img.setAlpha(0.70);
        // Faint crystal glow below
        rockGfx.fillStyle(0x4466DD, 0.10);
        rockGfx.fillEllipse(p.cx, p.cy + 20, p.w * 0.8, 20);
        continue;
      }

      const spr = this.platGroup.create(p.cx, p.cy, this.platTex(p.w)) as Phaser.Physics.Arcade.Sprite;
      spr.setDisplaySize(p.w, 24);
      (spr.body as Phaser.Physics.Arcade.StaticBody).setSize(p.w, 24);
      spr.refreshBody();

      // ── Boulder/cliff face below the ledge ──────────────────────────────
      // This gives platforms visual mass so the player clearly stands ON TOP
      const ledgeTop    = p.cy - 12;  // top of physics body = standing surface
      const ledgeBottom = p.cy + 12;  // bottom of physics body
      const boulderH    = 28 + ((p.cx * 7) % 12); // varies 28–39px per platform

      // Outer rock body — gets slightly narrower at the base (natural taper)
      const inset = 6;
      const pts: Phaser.Types.Math.Vector2Like[] = [
        { x: p.cx - p.w / 2,         y: ledgeBottom },
        { x: p.cx - p.w / 2 + inset, y: ledgeBottom + boulderH * 0.5 },
        { x: p.cx - p.w / 2 + inset + 4, y: ledgeBottom + boulderH },
        { x: p.cx + p.w / 2 - inset - 4, y: ledgeBottom + boulderH },
        { x: p.cx + p.w / 2 - inset, y: ledgeBottom + boulderH * 0.5 },
        { x: p.cx + p.w / 2,         y: ledgeBottom },
      ];

      // Main boulder rock — dark volcanic stone
      rockGfx.fillStyle(0x3A1408);
      rockGfx.fillPoints(pts, true);

      // Rock strata mid-band — slightly lighter
      rockGfx.fillStyle(0x4C1C0C, 0.6);
      rockGfx.fillRect(p.cx - p.w / 2 + inset, ledgeBottom + 5, p.w - inset * 2, 7);

      // Lava crack veins running down the face
      rockGfx.lineStyle(1, 0xFF4400, 0.55);
      for (let cx = p.cx - p.w * 0.35; cx < p.cx + p.w * 0.45; cx += p.w * 0.22) {
        const jitter = (cx % 7) - 3;
        rockGfx.beginPath();
        rockGfx.moveTo(cx,         ledgeBottom + 2);
        rockGfx.lineTo(cx + jitter, ledgeBottom + boulderH * 0.4);
        rockGfx.lineTo(cx + jitter * 0.5, ledgeBottom + boulderH * 0.75);
        rockGfx.strokePath();
      }

      // Lava seam glow along the very underside edge
      rockGfx.fillStyle(0xFF3300, 0.50);
      rockGfx.fillRect(p.cx - p.w / 2 + inset + 4, ledgeBottom + boulderH - 3, p.w - (inset + 4) * 2, 3);
      rockGfx.fillStyle(0xFF8800, 0.65);
      rockGfx.fillRect(p.cx - p.w / 2 + inset + 4, ledgeBottom + boulderH - 1, p.w - (inset + 4) * 2, 1);

      // Lava drip stalactites at irregular intervals
      for (let sx = p.cx - p.w / 2 + 18; sx < p.cx + p.w / 2 - 14; sx += 22) {
        const dh = 8 + (Math.floor(sx * 0.11) % 9);
        rockGfx.fillStyle(0x5A1C08);
        rockGfx.fillTriangle(sx - 4, ledgeBottom + boulderH, sx + 4, ledgeBottom + boulderH, sx, ledgeBottom + boulderH + dh);
        rockGfx.fillStyle(0xFF2200, 0.75);
        rockGfx.fillCircle(sx, ledgeBottom + boulderH + dh, 2.8);
        rockGfx.fillStyle(0xFF8800, 0.85);
        rockGfx.fillCircle(sx, ledgeBottom + boulderH + dh, 1.4);
      }

      // Ambient lava glow pool below the boulder (light from underside)
      rockGfx.fillStyle(0xFF4400, 0.08);
      rockGfx.fillEllipse(p.cx, ledgeBottom + boulderH + 14, p.w * 0.7, 18);
    }
  }

  private buildCoins() {
    this.coinGroup = this.physics.add.staticGroup();
    this.highCoins = this.add.group();

    for (const c of COINS) {
      if (c.high) {
        const img = this.add.image(c.x, c.y, TEX.COIN_HIGH).setScale(0.9).setAlpha(0.85);
        this.highCoins.add(img);
        this.tweens.add({ targets: img, y: c.y - 5, duration: 700 + Math.random() * 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        const arrow = this.add.text(c.x, c.y - 16, '▲', { fontSize: '9px', color: '#cc88ff' }).setOrigin(0.5);
        this.tweens.add({ targets: arrow, alpha: { from: 0.2, to: 0.8 }, duration: 900, yoyo: true, repeat: -1 });
      } else {
        const img = this.coinGroup.create(c.x, c.y, TEX.COIN) as Phaser.Physics.Arcade.Sprite;
        img.setScale(0.9);
        img.refreshBody();
        const origY = c.y;
        this.tweens.add({ targets: img, y: origY - 4, duration: 600 + Math.random() * 200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    }
  }

  private buildEnemies() {
    this.enemyGroup = this.physics.add.group();

    for (const e of ENEMIES) {
      const spr = this.enemyGroup.create(e.x, e.y, TEX.SLUG) as Phaser.Physics.Arcade.Sprite;
      spr.play('cinderslug-walk');
      spr.setScale(1.5);   // 44×28 → ~66×42 displayed
      spr.setData('left',  e.left);
      spr.setData('right', e.right);
      spr.setData('dir',   1);
      spr.setData('baseSpeed', 70);
      spr.setVelocityX(70);
      spr.setCollideWorldBounds(false);
      const sb = spr.body as Phaser.Physics.Arcade.Body;
      sb.setGravityY(200);
      sb.setSize(40, 18);   // wide flat lizard — snug to body shape
    }
  }

  private buildPlayer() {
    this.player = this.physics.add.sprite(80, GROUND_Y, 'player-idle-r');
    this.player.setOrigin(0.5, 1);
    this.player.setCollideWorldBounds(true);
    this.player.setTint(0xFFBB60);  // warm amber for Scoria

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setMaxVelocityY(900);
    body.setMaxVelocityX(PLAYER_SPEED);   // acceleration respects this cap

    this.setPlayerAnimation('idle-r');
  }

  private buildGeysers() {
    for (const def of GEYSERS) {
      // Vent base sprite
      this.add.image(def.x, GROUND_Y, 'geyser-base')
        .setOrigin(0.5, 1)
        .setDepth(1);

      // Damage zone (16px wide, 90px tall eruption column above ground)
      const zone = this.add.zone(def.x, GROUND_Y - 45, 16, 90);
      this.physics.add.existing(zone, true);
      const zBody = zone.body as Phaser.Physics.Arcade.StaticBody;
      zBody.enable = false;   // inactive until erupting

      this.geysers.push({
        x: def.x,
        phase:   'cool',
        elapsed: def.offset % (GEYSER_COOL_MS + GEYSER_WARN_MS + GEYSER_ERUPT_MS),
        zone,
        zBody,
      });
    }
  }

  private buildPortal() {
    const portal = this.add.image(END_PORTAL_X, END_PORTAL_Y, TEX.PORTAL);
    this.tweens.add({
      targets: portal,
      alpha: { from: 0.75, to: 1 },
      scaleX: { from: 0.95, to: 1.05 },
      scaleY: { from: 0.95, to: 1.05 },
      duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    const zone = this.add.zone(END_PORTAL_X, END_PORTAL_Y, 60, 80);
    this.physics.add.existing(zone, true);
    this.physics.add.overlap(this.player, zone, () => this.triggerLevelEnd(), undefined, this);
  }

  private buildHUD() {
    const { width: W, height: H } = this.scale;

    const hudBg = this.add.graphics().setScrollFactor(0).setDepth(20);
    hudBg.fillStyle(0x000000, 0.55);
    hudBg.fillRoundedRect(8, 8, 220, 38, 10);

    this.add.image(26, 27, TEX.COIN).setScrollFactor(0).setScale(0.9).setDepth(21);
    this.iridiumText = this.add.text(44, 16, '0  IRIDIUM', {
      fontFamily: '"Fredoka One", "Nunito", sans-serif',
      fontSize: '17px', color: '#ffe080',
      stroke: '#000000', strokeThickness: 3,
    }).setScrollFactor(0).setDepth(21);

    this.add.text(W / 2, 15, 'World 1-1   The Char Plains', {
      fontFamily: '"Nunito", sans-serif',
      fontStyle: 'bold',
      fontSize: '13px', color: '#ffcc88',
      stroke: '#000000', strokeThickness: 3,
    }).setScrollFactor(0).setOrigin(0.5, 0).setDepth(21);

    // Double-jump hint (fades after a few seconds)
    const hint = this.add.text(W / 2, H - 16, '↑  Press JUMP again mid-air for a double jump!', {
      fontFamily: '"Nunito", sans-serif',
      fontStyle: 'bold',
      fontSize: '12px', color: '#ffee99',
      stroke: '#000000', strokeThickness: 3,
    }).setScrollFactor(0).setOrigin(0.5, 1).setDepth(21).setAlpha(0.9);
    this.time.delayedCall(4500, () => {
      this.tweens.add({ targets: hint, alpha: 0, duration: 900, onComplete: () => hint.destroy() });
    });
  }

  private setupCamera() {
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.12);
    this.cameras.main.setDeadzone(80, 60);
  }

  private setupControls() {
    this.cursors = this.input.keyboard!.createCursorKeys();
    const kb = this.input.keyboard!;
    this.wasdKeys = {
      up:    kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      left:  kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
  }

  private setupCollisions() {
    this.physics.add.collider(this.player, this.groundGroup);
    this.physics.add.collider(this.player, this.platGroup);
    this.physics.add.collider(this.enemyGroup, this.groundGroup);
    this.physics.add.collider(this.enemyGroup, this.platGroup);

    this.physics.add.overlap(this.player, this.coinGroup, (_, coin) => {
      this.collectCoin(coin as Phaser.Physics.Arcade.Sprite);
    }, undefined, this);

    this.physics.add.overlap(this.player, this.enemyGroup, (_, enemy) => {
      this.handleEnemyContact(enemy as Phaser.Physics.Arcade.Sprite);
    }, undefined, this);

    // Geyser damage zones
    for (const g of this.geysers) {
      this.physics.add.overlap(this.player, g.zone, () => {
        if (g.phase === 'erupt') this.geyserHitPlayer();
      }, undefined, this);
    }
  }

  private setupLavaAnim() {
    let phase = 0;
    this.time.addEvent({ delay: 20, loop: true, callback: () => {
      phase += 0.05;
      this.lavaGfx.clear();

      // Lava river below ground
      this.lavaGfx.fillStyle(0xFF3300, 1.0);
      this.lavaGfx.fillRect(0, GROUND_Y + 32, WORLD_WIDTH, 60);
      this.lavaGfx.fillStyle(0xFF6600, 1.0);
      this.lavaGfx.fillRect(0, GROUND_Y + 32, WORLD_WIDTH, 8);
      this.lavaGfx.fillStyle(0xFFCC00, 0.45 + Math.sin(phase * 0.8) * 0.2);
      this.lavaGfx.fillRect(0, GROUND_Y + 32, WORLD_WIDTH, 3);

      // Large bubbling hotspots along the river
      for (let x = 60; x < WORLD_WIDTH; x += 180) {
        const bSize = 7 + Math.sin(phase + x * 0.025) * 5;
        this.lavaGfx.fillStyle(0xFF8800, 0.75);
        this.lavaGfx.fillCircle(x, GROUND_Y + 40, bSize);
        this.lavaGfx.fillStyle(0xFFDD00, 0.5);
        this.lavaGfx.fillCircle(x, GROUND_Y + 40, bSize * 0.45);
      }

      // Lava pools in ground gaps
      for (const [gStart, gEnd] of GROUND_GAPS) {
        this.lavaGfx.fillStyle(0xFF2200, 1.0);
        this.lavaGfx.fillRect(gStart, GROUND_Y - 26, gEnd - gStart, 62);
        this.lavaGfx.fillStyle(0xFF6600, 1.0);
        this.lavaGfx.fillRect(gStart, GROUND_Y - 26, gEnd - gStart, 7);
        this.lavaGfx.fillStyle(0xFFCC00, 0.38 + Math.sin(phase * 1.2) * 0.18);
        this.lavaGfx.fillRect(gStart, GROUND_Y - 24, gEnd - gStart, 10);
        const cx = (gStart + gEnd) / 2;
        const gR = 14 + Math.sin(phase * 1.3) * 8;
        this.lavaGfx.fillStyle(0xFFCC00, 0.45);
        this.lavaGfx.fillCircle(cx, GROUND_Y - 12, gR);
        this.lavaGfx.fillStyle(0xFFFF80, 0.6);
        this.lavaGfx.fillCircle(cx, GROUND_Y - 12, gR * 0.5);
      }
    }});
  }

  // ── Geyser drawing (called every frame in update) ──────────────────────────

  private drawGeysers(time: number) {
    this.geyserGfx.clear();

    for (const g of this.geysers) {
      const { x } = g;
      const baseY = GROUND_Y;

      if (g.phase === 'warn') {
        // Pulsing ground crack glow
        const t = g.elapsed / GEYSER_WARN_MS;
        const pulse = Math.sin(time * 0.012) * 0.5 + 0.5;
        this.geyserGfx.fillStyle(0xFF4400, 0.25 + t * 0.4 + pulse * 0.2);
        this.geyserGfx.fillEllipse(x, baseY - 4, 28 + t * 12, 10 + t * 6);
        this.geyserGfx.fillStyle(0xFF8800, 0.4 + t * 0.4);
        this.geyserGfx.fillEllipse(x, baseY - 4, 16 + t * 8, 6 + t * 3);
        // Steam wisps rising
        for (let i = 0; i < 3; i++) {
          const wx = x + (i - 1) * 8;
          const wh = 20 + t * 30;
          this.geyserGfx.fillStyle(0xFFAA60, 0.15 + t * 0.2);
          this.geyserGfx.fillEllipse(wx, baseY - wh / 2, 8, wh);
        }
      } else if (g.phase === 'erupt') {
        const t = g.elapsed / GEYSER_ERUPT_MS;
        // Column grows quickly, then fades
        const growT = Math.min(1, t * 3);
        const fadeT = t > 0.7 ? (t - 0.7) / 0.3 : 0;
        const colH  = growT * 110;
        const alpha  = 1 - fadeT;

        // Outer plume (wide, semi-transparent)
        this.geyserGfx.fillStyle(0xFF4400, 0.35 * alpha);
        this.geyserGfx.fillRect(x - 18, baseY - colH, 36, colH);
        // Mid column
        this.geyserGfx.fillStyle(0xFF6600, 0.65 * alpha);
        this.geyserGfx.fillRect(x - 10, baseY - colH * 0.95, 20, colH * 0.95);
        // Hot core
        this.geyserGfx.fillStyle(0xFF9900, 0.85 * alpha);
        this.geyserGfx.fillRect(x - 5,  baseY - colH * 0.9,  10, colH * 0.9);
        // Bright centre streak
        this.geyserGfx.fillStyle(0xFFCC00, 0.9 * alpha);
        this.geyserGfx.fillRect(x - 2,  baseY - colH * 0.85,  4, colH * 0.85);

        // Spray particles at top
        if (t < 0.6) {
          for (let i = 0; i < 5; i++) {
            const angle = -Math.PI / 2 + (i - 2) * 0.35;
            const dist  = 20 + i * 8;
            const px = x + Math.cos(angle) * dist;
            const py = baseY - colH + Math.sin(angle) * dist;
            this.geyserGfx.fillStyle(0xFF8800, 0.7 * alpha);
            this.geyserGfx.fillCircle(px, py, 5 - i * 0.5);
          }
        }

        // Ground ring glow
        this.geyserGfx.fillStyle(0xFF4400, 0.5 * alpha);
        this.geyserGfx.fillEllipse(x, baseY - 4, 40, 14);
        this.geyserGfx.fillStyle(0xFFCC00, 0.7 * alpha);
        this.geyserGfx.fillEllipse(x, baseY - 4, 18, 6);
      }
    }
  }

  // ── Particle effects ────────────────────────────────────────────────────────

  private spawnLandDust(big: boolean) {
    const count = big ? 12 : 7;
    for (let i = 0; i < count; i++) {
      const angle = Math.PI + (Math.random() - 0.5) * Math.PI * 0.8;
      const speed = 20 + Math.random() * (big ? 55 : 35);
      const dot = this.add.circle(
        this.player.x + Phaser.Math.Between(-10, 10),
        this.player.y,
        2 + Math.random() * (big ? 4 : 2.5),
        big ? 0xFF8830 : 0xCC5518,
      ).setDepth(5);
      this.tweens.add({
        targets: dot,
        x: dot.x + Math.cos(angle) * speed,
        y: dot.y + Math.sin(angle) * speed * 0.6,
        alpha: 0, scaleX: 0.2, scaleY: 0.2,
        duration: 220 + Math.random() * 180,
        ease: 'Quad.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
    if (big) this.cameras.main.shake(70, 0.004);
  }

  private spawnDoubleJumpBurst() {
    // Radial ember ring
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const dot = this.add.circle(
        this.player.x,
        this.player.y - 30,
        3 + Math.random() * 2,
        Phaser.Math.Between(0, 1) ? 0xFF8800 : 0xFFDD00,
      ).setDepth(5);
      this.tweens.add({
        targets: dot,
        x: dot.x + Math.cos(angle) * 32,
        y: dot.y + Math.sin(angle) * 20,
        alpha: 0, scaleX: 0.3, scaleY: 0.3,
        duration: 300 + Math.random() * 120,
        ease: 'Cubic.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  }

  private emitRunTrail() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (Math.abs(body.velocity.x) < PLAYER_SPEED * 0.65) return;

    const trailX = this.player.x + (this.playerFacing === 'r' ? -18 : 18);
    const trailY = this.player.y - 18 - Math.random() * 14;
    const dot = this.add.circle(trailX, trailY, 2 + Math.random() * 2, 0xFF7700)
      .setDepth(4).setAlpha(0.65);
    this.tweens.add({
      targets: dot,
      alpha: 0, scaleX: 0.2, scaleY: 0.2,
      x: dot.x + (Math.random() - 0.5) * 14,
      y: dot.y - Math.random() * 12,
      duration: 200 + Math.random() * 120,
      onComplete: () => dot.destroy(),
    });
  }

  // ── Player animation ────────────────────────────────────────────────────────

  private setPlayerAnimation(state: PlayerAnimState) {
    const key = `ember-${state}`;
    if (this.playerAnimState === state) return;
    this.playerAnimState = state;

    this.player.play(key, true);
    this.player.setScale(PLAYER_SCALE);

    const isRun   = state.startsWith('run');
    const displayW = (isRun ? 85 : 45) * PLAYER_SCALE;   // 64 or 34 px
    const displayH = 100 * PLAYER_SCALE;                  // 75 px
    const BODY_W = 18, BODY_H = 52;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(BODY_W, BODY_H);
    body.setOffset((displayW - BODY_W) / 2, displayH - BODY_H - 4);
  }

  // ── Game logic ──────────────────────────────────────────────────────────────

  private collectCoin(coin: Phaser.Physics.Arcade.Sprite) {
    if (!coin.active) return;
    coin.setActive(false).setVisible(false);
    (coin.body as Phaser.Physics.Arcade.StaticBody).enable = false;
    this.iridiumCount++;
    this.iridiumText.setText(`${this.iridiumCount}  IRIDIUM`);

    // Floating +1 pop
    const pop = this.add.text(coin.x, coin.y - 10, '+1', {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#ffe080',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: pop, y: coin.y - 44, alpha: 0, duration: 550, onComplete: () => pop.destroy() });

    // Sparkle burst
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const dot = this.add.circle(coin.x, coin.y, 3, 0xd8d8f8).setDepth(29);
      this.tweens.add({
        targets: dot,
        x: coin.x + Math.cos(angle) * 30,
        y: coin.y + Math.sin(angle) * 30,
        alpha: 0, duration: 360,
        onComplete: () => dot.destroy(),
      });
    }
  }

  private handleEnemyContact(enemy: Phaser.Physics.Arcade.Sprite) {
    if (!enemy.active) return;
    const body      = this.player.body as Phaser.Physics.Arcade.Body;
    const enemyBody = enemy.body as Phaser.Physics.Arcade.Body;

    // Stomp — falling and above enemy midpoint
    if (body.velocity.y > 0 && this.player.y < enemy.y - 6) {
      enemy.setActive(false).setVisible(false);
      enemyBody.enable = false;

      // Squash tween before hide
      this.tweens.add({
        targets: enemy, scaleY: 0.15, scaleX: 2.5,
        duration: 80, onComplete: () => enemy.setVisible(false),
      });

      body.setVelocityY(-380);
      this.airJumpsLeft = 1;   // restore double-jump on stomp

      const pop = this.add.text(enemy.x, enemy.y - 12, 'STOMP!', {
        fontFamily: 'Georgia, serif', fontSize: '13px', color: '#ffdd44',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(30);
      this.tweens.add({ targets: pop, y: enemy.y - 50, alpha: 0, duration: 650, onComplete: () => pop.destroy() });
      this.cameras.main.shake(90, 0.004);

      // Score burst
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const dot = this.add.circle(enemy.x, enemy.y, 4, 0xFF8800).setDepth(28);
        this.tweens.add({ targets: dot, x: enemy.x + Math.cos(angle) * 30, y: enemy.y + Math.sin(angle) * 30, alpha: 0, scaleX: 0.3, scaleY: 0.3, duration: 380, onComplete: () => dot.destroy() });
      }
    } else {
      // Side hit
      if (this.player.getData('invincible')) return;
      this.player.setData('invincible', true);
      const dir = this.player.x < enemy.x ? -1 : 1;
      body.setVelocity(dir * 300, -330);
      this.tweens.add({
        targets: this.player, alpha: 0.2, duration: 90,
        yoyo: true, repeat: 11,
        onComplete: () => { this.player.setAlpha(1); this.player.setData('invincible', false); },
      });
      this.cameras.main.shake(150, 0.006);
    }
  }

  private geyserHitPlayer() {
    if (this.player.getData('invincible') || this.player.getData('geyserHit')) return;
    this.player.setData('geyserHit', true);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocityY(-520);  // blast upward
    this.cameras.main.shake(120, 0.007);
    this.tweens.add({
      targets: this.player, alpha: 0.25, tint: 0xFF4400,
      duration: 80, yoyo: true, repeat: 7,
      onComplete: () => {
        this.player.clearTint();
        this.player.setTint(0xFFBB60);  // restore amber
        this.player.setAlpha(1);
        this.player.setData('geyserHit', false);
      },
    });
  }

  private triggerLevelEnd() {
    if (this.levelComplete) return;
    this.levelComplete = true;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.enable = false;
    this.cameras.main.pan(END_PORTAL_X, END_PORTAL_Y, 600, 'Power2');
    this.cameras.main.zoomTo(1.4, 800);
    this.time.delayedCall(1000, () => {
      this.cameras.main.fadeOut(600, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('LevelEndScene', { iridiumEarned: this.iridiumCount });
      });
    });
  }

  // ── Update loop ─────────────────────────────────────────────────────────────

  update(time: number, delta: number) {
    if (this.levelComplete) return;

    const dt   = delta / 1000;
    const body = this.player.body as Phaser.Physics.Arcade.Body;

    this.isOnGround = body.blocked.down;

    // ── Landing detection ────────────────────────────────────────────────────
    const justLanded = !this.wasOnGround && this.isOnGround;
    if (justLanded) {
      this.airJumpsLeft = 1;
      const hardLand = this.prevVelY > 420;
      this.spawnLandDust(hardLand);
    }

    // ── Coyote time ──────────────────────────────────────────────────────────
    if (this.isOnGround) { this.coyoteTimer = 0.08; }
    else if (this.coyoteTimer > 0) { this.coyoteTimer -= dt; }

    // ── Jump buffering ───────────────────────────────────────────────────────
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
                        Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
                        Phaser.Input.Keyboard.JustDown(this.wasdKeys.up);
    if (jumpPressed) this.jumpBuffer = 0.12;
    else if (this.jumpBuffer > 0) this.jumpBuffer -= dt;

    // ── Execute normal jump (with coyote) ────────────────────────────────────
    if (this.jumpBuffer > 0 && this.coyoteTimer > 0) {
      body.setVelocityY(PLAYER_JUMP);
      this.jumpBuffer  = 0;
      this.coyoteTimer = 0;
    }
    // ── Double jump (mid-air, second press) ──────────────────────────────────
    else if (jumpPressed && !this.isOnGround && this.coyoteTimer <= 0 && this.airJumpsLeft > 0) {
      body.setVelocityY(PLAYER_JUMP * 0.82);
      this.airJumpsLeft--;
      this.spawnDoubleJumpBurst();
    }

    // ── Variable jump height — release early = smaller arc ───────────────────
    const jumpHeld = this.cursors.up.isDown || this.cursors.space.isDown || this.wasdKeys.up.isDown;
    if (!jumpHeld && body.velocity.y < -180) {
      body.setVelocityY(body.velocity.y * (1 - dt * 8));
    }

    // ── Acceleration-based horizontal movement ───────────────────────────────
    const goLeft  = this.cursors.left.isDown  || this.wasdKeys.left.isDown;
    const goRight = this.cursors.right.isDown || this.wasdKeys.right.isDown;
    const accel = this.isOnGround ? GROUND_ACCEL : AIR_ACCEL;

    if (goLeft) {
      body.setAccelerationX(-accel);
      this.playerFacing = 'l';
      this.setPlayerAnimation('run-l');
    } else if (goRight) {
      body.setAccelerationX(accel);
      this.playerFacing = 'r';
      this.setPlayerAnimation('run-r');
    } else {
      body.setAccelerationX(0);
      // Friction / air drag
      const drag = this.isOnGround ? GROUND_DRAG : AIR_DRAG;
      const newVx = body.velocity.x * (1 - Math.min(1, drag * dt));
      body.setVelocityX(Math.abs(newVx) < 5 ? 0 : newVx);
      this.setPlayerAnimation(this.isOnGround
        ? (`idle-${this.playerFacing}` as PlayerAnimState)
        : (`run-${this.playerFacing}` as PlayerAnimState));
    }

    // ── Run trail ────────────────────────────────────────────────────────────
    this.runTrailTimer += delta;
    if (this.runTrailTimer >= 75) {
      this.runTrailTimer = 0;
      this.emitRunTrail();
    }

    // ── Lava death ───────────────────────────────────────────────────────────
    if (this.player.y > WORLD_HEIGHT + 60) {
      this.player.setPosition(80, GROUND_Y);
      body.setVelocity(0, 0);
      body.setAccelerationX(0);
      this.airJumpsLeft = 1;
      this.iridiumCount = Math.max(0, this.iridiumCount - 3);
      this.iridiumText.setText(`${this.iridiumCount}  IRIDIUM`);
      this.cameras.main.shake(200, 0.008);
    }

    // ── Enemy AI — patrol + aggro when player is close ───────────────────────
    this.enemyGroup.getChildren().forEach((obj) => {
      const slug = obj as Phaser.Physics.Arcade.Sprite;
      if (!slug.active) return;
      const sb    = slug.body as Phaser.Physics.Arcade.Body;
      const left  = slug.getData('left')  as number;
      const right = slug.getData('right') as number;
      let   dir   = slug.getData('dir')   as number;
      const base  = slug.getData('baseSpeed') as number;

      // Speed up when the player is within 220px and on same Y zone
      const dist = Math.abs(this.player.x - slug.x);
      const sameLevel = Math.abs(this.player.y - slug.y) < 80;
      const speed = (dist < 220 && sameLevel) ? base * 1.9 : base;

      if (slug.x <= left && dir === -1) {
        dir = 1;
        slug.setData('dir', 1);
        slug.setFlipX(false);
      } else if (slug.x >= right && dir === 1) {
        dir = -1;
        slug.setData('dir', -1);
        slug.setFlipX(true);
      }
      sb.setVelocityX(dir * speed);
    });

    // ── Geyser state machine ─────────────────────────────────────────────────
    for (const g of this.geysers) {
      g.elapsed += delta;
      if (g.phase === 'cool' && g.elapsed >= GEYSER_COOL_MS) {
        g.phase = 'warn'; g.elapsed = 0;
      } else if (g.phase === 'warn' && g.elapsed >= GEYSER_WARN_MS) {
        g.phase = 'erupt'; g.elapsed = 0;
        g.zBody.enable = true;
      } else if (g.phase === 'erupt' && g.elapsed >= GEYSER_ERUPT_MS) {
        g.phase = 'cool'; g.elapsed = 0;
        g.zBody.enable = false;
      }
    }
    this.drawGeysers(time);

    // ── Parallax scroll ───────────────────────────────────────────────────────
    this.bgClouds.tilePositionX = this.cameras.main.scrollX * 0.04;
    this.bgFar.tilePositionX    = this.cameras.main.scrollX * 0.10;
    this.bgMid.tilePositionX    = this.cameras.main.scrollX * 0.22;
    this.bgNear.tilePositionX   = this.cameras.main.scrollX * 0.40;

    // Track for next frame
    this.prevVelY    = body.velocity.y;
    this.wasOnGround = this.isOnGround;
  }
}

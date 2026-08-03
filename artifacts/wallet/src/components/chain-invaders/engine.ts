/**
 * Chain Invaders — lightweight Space-Invaders-style canvas game.
 * Supports keyboard (desktop) and NiftyBoy pad events (mobile).
 */

export type PadButton =
  | "left"
  | "right"
  | "up"
  | "down"
  | "a"
  | "b"
  | "start"
  | "select";

export type GamePhase = "title" | "playing" | "paused" | "gameover";

export interface GameHooks {
  onScore?: (score: number) => void;
  onGameOver?: (result: PlayResult) => void;
  onPhase?: (phase: GamePhase) => void;
}

export interface PlayResult {
  score: number;
  kills: number;
  durationMs: number;
  seed: string;
  playHash: string;
  /** Server round token — required for attest when seed was server-issued */
  roundToken?: string;
}

interface Invader {
  x: number;
  y: number;
  alive: boolean;
  col: number;
  row: number;
}

interface Bullet {
  x: number;
  y: number;
  vy: number;
  fromPlayer: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mix a hex/ascii seed into a 32-bit PRNG state (not just charCode sum). */
function seedToUint32(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Fold extra entropy from WebCrypto-ish client noise if present after `|`
  return h >>> 0 || 1;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type RoundSeedProvider = () => Promise<{ seed: string; token?: string } | null>;

export class ChainInvadersEngine {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private running = false;
  private phase: GamePhase = "title";
  private hooks: GameHooks;

  private W = 320;
  private H = 240;

  private playerX = 160;
  private playerAlive = true;
  private score = 0;
  private kills = 0;
  private lives = 3;
  private wave = 1;
  private invaders: Invader[] = [];
  private bullets: Bullet[] = [];
  private particles: Particle[] = [];
  private invaderDir = 1;
  private invaderTick = 0;
  private invaderSpeed = 40;
  private shootCooldown = 0;
  private fireHeld = false;
  private enemyShootTimer = 0;
  private enemyShotIndex = 0;
  private keys = new Set<string>();
  private pad = new Set<PadButton>();
  private startedAt = 0;
  private seed = "";
  private roundToken = "";
  private rng = mulberry32(1);
  private flash = 0;
  private transcript: string[] = [];
  private jackpotLabel = "";
  private roundSeedProvider: RoundSeedProvider | null = null;

  constructor(canvas: HTMLCanvasElement, hooks: GameHooks = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
    this.hooks = hooks;
    canvas.width = this.W;
    canvas.height = this.H;
  }

  setRoundSeedProvider(provider: RoundSeedProvider | null) {
    this.roundSeedProvider = provider;
  }

  setJackpotLabel(label: string) {
    this.jackpotLabel = label;
  }

  setPhase(phase: GamePhase) {
    this.phase = phase;
    this.hooks.onPhase?.(phase);
  }

  getPhase(): GamePhase {
    return this.phase;
  }

  /** Pause for score menu / Esc — no-op if not playing. */
  pauseForMenu() {
    if (this.phase === "playing") this.setPhase("paused");
  }

  /** Resume after closing Esc high-score menu. */
  resumeFromMenu() {
    if (this.phase === "paused") this.setPhase("playing");
  }

  startLoop() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stopLoop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy() {
    this.stopLoop();
    this.detachInput();
  }

  private keyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (
      ["arrowleft", "arrowright", "arrowup", "arrowdown", " ", "enter", "a", "z", "x", "p", "escape"].includes(k) ||
      e.code === "Space" ||
      e.key === "Escape"
    ) {
      e.preventDefault();
    }
    this.keys.add(k);
    if (e.code === "Space") this.keys.add(" ");
    // Escape is handled by the React score menu (pause + overlay) on desktop.
    if (e.key === "Escape") return;
    if (this.phase === "title" && (k === "enter" || k === " ")) {
      this.beginPlay();
    } else if (this.phase === "gameover" && (k === "enter" || k === " ")) {
      this.beginPlay();
    } else if (this.phase === "playing" && k === "p") {
      this.setPhase("paused");
    } else if (this.phase === "paused" && k === "p") {
      this.setPhase("playing");
    }
  };

  private keyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
    if (e.code === "Space") this.keys.delete(" ");
  };

  attachKeyboard() {
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
  }

  detachInput() {
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
  }

  pressPad(button: PadButton, active: boolean) {
    if (active) this.pad.add(button);
    else this.pad.delete(button);

    if (active && button === "start") {
      if (this.phase === "title" || this.phase === "gameover") this.beginPlay();
      else if (this.phase === "playing") this.setPhase("paused");
      else if (this.phase === "paused") this.setPhase("playing");
    }
    if (active && button === "a" && this.phase === "playing") {
      this.tryShoot();
    }
  }

  showTitle() {
    this.setPhase("title");
    this.score = 0;
    this.kills = 0;
    this.lives = 3;
    this.wave = 1;
    this.bullets = [];
    this.particles = [];
    this.invaders = [];
    this.playerAlive = true;
  }

  beginPlay() {
    void this.beginPlayAsync();
  }

  private async beginPlayAsync() {
    this.roundToken = "";
    let seed = "";
    try {
      const issued = await this.roundSeedProvider?.();
      if (issued?.seed) {
        seed = issued.seed;
        this.roundToken = issued.token ?? "";
      }
    } catch {
      /* fall through to local entropy */
    }
    if (!seed) {
      const local = new Uint8Array(32);
      crypto.getRandomValues(local);
      seed =
        "0x" +
        Array.from(local)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
    }

    this.seed = seed;
    this.rng = mulberry32(seedToUint32(seed));
    this.enemyShotIndex = 0;
    this.score = 0;
    this.kills = 0;
    this.lives = 3;
    this.wave = 1;
    this.playerX = this.W / 2;
    this.playerAlive = true;
    this.bullets = [];
    this.particles = [];
    this.transcript = [`seed:${this.seed}`];
    if (this.roundToken) this.transcript.push(`token:${this.roundToken.slice(0, 16)}`);
    this.startedAt = performance.now();
    this.spawnWave();
    this.setPhase("playing");
    this.hooks.onScore?.(0);
  }

  private spawnWave() {
    this.invaders = [];
    const cols = 8;
    const rows = Math.min(5, 2 + this.wave);
    const gapX = 28;
    const gapY = 20;
    const startX = 40;
    const startY = 28;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.invaders.push({
          x: startX + c * gapX,
          y: startY + r * gapY,
          alive: true,
          col: c,
          row: r,
        });
      }
    }
    this.invaderDir = 1;
    this.invaderSpeed = Math.max(12, 48 - this.wave * 6);
    this.invaderTick = 0;
    // First shot delay also jittered — bots can't assume a fixed 1.2s opener
    this.enemyShootTimer = 0.85 + this.rng() * 0.9;
    this.transcript.push(`wave:${this.wave}`);
  }

  private tryShoot() {
    if (this.shootCooldown > 0 || !this.playerAlive) return;
    this.bullets.push({ x: this.playerX, y: this.H - 28, vy: -220, fromPlayer: true });
    this.shootCooldown = 0.28;
    this.transcript.push(`shot:${Math.floor(this.playerX)}`);
  }

  private explode(x: number, y: number, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2;
      const s = 40 + this.rng() * 80;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.35 + this.rng() * 0.35,
      });
    }
  }

  private update(dt: number) {
    if (this.phase !== "playing") return;

    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.enemyShootTimer -= dt;

    const left = this.keys.has("arrowleft") || this.keys.has("a") || this.pad.has("left");
    const right = this.keys.has("arrowright") || this.keys.has("d") || this.pad.has("right");
    const shootWanted =
      this.keys.has(" ") ||
      this.keys.has("z") ||
      this.keys.has("x") ||
      this.pad.has("a") ||
      this.pad.has("b");

    if (left) this.playerX -= 140 * dt;
    if (right) this.playerX += 140 * dt;
    this.playerX = Math.max(16, Math.min(this.W - 16, this.playerX));
    // One shot per press — holding Space / fire buttons does not auto-fire.
    if (shootWanted && !this.fireHeld) this.tryShoot();
    this.fireHeld = shootWanted;

    // Invaders march
    this.invaderTick += dt * 60;
    if (this.invaderTick >= this.invaderSpeed) {
      this.invaderTick = 0;
      let hitEdge = false;
      for (const inv of this.invaders) {
        if (!inv.alive) continue;
        inv.x += this.invaderDir * 8;
        if (inv.x < 12 || inv.x > this.W - 12) hitEdge = true;
      }
      if (hitEdge) {
        this.invaderDir *= -1;
        for (const inv of this.invaders) {
          if (!inv.alive) continue;
          inv.y += 12;
          inv.x += this.invaderDir * 8;
          if (inv.y > this.H - 50) {
            this.playerHit();
          }
        }
      }
    }

    if (this.enemyShootTimer <= 0) {
      const alive = this.invaders.filter((i) => i.alive);
      if (alive.length) {
        // Derive shooter + cadence from seeded stream (not a fixed interval).
        this.enemyShotIndex += 1;
        const shooter = alive[Math.floor(this.rng() * alive.length)]!;
        const speed = 95 + this.wave * 8 + this.rng() * 40;
        this.bullets.push({
          x: shooter.x,
          y: shooter.y + 8,
          vy: speed,
          fromPlayer: false,
        });
        this.transcript.push(
          `eshot:${this.enemyShotIndex}:${shooter.col},${shooter.row}:${Math.floor(speed)}`,
        );
      }
      const base = Math.max(0.28, 1.35 - this.wave * 0.11);
      this.enemyShootTimer = base * (0.55 + this.rng() * 0.9);
    }

    for (const b of this.bullets) {
      b.y += b.vy * dt;
    }

    // Collisions
    for (const b of this.bullets) {
      if (!b.fromPlayer) {
        if (
          this.playerAlive &&
          Math.abs(b.x - this.playerX) < 10 &&
          b.y > this.H - 30 &&
          b.y < this.H - 12
        ) {
          b.y = -999;
          this.playerHit();
        }
        continue;
      }
      for (const inv of this.invaders) {
        if (!inv.alive) continue;
        if (Math.abs(b.x - inv.x) < 12 && Math.abs(b.y - inv.y) < 10) {
          inv.alive = false;
          b.y = -999;
          this.kills += 1;
          this.score += 10 + inv.row * 5 + this.wave * 2;
          this.hooks.onScore?.(this.score);
          this.explode(inv.x, inv.y, 8);
          this.transcript.push(`kill:${inv.col},${inv.row},${this.score}`);
          break;
        }
      }
    }

    this.bullets = this.bullets.filter((b) => b.y > -20 && b.y < this.H + 20);

    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    if (this.invaders.every((i) => !i.alive)) {
      this.wave += 1;
      this.score += 50 * this.wave;
      this.hooks.onScore?.(this.score);
      this.spawnWave();
      this.flash = 0.25;
    }
  }

  private playerHit() {
    this.lives -= 1;
    this.flash = 0.4;
    this.explode(this.playerX, this.H - 22, 14);
    this.transcript.push(`hit:${this.lives}`);
    this.bullets = this.bullets.filter((b) => b.fromPlayer);
    if (this.lives <= 0) {
      this.playerAlive = false;
      void this.finishGame();
    }
  }

  private async finishGame() {
    this.setPhase("gameover");
    const durationMs = Math.max(1, Math.floor(performance.now() - this.startedAt));
    this.transcript.push(`end:${this.score}:${durationMs}`);
    const playHash = await sha256Hex(this.transcript.join("|"));
    this.hooks.onGameOver?.({
      score: this.score,
      kills: this.kills,
      durationMs,
      seed: this.seed,
      playHash: `0x${playHash}`,
      roundToken: this.roundToken || undefined,
    });
  }

  private draw() {
    const ctx = this.ctx;
    ctx.fillStyle = "#020608";
    ctx.fillRect(0, 0, this.W, this.H);

    // stars
    ctx.fillStyle = "#1a3040";
    for (let i = 0; i < 40; i++) {
      const x = (i * 47) % this.W;
      const y = (i * 97 + Math.floor(performance.now() / 50) * ((i % 3) + 1)) % this.H;
      ctx.fillRect(x, y, 1, 1);
    }

    if (this.jackpotLabel) {
      ctx.fillStyle = "rgba(255,100,0,0.9)";
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "right";
      ctx.fillText(this.jackpotLabel, this.W - 6, 12);
      ctx.textAlign = "left";
    }

    if (this.phase === "title") {
      ctx.fillStyle = "#ff5a1f";
      ctx.font = "bold 22px monospace";
      ctx.textAlign = "center";
      ctx.fillText("CHAIN INVADERS", this.W / 2, this.H / 2 - 30);
      ctx.fillStyle = "#9ae6b4";
      ctx.font = "11px monospace";
      ctx.fillText("Defend the Emberchain", this.W / 2, this.H / 2 - 8);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px monospace";
      ctx.fillText("PRESS START / ENTER", this.W / 2, this.H / 2 + 28);
      ctx.fillStyle = "#888";
      ctx.font = "9px monospace";
      ctx.fillText("← → move · Z/X/A fire", this.W / 2, this.H / 2 + 48);
      ctx.textAlign = "left";
      return;
    }

    // HUD
    ctx.fillStyle = "#ffb347";
    ctx.font = "10px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`SCORE ${this.score}`, 6, 12);
    ctx.fillText(`WAVE ${this.wave}`, 6, 24);
    ctx.fillText(`❤ ${Math.max(0, this.lives)}`, this.W - 36, 24);

    // invaders
    for (const inv of this.invaders) {
      if (!inv.alive) continue;
      const blink = Math.floor(performance.now() / 200) % 2;
      ctx.fillStyle = inv.row % 2 === 0 ? "#5eead4" : "#fb7185";
      ctx.fillRect(inv.x - 8, inv.y - 6, 16, 12);
      ctx.fillStyle = "#021015";
      ctx.fillRect(inv.x - 4, inv.y - 2, 3, 3);
      ctx.fillRect(inv.x + 1, inv.y - 2, 3, 3);
      if (blink) {
        ctx.fillStyle = inv.row % 2 === 0 ? "#5eead4" : "#fb7185";
        ctx.fillRect(inv.x - 10, inv.y + 4, 4, 3);
        ctx.fillRect(inv.x + 6, inv.y + 4, 4, 3);
      }
    }

    // player
    if (this.playerAlive) {
      ctx.fillStyle = this.flash > 0 ? "#fff" : "#f97316";
      ctx.beginPath();
      ctx.moveTo(this.playerX, this.H - 28);
      ctx.lineTo(this.playerX - 10, this.H - 14);
      ctx.lineTo(this.playerX + 10, this.H - 14);
      ctx.closePath();
      ctx.fill();
    }

    // bullets
    for (const b of this.bullets) {
      ctx.fillStyle = b.fromPlayer ? "#fde68a" : "#ef4444";
      ctx.fillRect(b.x - 1, b.y - 4, 2, 8);
    }

    // particles
    for (const p of this.particles) {
      ctx.fillStyle = `rgba(255,180,60,${Math.max(0, p.life)})`;
      ctx.fillRect(p.x, p.y, 2, 2);
    }

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.35})`;
      ctx.fillRect(0, 0, this.W, this.H);
    }

    if (this.phase === "paused") {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 16px monospace";
      ctx.textAlign = "center";
      ctx.fillText("PAUSED", this.W / 2, this.H / 2);
      ctx.textAlign = "left";
    }

    if (this.phase === "gameover") {
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.fillStyle = "#ff5a1f";
      ctx.font = "bold 18px monospace";
      ctx.textAlign = "center";
      ctx.fillText("GAME OVER", this.W / 2, this.H / 2 - 16);
      ctx.fillStyle = "#fff";
      ctx.font = "12px monospace";
      ctx.fillText(`SCORE ${this.score}`, this.W / 2, this.H / 2 + 6);
      ctx.fillStyle = "#9ae6b4";
      ctx.font = "10px monospace";
      ctx.fillText("PRESS START / ENTER", this.W / 2, this.H / 2 + 28);
      ctx.textAlign = "left";
    }
  }
}

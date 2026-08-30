/**
 * Ember Lotto — ticket storage, draws, and referral tracking.
 */

import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[lotto-db] Pool error:', err.message);
});

export const LOTTO_NUMBER_MIN = Number(process.env.LOTTO_NUMBER_MIN ?? '1');
export const LOTTO_NUMBER_MAX = Number(process.env.LOTTO_NUMBER_MAX ?? '49');
export const LOTTO_NUMBERS_PER_TICKET = Number(process.env.LOTTO_NUMBERS_PER_TICKET ?? '5');
export const LOTTO_TICKET_PRICE_EMBR = Number(process.env.LOTTO_TICKET_PRICE_EMBR ?? '1');
export const LOTTO_REFERRAL_BONUS_PCT = Number(process.env.LOTTO_REFERRAL_BONUS_PCT ?? '10');
export const LOTTO_JACKPOT_PCT = Number(process.env.LOTTO_JACKPOT_PCT ?? '80');
export const LOTTO_DRAW_DURATION_MS = Number(process.env.LOTTO_DRAW_DURATION_MS ?? String(7 * 24 * 60 * 60 * 1000));

const TICKET_PRICE_WEI = BigInt(Math.floor(LOTTO_TICKET_PRICE_EMBR * 1e18));

export function ticketPriceWei(): bigint {
  return TICKET_PRICE_WEI;
}

export function currentDrawId(now = Date.now()): number {
  return Math.floor(now / LOTTO_DRAW_DURATION_MS);
}

export function drawClosesAt(drawId: number): Date {
  return new Date((drawId + 1) * LOTTO_DRAW_DURATION_MS);
}

export async function ensureLottoTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lotto_draws (
      draw_id          INTEGER      PRIMARY KEY,
      winning_numbers  INTEGER[]    NULL,
      drawn_at         TIMESTAMPTZ  NULL,
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS lotto_tickets (
      id               SERIAL       PRIMARY KEY,
      draw_id          INTEGER      NOT NULL,
      player           TEXT         NOT NULL,
      numbers          INTEGER[]    NOT NULL,
      tx_hash          TEXT         NOT NULL UNIQUE,
      referrer         TEXT         NULL,
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS lotto_tickets_draw_player_idx
      ON lotto_tickets(draw_id, player);

    CREATE INDEX IF NOT EXISTS lotto_tickets_referrer_idx
      ON lotto_tickets(referrer);
  `);
}

export interface LottoTicketRow {
  id: number;
  draw_id: number;
  player: string;
  numbers: number[];
  tx_hash: string;
  referrer: string | null;
  created_at: Date;
}

function normalizeAddress(addr: string): string {
  return addr.trim().toLowerCase();
}

function validateNumbers(numbers: number[]): void {
  if (numbers.length !== LOTTO_NUMBERS_PER_TICKET) {
    throw new Error(`Pick exactly ${LOTTO_NUMBERS_PER_TICKET} numbers`);
  }
  const sorted = [...numbers].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i]!;
    if (!Number.isInteger(n) || n < LOTTO_NUMBER_MIN || n > LOTTO_NUMBER_MAX) {
      throw new Error(`Numbers must be integers between ${LOTTO_NUMBER_MIN} and ${LOTTO_NUMBER_MAX}`);
    }
    if (i > 0 && sorted[i - 1] === n) {
      throw new Error('Duplicate numbers are not allowed');
    }
  }
}

export async function insertTicket(input: {
  drawId: number;
  player: string;
  numbers: number[];
  txHash: string;
  referrer?: string | null;
}): Promise<LottoTicketRow> {
  validateNumbers(input.numbers);
  const player = normalizeAddress(input.player);
  const txHash = input.txHash.toLowerCase();
  const referrer = input.referrer ? normalizeAddress(input.referrer) : null;

  if (referrer && referrer === player) {
    throw new Error('Cannot refer yourself');
  }

  const sortedNumbers = [...input.numbers].sort((a, b) => a - b);

  const { rows } = await pool.query<LottoTicketRow>(
    `INSERT INTO lotto_tickets (draw_id, player, numbers, tx_hash, referrer)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, draw_id, player, numbers, tx_hash, referrer, created_at`,
    [input.drawId, player, sortedNumbers, txHash, referrer],
  );
  return rows[0]!;
}

export async function getTicketByTxHash(txHash: string): Promise<LottoTicketRow | null> {
  const { rows } = await pool.query<LottoTicketRow>(
    `SELECT id, draw_id, player, numbers, tx_hash, referrer, created_at
     FROM lotto_tickets WHERE tx_hash = $1`,
    [txHash.toLowerCase()],
  );
  return rows[0] ?? null;
}

export async function countTickets(drawId: number): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM lotto_tickets WHERE draw_id = $1`,
    [drawId],
  );
  return Number(rows[0]?.count ?? '0');
}

export async function listTickets(drawId: number, player?: string): Promise<LottoTicketRow[]> {
  if (player) {
    const { rows } = await pool.query<LottoTicketRow>(
      `SELECT id, draw_id, player, numbers, tx_hash, referrer, created_at
       FROM lotto_tickets
       WHERE draw_id = $1 AND player = $2
       ORDER BY created_at DESC`,
      [drawId, normalizeAddress(player)],
    );
    return rows;
  }
  const { rows } = await pool.query<LottoTicketRow>(
    `SELECT id, draw_id, player, numbers, tx_hash, referrer, created_at
     FROM lotto_tickets WHERE draw_id = $1 ORDER BY created_at DESC`,
    [drawId],
  );
  return rows;
}

export async function getDraw(drawId: number): Promise<{ winning_numbers: number[] | null; drawn_at: Date | null } | null> {
  const { rows } = await pool.query<{ winning_numbers: number[] | null; drawn_at: Date | null }>(
    `SELECT winning_numbers, drawn_at FROM lotto_draws WHERE draw_id = $1`,
    [drawId],
  );
  return rows[0] ?? null;
}

export async function setDrawWinningNumbers(drawId: number, winningNumbers: number[]): Promise<void> {
  await pool.query(
    `INSERT INTO lotto_draws (draw_id, winning_numbers, drawn_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (draw_id) DO UPDATE
       SET winning_numbers = EXCLUDED.winning_numbers,
           drawn_at = COALESCE(lotto_draws.drawn_at, NOW())`,
    [drawId, winningNumbers],
  );
}

export function countMatches(numbers: number[], winning: number[]): number {
  const winSet = new Set(winning);
  return numbers.filter((n) => winSet.has(n)).length;
}

export async function getReferralStats(address: string): Promise<{ referralCount: number; bonusWei: bigint }> {
  const addr = normalizeAddress(address);
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM lotto_tickets WHERE referrer = $1`,
    [addr],
  );
  const referralCount = Number(rows[0]?.count ?? '0');
  const bonusWei =
    (BigInt(referralCount) * ticketPriceWei() * BigInt(LOTTO_REFERRAL_BONUS_PCT)) / 100n;
  return { referralCount, bonusWei };
}

export function formatEmbrFromWei(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const frac = wei % 10n ** 18n;
  const frac4 = frac.toString().padStart(18, '0').slice(0, 4);
  return `${whole}.${frac4}`;
}

export function jackpotEmbrForTicketCount(ticketCount: number): string {
  const poolWei =
    (BigInt(ticketCount) * ticketPriceWei() * BigInt(LOTTO_JACKPOT_PCT)) / 100n;
  return formatEmbrFromWei(poolWei);
}

void ensureLottoTables().catch((err) => {
  console.error('[lotto-db] ensure tables failed:', err.message);
});

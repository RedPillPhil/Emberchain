/**
 * Ember Lotto API — ticket registration, draw status, referrals.
 *
 * GET  /api/lotto/config
 * GET  /api/lotto/status
 * GET  /api/lotto/tickets
 * POST /api/lotto/tickets
 * GET  /api/lotto/referrals/:address
 */

import { Router, type Request, type Response } from 'express';
import { createHmac } from 'crypto';
import {
  LOTTO_NUMBER_MIN,
  LOTTO_NUMBER_MAX,
  LOTTO_NUMBERS_PER_TICKET,
  LOTTO_TICKET_PRICE_EMBR,
  LOTTO_REFERRAL_BONUS_PCT,
  currentDrawId,
  drawClosesAt,
  countTickets,
  formatEmbrFromWei,
  getDraw,
  getReferralStats,
  getTicketByTxHash,
  insertTicket,
  jackpotEmbrForTicketCount,
  listTickets,
  setDrawWinningNumbers,
  countMatches,
  ticketPriceWei,
} from '../lib/lotto-db';
import { verifyLottoPayment } from '../lib/lotto-verifier';

const router = Router();

function treasuryAddress(): string | null {
  const addr = (process.env.LOTTO_TREASURY_ADDRESS ?? '').trim();
  return /^0x[0-9a-fA-F]{40}$/.test(addr) ? addr.toLowerCase() : null;
}

function drawSecret(): string {
  return (
    process.env.LOTTO_DRAW_SECRET ||
    process.env.CHAIN_INVADERS_SIGNER_KEY ||
    process.env.GAME_SIGNER_PRIVATE_KEY ||
    'ember-lotto-dev-draw-secret'
  );
}

function generateWinningNumbers(drawId: number): number[] {
  const picked = new Set<number>();
  let counter = 0;
  while (picked.size < LOTTO_NUMBERS_PER_TICKET) {
    const digest = createHmac('sha256', drawSecret())
      .update(`draw:${drawId}:${counter}`)
      .digest();
    const n = (digest.readUInt32BE(0) % (LOTTO_NUMBER_MAX - LOTTO_NUMBER_MIN + 1)) + LOTTO_NUMBER_MIN;
    picked.add(n);
    counter += 1;
  }
  return [...picked].sort((a, b) => a - b);
}

async function resolveDraw(drawId: number) {
  const now = Date.now();
  const closesAt = drawClosesAt(drawId);
  const isPast = now >= closesAt.getTime();

  let draw = await getDraw(drawId);
  if (isPast && (!draw || !draw.winning_numbers)) {
    const winning = generateWinningNumbers(drawId);
    await setDrawWinningNumbers(drawId, winning);
    draw = { winning_numbers: winning, drawn_at: new Date() };
  }

  const ticketCount = await countTickets(drawId);
  return {
    drawId,
    ticketCount,
    jackpotEmbr: jackpotEmbrForTicketCount(ticketCount),
    closesAt: closesAt.toISOString(),
    winningNumbers: draw?.winning_numbers ?? null,
    drawn: Boolean(draw?.winning_numbers),
  };
}

router.get('/lotto/config', (_req: Request, res: Response) => {
  res.json({
    ticketPriceEmbr: LOTTO_TICKET_PRICE_EMBR,
    ticketPriceWei: ticketPriceWei().toString(),
    treasuryAddress: treasuryAddress(),
    numberMin: LOTTO_NUMBER_MIN,
    numberMax: LOTTO_NUMBER_MAX,
    numbersPerTicket: LOTTO_NUMBERS_PER_TICKET,
    referralBonusPct: LOTTO_REFERRAL_BONUS_PCT,
  });
});

router.get('/lotto/status', async (req: Request, res: Response) => {
  try {
    const drawId =
      req.query.drawId != null && req.query.drawId !== ''
        ? Number(req.query.drawId)
        : currentDrawId();
    if (!Number.isFinite(drawId) || drawId < 0) {
      res.status(400).json({ error: 'Invalid drawId' });
      return;
    }
    res.json(await resolveDraw(Math.floor(drawId)));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Status failed' });
  }
});

router.get('/lotto/tickets', async (req: Request, res: Response) => {
  try {
    const address = typeof req.query.address === 'string' ? req.query.address : '';
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      res.status(400).json({ error: 'address query param required' });
      return;
    }
    const drawId =
      req.query.drawId != null && req.query.drawId !== ''
        ? Number(req.query.drawId)
        : currentDrawId();
    if (!Number.isFinite(drawId)) {
      res.status(400).json({ error: 'Invalid drawId' });
      return;
    }

    const status = await resolveDraw(Math.floor(drawId));
    const rows = await listTickets(Math.floor(drawId), address);
    const tickets = rows.map((row) => ({
      id: row.id,
      drawId: row.draw_id,
      player: row.player,
      numbers: row.numbers,
      txHash: row.tx_hash,
      referrer: row.referrer,
      createdAt: row.created_at.toISOString(),
      matches:
        status.winningNumbers != null
          ? countMatches(row.numbers, status.winningNumbers)
          : null,
    }));
    res.json({ tickets });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'List tickets failed' });
  }
});

router.post('/lotto/tickets', async (req: Request, res: Response) => {
  try {
    const treasury = treasuryAddress();
    if (!treasury) {
      res.status(503).json({
        error: 'Lotto treasury not configured — set LOTTO_TREASURY_ADDRESS on api-server',
      });
      return;
    }

    const { player, numbers, txHash, referrer } = req.body ?? {};
    if (
      typeof player !== 'string' ||
      !/^0x[0-9a-fA-F]{40}$/.test(player) ||
      typeof txHash !== 'string' ||
      !/^0x[0-9a-fA-F]{64}$/.test(txHash) ||
      !Array.isArray(numbers)
    ) {
      res.status(400).json({ error: 'Invalid ticket payload' });
      return;
    }

    const existing = await getTicketByTxHash(txHash);
    if (existing) {
      res.status(409).json({ error: 'Ticket already registered for this transaction' });
      return;
    }

    const drawId = currentDrawId();
    const status = await resolveDraw(drawId);
    if (status.drawn) {
      res.status(400).json({ error: 'Current draw is closed — wait for the next draw' });
      return;
    }

    const verified = await verifyLottoPayment(txHash, treasury, ticketPriceWei());
    if (verified.from !== player.toLowerCase()) {
      res.status(400).json({ error: 'Transaction sender does not match player address' });
      return;
    }

    const row = await insertTicket({
      drawId,
      player,
      numbers: numbers.map(Number),
      txHash,
      referrer: typeof referrer === 'string' ? referrer : null,
    });

    res.status(201).json({
      id: row.id,
      drawId: row.draw_id,
      player: row.player,
      numbers: row.numbers,
      txHash: row.tx_hash,
      referrer: row.referrer,
      createdAt: row.created_at.toISOString(),
      matches: null,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Register ticket failed' });
  }
});

router.get('/lotto/referrals/:address', async (req: Request, res: Response) => {
  try {
    const raw = req.params.address;
    const address = typeof raw === 'string' ? raw : raw?.[0] ?? '';
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      res.status(400).json({ error: 'Invalid address' });
      return;
    }
    const stats = await getReferralStats(address);
    res.json({
      address: address.toLowerCase(),
      referralCount: stats.referralCount,
      bonusEmbr: formatEmbrFromWei(stats.bonusWei),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Referral stats failed' });
  }
});

export default router;

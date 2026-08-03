/**
 * Chain Invaders score signing (ECDSA game-server signatures).
 *
 * The api-server holds GAME_SIGNER_PRIVATE_KEY and signs:
 *   keccak256(abi.encodePacked(player, dayId, score, playHash))
 *
 * The ChainInvaders contract recovers the signer with ECDSA and rejects
 * anything not signed by `gameSigner`. Players cannot forge rewards.
 *
 * POST /api/chain-invaders/attest
 * GET  /api/chain-invaders/signer
 */

import { Router, type Request, type Response } from "express";
import { Wallet, keccak256, solidityPacked, getBytes } from "ethers";

const router = Router();

const MAX_SCORE_PER_SEC = 80;
const MIN_DURATION_MS = 8_000;
const MAX_SCORE = 500_000;

function getGameSigner(): Wallet | null {
  const key = (
    process.env.CHAIN_INVADERS_SIGNER_KEY ||
    process.env.GAME_SIGNER_PRIVATE_KEY ||
    process.env.CHAIN_INVADERS_ORACLE_KEY ||
    ""
  ).trim();
  if (!key) return null;
  try {
    return new Wallet(key.startsWith("0x") ? key : `0x${key}`);
  } catch {
    return null;
  }
}

router.get("/chain-invaders/signer", (_req: Request, res: Response) => {
  const signer = getGameSigner();
  res.json({
    configured: Boolean(signer),
    address: signer?.address ?? null,
  });
});

/** @deprecated Prefer /signer — kept so older clients still resolve. */
router.get("/chain-invaders/oracle", (_req: Request, res: Response) => {
  const signer = getGameSigner();
  res.json({
    configured: Boolean(signer),
    address: signer?.address ?? null,
  });
});

router.post("/chain-invaders/attest", async (req: Request, res: Response) => {
  try {
    const signer = getGameSigner();
    if (!signer) {
      res.status(503).json({
        error:
          "Game signer not configured — set CHAIN_INVADERS_SIGNER_KEY (ECDSA private key) on api-server",
      });
      return;
    }

    const { player, dayId, score, playHash, seed, durationMs, kills } = req.body ?? {};

    if (
      typeof player !== "string" ||
      !/^0x[0-9a-fA-F]{40}$/.test(player) ||
      typeof playHash !== "string" ||
      !/^0x[0-9a-fA-F]{64}$/.test(playHash) ||
      typeof seed !== "string" ||
      seed.length < 4
    ) {
      res.status(400).json({ error: "Invalid player / playHash / seed" });
      return;
    }

    const scoreN = Number(score);
    const dayN = Number(dayId);
    const dur = Number(durationMs);
    const killN = Number(kills ?? 0);

    if (!Number.isFinite(scoreN) || scoreN <= 0 || scoreN > MAX_SCORE) {
      res.status(400).json({ error: "Score out of range" });
      return;
    }
    if (!Number.isFinite(dayN) || dayN < 0) {
      res.status(400).json({ error: "Invalid dayId" });
      return;
    }
    if (!Number.isFinite(dur) || dur < MIN_DURATION_MS) {
      res.status(400).json({
        error: `Play too short — minimum ${MIN_DURATION_MS / 1000}s`,
      });
      return;
    }

    const maxByTime = Math.ceil((dur / 1000) * MAX_SCORE_PER_SEC) + 200;
    if (scoreN > maxByTime) {
      res.status(400).json({ error: "Score exceeds honest play ceiling for duration" });
      return;
    }
    if (killN > 0 && scoreN > killN * 80 + 500) {
      res.status(400).json({ error: "Score inconsistent with kill count" });
      return;
    }

    const digest = keccak256(
      solidityPacked(
        ["address", "uint256", "uint256", "bytes32"],
        [player, BigInt(Math.floor(dayN)), BigInt(Math.floor(scoreN)), playHash],
      ),
    );

    // ethers signMessage applies the Ethereum signed-message prefix —
    // matches MessageHashUtils.toEthSignedMessageHash on-chain.
    const signature = await signer.signMessage(getBytes(digest));

    res.json({
      signature,
      attestation: signature, // alias for older clients
      signer: signer.address,
      digest,
      player,
      dayId: Math.floor(dayN),
      score: Math.floor(scoreN),
      playHash,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Signing failed",
    });
  }
});

export default router;

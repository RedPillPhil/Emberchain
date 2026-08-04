/**
 * Chain Invaders on-chain helpers — calldata encoding + jackpot reads.
 */

import { keccak256 } from "ethereum-cryptography/keccak.js";
import { hexToBytes, bytesToHex } from "ethereum-cryptography/utils.js";

function envAddress(value: string | undefined, fallback: string): string {
  return (value ?? fallback).trim().replace(/^=+/, "");
}

/** Set after deploy via VITE_CHAIN_INVADERS_ADDRESS */
export const CHAIN_INVADERS_ADDRESS = envAddress(
  import.meta.env.VITE_CHAIN_INVADERS_ADDRESS,
  "",
);

export const ENTRY_FEE_WEI = 500n * 10n ** 18n;

function fnSelector(sig: string): string {
  const hash = keccak256(new TextEncoder().encode(sig));
  return bytesToHex(hash).slice(0, 8);
}

const SEL = {
  enter: fnSelector("enter()"),
  commitScore: fnSelector("commitScore(bytes32)"),
  revealScore: fnSelector("revealScore(uint256,bytes32,bytes32,bytes)"),
  todayJackpot: fnSelector("todayJackpot()"),
  entryJackpot: fnSelector("entryJackpot()"),
  currentDayId: fnSelector("currentDayId()"),
  entryDayId: fnSelector("entryDayId()"),
  inCompetitionWindow: fnSelector("inCompetitionWindow()"),
  entered: fnSelector("entered(uint256,address)"),
  dayWindow: fnSelector("dayWindow(uint256)"),
  days_: fnSelector("days_(uint256)"),
  settleDay: fnSelector("settleDay(uint256)"),
};

function padUint(n: bigint | number): string {
  return BigInt(n).toString(16).padStart(64, "0");
}

function padBytes32(hex: string): string {
  const clean = hex.replace(/^0x/, "").toLowerCase();
  return clean.padStart(64, "0").slice(-64);
}

function padAddr(addr: string): string {
  return addr.replace(/^0x/, "").toLowerCase().padStart(64, "0");
}

export function encEnter(): string {
  return "0x" + SEL.enter;
}

export function encCommitScore(commitment: string): string {
  return "0x" + SEL.commitScore + padBytes32(commitment);
}

export function encRevealScore(
  score: bigint,
  salt: string,
  playHash: string,
  attestationHex: string,
): string {
  const attClean = attestationHex.replace(/^0x/, "");
  const attLen = attClean.length / 2;
  const head =
    padUint(score) +
    padBytes32(salt) +
    padBytes32(playHash) +
    padUint(128);
  const padding = (32 - (attLen % 32)) % 32;
  const attData = attClean + "00".repeat(padding);
  return "0x" + SEL.revealScore + head + padUint(attLen) + attData;
}

export function encTodayJackpot(): string {
  return "0x" + SEL.todayJackpot;
}

export function encEntryJackpot(): string {
  return "0x" + SEL.entryJackpot;
}

export function encCurrentDayId(): string {
  return "0x" + SEL.currentDayId;
}

export function encEntryDayId(): string {
  return "0x" + SEL.entryDayId;
}

export function encInWindow(): string {
  return "0x" + SEL.inCompetitionWindow;
}

export function encEntered(dayId: bigint, player: string): string {
  return "0x" + SEL.entered + padUint(dayId) + padAddr(player);
}

export function encDayWindow(dayId: bigint): string {
  return "0x" + SEL.dayWindow + padUint(dayId);
}

export function encDays(dayId: bigint): string {
  return "0x" + SEL.days_ + padUint(dayId);
}

export function encSettleDay(dayId: bigint): string {
  return "0x" + SEL.settleDay + padUint(dayId);
}

/** Decode days_(uint256) eth_call result. */
export function decodeDayState(hex: string): {
  pot: bigint;
  bestCumulative: bigint;
  cumulativeLeader: string;
  bestSingle: bigint;
  singleLeader: string;
  settled: boolean;
  entrants: bigint;
} | null {
  const clean = hex.replace(/^0x/i, "").toLowerCase();
  if (!clean || clean.length < 448 || clean.startsWith("08c379a0")) return null;
  const word = (i: number) => clean.slice(i * 64, i * 64 + 64);
  const addr = (i: number) => "0x" + word(i).slice(24);
  return {
    pot: BigInt("0x" + word(0)),
    bestCumulative: BigInt("0x" + word(1)),
    cumulativeLeader: addr(2),
    bestSingle: BigInt("0x" + word(3)),
    singleLeader: addr(4),
    settled: BigInt("0x" + word(5)) !== 0n,
    entrants: BigInt("0x" + word(6)),
  };
}

export function randomSalt(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return "0x" + bytesToHex(arr);
}

/** commitment = keccak256(abi.encodePacked(player, dayId, score, salt, playHash)) */
export function makeCommitment(
  player: string,
  dayId: bigint,
  score: bigint,
  salt: string,
  playHash: string,
): string {
  const addr = player.replace(/^0x/, "").toLowerCase().padStart(40, "0");
  const packed = hexToBytes(
    addr +
      padUint(dayId) +
      padUint(score) +
      padBytes32(salt) +
      padBytes32(playHash),
  );
  return "0x" + bytesToHex(keccak256(packed));
}

export function formatEmbrJackpot(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  return `${whole.toLocaleString()} EMBR`;
}

export { SEL };

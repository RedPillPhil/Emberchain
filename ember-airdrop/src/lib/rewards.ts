/** Client-side reward preview mirrors api-server airdrop-config. */

export function taskRewardEmbr(participantCount: number, multiplier = 1): number {
  const n = Math.max(1, Math.floor(participantCount));
  let base: number;
  if (n <= 10) base = 5;
  else if (n <= 25) base = 2.5;
  else if (n <= 50) base = 1.25;
  else if (n <= 100) base = 0.625;
  else if (n <= 250) base = 0.3125;
  else base = 0.15625;
  return Math.round(base * multiplier * 1e6) / 1e6;
}

export function liquidityRewardEmbr(priorDonationCount: number): number {
  return Math.round(500 * 0.99 ** Math.max(0, priorDonationCount) * 1e6) / 1e6;
}

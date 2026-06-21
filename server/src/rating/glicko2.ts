/**
 * Glicko-2 rating system (Mark Glickman). Implemented per the reference paper.
 * We treat each rated game as a rating period of one game, which is the common
 * online-chess approach (Lichess does effectively the same).
 */

const SCALE = 173.7178;
const TAU = 0.5; // system constant, constrains volatility change
const EPSILON = 1e-6;

export interface Glicko {
  rating: number; // r
  deviation: number; // RD
  volatility: number; // sigma
}

export interface Opponent {
  rating: number;
  deviation: number;
  /** score against this opponent: 1 win, 0.5 draw, 0 loss */
  score: number;
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expectation(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

export function updateGlicko(player: Glicko, opponents: Opponent[]): Glicko {
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.deviation / SCALE;
  const sigma = player.volatility;

  // No games in the period: only RD increases.
  if (opponents.length === 0) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return { rating: player.rating, deviation: phiStar * SCALE, volatility: sigma };
  }

  // Step 3: variance v
  let vInv = 0;
  let deltaSum = 0;
  for (const opp of opponents) {
    const muJ = (opp.rating - 1500) / SCALE;
    const phiJ = opp.deviation / SCALE;
    const e = expectation(mu, muJ, phiJ);
    const gj = g(phiJ);
    vInv += gj * gj * e * (1 - e);
    deltaSum += gj * (opp.score - e);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;

  // Step 5: new volatility via Illinois algorithm
  const a = Math.log(sigma * sigma);
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * Math.pow(phi * phi + v + ex, 2);
    return num / den - (x - a) / (TAU * TAU);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k += 1;
    B = a - k * TAU;
  }

  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  const sigmaPrime = Math.exp(A / 2);

  // Step 6-7: new RD and rating
  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime = mu + phiPrime * phiPrime * deltaSum;

  return {
    rating: muPrime * SCALE + 1500,
    deviation: phiPrime * SCALE,
    volatility: sigmaPrime,
  };
}

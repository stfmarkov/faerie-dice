import {
  getFaceChances,
  type ChanceEntry,
  type DiceType,
  type PickMode,
  type ResultMode,
} from './dice';

// ways[s] = number of ways to total s with identical fair dice (faces 1..sides)
const sumWaysDistribution = (numberOfRolls: number, sides: number) => {
  let ways = [1]; // 0 dice → sum 0 has 1 way

  for (let die = 0; die < numberOfRolls; die++) {
    const next: number[] = Array(ways.length + sides).fill(0);
    for (let sum = 0; sum < ways.length; sum++) {
      if (ways[sum] === 0) {
        continue;
      }
      for (let face = 1; face <= sides; face++) {
        next[sum + face] += ways[sum];
      }
    }
    ways = next;
  }

  return ways;
};

// Chance of each face when the result is round(mean of N fair rolls).
export const averageCurveFaceChances = (sides: number, componentRolls: number) => {
  const ways = sumWaysDistribution(componentRolls, sides);
  const totalOutcomes = Math.pow(sides, componentRolls);
  const counts = Array(sides + 1).fill(0);
  const minSum = componentRolls;
  const maxSum = componentRolls * sides;

  for (let sum = minSum; sum <= maxSum; sum++) {
    const face = Math.min(sides, Math.max(1, Math.round(sum / componentRolls)));
    counts[face] += ways[sum] ?? 0;
  }

  return Array.from({ length: sides }, (_, i) => {
    const value = i + 1;
    return { value, chance: (counts[value] / totalOutcomes) * 100 };
  });
};

// Face probabilities as fractions (sum to 1) for the active pick mode.
// Weighted uses live weights (i.i.d. snapshot of current odds).
// Multi-die weighted rolls still update memory between dice while picking;
// advantage / disadvantage then keep the chance drop only on the used face,
// and drop low / drop top drop chance on each kept face in the remaining sum.
// The graph freezes tonight's chances to answer “what do reported results look like now?”
const getPickFaceProbabilities = (
  pickMode: PickMode,
  diceType: DiceType,
  averageCurveRolls: number,
) => {
  const sides = diceType.sides;
  let raw: number[];
  switch (pickMode) {
    case 'average':
      raw = averageCurveFaceChances(sides, averageCurveRolls).map(face => face.chance / 100);
      break;
    case 'weighted':
      raw = getFaceChances(diceType).map(face => face.chance / 100);
      break;
    case 'fair':
      raw = Array.from({ length: sides }, () => 1 / sides);
      break;
  }

  const total = raw.reduce((sum, chance) => sum + chance, 0);
  if (total <= 0) {
    return Array.from({ length: sides }, () => 1 / sides);
  }
  return raw.map(chance => chance / total);
};

const sumProbabilityDistribution = (
  numberOfDice: number,
  sides: number,
  faceProb: number[],
) => {
  // Convolution of identical independent face distributions
  let mass = [1]; // 0 dice → sum 0 with probability 1
  for (let die = 0; die < numberOfDice; die++) {
    const next: number[] = Array(mass.length + sides).fill(0);
    for (let sum = 0; sum < mass.length; sum++) {
      if (mass[sum] === 0) {
        continue;
      }
      for (let face = 1; face <= sides; face++) {
        next[sum + face] += mass[sum] * faceProb[face - 1];
      }
    }
    mass = next;
  }

  const minValue = numberOfDice;
  const maxValue = numberOfDice * sides;
  const distribution: ChanceEntry[] = [];

  for (let value = minValue; value <= maxValue; value++) {
    distribution.push({
      value,
      chance: (mass[value] ?? 0) * 100,
    });
  }

  return distribution;
};

// Keep highest: P(max = k) = F(k)^n - F(k-1)^n
const advantageProbabilityDistribution = (
  dicePerRoll: number,
  sides: number,
  faceProb: number[],
) => {
  const distribution: ChanceEntry[] = [];
  let cdf = 0;

  for (let value = 1; value <= sides; value++) {
    const prevCdf = cdf;
    cdf += faceProb[value - 1];
    const ways = Math.pow(cdf, dicePerRoll) - Math.pow(prevCdf, dicePerRoll);
    distribution.push({
      value,
      chance: ways * 100,
    });
  }

  return distribution;
};

// Keep lowest: P(min = k) = S(k)^n - S(k+1)^n where S(k) = P(X >= k)
const disadvantageProbabilityDistribution = (
  dicePerRoll: number,
  sides: number,
  faceProb: number[],
) => {
  const distribution: ChanceEntry[] = [];
  let survival = 1;

  for (let value = 1; value <= sides; value++) {
    const nextSurvival = survival - faceProb[value - 1];
    const ways = Math.pow(survival, dicePerRoll) - Math.pow(Math.max(0, nextSurvival), dicePerRoll);
    distribution.push({
      value,
      chance: ways * 100,
    });
    survival = nextSurvival;
  }

  return distribution;
};

// P(X = c) for X ~ Binomial(n, p), stable enough for n up to 100.
const binomialProbs = (n: number, p: number) => {
  const probs = new Float64Array(n + 1);
  if (n === 0 || p <= 0) {
    probs[0] = 1;
    return probs;
  }
  if (p >= 1) {
    probs[n] = 1;
    return probs;
  }

  const logP = Math.log(p);
  const logQ = Math.log(1 - p);
  const logs = new Float64Array(n + 1);
  let logC = 0;
  let maxLog = -Infinity;
  for (let c = 0; c <= n; c++) {
    logs[c] = logC + c * logP + (n - c) * logQ;
    if (logs[c] > maxLog) {
      maxLog = logs[c];
    }
    if (c < n) {
      logC += Math.log(n - c) - Math.log(c + 1);
    }
  }

  let total = 0;
  for (let c = 0; c <= n; c++) {
    probs[c] = Math.exp(logs[c] - maxLog);
    total += probs[c];
  }
  if (total > 0) {
    for (let c = 0; c <= n; c++) {
      probs[c] /= total;
    }
  }
  return probs;
};

const addScaledMass = (target: Float64Array, source: Float64Array, shift: number, scale: number) => {
  if (scale === 0) {
    return;
  }
  for (let sum = 0; sum < source.length; sum++) {
    const mass = source[sum];
    if (mass !== 0) {
      target[sum + shift] += mass * scale;
    }
  }
};

// Drop the single lowest or highest die, then sum the rest.
const dropKeepSumProbabilityDistribution = (
  dropHighest: boolean,
  n: number,
  sides: number,
  faceProb: number[],
) => {
  const keep = n - 1;
  if (keep < 1) {
    return [];
  }

  const maxSum = keep * sides;
  const cost = sides * keep * keep * maxSum;
  if (cost > 8_000_000) {
    return [];
  }

  const faceOrder = dropHighest
    ? Array.from({ length: sides }, (_, i) => i + 1)
    : Array.from({ length: sides }, (_, i) => sides - i);

  let continuing: Float64Array[] = Array.from({ length: keep }, () => new Float64Array(0));
  continuing[0] = new Float64Array(1);
  continuing[0][0] = 1;
  const finalized = new Float64Array(maxSum + 1);

  for (let index = 0; index < faceOrder.length; index++) {
    const face = faceOrder[index];
    let pRemaining = 0;
    for (let later = index; later < faceOrder.length; later++) {
      pRemaining += faceProb[faceOrder[later] - 1];
    }
    const pEqual = faceProb[face - 1];
    const pRest = pRemaining - pEqual;
    let pThis = 0;
    if (pRemaining > 0) {
      pThis = pRest <= 1e-15 ? 1 : pEqual / pRemaining;
    }

    const nextContinuing: Float64Array[] = Array.from({ length: keep }, () => new Float64Array(0));

    for (let kept = 0; kept < keep; kept++) {
      const mass = continuing[kept];
      if (mass.length === 0) {
        continue;
      }

      const slotsLeft = keep - kept;
      const remainingDice = n - kept;
      if (remainingDice <= 0) {
        continue;
      }

      const binom = binomialProbs(remainingDice, pThis);
      let pFinalize = 0;
      for (let count = slotsLeft; count <= remainingDice; count++) {
        pFinalize += binom[count];
      }
      if (pFinalize > 0) {
        addScaledMass(finalized, mass, face * slotsLeft, pFinalize);
      }

      for (let count = 0; count < slotsLeft && count <= remainingDice; count++) {
        const pCount = binom[count];
        if (pCount === 0) {
          continue;
        }
        const nextKept = kept + count;
        const nextLen = mass.length + face * count;
        if (nextContinuing[nextKept].length < nextLen) {
          const grown = new Float64Array(nextLen);
          grown.set(nextContinuing[nextKept]);
          nextContinuing[nextKept] = grown;
        }
        addScaledMass(nextContinuing[nextKept], mass, face * count, pCount);
      }
    }

    continuing = nextContinuing;
  }

  const minValue = keep;
  const distribution: ChanceEntry[] = [];
  for (let value = minValue; value <= maxSum; value++) {
    distribution.push({
      value,
      chance: (finalized[value] ?? 0) * 100,
    });
  }
  return distribution;
};

const aggregatedChanceByMode = (
  resultMode: ResultMode,
  dicePerRoll: number,
  sides: number,
  faceProb: number[],
): ChanceEntry[] => {
  switch (resultMode) {
    case 'sum':
      return sumProbabilityDistribution(dicePerRoll, sides, faceProb);
    case 'advantage':
      return advantageProbabilityDistribution(dicePerRoll, sides, faceProb);
    case 'disadvantage':
      return disadvantageProbabilityDistribution(dicePerRoll, sides, faceProb);
    case 'drop-lowest':
      return dropKeepSumProbabilityDistribution(false, dicePerRoll, sides, faceProb);
    case 'drop-highest':
      return dropKeepSumProbabilityDistribution(true, dicePerRoll, sides, faceProb);
  }
};

const applyModifierToDistribution = (entries: ChanceEntry[], modifier: number) => {
  if (modifier === 0) {
    return entries;
  }
  return entries.map(entry => ({ value: entry.value + modifier, chance: entry.chance }));
};

export const getReportedDistribution = (input: {
  resultMode: ResultMode | null;
  pickMode: PickMode;
  diceType: DiceType;
  dicePerRoll: number;
  modifier: number;
  averageCurveRolls: number;
}) => {
  const { resultMode, pickMode, diceType, dicePerRoll, modifier, averageCurveRolls } = input;

  if (resultMode) {
    const faceProb = getPickFaceProbabilities(pickMode, diceType, averageCurveRolls);
    return applyModifierToDistribution(
      aggregatedChanceByMode(resultMode, dicePerRoll, diceType.sides, faceProb),
      modifier,
    );
  }
  if (pickMode === 'average') {
    return applyModifierToDistribution(
      averageCurveFaceChances(diceType.sides, averageCurveRolls),
      modifier,
    );
  }
  return applyModifierToDistribution(getFaceChances(diceType), modifier);
};

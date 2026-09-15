export type Modifier = {
  value: number;
  modifierValue: number;
};

export type DiceType = {
  name: string;
  sides: number;
  modifiers: Modifier[];
};

export type PickMode = 'fair' | 'weighted' | 'average';

export type HistoryRoll = {
  die: string;
  value: number;
  detail?: string;
};

export type ResultMode = 'advantage' | 'disadvantage' | 'sum' | 'drop-lowest' | 'drop-highest';

export type ChanceEntry = { value: number, chance: number };

type Aggregation = {
  label: string;
  configLabel: string;
  graphLabel: string;
  historyDetail: (faces: number[]) => string;
  keptFaces: (faces: number[]) => number[];
  rememberKeptOnly: boolean;
};

export const diceTypes: DiceType[] = [
  {
    name: "d4",
    sides: 4,
    modifiers: [],
  },
  {
    name: "d6",
    sides: 6,
    modifiers: [],
  },
  {
    name: "d8",
    sides: 8,
    modifiers: [],
  },
  {
    name: "d10",
    sides: 10,
    modifiers: [],
  },
  {
    name: "d12",
    sides: 12,
    modifiers: [],
  },
  {
    name: "d20",
    sides: 20,
    modifiers: [],
  },
  {
    name: "d100",
    sides: 100,
    modifiers: [],
  },
];

export const getChance = (diceType: DiceType) => {
  return 100 / diceType.sides;
};

const getFaceChance = (diceType: DiceType, value: number) => {
  const chance = diceType.modifiers.find(m => m.value === value)?.modifierValue ?? getChance(diceType);
  return Math.max(0, chance);
};

const getBaseModifier = (diceType: DiceType, weightedDropPercent: number) => {
  return getChance(diceType) * (weightedDropPercent / 100);
};

const ensureFaceModifier = (diceTypeIndex: number, diceType: DiceType, value: number) => {
  const existing = diceTypes[diceTypeIndex].modifiers.find(m => m.value === value);
  if (existing) {
    return existing;
  }
  const created = { value, modifierValue: getChance(diceType) };
  diceTypes[diceTypeIndex].modifiers.push(created);
  return created;
};

export const modifyValues = (diceType: DiceType, rolledValue: number, weightedDropPercent: number) => {
  // Value memory: reduce the rolled face (never below 0) and move that mass
  // to the opposite high/low group. Same-group faces are left unchanged.
  const diceTypeIndex = diceTypes.findIndex(d => d.name === diceType.name);
  const sides = diceType.sides;
  const groupThreshold = sides / 2;
  const isHigh = (value: number) => value > groupThreshold;

  for (let value = 1; value <= sides; value++) {
    ensureFaceModifier(diceTypeIndex, diceType, value);
  }

  const rolledMod = diceTypes[diceTypeIndex].modifiers.find(m => m.value === rolledValue)!;
  const available = Math.max(0, rolledMod.modifierValue);
  rolledMod.modifierValue = available;

  const desiredDrop = getBaseModifier(diceType, weightedDropPercent);
  const actualDrop = Math.min(desiredDrop, available);

  if (actualDrop <= 0) {
    return;
  }

  rolledMod.modifierValue -= actualDrop;

  // Existing split: each face is notionally owed actualDrop/sides from value
  // memory; same-group cancels that, opposite-group receives it twice → all of
  // actualDrop lands on the opposite high/low group.
  const restShare = actualDrop / sides;

  for (let value = 1; value <= sides; value++) {
    if (value === rolledValue) {
      continue;
    }
    const sameGroup = isHigh(value) === isHigh(rolledValue);
    if (sameGroup) {
      continue;
    }
    diceTypes[diceTypeIndex].modifiers.find(m => m.value === value)!.modifierValue += 2 * restShare;
  }
};

const rollFair = (diceType: DiceType) => {
  return Math.floor(Math.random() * diceType.sides) + 1;
};

export const cloneModifiers = (modifiers: Modifier[]) =>
  modifiers.map(modifier => ({
    value: modifier.value,
    modifierValue: modifier.modifierValue,
  }));

export const snapshotModifiers = (diceType: DiceType) => cloneModifiers(diceType.modifiers);

export const restoreModifiers = (diceType: DiceType, snapshot: Modifier[]) => {
  diceType.modifiers = cloneModifiers(snapshot);
};

// Weighted pick along the 0–100% chance line, then update modifiers.
const pickWeighted = (diceType: DiceType) => {
  let roll = Math.random() * 100;

  for (let value = 1; value <= diceType.sides; value++) {
    roll -= getFaceChance(diceType, value);
    if (roll < 0) {
      return value;
    }
  }

  // Floating-point safety if chances don't sum to exactly 100
  return diceType.sides;
};

const rollWeighted = (diceType: DiceType, weightedDropPercent: number) => {
  const value = pickWeighted(diceType);
  modifyValues(diceType, value, weightedDropPercent);
  return value;
};

const rollAverage = (diceType: DiceType, componentRolls: number) => {
  let sum = 0;
  for (let i = 0; i < componentRolls; i++) {
    sum += rollFair(diceType);
  }
  return Math.round(sum / componentRolls);
};

export const pickModeMeta: Record<PickMode, { label: string; graphSuffix: string }> = {
  fair: { label: 'fair', graphSuffix: '' },
  weighted: { label: 'fairish', graphSuffix: ' (fairish)' },
  average: { label: 'average', graphSuffix: ' (average)' },
};

export const isPickMode = (value: unknown): value is PickMode =>
  typeof value === 'string' && value in pickModeMeta;

export const rollDice = (
  diceType: DiceType,
  mode: PickMode,
  options: { weightedDropPercent: number; averageCurveRolls: number },
) => {
  switch (mode) {
    case 'weighted':
      return rollWeighted(diceType, options.weightedDropPercent);
    case 'average':
      return rollAverage(diceType, options.averageCurveRolls);
    default:
      return rollFair(diceType);
  }
};

export const getFaceChances = (diceType: DiceType) => {
  return Array.from({ length: diceType.sides }, (_, i) => {
    const value = i + 1;
    return { value, chance: getFaceChance(diceType, value) };
  });
};

export const pickModeLabel = (mode: PickMode) => pickModeMeta[mode].label;

const withoutOne = (faces: number[], dropped: number) => {
  const index = faces.indexOf(dropped);
  return faces.filter((_, faceIndex) => faceIndex !== index);
};

export const aggregations: Record<ResultMode, Aggregation> = {
  advantage: {
    label: 'Advantage',
    configLabel: 'advantage',
    graphLabel: 'Advantage distribution',
    historyDetail: faces => faces.join(', '),
    keptFaces: faces => [Math.max(...faces)],
    rememberKeptOnly: true,
  },
  disadvantage: {
    label: 'Disadvantage',
    configLabel: 'disadvantage',
    graphLabel: 'Disadvantage distribution',
    historyDetail: faces => faces.join(', '),
    keptFaces: faces => [Math.min(...faces)],
    rememberKeptOnly: true,
  },
  sum: {
    label: 'Sum',
    configLabel: 'sum',
    graphLabel: 'Sum distribution',
    historyDetail: faces => `sum of ${faces.join(', ')}`,
    keptFaces: faces => faces,
    rememberKeptOnly: false,
  },
  'drop-lowest': {
    label: 'Drop low',
    configLabel: 'drop low',
    graphLabel: 'Drop low distribution',
    historyDetail: faces => `drop low of ${faces.join(', ')}`,
    keptFaces: faces => withoutOne(faces, Math.min(...faces)),
    rememberKeptOnly: true,
  },
  'drop-highest': {
    label: 'Drop top',
    configLabel: 'drop top',
    graphLabel: 'Drop top distribution',
    historyDetail: faces => `drop top of ${faces.join(', ')}`,
    keptFaces: faces => withoutOne(faces, Math.max(...faces)),
    rememberKeptOnly: true,
  },
};

export const isResultMode = (value: unknown): value is ResultMode =>
  typeof value === 'string' && value in aggregations;

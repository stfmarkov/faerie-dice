import {
  cloneModifiers,
  diceTypes,
  isPickMode,
  isResultMode,
  type DiceType,
  type HistoryRoll,
  type Modifier,
  type PickMode,
  type ResultMode,
} from './dice';

export const HISTORY_CAP = 100;
const STATE_KEY = 'fair-ish-dice-state';
const LEGACY_STATE_KEY = 'faerie-dice-state';
const STATE_VERSION = 1;

export type PersistedSettings = {
  selectedDie: string;
  pickMode: PickMode;
  resultMode: ResultMode | null;
  rollCount: number;
  dicePerRoll: number;
  modifier: number;
  weightedDropPercent: number;
  averageCurveRolls: number;
};

type PersistedState = {
  version: number;
  history: HistoryRoll[];
  weights: Record<string, Modifier[]>;
  settings: PersistedSettings;
};

export const defaultSettings = (): PersistedSettings => ({
  selectedDie: diceTypes[5].name,
  pickMode: 'weighted',
  resultMode: null,
  rollCount: 1,
  dicePerRoll: 2,
  modifier: 0,
  weightedDropPercent: 20,
  averageCurveRolls: 2,
});

export const persistState = (payload: {
  diceCatalog: DiceType[];
  selectedDice: DiceType;
  pickMode: PickMode;
  resultMode: ResultMode | null;
  history: HistoryRoll[];
  rollCount: number;
  dicePerRoll: number;
  modifier: number;
  weightedDropPercent: number;
  averageCurveRolls: number;
}) => {
  const weights: Record<string, Modifier[]> = {};
  for (const die of payload.diceCatalog) {
    if (die.modifiers.length > 0) {
      weights[die.name] = cloneModifiers(die.modifiers);
    }
  }

  const stored: PersistedState = {
    version: STATE_VERSION,
    history: payload.history.slice(-HISTORY_CAP),
    weights,
    settings: {
      selectedDie: payload.selectedDice.name,
      pickMode: payload.pickMode,
      resultMode: payload.resultMode,
      rollCount: payload.rollCount,
      dicePerRoll: payload.dicePerRoll,
      modifier: payload.modifier,
      weightedDropPercent: payload.weightedDropPercent,
      averageCurveRolls: payload.averageCurveRolls,
    },
  };

  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(stored));
  } catch {
    // Private mode or blocked storage — in-session state still works.
  }
};

const parseStoredModifiers = (raw: unknown, sides: number): Modifier[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  const byValue = new Map<number, Modifier>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as { value?: unknown; modifierValue?: unknown };
    const value = typeof record.value === 'number' ? record.value : Number(record.value);
    const modifierValue = typeof record.modifierValue === 'number'
      ? record.modifierValue
      : Number(record.modifierValue);
    if (!Number.isInteger(value) || value < 1 || value > sides || !Number.isFinite(modifierValue)) {
      continue;
    }
    byValue.set(value, { value, modifierValue: Math.max(0, modifierValue) });
  }

  return Array.from(byValue.values());
};

const parseStoredHistory = (raw: unknown, catalog: DiceType[]): HistoryRoll[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  const entries: HistoryRoll[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as { die?: unknown; value?: unknown; detail?: unknown };
    if (typeof record.die !== 'string') {
      continue;
    }
    const die = catalog.find(candidate => candidate.name === record.die);
    if (!die) {
      continue;
    }
    const value = typeof record.value === 'number' ? record.value : Number(record.value);
    if (!Number.isFinite(value)) {
      continue;
    }
    if (!Number.isInteger(value) || value < -10000 || value > 20000) {
      continue;
    }
    const entry: HistoryRoll = { die: record.die, value };
    if (typeof record.detail === 'string' && record.detail.length > 0) {
      entry.detail = record.detail;
    }
    entries.push(entry);
  }

  return entries.slice(-HISTORY_CAP);
};

const parseStoredSettings = (raw: unknown, catalog: DiceType[]): PersistedSettings => {
  const defaults = defaultSettings();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const record = raw as Partial<PersistedSettings>;
  const selectedDie = typeof record.selectedDie === 'string'
    && catalog.some(die => die.name === record.selectedDie)
    ? record.selectedDie
    : defaults.selectedDie;
  const nextPick = isPickMode(record.pickMode) ? record.pickMode : defaults.pickMode;
  let nextResult = defaults.resultMode;
  if (record.resultMode === null) {
    nextResult = null;
  } else if (isResultMode(record.resultMode)) {
    nextResult = record.resultMode;
  }

  const clamp = (value: unknown, min: number, max: number, fallback: number) => {
    const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(parsed)));
  };

  return {
    selectedDie,
    pickMode: nextPick,
    resultMode: nextResult,
    rollCount: clamp(record.rollCount, 1, 100, defaults.rollCount),
    dicePerRoll: clamp(record.dicePerRoll, 2, 100, defaults.dicePerRoll),
    modifier: clamp(record.modifier, -100, 100, defaults.modifier),
    weightedDropPercent: clamp(record.weightedDropPercent, 0, 100, defaults.weightedDropPercent),
    averageCurveRolls: clamp(record.averageCurveRolls, 2, 20, defaults.averageCurveRolls),
  };
};

export const loadPersistedState = (catalog: DiceType[]): {
  history: HistoryRoll[];
  settings: PersistedSettings;
} | null => {
  try {
    const raw = localStorage.getItem(STATE_KEY) ?? localStorage.getItem(LEGACY_STATE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (!parsed || typeof parsed !== 'object' || parsed.version !== STATE_VERSION) {
      return null;
    }

    const weights = parsed.weights && typeof parsed.weights === 'object'
      ? parsed.weights as Record<string, unknown>
      : {};
    for (const die of catalog) {
      die.modifiers = parseStoredModifiers(weights[die.name], die.sides);
    }

    return {
      history: parseStoredHistory(parsed.history, catalog),
      settings: parseStoredSettings(parsed.settings, catalog),
    };
  } catch {
    // Ignore corrupt or blocked storage; keep in-memory defaults.
    return null;
  }
};

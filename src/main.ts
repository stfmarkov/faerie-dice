import './style.css'

import {
  aggregations,
  diceTypes,
  getChance,
  getFaceChances,
  isPickMode,
  isResultMode,
  modifyValues,
  pickModeLabel,
  pickModeMeta,
  restoreModifiers,
  rollDice,
  snapshotModifiers,
  type HistoryRoll,
  type PickMode,
  type ResultMode,
} from './dice';
import { averageCurveFaceChances, getReportedDistribution } from './distribution';
import { dieIcon } from './icons';
import { createListbox } from './listbox';
import { defaultSettings, HISTORY_CAP, loadPersistedState, persistState as writePersistedState } from './persist';

// Share of a face's base chance removed when that face is rolled (weighted mode).
let weightedDropPercent = 20;

// Average of N fair rolls (default 2) → bell curve; middle common, extremes rare.
let averageCurveRolls = 2;

let selectedDice = diceTypes[5]; // d20
let lastRolls: number[] = [];
let lastReportedValues: number[] = [];
let pickMode: PickMode = 'weighted';
let resultMode: ResultMode | null = null;
const rollHistory: HistoryRoll[] = [];

const page = document.querySelector('body')!;
const byId = <T extends Element>(id: string) => page.querySelector<T>(`#${CSS.escape(id)}`)!;

const dieSelect = byId<HTMLUListElement>('die-select');
const rollsInput = byId<HTMLInputElement>('number-of-rolls');
const dicePerRollBlock = byId<HTMLElement>('dice-per-roll-block');
const dicePerRollInput = byId<HTMLInputElement>('dice-per-roll');
const modifierInput = byId<HTMLInputElement>('roll-modifier');
const rollBtn = byId<HTMLButtonElement>('roll-btn');
const resultValueEl = byId<HTMLParagraphElement>('result-value');
const resultMetaEl = byId<HTMLParagraphElement>('result-meta');
const resultDieEl = byId<HTMLElement>('result-die');
const resultDieShapeEl = byId<HTMLElement>('result-die-shape');
const weightsEl = byId<HTMLUListElement>('weights');
const aggregatedGraphEl = byId<HTMLElement>('aggregated-graph');
const aggregatedDistributionEl = byId<HTMLUListElement>('aggregated-distribution');
const aggregatedDistributionLabelEl = byId<HTMLElement>('aggregated-distribution-label');
const probabilityEl = byId<HTMLElement>('probability-drawer');
const probabilityConfigEl = byId<HTMLElement>('probability-config');
const probabilityCurrentRollEl = byId<HTMLElement>('probability-current-roll');
const targetInput = byId<HTMLInputElement>('target-number');
const targetChanceEl = byId<HTMLElement>('target-chance');
const settingsEl = byId<HTMLElement>('settings-drawer');
const averageCurveRollsInput = byId<HTMLInputElement>('average-curve-rolls');
const weightedDropSlider = byId<HTMLInputElement>('weighted-drop-slider');
const weightedDropValueEl = byId<HTMLElement>('weighted-drop-value');
const historyBtn = byId<HTMLButtonElement>('history-btn');
const historyRoot = byId<HTMLElement>('history-root');
const modeListboxRoot = byId<HTMLElement>('mode-listbox-root');
const aggregationListboxRoot = byId<HTMLElement>('aggregation-listbox-root');

const actionEl = <T extends Element>(action: string) =>
  page.querySelector<T>(`[data-action="${action}"]`);

const recordHistory = (entries: HistoryRoll[]) => {
  for (const entry of entries) {
    rollHistory.push(entry);
  }
  if (rollHistory.length > HISTORY_CAP) {
    rollHistory.splice(0, rollHistory.length - HISTORY_CAP);
  }
};

const closeHistoryModal = () => {
  historyBtn.dispatchEvent(new CustomEvent('htmx:abort', {
    bubbles: true,
    cancelable: true,
    composed: true,
    detail: { elt: historyBtn },
  }));
  historyRoot.innerHTML = '';
};

type HtmxConfigRequestDetail = {
  path: string;
  parameters: { history?: string };
};

historyBtn.addEventListener('htmx:configRequest', (event) => {
  const detail = (event as CustomEvent<HtmxConfigRequestDetail>).detail;
  if (detail.path !== '/history') {
    return;
  }
  detail.parameters.history = JSON.stringify(rollHistory);
});

historyBtn.addEventListener('htmx:responseError', closeHistoryModal);
historyBtn.addEventListener('htmx:sendError', closeHistoryModal);

const isOverlayDrawer = () => window.matchMedia('(max-width: 1399px)').matches;

const setProbabilityOpen = (open: boolean) => {
  probabilityEl.dataset.open = String(open);
  actionEl('probability-toggle')?.setAttribute('aria-expanded', String(open));
};

const setSettingsOpen = (open: boolean) => {
  settingsEl.dataset.open = String(open);
  actionEl('settings-toggle')?.setAttribute('aria-expanded', String(open));
};

type Theme = 'light' | 'dark';
const THEME_KEY = 'fair-ish-dice-theme';
const LEGACY_THEME_KEY = 'faerie-dice-theme';

const readStoredTheme = (): Theme => {
  try {
    const stored = localStorage.getItem(THEME_KEY) ?? localStorage.getItem(LEGACY_THEME_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    // Private mode or blocked storage — keep the default dark theme.
  }
  return 'dark';
};

const applyTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
  actionEl('theme-toggle')?.setAttribute('aria-checked', String(theme === 'light'));
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore persistence failures; the in-session theme still applies.
  }
};

const renderWeightedDropControl = () => {
  weightedDropSlider.value = String(weightedDropPercent);
  weightedDropSlider.setAttribute('aria-valuenow', String(weightedDropPercent));
  weightedDropSlider.setAttribute('aria-valuetext', `${weightedDropPercent} percent`);
  weightedDropValueEl.textContent = `${weightedDropPercent}%`;
};

const getAverageCurveRolls = () => {
  const value = Number.parseInt(averageCurveRollsInput.value, 10);
  if (!Number.isFinite(value) || value < 2) {
    return 2;
  }
  return Math.min(value, 20);
};

const setAverageCurveRolls = (value: number) => {
  averageCurveRolls = Math.min(20, Math.max(2, value));
  averageCurveRollsInput.value = String(averageCurveRolls);
};

const applyAverageCurveRolls = (value: number) => {
  setAverageCurveRolls(value);
  if (pickMode === 'average') {
    renderWeights();
    renderAggregatedDistribution();
  }
  persistState();
};

const renderStageDie = () => {
  resultDieEl.dataset.die = selectedDice.name;
  resultDieShapeEl.innerHTML = dieIcon(selectedDice.name);
};

const getRollCount = () => {
  const value = Number.parseInt(rollsInput.value, 10);
  if (!Number.isFinite(value) || value < 1) {
    return 1;
  }
  return Math.min(value, 100);
};

const setRollCount = (value: number) => {
  rollsInput.value = String(Math.min(100, Math.max(1, value)));
  const count = getRollCount();
  rollBtn.textContent = count === 1 ? 'Roll' : `Roll ×${count}`;
};

const usesDicePerRoll = () => resultMode !== null;

const getDicePerRoll = () => {
  const value = Number.parseInt(dicePerRollInput.value, 10);
  if (!Number.isFinite(value) || value < 2) {
    return 2;
  }
  return Math.min(value, 100);
};

const setDicePerRoll = (value: number) => {
  dicePerRollInput.value = String(Math.min(100, Math.max(2, value)));
};

const getRollModifier = () => {
  const value = Number.parseInt(modifierInput.value, 10);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(-100, value));
};

const setRollModifier = (value: number) => {
  modifierInput.value = String(Math.min(100, Math.max(-100, Math.round(value))));
};

const formatModifier = (value: number) => {
  if (value === 0) {
    return '';
  }
  return value > 0 ? `+${value}` : String(value);
};

const getTargetNumber = () => {
  const raw = targetInput.value.trim();
  if (raw === '') {
    return null;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
    return null;
  }
  return value;
};

const setTargetNumber = (value: number) => {
  targetInput.value = String(Math.min(10000, Math.max(1, Math.round(value))));
};

const stepTarget = (delta: number) => {
  const current = getTargetNumber();
  setTargetNumber(current === null ? 1 : current + delta);
  renderAggregatedDistribution();
};

const renderDicePerRollControl = () => {
  dicePerRollBlock.hidden = !usesDicePerRoll();
  if (usesDicePerRoll()) {
    setDicePerRoll(getDicePerRoll());
  }
};

const persistState = () => {
  writePersistedState({
    diceCatalog: diceTypes,
    selectedDice,
    pickMode,
    resultMode,
    history: rollHistory,
    rollCount: getRollCount(),
    dicePerRoll: getDicePerRoll(),
    modifier: getRollModifier(),
    weightedDropPercent,
    averageCurveRolls,
  });
};

const restorePersistedState = () => {
  const loaded = loadPersistedState(diceTypes);
  if (!loaded) {
    return;
  }

  rollHistory.length = 0;
  rollHistory.push(...loaded.history);

  const settings = loaded.settings;
  selectedDice = diceTypes.find(die => die.name === settings.selectedDie) ?? selectedDice;
  pickMode = settings.pickMode;
  resultMode = settings.resultMode;
  weightedDropPercent = settings.weightedDropPercent;
  setRollCount(settings.rollCount);
  setDicePerRoll(settings.dicePerRoll);
  setRollModifier(settings.modifier);
  setAverageCurveRolls(settings.averageCurveRolls);
};

const renderResultModeControls = () => {
  aggregationListbox.setValue(resultMode ?? '');
  renderDicePerRollControl();
};

const setResultDisplay = (value: string, metaHtml: string) => {
  resultValueEl.textContent = value;
  resultMetaEl.innerHTML = metaHtml;
  resultDieEl.dataset.digits = String(Math.max(1, value.replace(/\D/g, '').length || 1));
  renderProbabilityCurrentRoll(value);
};

const renderProbabilityCurrentRoll = (heroValue: string) => {
  if (heroValue === '—' || lastReportedValues.length === 0) {
    probabilityCurrentRollEl.textContent = 'Current roll: —';
    return;
  }
  const shown = lastReportedValues.length <= 8
    ? lastReportedValues.join(', ')
    : heroValue;
  probabilityCurrentRollEl.textContent = `Current roll: ${shown}`;
};

const totalRolls = (rolls: number[]) => rolls.reduce((sum, value) => sum + value, 0);

type RollGroup = {
  faces: number[];
  value: number;
};

const formatRollResult = (groups: RollGroup[], mode: ResultMode | null, picking: PickMode) => {
  const modeLabel = pickModeLabel(picking);
  const dieName = selectedDice.name.toUpperCase();
  const modifierText = formatModifier(getRollModifier());

  if (mode) {
    const dicePerRoll = groups[0]?.faces.length ?? getDicePerRoll();
    const formula = groups.length === 1
      ? `${dicePerRoll}${dieName}${modifierText}`
      : `${groups.length}× ${dicePerRoll}${dieName}${modifierText}`;
    const reported = groups.map(group => group.value);
    const rollsText = groups.map(group => {
      const facesText = group.faces.join(', ');
      return `[${facesText}]→${group.value}`;
    }).join('; ');

    return {
      value: groups.length === 1 ? String(groups[0].value) : `${groups.length}×`,
      meta: `${formula}: ${rollsText} → <span class="mode">${aggregations[mode].label} (${modeLabel})</span>`,
      reported,
    };
  }

  const reported = groups.map(group => group.value);
  const rollsText = reported.join(', ');
  const count = reported.length;
  const formula = `${count}${dieName}${modifierText}`;

  if (count === 1) {
    return {
      value: String(reported[0]),
      meta: `${formula} <span class="mode">(${modeLabel})</span>`,
      reported,
    };
  }

  return {
    value: `${count}×`,
    meta: `${formula}: ${rollsText} <span class="mode">(${modeLabel})</span>`,
    reported,
  };
};

const renderModeControls = () => {
  modeListbox.setValue(pickMode);
};

const renderProbabilityConfig = () => {
  const die = selectedDice.name;
  const suffix = formatModifier(getRollModifier());
  if (resultMode) {
    const rolls = getRollCount();
    const dice = getDicePerRoll();
    const { configLabel } = aggregations[resultMode];
    probabilityConfigEl.textContent = rolls === 1
      ? `Current config: ${dice}${die}${suffix} ${configLabel}`
      : `Current config: ${rolls}× ${dice}${die}${suffix} ${configLabel}`;
    return;
  }
  probabilityConfigEl.textContent = `Current config: ${getRollCount()}${die}${suffix}`;
};

const formatChance = (chance: number) => `${chance.toFixed(3)}%`;

const getWeightToneClass = (chance: number, baseChance: number) => {
  const ratio = chance / baseChance;
  if (ratio < 0.66) {
    return 'weight-low';
  }
  if (ratio < 0.75) {
    return 'weight-warn';
  }
  if (ratio > 1.25) {
    return 'weight-high';
  }
  return '';
};

const currentDistribution = () => getReportedDistribution({
  resultMode,
  pickMode,
  diceType: selectedDice,
  dicePerRoll: getDicePerRoll(),
  modifier: getRollModifier(),
  averageCurveRolls,
});

const renderWeights = () => {
  const faces = pickMode === 'average'
    ? averageCurveFaceChances(selectedDice.sides, averageCurveRolls)
    : getFaceChances(selectedDice);
  const baseChance = getChance(selectedDice);
  const maxChance = Math.max(...faces.map(face => face.chance), baseChance);
  const hitFaces = new Set(lastRolls);
  const middle = Math.ceil(selectedDice.sides / 2);

  weightsEl.style.setProperty('--sides', String(selectedDice.sides));
  weightsEl.innerHTML = faces.map(face => {
    const height = Math.max(0, (face.chance / maxChance) * 100);
    const hitClass = hitFaces.has(face.value) ? 'hit' : '';
    const toneClass = getWeightToneClass(face.chance, baseChance);
    const isKeyLabel =
      face.value === 1 ||
      face.value === selectedDice.sides ||
      face.value === middle;
    const labelClass = isKeyLabel ? 'key-label' : '';
    return `
        <li class="${hitClass} ${toneClass} ${labelClass}" title="${face.value}: ${formatChance(face.chance)}">
          <span class="bar-track">
            <span class="bar" style="height: ${height}%"></span>
          </span>
          <span class="face">${face.value}</span>
        </li>
      `;
  }).join('');
  renderTargetChance();
};

const renderAggregatedDistribution = () => {
  if (!resultMode) {
    aggregatedGraphEl.hidden = true;
    aggregatedDistributionEl.innerHTML = '';
    renderTargetChance();
    return;
  }

  const distribution = currentDistribution();
  const title = `${aggregations[resultMode].graphLabel}${pickModeMeta[pickMode].graphSuffix}`;

  aggregatedGraphEl.hidden = false;
  aggregatedDistributionLabelEl.textContent = title;
  aggregatedGraphEl.setAttribute('aria-label', title);

  if (distribution.length === 0) {
    aggregatedDistributionEl.innerHTML = '';
    renderTargetChance();
    return;
  }

  const maxChance = Math.max(...distribution.map(entry => entry.chance));
  const minValue = distribution[0].value;
  const maxValue = distribution[distribution.length - 1].value;
  const middle = Math.round((minValue + maxValue) / 2);
  const hitValues = new Set(lastReportedValues);
  const target = getTargetNumber();
  aggregatedDistributionEl.style.setProperty('--sides', String(distribution.length));
  aggregatedDistributionEl.innerHTML = distribution.map(entry => {
    const height = maxChance > 0 ? Math.max(0, (entry.chance / maxChance) * 100) : 0;
    const hitClass = hitValues.has(entry.value) ? 'hit' : '';
    const isKeyLabel =
      entry.value === minValue ||
      entry.value === maxValue ||
      entry.value === middle;
    const labelClass = isKeyLabel ? 'key-label' : '';
    const toneClass = target === null
      ? ''
      : entry.value < target
        ? 'weight-low'
        : 'weight-high';
    return `
        <li class="${hitClass} ${toneClass} ${labelClass}" title="${entry.value}: ${formatChance(entry.chance)}">
          <span class="bar-track">
            <span class="bar" style="height: ${height}%"></span>
          </span>
          <span class="face">${entry.value}</span>
        </li>
      `;
  }).join('');
  renderTargetChance();
};

const renderTargetChance = () => {
  const target = getTargetNumber();
  if (target === null) {
    targetChanceEl.hidden = true;
    targetChanceEl.innerHTML = '';
    return;
  }

  const distribution = currentDistribution();
  let under = 0;
  let over = 0;
  for (const entry of distribution) {
    if (entry.value < target) {
      under += entry.chance;
    } else {
      over += entry.chance;
    }
  }

  targetChanceEl.hidden = false;
  targetChanceEl.innerHTML = `
      <span id="target-under" class="target-under">Under ${formatChance(under)}</span>
      <span id="target-over" class="target-over">Over ${formatChance(over)}</span>
    `;
};

const selectDie = (name: string) => {
  const nextDice = diceTypes.find(d => d.name === name);
  if (!nextDice) {
    return;
  }

  selectedDice = nextDice;
  lastRolls = [];
  lastReportedValues = [];
  renderStageDie();
  setResultDisplay('—', `Selected ${selectedDice.name}. Roll to begin.`);
  renderDieSelect();
  renderProbabilityConfig();
  renderWeights();
  renderAggregatedDistribution();
  persistState();
};

const setPickMode = (next: PickMode) => {
  pickMode = next;
  renderModeControls();
  renderWeights();
  renderAggregatedDistribution();

  switch (next) {
    case 'weighted':
      setResultDisplay(
        resultValueEl.textContent || '—',
        'Fairish picking on — rolls use and update face chances.',
      );
      break;
    case 'average':
      setResultDisplay(
        resultValueEl.textContent || '—',
        `Average curve on — each result is the mean of ${averageCurveRolls} fair rolls (extremes rare, middle common).`,
      );
      break;
    case 'fair':
      setResultDisplay(
        resultValueEl.textContent || '—',
        'Fair picking — fair rolls, weights stay frozen.',
      );
      break;
  }
  persistState();
};

const modeListbox = createListbox(
  modeListboxRoot,
  (value) => {
    if (isPickMode(value)) {
      setPickMode(value);
    }
  },
);

const aggregationListbox = createListbox(
  aggregationListboxRoot,
  (value) => {
    resultMode = isResultMode(value) ? value : null;
    renderResultModeControls();
    renderProbabilityConfig();
    renderAggregatedDistribution();
    persistState();
  },
);

const pickOptions = () => ({ weightedDropPercent, averageCurveRolls });

const afterTrayChange = () => {
  renderProbabilityConfig();
  renderAggregatedDistribution();
  persistState();
};

const performRoll = () => {
  const rollCount = getRollCount();
  setRollCount(rollCount);
  const modifier = getRollModifier();
  setRollModifier(modifier);

  const groups: RollGroup[] = [];

  if (resultMode) {
    const dicePerRoll = getDicePerRoll();
    setDicePerRoll(dicePerRoll);
    const aggregation = aggregations[resultMode];
    const rememberKeptOnly = pickMode === 'weighted' && aggregation.rememberKeptOnly;
    for (let rollIndex = 0; rollIndex < rollCount; rollIndex++) {
      const beforePool = rememberKeptOnly ? snapshotModifiers(selectedDice) : null;
      const faces = Array.from({ length: dicePerRoll }, () =>
        rollDice(selectedDice, pickMode, pickOptions()),
      );
      const kept = aggregation.keptFaces(faces);
      const value = totalRolls(kept) + modifier;
      if (beforePool !== null) {
        restoreModifiers(selectedDice, beforePool);
        for (const face of kept) {
          modifyValues(selectedDice, face, weightedDropPercent);
        }
      }
      groups.push({ faces, value });
    }
  } else {
    for (let rollIndex = 0; rollIndex < rollCount; rollIndex++) {
      const face = rollDice(selectedDice, pickMode, pickOptions());
      groups.push({ faces: [face], value: face + modifier });
    }
  }

  lastRolls = groups.flatMap(group => group.faces);
  const { value, meta, reported } = formatRollResult(groups, resultMode, pickMode);
  lastReportedValues = reported;
  recordHistory(groups.map(group => ({
    die: selectedDice.name,
    value: group.value,
    detail: resultMode ? aggregations[resultMode].historyDetail(group.faces) : undefined,
  })));
  persistState();
  setResultDisplay(value, meta);
  renderProbabilityConfig();
  renderWeights();
  renderAggregatedDistribution();
};

const resetWeights = () => {
  selectedDice.modifiers = [];
  lastRolls = [];
  lastReportedValues = [];
  setResultDisplay('—', `${selectedDice.name} reset to fair odds.`);
  renderWeights();
  renderAggregatedDistribution();
  persistState();
};

const restoreDefaultSettings = () => {
  const settings = defaultSettings();
  selectedDice = diceTypes.find(die => die.name === settings.selectedDie) ?? selectedDice;
  pickMode = settings.pickMode;
  resultMode = settings.resultMode;
  weightedDropPercent = settings.weightedDropPercent;
  lastRolls = [];
  lastReportedValues = [];
  setRollCount(settings.rollCount);
  setDicePerRoll(settings.dicePerRoll);
  setRollModifier(settings.modifier);
  setAverageCurveRolls(settings.averageCurveRolls);
  targetInput.value = '';
  applyTheme('dark');
  renderStageDie();
  renderDieSelect();
  renderModeControls();
  renderResultModeControls();
  renderWeightedDropControl();
  renderProbabilityConfig();
  renderWeights();
  renderAggregatedDistribution();
  setResultDisplay('—', 'Settings restored to defaults.');
  persistState();
};

const toggleOverlayDrawer = (
  drawer: HTMLElement,
  open: (next: boolean) => void,
  other: (next: boolean) => void,
) => {
  if (!isOverlayDrawer()) {
    return;
  }
  const next = drawer.dataset.open !== 'true';
  open(next);
  if (next) {
    other(false);
  }
};

const handlePageEvent = (event: Event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  if (event.type === 'click') {
    if (target.closest('[data-history-clear]')) {
      rollHistory.length = 0;
      persistState();
      historyBtn.click();
      return;
    }
    if (target.closest('[data-history-close]')) {
      closeHistoryModal();
      return;
    }

    const control = target.closest<HTMLElement>('[data-action]');
    if (!control || control instanceof HTMLInputElement) {
      return;
    }

    switch (control.dataset.action) {
      case 'select-die': {
        const name = control.dataset.dieName;
        if (name) {
          selectDie(name);
        }
        break;
      }
      case 'rolls-dec':
        setRollCount(getRollCount() - 1);
        afterTrayChange();
        break;
      case 'rolls-inc':
        setRollCount(getRollCount() + 1);
        afterTrayChange();
        break;
      case 'dice-per-roll-dec':
        setDicePerRoll(getDicePerRoll() - 1);
        afterTrayChange();
        break;
      case 'dice-per-roll-inc':
        setDicePerRoll(getDicePerRoll() + 1);
        afterTrayChange();
        break;
      case 'modifier-dec':
        setRollModifier(getRollModifier() - 1);
        afterTrayChange();
        break;
      case 'modifier-inc':
        setRollModifier(getRollModifier() + 1);
        afterTrayChange();
        break;
      case 'target-dec':
        stepTarget(-1);
        break;
      case 'target-inc':
        stepTarget(1);
        break;
      case 'curve-rolls-dec':
        applyAverageCurveRolls(getAverageCurveRolls() - 1);
        break;
      case 'curve-rolls-inc':
        applyAverageCurveRolls(getAverageCurveRolls() + 1);
        break;
      case 'roll':
        performRoll();
        break;
      case 'reset-weights':
        resetWeights();
        break;
      case 'probability-toggle':
        toggleOverlayDrawer(probabilityEl, setProbabilityOpen, setSettingsOpen);
        break;
      case 'probability-close':
        setProbabilityOpen(false);
        break;
      case 'settings-toggle':
        toggleOverlayDrawer(settingsEl, setSettingsOpen, setProbabilityOpen);
        break;
      case 'settings-close':
        setSettingsOpen(false);
        break;
      case 'settings-default':
        restoreDefaultSettings();
        break;
      case 'theme-toggle': {
        const next: Theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
        applyTheme(next);
        break;
      }
    }
    return;
  }

  const control = target.closest<HTMLElement>('[data-action]');
  if (!control) {
    return;
  }
  const action = control.dataset.action;

  if (event.type === 'input') {
    if (action === 'target') {
      renderAggregatedDistribution();
    } else if (action === 'weighted-drop') {
      const next = Number.parseInt(weightedDropSlider.value, 10);
      weightedDropPercent = Number.isFinite(next)
        ? Math.min(100, Math.max(0, next))
        : 20;
      renderWeightedDropControl();
      persistState();
    }
    return;
  }

  if (event.type !== 'change') {
    return;
  }

  switch (action) {
    case 'rolls':
      setRollCount(getRollCount());
      afterTrayChange();
      break;
    case 'dice-per-roll':
      setDicePerRoll(getDicePerRoll());
      afterTrayChange();
      break;
    case 'modifier':
      setRollModifier(getRollModifier());
      afterTrayChange();
      break;
    case 'curve-rolls':
      applyAverageCurveRolls(getAverageCurveRolls());
      break;
  }
};

page.addEventListener('click', handlePageEvent);
page.addEventListener('input', handlePageEvent);
page.addEventListener('change', handlePageEvent);

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (historyRoot.querySelector('#history-modal')) {
      closeHistoryModal();
      return;
    }
    if (settingsEl.dataset.open === 'true' && isOverlayDrawer()) {
      setSettingsOpen(false);
      return;
    }
    if (probabilityEl.dataset.open === 'true' && isOverlayDrawer()) {
      setProbabilityOpen(false);
    }
  }
});

const renderDieSelect = () => {
  dieSelect.innerHTML = diceTypes.map(d => {
    const pressed = d.name === selectedDice.name;
    return `
        <li class="die-select-item">
          <button
            type="button"
            class="die-select-item-btn"
            data-action="select-die"
            data-die-name="${d.name}"
            aria-pressed="${pressed}"
            aria-label="${d.name}"
          >
            ${dieIcon(d.name)}
            <span class="die-label">${d.name}</span>
          </button>
        </li>
      `;
  }).join('');
};

const main = () => {
  applyTheme(readStoredTheme());
  restorePersistedState();
  setRollCount(getRollCount());
  setRollModifier(getRollModifier());
  renderStageDie();
  renderDieSelect();
  renderModeControls();
  renderResultModeControls();
  renderWeightedDropControl();
  setAverageCurveRolls(averageCurveRolls);
  renderProbabilityConfig();
  renderWeights();
  renderAggregatedDistribution();
};

main();

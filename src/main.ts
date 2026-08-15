import './style.css'

(() => {
  type Modifier = {
    value: number;
    modifierValue: number;
  }

  type DiceType = {
    name: string;
    sides: number;
    modifiers: Modifier[];
  }

  // Share of a face's base chance removed when that face is rolled (weighted mode).
  let weightedDropPercent = 20;

  const getBaseModifier = (diceType: DiceType) => {
    return getChance(diceType) * (weightedDropPercent / 100);
  }

  const diceTypes: DiceType[] = [
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
  ]

  const getChance = (diceType: DiceType) => {
    return 100 / diceType.sides;
  }

  const getFaceChance = (diceType: DiceType, value: number) => {
    const chance = diceType.modifiers.find(m => m.value === value)?.modifierValue ?? getChance(diceType);
    return Math.max(0, chance);
  }

  const ensureFaceModifier = (diceTypeIndex: number, diceType: DiceType, value: number) => {
    const existing = diceTypes[diceTypeIndex].modifiers.find(m => m.value === value);
    if (existing) {
      return existing;
    }
    const created = { value, modifierValue: getChance(diceType) };
    diceTypes[diceTypeIndex].modifiers.push(created);
    return created;
  };

  const modifyValues = (diceType: DiceType, rolledValue: number) => {
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

    const desiredDrop = getBaseModifier(diceType);
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
  }

  const rollFair = (diceType: DiceType) => {
    return Math.floor(Math.random() * diceType.sides) + 1;
  }

  // Weighted pick along the 0–100% chance line, then update modifiers.
  const rollWeighted = (diceType: DiceType) => {
    let roll = Math.random() * 100;

    for (let value = 1; value <= diceType.sides; value++) {
      roll -= getFaceChance(diceType, value);
      if (roll < 0) {
        modifyValues(diceType, value);
        return value;
      }
    }

    // Floating-point safety if chances don't sum to exactly 100
    modifyValues(diceType, diceType.sides);
    return diceType.sides;
  }

  // Average of N fair rolls (default 2) → bell curve; middle common, extremes rare.
  let averageCurveRolls = 2;

  const rollAverage = (diceType: DiceType, componentRolls = averageCurveRolls) => {
    let sum = 0;
    for (let i = 0; i < componentRolls; i++) {
      sum += rollFair(diceType);
    }
    return Math.round(sum / componentRolls);
  }

  type PickMode = 'fair' | 'weighted' | 'average';

  const rollDice = (diceType: DiceType, mode: PickMode) => {
    if (mode === 'weighted') {
      return rollWeighted(diceType);
    }
    if (mode === 'average') {
      return rollAverage(diceType);
    }
    return rollFair(diceType);
  }

  const getFaceChances = (diceType: DiceType) => {
    return Array.from({ length: diceType.sides }, (_, i) => {
      const value = i + 1;
      return { value, chance: getFaceChance(diceType, value) };
    });
  }

  const pickModeLabel = (mode: PickMode) => {
    if (mode === 'weighted') {
      return 'weighted';
    }
    if (mode === 'average') {
      return 'average';
    }
    return 'fair';
  }

  const formatChance = (chance: number) => `${chance.toFixed(3)}%`;

  type HistoryRoll = {
    die: string;
    value: number;
    detail?: string;
  };

  type ResultMode = 'advantage' | 'disadvantage' | 'sum';

  let selectedDice = diceTypes[5]; // d20
  let lastRolls: number[] = [];
  let lastReportedValues: number[] = [];
  let pickMode: PickMode = 'weighted';
  let resultMode: ResultMode | null = null;
  const rollHistory: HistoryRoll[] = [];
  (window as Window & { __rollHistory?: HistoryRoll[] }).__rollHistory = rollHistory;

  const dieSelect = document.querySelector<HTMLUListElement>('#die-select')!;
  const rollsInput = document.querySelector<HTMLInputElement>('#number-of-rolls')!;
  const rollsDecBtn = document.querySelector<HTMLButtonElement>('#rolls-dec')!;
  const rollsIncBtn = document.querySelector<HTMLButtonElement>('#rolls-inc')!;
  const dicePerRollBlock = document.querySelector<HTMLElement>('#dice-per-roll-block')!;
  const dicePerRollInput = document.querySelector<HTMLInputElement>('#dice-per-roll')!;
  const dicePerRollDecBtn = document.querySelector<HTMLButtonElement>('#dice-per-roll-dec')!;
  const dicePerRollIncBtn = document.querySelector<HTMLButtonElement>('#dice-per-roll-inc')!;
  const rollBtn = document.querySelector<HTMLButtonElement>('#roll-btn')!;
  const probabilityRollBtn = document.querySelector<HTMLButtonElement>('#probability-roll-btn')!;
  const resetBtn = document.querySelector<HTMLButtonElement>('#reset-btn')!;
  const resultValueEl = document.querySelector<HTMLParagraphElement>('#result-value')!;
  const resultMetaEl = document.querySelector<HTMLParagraphElement>('#result-meta')!;
  const resultDieEl = document.querySelector<HTMLElement>('#result-die')!;
  const resultDieShapeEl = document.querySelector<HTMLElement>('#result-die-shape')!;
  const weightsEl = document.querySelector<HTMLUListElement>('#weights')!;
  const aggregatedGraphEl = document.querySelector<HTMLElement>('#aggregated-graph')!;
  const aggregatedDistributionEl = document.querySelector<HTMLUListElement>('#aggregated-distribution')!;
  const aggregatedDistributionLabelEl = document.querySelector<HTMLElement>('#aggregated-distribution-label')!;
  const probabilityEl = document.querySelector<HTMLElement>('#probability-drawer')!;
  const probabilityToggleBtn = document.querySelector<HTMLButtonElement>('#probability-toggle')!;
  const probabilityCloseBtn = document.querySelector<HTMLButtonElement>('#probability-close')!;
  const probabilityConfigEl = document.querySelector<HTMLElement>('#probability-config')!;
  const settingsEl = document.querySelector<HTMLElement>('#settings-drawer')!;
  const settingsToggleBtn = document.querySelector<HTMLButtonElement>('#settings-toggle')!;
  const settingsCloseBtn = document.querySelector<HTMLButtonElement>('#settings-close')!;
  const settingsModeLabelEl = document.querySelector<HTMLElement>('#settings-mode-label')!;
  const themeToggleBtn = document.querySelector<HTMLButtonElement>('#theme-toggle')!;
  const averageCurveRollsInput = document.querySelector<HTMLInputElement>('#average-curve-rolls')!;
  const averageCurveRollsDecBtn = document.querySelector<HTMLButtonElement>('#average-curve-rolls-dec')!;
  const averageCurveRollsIncBtn = document.querySelector<HTMLButtonElement>('#average-curve-rolls-inc')!;
  const weightedDropSlider = document.querySelector<HTMLInputElement>('#weighted-drop-slider')!;
  const weightedDropValueEl = document.querySelector<HTMLElement>('#weighted-drop-value')!;
  const historyRoot = document.querySelector<HTMLElement>('#history-root')!;

  const recordHistory = (entries: HistoryRoll[]) => {
    for (const entry of entries) {
      rollHistory.push(entry);
    }
  };

  const closeHistoryModal = () => {
    historyRoot.innerHTML = '';
  };

  type ListboxApi = {
    getValue: () => string;
    setValue: (value: string) => void;
    close: () => void;
  };

  const createListbox = (
    root: HTMLElement,
    onChange: (value: string) => void,
  ): ListboxApi => {
    const trigger = root.querySelector<HTMLButtonElement>('.listbox-trigger')!;
    const list = root.querySelector<HTMLUListElement>('[role="listbox"]')!;
    const options = Array.from(list.querySelectorAll<HTMLElement>('[role="option"]'));

    const getSelectedOption = () =>
      options.find(option => option.getAttribute('aria-selected') === 'true') ?? options[0];

    const getValue = () => getSelectedOption()?.dataset.value ?? '';

    const LIST_GAP = 4;

    const placeOptions = () => {
      list.classList.remove('listbox-options--drop-up');
      const triggerRect = trigger.getBoundingClientRect();
      const listHeight = list.getBoundingClientRect().height;
      const clipRoot = root.closest('.shell');
      const clipRect = clipRoot?.getBoundingClientRect();
      const clipTop = clipRect?.top ?? 0;
      const clipBottom = clipRect?.bottom ?? window.innerHeight;
      const spaceBelow = clipBottom - triggerRect.bottom - LIST_GAP;
      const spaceAbove = triggerRect.top - clipTop - LIST_GAP;
      const openUp = spaceBelow < listHeight && spaceAbove > spaceBelow;
      list.classList.toggle('listbox-options--drop-up', openUp);
    };

    const setOpen = (open: boolean) => {
      trigger.setAttribute('aria-expanded', String(open));
      list.hidden = !open;
      if (open) {
        placeOptions();
        getSelectedOption()?.focus();
      } else {
        list.classList.remove('listbox-options--drop-up');
      }
    };

    const setValue = (value: string) => {
      const next = options.find(option => (option.dataset.value ?? '') === value) ?? options[0];
      for (const option of options) {
        option.setAttribute('aria-selected', String(option === next));
      }
      trigger.textContent = next.textContent?.trim() ?? '';
    };

    const selectOption = (option: HTMLElement) => {
      const value = option.dataset.value ?? '';
      setValue(value);
      setOpen(false);
      trigger.focus();
      onChange(value);
    };

    const moveSelection = (delta: number) => {
      const currentIndex = Math.max(0, options.indexOf(document.activeElement as HTMLElement));
      const nextIndex = (currentIndex + delta + options.length) % options.length;
      options[nextIndex].focus();
    };

    trigger.addEventListener('click', () => {
      setOpen(list.hasAttribute('hidden'));
    });

    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setOpen(true);
      }
    });

    list.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveSelection(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveSelection(-1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        options[0]?.focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        options[options.length - 1]?.focus();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (document.activeElement instanceof HTMLElement && options.includes(document.activeElement)) {
          selectOption(document.activeElement);
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        trigger.focus();
      }
    });

    for (const option of options) {
      option.addEventListener('click', () => {
        selectOption(option);
      });
    }

    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Node) || root.contains(event.target)) {
        return;
      }
      setOpen(false);
    });

    window.addEventListener('resize', () => {
      if (!list.hidden) {
        placeOptions();
      }
    });

    return {
      getValue,
      setValue,
      close: () => setOpen(false),
    };
  };

  const isOverlayDrawer = () => window.matchMedia('(max-width: 1599px)').matches;

  const setProbabilityOpen = (open: boolean) => {
    probabilityEl.dataset.open = String(open);
    probabilityToggleBtn.setAttribute('aria-expanded', String(open));
  };

  const setSettingsOpen = (open: boolean) => {
    settingsEl.dataset.open = String(open);
    settingsToggleBtn.setAttribute('aria-expanded', String(open));
  };

  type Theme = 'light' | 'dark';
  const THEME_KEY = 'faerie-dice-theme';

  const readStoredTheme = (): Theme => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
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
    themeToggleBtn.setAttribute('aria-checked', String(theme === 'light'));
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Ignore persistence failures; the in-session theme still applies.
    }
  };

  const pickModeTitle: Record<PickMode, string> = {
    fair: 'Normal',
    weighted: 'Weighted',
    average: 'Average',
  };

  const renderSettingsMode = () => {
    settingsModeLabelEl.textContent = pickModeTitle[pickMode];
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
  };

  const dieIconPaths: Record<string, string> = {
    d4: `<polygon points="12,3 21,20 3,20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="miter"/>`,
    d6: `<rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    d8: `<polygon points="12,2 20,12 12,22 4,12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="miter"/>`,
    d10: `<polygon points="12,2 19,9 12,22 5,9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="miter"/>`,
    d12: `<polygon points="12,2 20.5,7 20.5,17 12,22 3.5,17 3.5,7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="miter"/>`,
    d20: `<polygon points="12,2 21,8.5 17.5,19.5 6.5,19.5 3,8.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="miter"/>`,
    d100: `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
  };

  const dieIcon = (name: string) =>
    `<svg class="die-icon" viewBox="0 0 24 24" aria-hidden="true">${dieIconPaths[name]}</svg>`;

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

  const renderDicePerRollControl = () => {
    dicePerRollBlock.hidden = !usesDicePerRoll();
    if (usesDicePerRoll()) {
      setDicePerRoll(getDicePerRoll());
    }
  };

  const renderResultModeControls = () => {
    aggregationListbox.setValue(resultMode ?? '');
    renderDicePerRollControl();
  };

  const setResultDisplay = (value: string, metaHtml: string) => {
    resultValueEl.textContent = value;
    resultMetaEl.innerHTML = metaHtml;
    resultDieEl.dataset.digits = String(Math.max(1, value.replace(/\D/g, '').length || 1));
  };

  const totalRolls = (rolls: number[]) => rolls.reduce((sum, value) => sum + value, 0);

  type RollGroup = {
    faces: number[];
    value: number;
  };

  const historyDetailFor = (group: RollGroup, mode: ResultMode | null) => {
    if (mode === 'advantage' || mode === 'disadvantage') {
      return group.faces.join(', ');
    }
    if (mode === 'sum') {
      return `sum of ${group.faces.join(', ')}`;
    }
    return undefined;
  };

  const aggregationLabel = (mode: ResultMode) => {
    if (mode === 'advantage') {
      return 'Advantage';
    }
    if (mode === 'disadvantage') {
      return 'Disadvantage';
    }
    return 'Sum';
  };

  const formatRollResult = (groups: RollGroup[], mode: ResultMode | null, picking: PickMode) => {
    const modeLabel = pickModeLabel(picking);
    const dieName = selectedDice.name.toUpperCase();

    if (mode) {
      const dicePerRoll = groups[0]?.faces.length ?? getDicePerRoll();
      const formula = groups.length === 1
        ? `${dicePerRoll}${dieName}`
        : `${groups.length}× ${dicePerRoll}${dieName}`;
      const reported = groups.map(group => group.value);
      const rollsText = groups.map(group => {
        const facesText = group.faces.join(', ');
        return `[${facesText}]→${group.value}`;
      }).join('; ');

      return {
        value: groups.length === 1 ? String(groups[0].value) : `${groups.length}×`,
        meta: `${formula}: ${rollsText} → <span class="mode">${aggregationLabel(mode)} (${modeLabel})</span>`,
        reported,
      };
    }

    const faces = groups.flatMap(group => group.faces);
    const rollsText = faces.join(', ');
    const count = faces.length;
    const formula = `${count}${dieName}`;

    if (count === 1) {
      return {
        value: String(faces[0]),
        meta: `${formula} <span class="mode">(${modeLabel})</span>`,
        reported: faces,
      };
    }

    return {
      value: `${count}×`,
      meta: `${formula}: ${rollsText} <span class="mode">(${modeLabel})</span>`,
      reported: faces,
    };
  };

  const renderModeControls = () => {
    modeListbox.setValue(pickMode);
  };

  const renderProbabilityConfig = () => {
    const die = selectedDice.name;
    if (resultMode) {
      const rolls = getRollCount();
      const dice = getDicePerRoll();
      const label = resultMode === 'advantage'
        ? 'advantage'
        : resultMode === 'disadvantage'
          ? 'disadvantage'
          : 'sum';
      probabilityConfigEl.textContent = rolls === 1
        ? `Current config: ${dice}${die} ${label}`
        : `Current config: ${rolls}× ${dice}${die} ${label}`;
      return;
    }
    probabilityConfigEl.textContent = `Current config: ${getRollCount()}${die}`;
  };

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

  const renderWeights = () => {
    const faces = pickMode === 'average'
      ? averageCurveFaceChances(selectedDice.sides)
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
  };

  const renderAggregatedDistribution = () => {
    if (!resultMode) {
      aggregatedGraphEl.hidden = true;
      aggregatedDistributionEl.innerHTML = '';
      return;
    }

    const distribution =
      resultMode === 'sum'
        ? sumProbabilityDistribution()
        : resultMode === 'advantage'
          ? advantageProbabilityDistribution()
          : disadvantageProbabilityDistribution();

    const labels: Record<ResultMode, string> = {
      sum: 'Sum distribution',
      advantage: 'Advantage distribution',
      disadvantage: 'Disadvantage distribution',
    };

    const modeSuffix =
      pickMode === 'weighted'
        ? ' (weighted)'
        : pickMode === 'average'
          ? ' (average)'
          : '';

    aggregatedGraphEl.hidden = false;
    aggregatedDistributionLabelEl.textContent = `${labels[resultMode]}${modeSuffix}`;
    aggregatedGraphEl.setAttribute('aria-label', `${labels[resultMode]}${modeSuffix}`);

    if (distribution.length === 0) {
      aggregatedDistributionEl.innerHTML = '';
      return;
    }

    const maxChance = Math.max(...distribution.map(entry => entry.chance));
    const minValue = distribution[0].value;
    const maxValue = distribution[distribution.length - 1].value;
    const middle = Math.round((minValue + maxValue) / 2);
    const hitValues = new Set(lastReportedValues);
    aggregatedDistributionEl.style.setProperty('--sides', String(distribution.length));
    aggregatedDistributionEl.innerHTML = distribution.map(entry => {
      const height = maxChance > 0 ? Math.max(0, (entry.chance / maxChance) * 100) : 0;
      const hitClass = hitValues.has(entry.value) ? 'hit' : '';
      const isKeyLabel =
        entry.value === minValue ||
        entry.value === maxValue ||
        entry.value === middle;
      const labelClass = isKeyLabel ? 'key-label' : '';
      return `
        <li class="${hitClass} ${labelClass}" title="${entry.value}: ${formatChance(entry.chance)}">
          <span class="bar-track">
            <span class="bar" style="height: ${height}%"></span>
          </span>
          <span class="face">${entry.value}</span>
        </li>
      `;
    }).join('');
  };

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
  const averageCurveFaceChances = (sides: number, componentRolls = averageCurveRolls) => {
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
  // Weighted uses live Faerie weights (i.i.d. snapshot of current odds).
  // Multi-die weighted rolls still update between dice; the graph freezes
  // tonight's face chances to answer “what do reported results look like now?”
  const getPickFaceProbabilities = () => {
    const sides = selectedDice.sides;
    let raw: number[];

    if (pickMode === 'average') {
      raw = averageCurveFaceChances(sides).map(face => face.chance / 100);
    } else if (pickMode === 'weighted') {
      raw = getFaceChances(selectedDice).map(face => face.chance / 100);
    } else {
      raw = Array.from({ length: sides }, () => 1 / sides);
    }

    const total = raw.reduce((sum, chance) => sum + chance, 0);
    if (total <= 0) {
      return Array.from({ length: sides }, () => 1 / sides);
    }
    return raw.map(chance => chance / total);
  };

  const sumProbabilityDistribution = () => {
    const numberOfDice = getDicePerRoll();
    const sides = selectedDice.sides;
    const faceProb = getPickFaceProbabilities();

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
    const distribution: Array<{ value: number, chance: number }> = [];

    for (let value = minValue; value <= maxValue; value++) {
      distribution.push({
        value,
        chance: (mass[value] ?? 0) * 100,
      });
    }

    return distribution;
  };

  // Keep highest: P(max = k) = F(k)^n - F(k-1)^n
  const advantageProbabilityDistribution = () => {
    const dicePerRoll = getDicePerRoll();
    const sides = selectedDice.sides;
    const faceProb = getPickFaceProbabilities();
    const distribution: Array<{ value: number, chance: number }> = [];
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
  const disadvantageProbabilityDistribution = () => {
    const dicePerRoll = getDicePerRoll();
    const sides = selectedDice.sides;
    const faceProb = getPickFaceProbabilities();
    const distribution: Array<{ value: number, chance: number }> = [];
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
  };

  dieSelect.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest<HTMLButtonElement>('button[data-die-name]');
    if (!button) {
      return;
    }

    const name = button.dataset.dieName;
    if (!name) {
      return;
    }

    selectDie(name);
  });

  const setPickMode = (next: PickMode) => {
    pickMode = next;
    renderModeControls();
    renderSettingsMode();
    renderWeights();
    renderAggregatedDistribution();

    if (next === 'weighted') {
      setResultDisplay(
        resultValueEl.textContent || '—',
        'Weighted picking on — rolls use and update face chances.',
      );
      return;
    }
    if (next === 'average') {
      setResultDisplay(
        resultValueEl.textContent || '—',
        `Average curve on — each result is the mean of ${averageCurveRolls} fair rolls (extremes rare, middle common).`,
      );
      return;
    }
    setResultDisplay(
      resultValueEl.textContent || '—',
      'Normal picking — fair rolls, weights stay frozen.',
    );
  };

  const modeListbox = createListbox(
    document.querySelector<HTMLElement>('#mode-listbox-root')!,
    (value) => {
      if (value === 'weighted' || value === 'average' || value === 'fair') {
        setPickMode(value);
      }
    },
  );

  const aggregationListbox = createListbox(
    document.querySelector<HTMLElement>('#aggregation-listbox-root')!,
    (value) => {
      resultMode = value === '' ? null : value as ResultMode;
      renderResultModeControls();
      renderProbabilityConfig();
      renderAggregatedDistribution();
    },
  );

  rollsDecBtn.addEventListener('click', () => {
    setRollCount(getRollCount() - 1);
    renderProbabilityConfig();
    renderAggregatedDistribution();
  });

  rollsIncBtn.addEventListener('click', () => {
    setRollCount(getRollCount() + 1);
    renderProbabilityConfig();
    renderAggregatedDistribution();
  });

  rollsInput.addEventListener('change', () => {
    setRollCount(getRollCount());
    renderProbabilityConfig();
    renderAggregatedDistribution();
  });

  dicePerRollDecBtn.addEventListener('click', () => {
    setDicePerRoll(getDicePerRoll() - 1);
    renderProbabilityConfig();
    renderAggregatedDistribution();
  });

  dicePerRollIncBtn.addEventListener('click', () => {
    setDicePerRoll(getDicePerRoll() + 1);
    renderProbabilityConfig();
    renderAggregatedDistribution();
  });

  dicePerRollInput.addEventListener('change', () => {
    setDicePerRoll(getDicePerRoll());
    renderProbabilityConfig();
    renderAggregatedDistribution();
  });

  const performRoll = () => {
    const rollCount = getRollCount();
    setRollCount(rollCount);

    const groups: RollGroup[] = [];

    if (resultMode) {
      const dicePerRoll = getDicePerRoll();
      setDicePerRoll(dicePerRoll);
      for (let rollIndex = 0; rollIndex < rollCount; rollIndex++) {
        const faces = Array.from({ length: dicePerRoll }, () => rollDice(selectedDice, pickMode));
        const value =
          resultMode === 'advantage'
            ? Math.max(...faces)
            : resultMode === 'disadvantage'
              ? Math.min(...faces)
              : totalRolls(faces);
        groups.push({ faces, value });
      }
    } else {
      for (let rollIndex = 0; rollIndex < rollCount; rollIndex++) {
        const face = rollDice(selectedDice, pickMode);
        groups.push({ faces: [face], value: face });
      }
    }

    lastRolls = groups.flatMap(group => group.faces);
    const { value, meta, reported } = formatRollResult(groups, resultMode, pickMode);
    lastReportedValues = reported;
    recordHistory(groups.map(group => ({
      die: selectedDice.name,
      value: group.value,
      detail: historyDetailFor(group, resultMode),
    })));
    setResultDisplay(value, meta);
    renderProbabilityConfig();
    renderWeights();
    renderAggregatedDistribution();
  };

  rollBtn.addEventListener('click', performRoll);
  probabilityRollBtn.addEventListener('click', performRoll);

  resetBtn.addEventListener('click', () => {
    selectedDice.modifiers = [];
    lastRolls = [];
    lastReportedValues = [];
    setResultDisplay('—', `${selectedDice.name} reset to fair odds.`);
    renderWeights();
    renderAggregatedDistribution();
  });

  probabilityToggleBtn.addEventListener('click', () => {
    if (!isOverlayDrawer()) {
      return;
    }
    const next = probabilityEl.dataset.open !== 'true';
    setProbabilityOpen(next);
    if (next) {
      setSettingsOpen(false);
    }
  });

  probabilityCloseBtn.addEventListener('click', () => {
    setProbabilityOpen(false);
  });

  settingsToggleBtn.addEventListener('click', () => {
    if (!isOverlayDrawer()) {
      return;
    }
    const next = settingsEl.dataset.open !== 'true';
    setSettingsOpen(next);
    if (next) {
      setProbabilityOpen(false);
    }
  });

  settingsCloseBtn.addEventListener('click', () => {
    setSettingsOpen(false);
  });

  themeToggleBtn.addEventListener('click', () => {
    const next: Theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
  });

  weightedDropSlider.addEventListener('input', () => {
    const next = Number.parseInt(weightedDropSlider.value, 10);
    weightedDropPercent = Number.isFinite(next)
      ? Math.min(100, Math.max(0, next))
      : 20;
    renderWeightedDropControl();
  });

  averageCurveRollsDecBtn.addEventListener('click', () => {
    applyAverageCurveRolls(getAverageCurveRolls() - 1);
  });

  averageCurveRollsIncBtn.addEventListener('click', () => {
    applyAverageCurveRolls(getAverageCurveRolls() + 1);
  });

  averageCurveRollsInput.addEventListener('change', () => {
    applyAverageCurveRolls(getAverageCurveRolls());
  });

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

  historyRoot.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest('[data-history-close]')) {
      closeHistoryModal();
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
    renderStageDie();
    renderDieSelect();
    renderModeControls();
    renderResultModeControls();
    renderSettingsMode();
    renderWeightedDropControl();
    setAverageCurveRolls(averageCurveRolls);
    renderProbabilityConfig();
    renderWeights();
  };

  main();
})();

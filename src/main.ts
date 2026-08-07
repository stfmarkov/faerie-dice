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

  const getBaseModifier = (diceType: DiceType) => {
    // 20% of the chance to roll a value for the current dice type
    return getChance(diceType) * 0.2;
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
    return diceType.modifiers.find(m => m.value === value)?.modifierValue ?? getChance(diceType);
  }

  const modifyValues = (diceType: DiceType, rolledValue: number) => {

    // To modify by value, we need to:
    // When a value is rolled, the chance to roll that value is reduced by a modifier
    // The same number is spread over the other values


    // To modify by group, we need to:
    // Check if the rolled value is above or below the group threshold
    // We decrese the chance to roll all values from the same group
    // We increase the chance to roll all values from the other group

    const baseModifier = getBaseModifier(diceType);
    // const restValuesModifier = (baseModifier / (diceType.sides - 1)) / 2;
    const restValuesModifier = baseModifier / diceType.sides; // d20 → 0.05%

    const diceTypeIndex = diceTypes.findIndex(d => d.name === diceType.name);
    const groupThreshold = diceType.sides / 2

    for (let i = 1; i <= diceType.sides; i++) {
      // Modify by value
      const hasModifierForCurrentValue = Boolean(diceTypes[diceTypeIndex].modifiers.find(m => m.value === i));
      const isTheRolledValue = i === rolledValue;
      if (hasModifierForCurrentValue && isTheRolledValue) {
        diceTypes[diceTypeIndex].modifiers.find(m => m.value === i)!.modifierValue -= baseModifier;
      }
      if (!hasModifierForCurrentValue && isTheRolledValue) {
        diceTypes[diceTypeIndex].modifiers.push({
          value: i,
          modifierValue: getChance(diceType) - baseModifier,
        });
      }
      if (hasModifierForCurrentValue && !isTheRolledValue) {
        diceTypes[diceTypeIndex].modifiers.find(m => m.value === i)!.modifierValue += restValuesModifier;
      }
      if (!hasModifierForCurrentValue && !isTheRolledValue) {
        diceTypes[diceTypeIndex].modifiers.push({
          value: i,
          modifierValue: getChance(diceType) + restValuesModifier,
        });
      }

      // Modify by group (skip the rolled value — value memory already handled it)
      const isHigh = (value: number) => value > groupThreshold;
      const isFromTheSameGroup = isHigh(i) === isHigh(rolledValue);

      if (isTheRolledValue) {
        continue;
      }

      if (isFromTheSameGroup) {
        diceTypes[diceTypeIndex].modifiers.find(m => m.value === i)!.modifierValue -= restValuesModifier;
      }
      if (!isFromTheSameGroup) {
        diceTypes[diceTypeIndex].modifiers.find(m => m.value === i)!.modifierValue += restValuesModifier;
      }
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

  const rollDice = (diceType: DiceType, weighted: boolean) => {
    return weighted ? rollWeighted(diceType) : rollFair(diceType);
  }

  const getFaceChances = (diceType: DiceType) => {
    return Array.from({ length: diceType.sides }, (_, i) => {
      const value = i + 1;
      return { value, chance: getFaceChance(diceType, value) };
    });
  }

  const formatChance = (chance: number) => `${chance.toFixed(3)}%`;

  type ResultMode = 'advantage' | 'disadvantage' | 'sum';

  let selectedDice = diceTypes[5]; // d20
  let lastRolls: number[] = [];
  let weightedPicking = true;
  let resultMode: ResultMode | null = null;

  const dieSelect = document.querySelector<HTMLUListElement>('#die-select')!;
  const rollsInput = document.querySelector<HTMLInputElement>('#number-of-rolls')!;
  const rollsDecBtn = document.querySelector<HTMLButtonElement>('#rolls-dec')!;
  const rollsIncBtn = document.querySelector<HTMLButtonElement>('#rolls-inc')!;
  const rollBtn = document.querySelector<HTMLButtonElement>('#roll-btn')!;
  const fairBtn = document.querySelector<HTMLButtonElement>('#fair-btn')!;
  const weightedBtn = document.querySelector<HTMLButtonElement>('#weighted-btn')!;
  const resetBtn = document.querySelector<HTMLButtonElement>('#reset-btn')!;
  const resultValueEl = document.querySelector<HTMLParagraphElement>('#result-value')!;
  const resultMetaEl = document.querySelector<HTMLParagraphElement>('#result-meta')!;
  const resultDieEl = document.querySelector<HTMLElement>('#result-die')!;
  const resultDieShapeEl = document.querySelector<HTMLElement>('#result-die-shape')!;
  const weightsEl = document.querySelector<HTMLUListElement>('#weights')!;
  const probabilityConfigEl = document.querySelector<HTMLElement>('#probability-config')!;
  const resultModeButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.result-mode-btn')
  );

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

  const ensureAdvDisadvDiceCount = () => {
    if ((resultMode === 'advantage' || resultMode === 'disadvantage') && getRollCount() < 2) {
      setRollCount(2);
    }
  };

  const renderResultModeButtons = () => {
    for (const button of resultModeButtons) {
      const mode = button.dataset.resultMode as ResultMode;
      const pressed = resultMode === mode;
      button.setAttribute('aria-pressed', String(pressed));
      button.classList.toggle('active', pressed);
    }
  };

  const padResult = (value: number) => {
    const width = String(selectedDice.sides).length;
    return String(value).padStart(width, '0');
  };

  const setResultDisplay = (value: string, metaHtml: string) => {
    resultValueEl.textContent = value;
    resultMetaEl.innerHTML = metaHtml;
    resultDieEl.dataset.digits = String(Math.max(1, value.replace(/\D/g, '').length || 1));
  };

  const formatRollResult = (rolls: number[], mode: ResultMode | null, weighted: boolean) => {
    const pickMode = weighted ? 'weighted' : 'fair';
    const rollsText = rolls.join(', ');
    const count = rolls.length;
    const formula = `${count}${selectedDice.name.toUpperCase()}`;

    if (mode === 'advantage') {
      const best = Math.max(...rolls);
      return {
        value: padResult(best),
        meta: `${formula}: ${rollsText} → Advantage <span class="mode">(${pickMode})</span>`,
      };
    }

    if (mode === 'disadvantage') {
      const worst = Math.min(...rolls);
      return {
        value: padResult(worst),
        meta: `${formula}: ${rollsText} → Disadvantage <span class="mode">(${pickMode})</span>`,
      };
    }

    if (mode === 'sum') {
      const total = rolls.reduce((sum, value) => sum + value, 0);
      return {
        value: String(total),
        meta: `${formula}: ${rollsText} → Sum <span class="mode">(${pickMode})</span>`,
      };
    }

    if (count === 1) {
      return {
        value: padResult(rolls[0]),
        meta: `${formula} <span class="mode">(${pickMode})</span>`,
      };
    }

    return {
      value: String(count),
      meta: `${formula}: ${rollsText} <span class="mode">(${pickMode})</span>`,
    };
  };

  const renderModeButtons = () => {
    fairBtn.setAttribute('aria-pressed', String(!weightedPicking));
    weightedBtn.setAttribute('aria-pressed', String(weightedPicking));
  };

  const renderProbabilityConfig = () => {
    const count = getRollCount();
    probabilityConfigEl.textContent = `Current config: ${count}${selectedDice.name}`;
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
    const faces = getFaceChances(selectedDice);
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

  const selectDie = (name: string) => {
    const nextDice = diceTypes.find(d => d.name === name);
    if (!nextDice) {
      return;
    }

    selectedDice = nextDice;
    lastRolls = [];
    renderStageDie();
    setResultDisplay('—', `Selected ${selectedDice.name}. Roll to begin.`);
    renderDieSelect();
    renderProbabilityConfig();
    renderWeights();
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

  const setWeightedPicking = (next: boolean) => {
    weightedPicking = next;
    renderModeButtons();
    setResultDisplay(
      resultValueEl.textContent || '—',
      weightedPicking
        ? 'Weighted picking on — rolls use and update face chances.'
        : 'Weighted picking off — fair rolls, weights stay frozen.'
    );
  };

  fairBtn.addEventListener('click', () => {
    setWeightedPicking(false);
  });

  weightedBtn.addEventListener('click', () => {
    setWeightedPicking(true);
  });

  for (const button of resultModeButtons) {
    button.addEventListener('click', () => {
      const mode = button.dataset.resultMode as ResultMode;
      resultMode = resultMode === mode ? null : mode;
      ensureAdvDisadvDiceCount();
      renderResultModeButtons();
      renderProbabilityConfig();
    });
  }

  rollsDecBtn.addEventListener('click', () => {
    setRollCount(getRollCount() - 1);
    ensureAdvDisadvDiceCount();
    renderProbabilityConfig();
  });

  rollsIncBtn.addEventListener('click', () => {
    setRollCount(getRollCount() + 1);
    renderProbabilityConfig();
  });

  rollsInput.addEventListener('change', () => {
    setRollCount(getRollCount());
    ensureAdvDisadvDiceCount();
    renderProbabilityConfig();
  });

  rollBtn.addEventListener('click', () => {
    ensureAdvDisadvDiceCount();
    const count = getRollCount();
    setRollCount(count);

    lastRolls = Array.from({ length: count }, () => rollDice(selectedDice, weightedPicking));
    const { value, meta } = formatRollResult(lastRolls, resultMode, weightedPicking);
    setResultDisplay(value, meta);
    renderProbabilityConfig();
    renderWeights();
  });

  resetBtn.addEventListener('click', () => {
    selectedDice.modifiers = [];
    lastRolls = [];
    setResultDisplay('—', `${selectedDice.name} reset to fair odds.`);
    renderWeights();
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
    renderStageDie();
    renderDieSelect();
    renderModeButtons();
    renderResultModeButtons();
    renderProbabilityConfig();
    renderWeights();
  };

  main();
})();

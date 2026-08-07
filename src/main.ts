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
  
  const app = document.querySelector<HTMLDivElement>('#app')!;
  
  const dieSelectPanel = app.querySelector<HTMLDetailsElement>('#die-select-panel')!;
  const dieSelectSummary = app.querySelector<HTMLElement>('#die-select-summary')!;
  const dieSelect = app.querySelector<HTMLUListElement>('#die-select')!;
  const rollsInput = app.querySelector<HTMLInputElement>('#number-of-rolls')!;
  const rollBtn = app.querySelector<HTMLButtonElement>('#roll-btn')!;
  const weightedBtn = app.querySelector<HTMLButtonElement>('#weighted-btn')!;
  const resetBtn = app.querySelector<HTMLButtonElement>('#reset-btn')!;
  const resultEl = app.querySelector<HTMLParagraphElement>('#result')!;
  const weightsEl = app.querySelector<HTMLUListElement>('#weights')!;
  const resultModeButtons = Array.from(
    app.querySelectorAll<HTMLButtonElement>('.result-mode-btn')
  );

  const isMobileDiePicker = () => window.matchMedia('(max-width: 639px)').matches;

  const getRollCount = () => {
    const value = Number.parseInt(rollsInput.value, 10);
    if (!Number.isFinite(value) || value < 1) {
      return 1;
    }
    return Math.min(value, 100);
  };

  const ensureAdvDisadvDiceCount = () => {
    if ((resultMode === 'advantage' || resultMode === 'disadvantage') && getRollCount() < 2) {
      rollsInput.value = '2';
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

  const formatRollResult = (rolls: number[], mode: ResultMode | null, weighted: boolean) => {
    const pickMode = weighted ? 'weighted' : 'fair';
    const rollsText = rolls.join(', ');
    const count = rolls.length;

    if (mode === 'advantage') {
      const best = Math.max(...rolls);
      return `Rolled ${count}${selectedDice.name}: ${rollsText} → <strong>Advantage ${best}</strong> <span class="mode">(${pickMode})</span>`;
    }

    if (mode === 'disadvantage') {
      const worst = Math.min(...rolls);
      return `Rolled ${count}${selectedDice.name}: ${rollsText} → <strong>Disadvantage ${worst}</strong> <span class="mode">(${pickMode})</span>`;
    }

    if (mode === 'sum') {
      const total = rolls.reduce((sum, value) => sum + value, 0);
      return `Rolled ${count}${selectedDice.name}: ${rollsText} → <strong>Sum ${total}</strong> <span class="mode">(${pickMode})</span>`;
    }

    if (count === 1) {
      return `Rolled <strong>${rolls[0]}</strong> on ${selectedDice.name} <span class="mode">(${pickMode})</span>`;
    }

    return `Rolled ${count}${selectedDice.name}: ${rollsText} <span class="mode">(${pickMode})</span>`;
  };
  
  const renderWeightedButton = () => {
    weightedBtn.textContent = weightedPicking ? 'Weighted: On' : 'Weighted: Off';
    weightedBtn.setAttribute('aria-pressed', String(weightedPicking));
    weightedBtn.classList.toggle('active', weightedPicking);
  };
  
  const renderWeights = () => {
    const faces = getFaceChances(selectedDice);
    const maxChance = Math.max(...faces.map(face => face.chance), getChance(selectedDice));
    const hitFaces = new Set(lastRolls);
  
    weightsEl.innerHTML = faces.map(face => {
      const width = Math.max(0, (face.chance / maxChance) * 100);
      const hitClass = hitFaces.has(face.value) ? 'hit' : '';
      return `
        <li class="${hitClass}">
          <span class="face">${face.value}</span>
          <span class="bar" aria-hidden="true"><span style="width: ${width}%"></span></span>
          <span class="pct">${formatChance(face.chance)}</span>
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
    resultEl.textContent = `Selected ${selectedDice.name}. Roll to begin.`;
    renderDieSelect();
    renderWeights();

    if (isMobileDiePicker()) {
      dieSelectPanel.open = false;
    }
  };

  dieSelect.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    const name = target.dataset.dieName;
    if (!name) {
      return;
    }

    selectDie(name);
  });
  
  weightedBtn.addEventListener('click', () => {
    weightedPicking = !weightedPicking;
    renderWeightedButton();
    resultEl.textContent = weightedPicking
      ? 'Weighted picking on — rolls use and update face chances.'
      : 'Weighted picking off — fair rolls, weights stay frozen.';
  });

  for (const button of resultModeButtons) {
    button.addEventListener('click', () => {
      const mode = button.dataset.resultMode as ResultMode;
      resultMode = resultMode === mode ? null : mode;
      ensureAdvDisadvDiceCount();
      renderResultModeButtons();
    });
  }
  
  rollBtn.addEventListener('click', () => {
    ensureAdvDisadvDiceCount();
    const count = getRollCount();
    rollsInput.value = String(count);

    lastRolls = Array.from({ length: count }, () => rollDice(selectedDice, weightedPicking));
    resultEl.innerHTML = formatRollResult(lastRolls, resultMode, weightedPicking);
    renderWeights();
  });
    
  resetBtn.addEventListener('click', () => {
    selectedDice.modifiers = [];
    lastRolls = [];
    resultEl.textContent = `${selectedDice.name} reset to fair odds.`;
    renderWeights();
  });
  
  const renderDieSelect = () => {
    dieSelectSummary.textContent = selectedDice.name;
    dieSelect.innerHTML = diceTypes.map(d => {
      const pressed = d.name === selectedDice.name;
      return `
        <li class="die-select-item">
          <button
            type="button"
            class="die-select-item-btn"
            data-die-name="${d.name}"
            aria-pressed="${pressed}"
          >${d.name}</button>
        </li>
      `;
    }).join('');
  };

  const main = () => {
    renderDieSelect();
    renderWeightedButton();
    renderResultModeButtons();
    renderWeights();
  };

  main();
})();





type ListboxApi = {
  getValue: () => string;
  setValue: (value: string) => void;
  close: () => void;
};

export const createListbox = (
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

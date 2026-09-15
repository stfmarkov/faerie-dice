const dieIconPaths: Record<string, string> = {
  d4: `<polygon points="12,3 21,20 3,20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="miter"/>`,
  d6: `<rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
  d8: `<polygon points="12,2 20,12 12,22 4,12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="miter"/>`,
  d10: `<polygon points="12,2 19,9 12,22 5,9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="miter"/>`,
  d12: `<polygon points="12,2 20.5,7 20.5,17 12,22 3.5,17 3.5,7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="miter"/>`,
  d20: `<polygon points="12,2 21,8.5 17.5,19.5 6.5,19.5 3,8.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="miter"/>`,
  d100: `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
};

export const dieIcon = (name: string) =>
  `<svg class="die-icon" viewBox="0 0 24 24" aria-hidden="true">${dieIconPaths[name]}</svg>`;

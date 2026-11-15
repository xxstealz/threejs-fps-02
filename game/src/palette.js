// The look plan, in one place. Dusk desert: dark ground, warm sand, rust attackers,
// slate defenders, amber accent. The same names are the CSS custom properties.
export const PALETTE = {
  canvas: '#191512',
  surface: '#26201a',
  hairline: '#3a3128',
  ink: '#efe6d4',
  muted: '#9a8f7d',
  sand: '#c9a86a',
  rust: '#d9573b',
  teal: '#4fae9e',
  accent: '#e8a33d',
  slate: '#5b7a99',
  ground: '#2a2118',
};

export function shade(name) {
  return PALETTE[name];
}

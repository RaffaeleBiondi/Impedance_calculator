export type GapRule =
  | { kind: 'compact-at-target' }
  | { kind: 'fixed-gap'; gap: number }
  | { kind: 'fixed-pitch'; pitch: number };

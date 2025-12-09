'use client';

import { canonModelKey } from './model';

type ThemeToken =
  | 'background'
  | 'background-end'
  | 'foreground'
  | 'glow-1'
  | 'glow-2'
  | 'accent-1'
  | 'accent-2'
  | 'accent-3'
  | 'panel-surface'
  | 'panel-border'
  | 'panel-shadow'
  | 'accent-ring';

type ModelTheme = Record<ThemeToken, string>;

const DEFAULT_THEME: ModelTheme = {
  background: '#020617',
  background-end: '#050a1f',
  foreground: '#f8fafc',
  'glow-1': 'rgba(16, 185, 129, 0.18)',
  'glow-2': 'rgba(129, 140, 248, 0.32)',
  'accent-1': 'rgba(16, 185, 129, 0.8)',
  'accent-2': 'rgba(79, 70, 229, 0.7)',
  'accent-3': 'rgba(14, 165, 233, 0.7)',
  'panel-surface': 'rgba(2, 6, 23, 0.72)',
  'panel-border': 'rgba(248, 250, 252, 0.05)',
  'panel-shadow': 'rgba(2, 6, 23, 0.55)',
  'accent-ring': 'rgba(52, 211, 153, 0.4)',
};

const MODEL_THEMES: Record<string, ModelTheme> = {
  'basic:gpt-4o-mini': DEFAULT_THEME,
  'basic:gemini-2.5-flash': {
    background: '#0b1024',
    background-end: '#11183a',
    foreground: '#f5f3ff',
    'glow-1': 'rgba(59, 130, 246, 0.25)',
    'glow-2': 'rgba(236, 72, 153, 0.25)',
    'accent-1': 'rgba(59, 130, 246, 0.85)',
    'accent-2': 'rgba(236, 72, 153, 0.85)',
    'accent-3': 'rgba(139, 92, 246, 0.75)',
    'panel-surface': 'rgba(10, 15, 32, 0.72)',
    'panel-border': 'rgba(226, 232, 240, 0.07)',
    'panel-shadow': 'rgba(8, 10, 26, 0.55)',
    'accent-ring': 'rgba(125, 211, 252, 0.45)',
  },
  'basic:mistral-medium': {
    background: '#120b04',
    background-end: '#1c0f05',
    foreground: '#fff7ed',
    'glow-1': 'rgba(249, 115, 22, 0.28)',
    'glow-2': 'rgba(234, 179, 8, 0.2)',
    'accent-1': 'rgba(249, 115, 22, 0.8)',
    'accent-2': 'rgba(236, 138, 46, 0.8)',
    'accent-3': 'rgba(248, 180, 0, 0.7)',
    'panel-surface': 'rgba(18, 10, 4, 0.78)',
    'panel-border': 'rgba(255, 237, 213, 0.08)',
    'panel-shadow': 'rgba(12, 6, 3, 0.6)',
    'accent-ring': 'rgba(251, 146, 60, 0.4)',
  },
  'basic:deepseek-v3': {
    background: '#010e1a',
    background-end: '#021526',
    foreground: '#e0f2fe',
    'glow-1': 'rgba(14, 165, 233, 0.24)',
    'glow-2': 'rgba(94, 234, 212, 0.22)',
    'accent-1': 'rgba(14, 165, 233, 0.85)',
    'accent-2': 'rgba(59, 130, 246, 0.85)',
    'accent-3': 'rgba(94, 234, 212, 0.7)',
    'panel-surface': 'rgba(2, 12, 24, 0.78)',
    'panel-border': 'rgba(191, 219, 254, 0.08)',
    'panel-shadow': 'rgba(2, 10, 18, 0.55)',
    'accent-ring': 'rgba(125, 211, 252, 0.45)',
  },
};

function getTheme(modelKey: string): ModelTheme {
  const canonical = canonModelKey(modelKey);
  return MODEL_THEMES[canonical] ?? DEFAULT_THEME;
}

export function applyModelTheme(modelKey: string) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const canonical = canonModelKey(modelKey);
  const theme = getTheme(modelKey);

  root.dataset.modelTheme = canonical;
  (Object.entries(theme) as Array<[ThemeToken, string]>).forEach(([token, value]) => {
    root.style.setProperty(`--${token}`, value);
  });
}

export { MODEL_THEMES, DEFAULT_THEME };

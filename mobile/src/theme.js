import React from 'react';
import { BRAND } from './brand';

const worthioBase = {
  accent: BRAND.colors.accentBlue,
  accentSoft: BRAND.colors.bgSecondary,
  background: BRAND.colors.bgBase,
  backgroundElevated: BRAND.colors.bgSecondary,
  card: BRAND.colors.surface,
  cardAlt: '#162F52',
  text: BRAND.colors.textPrimary,
  muted: BRAND.colors.textSecondary,
  subtle: BRAND.colors.textMuted,
  info: BRAND.colors.accentCyan,
  success: BRAND.colors.positive,
  danger: BRAND.colors.negative,
  warn: BRAND.colors.warning,
  border: BRAND.colors.surfaceBorder,
  inputBg: BRAND.colors.surfaceElevated,
  inputText: BRAND.colors.textPrimary,
  shadow: 'rgba(2, 8, 20, 0.28)',
  silver: '#8FA2BF',
  gold: '#DDB24D'
};

const lightBase = {
  accent: BRAND.colors.accentBlue,
  accentSoft: '#F1F5F9',
  background: '#F7FAFC',
  backgroundElevated: '#FFFFFF',
  card: '#FFFFFF',
  cardAlt: '#F1F5F9',
  text: BRAND.colors.bgBase,
  muted: '#334155',
  subtle: '#64748B',
  info: BRAND.colors.accentBlue,
  success: '#00A97A',
  danger: '#D92D20',
  warn: '#D97706',
  border: '#D9E2EF',
  inputBg: '#FFFFFF',
  inputText: BRAND.colors.bgBase,
  shadow: 'rgba(11, 31, 58, 0.08)',
  silver: '#94A3B8',
  gold: '#D6A53A'
};

export const THEMES = {
  worthio: {
    key: 'worthio',
    name: 'Worthio',
    ...worthioBase
  },
  light: {
    key: 'light',
    name: 'Light',
    ...lightBase
  }
};

export function normalizeThemeKey(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'worthio';
  if (raw === 'worthio' || raw === 'dark' || raw === 'black') return 'worthio';
  if (raw === 'light' || raw === 'teal' || raw === 'ocean' || raw === 'slate') return 'light';
  return 'worthio';
}

export const ThemeContext = React.createContext({
  theme: THEMES.worthio,
  themeKey: 'worthio',
  setThemeKey: () => {}
});

export function useTheme() {
  return React.useContext(ThemeContext);
}

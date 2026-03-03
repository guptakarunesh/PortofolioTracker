import React from 'react';

export const THEMES = {
  teal: {
    key: 'teal',
    name: 'Teal',
    accent: '#0f766e',
    accentSoft: '#e6f6f3',
    background: '#f7f9fc',
    card: '#ffffff',
    text: '#0f2f4d',
    muted: '#5d7a95',
    info: '#0f5fb8',
    success: '#0a8f4b',
    danger: '#b3261e',
    warn: '#9a6b00',
    border: '#dbe6f2',
    inputBg: '#ffffff',
    inputText: '#0f2f4d',
    silver: '#98a2b3',
    gold: '#c28f2c'
  },
  ocean: {
    key: 'ocean',
    name: 'Ocean',
    accent: '#0891b2',
    accentSoft: '#dff4fb',
    background: '#f0f9ff',
    card: '#ffffff',
    text: '#0f172a',
    muted: '#64748b',
    info: '#0891b2',
    success: '#0a8f4b',
    danger: '#b3261e',
    warn: '#b45309',
    border: '#d5eaf2',
    inputBg: '#ffffff',
    inputText: '#0f172a',
    silver: '#93a4b7',
    gold: '#b98430'
  },
  slate: {
    key: 'slate',
    name: 'Slate',
    accent: '#334155',
    accentSoft: '#e2e8f0',
    background: '#f8fafc',
    card: '#ffffff',
    text: '#0f172a',
    muted: '#64748b',
    info: '#334155',
    success: '#0a8f4b',
    danger: '#b3261e',
    warn: '#b45309',
    border: '#d7dee7',
    inputBg: '#ffffff',
    inputText: '#0f172a',
    silver: '#94a3b8',
    gold: '#b45309'
  },
  black: {
    key: 'black',
    name: 'Black',
    accent: '#d4a017',
    accentSoft: '#1f2a36',
    background: '#0b0f14',
    card: '#131a23',
    text: '#e7edf5',
    muted: '#93a4b7',
    info: '#5eead4',
    success: '#34d399',
    danger: '#f87171',
    warn: '#f59e0b',
    border: '#243040',
    inputBg: '#0f151d',
    inputText: '#e7edf5',
    silver: '#8a94a6',
    gold: '#f2c14e'
  }
};

export const ThemeContext = React.createContext({
  theme: THEMES.teal,
  themeKey: 'teal',
  setThemeKey: () => {}
});

export function useTheme() {
  return React.useContext(ThemeContext);
}

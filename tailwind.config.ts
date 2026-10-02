import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Wyze dark palette
        bg: '#1E1E1E',
        panel: '#262626',
        panelAlt: '#2E2E2E',
        line: '#3A3A3A',
        ink: '#C8C8C8',
        inkDim: '#8A8A8A',
        accent: '#1DF0BB',
        secondary: '#827AFF',
        warning: '#FF7A6B',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;

import { FlatCompat } from '@eslint/eslintrc';

// eslint-config-next still ships eslintrc-style configs, so bridge them into
// ESLint 9's flat config. (`next lint` is deprecated in Next 16; this runs the
// ESLint CLI directly instead.)
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // The codebase avoids `any` at API boundaries; make that a hard failure.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];

export default config;

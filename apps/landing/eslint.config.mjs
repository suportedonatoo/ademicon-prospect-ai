import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  { ignores: ['.next/**', '.next-build/**', 'node_modules/**', 'next-env.d.ts', '.netlify/**'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
];

export default config;

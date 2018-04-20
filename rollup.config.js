import alias from 'rollup-plugin-alias'
import babel from 'rollup-plugin-babel'
import json from 'rollup-plugin-json'

import packageJson from './package.json'

const babelOptions = {
  presets: ['flow'],
  plugins: ['transform-object-rest-spread']
}

export default {
  external: [
    ...Object.keys(packageJson.dependencies),
    ...Object.keys(packageJson.devDependencies),
    'buffer/',
    'crypto',
    'events',
    'net',
    'tls'
  ],
  input: './src/index.js',
  output: [
    { file: packageJson.main, format: 'cjs' },
    { file: packageJson.module, format: 'es' }
  ],
  plugins: [json(), alias({ 'buffer-hack': 'buffer/' }), babel(babelOptions)],
  sourcemap: true
}

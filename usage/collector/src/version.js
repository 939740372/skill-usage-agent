import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageCandidates = [
  path.resolve(moduleDirectory, '../../../package.json'),
  path.resolve(moduleDirectory, '../package.json')
];

export const packageVersion = packageCandidates.reduce((version, packagePath) => {
  if (version) return version;
  try {
    return JSON.parse(fs.readFileSync(packagePath, 'utf8')).version || null;
  } catch {
    return null;
  }
}, null) || '0.1.0';

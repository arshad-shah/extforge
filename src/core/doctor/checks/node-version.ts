import type { Check } from '../index.js';

// ExtForge's runtime dependencies (e.g. @arshad-shah/clif) require Node 22.12+.
const MIN_MAJOR = 22;
const MIN_MINOR = 12;
const MIN_LABEL = `${MIN_MAJOR}.${MIN_MINOR}`;

export const nodeVersionCheck: Check = {
  name: 'node-version',
  async run() {
    const [major, minor] = process.versions.node.split('.').map((n) => parseInt(n, 10));
    const ok = major! > MIN_MAJOR || (major === MIN_MAJOR && minor! >= MIN_MINOR);
    if (ok) {
      return { name: 'node-version', status: 'pass', message: `Node ${process.versions.node}` };
    }
    return {
      name: 'node-version',
      status: 'fail',
      message: `Node ${process.versions.node} is below the minimum (>= ${MIN_LABEL})`,
      hint: 'Upgrade Node: https://nodejs.org',
    };
  },
};

import type { Check } from '../index.js';

const MIN_MAJOR = 20;

export const nodeVersionCheck: Check = {
  name: 'node-version',
  async run() {
    const major = parseInt(process.versions.node.split('.')[0]!, 10);
    if (major >= MIN_MAJOR) {
      return { name: 'node-version', status: 'pass', message: `Node ${process.versions.node}` };
    }
    return {
      name: 'node-version',
      status: 'fail',
      message: `Node ${process.versions.node} is below the minimum (>= ${MIN_MAJOR})`,
      hint: 'Upgrade Node: https://nodejs.org',
    };
  },
};

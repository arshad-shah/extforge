import { loadExtForgeConfig } from '../../config.js';
import type { ModuleRegistry } from '../../modules/registry.js';
import type { Check } from '../index.js';

function describe(contributions: ReturnType<ModuleRegistry['getContributions']>[number]): string {
  const parts: string[] = [];
  if (contributions.entrypoints.length > 0) {
    parts.push(`entrypoints: ${contributions.entrypoints.join(', ')}`);
  }
  if (contributions.manifestPatches > 0) {
    parts.push(
      `manifest patch${contributions.manifestPatches === 1 ? '' : 'es'}: ${contributions.manifestPatches}`,
    );
  }
  if (contributions.typeDeclarations > 0) {
    parts.push(`type declarations: ${contributions.typeDeclarations}`);
  }
  if (contributions.runtimeImports.length > 0) {
    parts.push(`runtime imports: ${contributions.runtimeImports.join(', ')}`);
  }
  return parts.length > 0 ? parts.join('; ') : 'no contributions';
}

export const modulesActiveCheck: Check = {
  name: 'modules-active',
  async run({ cwd }) {
    let registry: ModuleRegistry | undefined;
    try {
      const cfg = await loadExtForgeConfig(cwd);
      registry = (cfg as { __moduleRegistry?: ModuleRegistry }).__moduleRegistry;
    } catch {
      return { name: 'modules-active', status: 'info', message: 'Skipped (config invalid)' };
    }
    const contributions = registry?.getContributions() ?? [];
    if (contributions.length === 0) {
      return { name: 'modules-active', status: 'info', message: 'No modules configured' };
    }
    const summary = contributions.map((c) => `${c.module} (${describe(c)})`).join('; ');
    return {
      name: 'modules-active',
      status: 'info',
      message: `${contributions.length} active module${contributions.length === 1 ? '' : 's'}: ${summary}`,
    };
  },
};

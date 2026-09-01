export { type ActionFake, createActionFake } from './fakes/action.js';
export { createRuntimeFake, type RuntimeFake } from './fakes/runtime.js';
export {
  createScriptingFake,
  type ExecuteScriptInjection,
  type ScriptingFake,
} from './fakes/scripting.js';
export { createStorageFake, type StorageAreaFake, type StorageFake } from './fakes/storage.js';
export { createTabsFake, type TabRecord, type TabsFake } from './fakes/tabs.js';
export {
  type ChromeFakes,
  createChromeFakes,
  installChromeFakes,
  resetChromeFakes,
} from './install.js';

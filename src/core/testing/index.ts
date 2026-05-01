export { installChromeFakes, resetChromeFakes, createChromeFakes, type ChromeFakes } from './install.js';
export { createRuntimeFake, type RuntimeFake } from './fakes/runtime.js';
export { createStorageFake, type StorageFake, type StorageAreaFake } from './fakes/storage.js';
export { createTabsFake, type TabsFake, type TabRecord } from './fakes/tabs.js';
export { createActionFake, type ActionFake } from './fakes/action.js';
export { createScriptingFake, type ScriptingFake, type ExecuteScriptInjection } from './fakes/scripting.js';

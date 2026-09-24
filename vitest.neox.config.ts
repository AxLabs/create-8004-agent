import { createVitestConfig } from './vitest.config.js';

export default createVitestConfig([
    'tests/neox-registration.test.ts',
    'tests/neofs-storage.test.ts',
    'tests/neox-services.test.ts',
    'tests/neox-t4.test.ts',
]);

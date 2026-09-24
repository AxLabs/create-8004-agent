import { defineConfig } from 'vitest/config';

export function createVitestConfig(include: string[], exclude: string[] = []) {
    return defineConfig({
        test: {
            globals: true,
            testTimeout: 120000, // 2 minutes for server tests
            hookTimeout: 60000,
            teardownTimeout: 10000,
            include,
            exclude,
            setupFiles: ['tests/setup.ts'],
            // Test files share generated output and port allocation state.
            pool: 'threads',
            fileParallelism: false,
        },
    });
}

export default createVitestConfig(
    ['tests/**/*.test.ts'],
    [
        'tests/chains/**/*.test.ts',
        // Compiles generated fixtures after installing their dependencies.
        'tests/neox-t4.test.ts',
    ],
);

/**
 * Jest setup file (runs after the test framework is installed in each test file).
 *
 * This is the place to register global test configuration and native-module
 * mocks that every test needs. Native modules (camera, GPS, secure store, etc.)
 * are not available in the Node test environment, so they are mocked here or in
 * the co-located `__mocks__/` directory.
 */

// Silence noisy native warnings that are irrelevant under the jest-expo preset.
// Individual test files can override these mocks as needed.

export {};

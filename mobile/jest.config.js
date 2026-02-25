module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  moduleNameMapper: {
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@parsers/(.*)$': '<rootDir>/src/parsers/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@screens/(.*)$': '<rootDir>/src/screens/$1',
    '^react-native-wifi-reborn$': '<rootDir>/__mocks__/react-native-wifi-reborn',
    '^react-native$': '<rootDir>/__mocks__/react-native',
    '^expo-secure-store$': '<rootDir>/__mocks__/expo-secure-store',
    '^expo-file-system$': '<rootDir>/__mocks__/expo-file-system',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
  ],
};

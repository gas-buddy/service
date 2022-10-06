/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  verbose: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  testRegex: '(\\.|/)(test|spec)\\.[jt]sx?$',
  moduleNameMapper: {
    '^@pkg/(.*)$': '<rootDir>/src/$1'
  }
};

import tap from 'tap';
import { loggableError } from '../src/util';

tap.test('error wrapping', (t) => {
  const errorString = 'Hello world';
  const errors = [
    new Error(errorString),
    errorString,
  ];

  for (const e of errors) {
    t.ok(loggableError(e).stack, 'Should have a stack');
    t.strictEquals(loggableError(e).message, errorString, 'Message should match');
  }

  t.end();
});

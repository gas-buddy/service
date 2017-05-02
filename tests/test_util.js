import tap from 'tap';
import { winstonError } from '../src/util';

tap.test('error wrapping', (t) => {
  const errorString = 'Hello world';
  const errors = [
    new Error(errorString),
    { errObj: new Error(errorString) },
    errorString,
  ];

  for (const e of errors) {
    t.ok(winstonError(e).stack, 'Should have a stack');
    t.strictEquals(winstonError(e).message, errorString, 'Message should match');
  }

  t.end();
});

import tap from 'tap';
import { winstonError } from '../src/util';

tap.test('error wrapping', (t) => {
  const err = new Error('Hello world');
  t.ok(winstonError(err).stack, 'Should have a stack');
  t.strictEquals(winstonError(err).message, 'Hello world', 'Message should match');
  const swagerr = {
    errObj: new Error('Hello world'),
  };
  t.ok(winstonError(swagerr).stack, 'Should have a stack');
  t.strictEquals(winstonError(swagerr).message, 'Hello world', 'Message should match');
  t.end();
});

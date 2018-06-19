import tap from 'tap';
import path from 'path';
import * as service from '../src/index';

const sourcedir = path.join(__dirname, 'app', 'src');

tap.test('test throwError', async (t) => {
  await service.runWithService((serviceInstance, req) => {
    try {
      req.gb.throwError('Test', 'Test Message', 500, {
        displayMessage: true,
      });
    } catch (e) {
      t.strictEquals(e.message, e.displayMessage, 'Display message gets copied to message');
    }

    try {
      req.gb.throwError('Test', 'Test Message', 500, {
        displayMessage: 'Different message',
      });
    } catch (e) {
      t.notEquals(e.message, e.displayMessage, 'Unique display message gets written');
    }

    try {
      req.gb.throwError('Test', 'Test Message', 500, 'fake-domain', {
        displayMessage: 'Different message',
      });
    } catch (e) {
      t.notEquals(e.message, e.displayMessage, 'Unique display message gets written in presence of domain');
    }
  }, { srcRoot: sourcedir });
});

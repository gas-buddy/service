import { runWithService } from '../src/hooks';

describe('fake-job', () => {
  test('verify assertions for options', async () => {
    runWithService(async () => {
      // @ts-ignore
    }, {}).catch((e) => {
      expect(e.message).toEqual('"name" is required in options');
    });
  });

  test('basic job functionality', () => {
    runWithService(async (app) => {
      expect(app).toBeDefined();
      expect(app.locals).toBeDefined();
      expect(app.locals.logger).toBeDefined();

      expect(app.locals.config).toBeDefined();

      // Verify that the configuration overwrites worked
      expect(app.locals.config.get('test')).toEqual('foo bar');

      // Verify that locals work as expected
      Object.assign(app.locals, {
        foo: 'bar',
      });
      // @ts-ignore
      expect(app.locals.foo).toEqual('bar');
    }, {
      name: 'fake-job',
      overwriteConfig: (config) => {
        config.set('test', 'foo bar');
      },
    });
  });
});

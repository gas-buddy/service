import { runWithService } from '../src/hooks';

describe('fake-job', () => {
  test('basic job functionality', async () => {
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

      // Verify that the runId provided to service run does get applied in locals
      expect(app.locals.runId).toEqual('generated-uuid-123456789');
    }, {
      runId: 'generated-uuid-123456789',
      overwriteConfig: (config) => {
        config.set('test', 'foo bar');
      },
    });
  });
});

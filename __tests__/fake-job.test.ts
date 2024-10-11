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
      const loggerSpy = jest.spyOn(app.locals.logger, 'info');

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
      console.log('loggerSpy.mock.lastCall: ', loggerSpy.mock.lastCall);
      expect(loggerSpy.mock.lastCall).toHaveBeenCalledWith({
        trace_id: 'generated-uuid-123456789',
      });
    }, {
      name: 'fake-job',
      runId: 'generated-uuid-123456789',
      overwriteConfig: (config) => {
        config.set('test', 'foo bar');
      },
    });
  });
});

import type { Server } from 'http';
import assert from 'assert';
import type {
  RequestLocals,
  Service,
  ServiceLocals,
  ServiceExpress,
  RunWithServiceOptions,
} from './types';
import { startServiceInstance } from './bootstrap';

/**
 * Example Usage:
 *
 * const serviceFn = () => {
 *   const gb = useService<YourService>();
 *   return {
 *     ...gb,
 *     async start(app) {
 *       await gb.start(app);
 *       // your start stuff goes here
 *     },
 *     async onRequest(req, res) {
 *       await gb?.onRequest(req, res);
 *     },
 *   }
 * }
 *
 * @returns Service<SLocals, RLocals>
 */
export function useService<
  SLocals extends ServiceLocals = ServiceLocals,
  RLocals extends RequestLocals = RequestLocals,
>(baseService?: Service<SLocals, RLocals>): Service<SLocals, RLocals> {
  return {
    async start(app) {
      await baseService?.start(app);
    },
  };
}

export async function runWithService(
  asyncFn: (
    app: ServiceExpress,
    server: Server | undefined,
  ) => Promise<void>,
  options: RunWithServiceOptions,
) {
  assert(options.name, '"name" is required in options');

  let exitCode = -1;
  return startServiceInstance({
    nobind: true,
    name: options.name,
    runId: options.runId,
    overwriteConfig: options.overwriteConfig,
  })
    .then(({ app, server }) => {
      app.locals.logger.info('Executing: runWithService');
      try {
        asyncFn(app, server);
        exitCode = 0;
        app.locals.logger.info('Completed: runWithService');
      } catch (err) {
        app.locals.logger.error({ error: err }, 'FAILED: runWithService');
        exitCode = 1;
      } finally {
        process.exit(exitCode);
      }
    })
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error('runWithService failed with unexpected error', e);
    });
}

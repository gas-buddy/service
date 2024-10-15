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

export async function runWithService<SLocals extends ServiceLocals = ServiceLocals>(
  asyncFn: (
    app: ServiceExpress<ServiceLocals>,
    server: Server | undefined,
  ) => Promise<void>,
  options: RunWithServiceOptions,
) {
  const { name: taskName, runId, overwriteConfig } = options;
  assert(!!taskName?.length, '"name" is required in options');

  let exitCode = -1;
  return startServiceInstance({
    nobind: true,
    name: taskName,
    runId,
    overwriteConfig,
  })
    .then(async ({ app, server }) => {
      const { logger } = app.locals;
      logger.info(`Executing: ${taskName}`);
      try {
        await asyncFn(app as ServiceExpress<SLocals>, server);
        exitCode = 0;
        logger.info(`Completed: ${taskName}`);
      } catch (err) {
        logger.error({ error: err }, `FAILED: ${taskName}`);
        exitCode = 1;
      } finally {
        logger.info(`Exiting: ${taskName}, exitCode: ${exitCode}`);
        process.exit(exitCode);
      }
    })
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error('runWithService failed with unexpected error', e);
    });
}

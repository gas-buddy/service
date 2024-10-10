import type { Server } from 'http';
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
  options: RunWithServiceOptions = {},
) {
  const opts = options || {};

  return startServiceInstance({
    nobind: true,
    runId: opts.runId,
    overwriteConfig: opts.overwriteConfig,
  })
    .then(({ app, server }) => asyncFn(app, server))
    .catch((e) => {
      // eslint-disable-next-line
      console.error('Service configuration failed', e);
      process.exitCode = -1;
    });
}

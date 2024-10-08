import type { RequestLocals, Service, ServiceLocals } from './types';

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

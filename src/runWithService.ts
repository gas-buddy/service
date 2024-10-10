import { ConfigStore } from 'config';
import type { Server } from 'http';
import { ServiceExpress } from 'types';
import { startServiceInstance } from './bootstrap';

export type RunWithServiceOptions = {
  overwriteConfig?: (config: ConfigStore) => void;
  runId?: string;
};

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

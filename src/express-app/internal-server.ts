import express from 'express';

import type { Application } from 'express-serve-static-core';
import { InternalLocals, ServiceExpress } from '../types';

export default async function startInternalApp(mainApp: ServiceExpress, port: number) {
  const app = express() as unknown as Application<InternalLocals>;
  app.locals.mainApp = mainApp;

  app.get('/health', async (req, res) => {
    if (mainApp.locals.service?.healthy) {
      try {
        const ok = await mainApp.locals.service.healthy(mainApp);
        res.sendStatus(ok ? 204 : 500);
      } catch (error) {
        mainApp.locals.logger.error(error, 'Health check failed');
      }
    } else {
      res.sendStatus(204);
    }
  });

  const listenPromise = new Promise<void>((accept) => {
    app.locals.server = app.listen(port, () => {
      accept();
    });
  });

  await listenPromise;
  return app;
}

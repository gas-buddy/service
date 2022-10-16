import { glob } from 'glob';
import path from 'path';
import express from 'express';
import type { ServiceExpress } from '../types';

export default async function loadRoutes(app: ServiceExpress, routingDir: string, pattern: string) {
  const files: string[] = await new Promise((accept, reject) => {
    glob(
      pattern,
      {
        nodir: true,
        strict: true,
        cwd: routingDir,
      },
      (error, matches) => (error ? reject(error) : accept(matches)),
    );
  });

  await Promise.all(
    files.map(async (filename) => {
      const routeBase = path.dirname(filename);
      const modulePath = path.resolve(routingDir, filename);
      // Need to use require for loading .ts files
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const module = require(modulePath);
      const mounter = module.default || module.route;
      if (typeof mounter === 'function') {
        const childRouter = express.Router();
        mounter(childRouter, app);
        const pathParts = [''];
        if (routeBase !== '.') {
          pathParts.push(routeBase);
        }
        const fn = path.parse(path.basename(filename)).name;
        if (fn.toLowerCase() !== 'index') {
          pathParts.push(fn);
        }
        const finalPath = pathParts.join('/') || '/';
        app.locals.logger.debug({ path: finalPath, source: filename }, 'Registering route');
        app.use(finalPath, childRouter);
      } else {
        app.locals.logger.warn({ filename }, 'Route file had no default export');
      }
    }),
  );
}

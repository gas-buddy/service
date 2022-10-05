import path from 'path';
import _ from 'lodash';
import * as OpenApiValidator from 'express-openapi-validator';

import type { Handler } from 'express';
import type { ServiceExpress } from './types';

const notImplementedHandler: Handler = (req, res) => {
  res.status(501).json({
    code: 'NotImplemented',
    domain: 'http',
    message: 'This method is not yet implemented',
  });
};

export default function openApi(
  app: ServiceExpress,
  rootDirectory: string,
  codepath: string,
  openApiOptions?: Parameters<typeof OpenApiValidator.middleware>[0],
) {
  const apiSpec = path.resolve(rootDirectory, `./api/${app.locals.name}.yaml`);
  app.locals.logger.debug({ apiSpec, codepath }, 'Serving OpenAPI');

  return OpenApiValidator.middleware(
    _.defaultsDeep(
      {
        apiSpec,
        ignoreUndocumented: true,
        operationHandlers: {
          basePath: path.resolve(rootDirectory, `${codepath}/handlers`),
          resolver(basePath: string, route: any) {
            const pathKey = route.openApiRoute.substring(route.basePath.length);
            const modulePath = path.join(basePath, pathKey);

            try {
              // eslint-disable-next-line import/no-dynamic-require, global-require
              const module = require(modulePath);
              const method = Object.keys(module).find((m) => m.toUpperCase() === route.method);
              if (!method) {
                throw new Error(
                  `Could not find a [${method}] function in ${modulePath} when trying to route [${route.method} ${route.expressRoute}].`,
                );
              }
              return module[method];
            } catch (error) {
              app.locals.logger.error(
                {
                  error: (error as Error).message,
                  pathKey,
                  modulePath: path.relative(rootDirectory, modulePath),
                },
                'Failed to load API method handler',
              );
              return notImplementedHandler;
            }
          },
        },
      },
      openApiOptions || {},
    ),
  );
}

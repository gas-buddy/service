import assert from 'assert';
import express from 'express';
import http from 'http';
import path from 'path';
import { pino } from 'pino';

import { createTerminus } from '@godaddy/terminus';

import type { RequestHandler } from 'express';
import { loadConfiguration } from '../config/config';
import findPort from '../development/port-finder';
import openApi from '../openapi';
import {
  errorHandlerMiddleware,
  loggerMiddleware,
  notFoundMiddleware,
} from '../telemetry/requestLogger';
import loadRoutes from './route-loader';

import type {
  RequestLocals, ServiceExpress, ServiceFactory, ServiceStartOptions,
} from '../types';
import { ConfigurationSchema } from '../config/schema';
import { isDev } from '../env';
import startInternalApp from './internal-server';

export async function startApp({
  service,
  rootDirectory,
  codepath = 'build',
  configurationDirectories = [path.resolve(rootDirectory, './config')],
  name,
}: ServiceStartOptions): Promise<ServiceExpress> {
  const shouldPrettyPrint = isDev() && !process.env.NO_PRETTY_LOGS;
  const destination = pino.destination({
    dest: process.env.LOG_TO_FILE || process.stdout.fd,
    minLength: process.env.LOG_BUFFER ? Number(process.env.LOG_BUFFER) : undefined,
  });
  const logger = pino(
    shouldPrettyPrint
      ? {
        transport: {
          destination,
          target: 'pino-pretty',
          options: {
            colorize: true,
          },
        },
      }
      : destination,
  );

  const serviceImpl = service();
  assert(serviceImpl?.start, 'Service function did not return a conforming object');

  const config = await loadConfiguration({
    name: service.name,
    configurationDirectories,
    rootDirectory,
  });

  const logging = config.get('logging') as ConfigurationSchema['logging'];
  logger.level = logging?.level || 'info';

  // Concentrate the Typescript ugliness...
  const app = express() as unknown as ServiceExpress;
  Object.assign(app.locals, {
    service: serviceImpl,
    logger,
    config,
    name,
  });

  if (config.get('trustProxy')) {
    app.set('trust proxy', config.get('trustProxy'));
  }

  app.use(loggerMiddleware(logger, logging?.logRequestBody, logging?.logResponseBody));

  // Allow the service to add locals, etc. We put this before the body parsers
  // so that the req can decide whether to save the raw request body or not.
  const attachServiceLocals: RequestHandler = (req, res, next) => {
    res.locals.logger = logger;
    const maybePromise = serviceImpl.onRequest?.(req, res);
    return maybePromise || next();
  };
  app.use(attachServiceLocals);

  const bodyParsers = config.get('bodyParsers') as ConfigurationSchema['bodyParsers'];
  if (bodyParsers?.json) {
    app.use(
      express.json({
        verify(req, res, buf) {
          const locals = (res as any).locals as RequestLocals;
          if (locals?.rawBody === true) {
            locals.rawBody = buf;
          }
        },
      }),
    );
  }
  if (bodyParsers?.form) {
    app.use(express.urlencoded());
  }

  const routing = config.get('routing') as ConfigurationSchema['routing'];
  if (routing?.routes) {
    await loadRoutes(
      app,
      path.resolve(rootDirectory, codepath, config.get('routing:routes')),
      codepath === 'build' ? '**/*.js' : '**/*.ts',
    );
  }
  if (routing?.openapi) {
    app.use(openApi(app, rootDirectory, codepath));
  }

  app.use(notFoundMiddleware(logger, routing?.errors?.renderErrors));
  app.use(errorHandlerMiddleware(logger, routing?.errors?.unnest, routing?.errors?.renderErrors));

  await serviceImpl.start(app);
  return app;
}

export async function listen(app: ServiceExpress, shutdownHandler?: () => Promise<void>) {
  let port = app.locals.config.get('port');

  if (port === 0) {
    port = await findPort(8001);
  }

  const { service } = app.locals;
  const server = http.createServer(app);
  createTerminus(server, {
    timeout: 15000,
    useExit0: true,
    // https://github.com/godaddy/terminus#how-to-set-terminus-up-with-kubernetes
    beforeShutdown() {
      if (app.locals.internalApp) {
        app.locals.internalApp.locals.server?.close();
      }
      app.locals.logger.info('Graceful shutdown beginning');
      return new Promise((accept) => {
        setTimeout(accept, 10000);
      });
    },
    onShutdown() {
      return Promise.resolve()
        .then(() => service.stop?.())
        .then(shutdownHandler || (() => {}))
        .then(() => app.locals.logger.info('Graceful shutdown complete'))
        .catch((error) => app.locals.logger.error(error, 'Error terminating tracing'));
    },
    logger: (msg, e) => {
      app.locals.logger.error(e, msg);
    },
  });

  // TODO handle rejection/error?
  const listenPromise = new Promise<void>((accept) => {
    server.listen(port, () => {
      const { locals } = app;
      locals.logger.info({ port, service: locals.name }, 'express listening');

      // Ok now start the internal port if we have one.
      const internalPort = locals.config.get('internalPort');
      if (internalPort) {
        startInternalApp(app, internalPort)
          .then((internalApp) => {
            locals.internalApp = internalApp;
            locals.logger.info({ port: internalPort }, 'Internal metadata server started');
          })
          .catch((error) => {
            locals.logger.warn(error, 'Failed to start internal metadata app');
          });
      }

      accept();
    });
  });

  await listenPromise;
  return server;
}

export async function importServiceDefinition(entrypoint: string): Promise<ServiceFactory> {
  const { default: service } = await import(entrypoint);
  // We can't import things (express, pino, etc) before telemetry has gotten its
  // hooks in. So that's why DelayLoadServiceStartOptions exists. I don't
  // entirely know why the export is default.default and not just default
  if (typeof service === 'function') {
    return service as ServiceFactory;
  }
  return service.default as ServiceFactory;
}

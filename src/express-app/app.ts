import assert from 'assert';
import express from 'express';
import http from 'http';
import path from 'path';
import { pino } from 'pino';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { metrics } from '@opentelemetry/api-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { createTerminus } from '@godaddy/terminus';

import type { RequestHandler, Response } from 'express';
import { loadConfiguration } from '../config/index';
import findPort from '../development/port-finder';
import openApi from '../openapi';
import {
  errorHandlerMiddleware,
  loggerMiddleware,
  notFoundMiddleware,
} from '../telemetry/requestLogger';
import loadRoutes from './route-loader';

import type {
  RequestLocals,
  RequestWithApp,
  ServiceExpress,
  ServiceLocals,
  ServiceOptions,
  ServiceStartOptions,
} from '../types';
import { ConfigurationSchema } from '../config/schema';
import { isDev } from '../env';
import startInternalApp from './internal-server';

async function enableMetrics<
  SLocals extends ServiceLocals = ServiceLocals,
>(app: ServiceExpress<SLocals>) {
  const meters = new MeterProvider();
  metrics.setGlobalMeterProvider(meters);
  app.locals.meters = meters;
}

async function endMetrics<
  SLocals extends ServiceLocals = ServiceLocals,
>(app: ServiceExpress<SLocals>) {
  const { meters, logger } = app.locals;
  await meters.shutdown();
  logger.info('Metrics shutdown');
}

export async function startApp<
  SLocals extends ServiceLocals = ServiceLocals,
  RLocals extends RequestLocals = RequestLocals,
>(startOptions: ServiceStartOptions<SLocals, RLocals>): Promise<ServiceExpress<SLocals>> {
  const {
    service,
    rootDirectory,
    codepath = 'build',
    name,
  } = startOptions;
  const shouldPrettyPrint = isDev() && !process.env.NO_PRETTY_LOGS;
  const destination = pino.destination({
    dest: process.env.LOG_TO_FILE || process.stdout.fd,
    minLength: process.env.LOG_BUFFER ? Number(process.env.LOG_BUFFER) : undefined,
  });
  const logger = shouldPrettyPrint ? pino({
    transport: {
      destination,
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    },
  }) : pino({
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  }, destination);

  const serviceImpl = service();
  assert(serviceImpl?.start, 'Service function did not return a conforming object');

  const baseOptions: ServiceOptions = {
    configurationDirectories: [path.resolve(rootDirectory, './config')],
  };
  const options = serviceImpl.configure?.(startOptions, baseOptions) || baseOptions;

  const config = await loadConfiguration({
    name,
    configurationDirectories: options.configurationDirectories,
    rootDirectory,
  });

  const logging = config.get('logging') as ConfigurationSchema['logging'];
  logger.level = logging?.level || 'info';

  // Concentrate the Typescript ugliness...
  const app = express() as unknown as ServiceExpress<SLocals>;
  const routing = config.get('routing') as ConfigurationSchema['routing'];

  app.disable('x-powered-by');
  if (routing?.etag !== true) {
    app.disable('etag');
  }

  Object.assign(app.locals, { services: {} }, startOptions.locals, {
    service: serviceImpl,
    logger,
    config,
    name,
  });

  try {
    await enableMetrics(app);
  } catch (error) {
    logger.error(error, 'Could not enable metrics.');
    throw error;
  }

  if (config.get('trustProxy')) {
    app.set('trust proxy', config.get('trustProxy'));
  }

  app.use(loggerMiddleware(app, logging?.logRequestBody, logging?.logResponseBody));

  // Allow the service to add locals, etc. We put this before the body parsers
  // so that the req can decide whether to save the raw request body or not.
  const attachServiceLocals: RequestHandler = (req, res, next) => {
    res.locals.logger = logger;
    const maybePromise = serviceImpl.onRequest?.(
      req as RequestWithApp<SLocals>,
      res as Response<any, RLocals>,
    );
    if (maybePromise) {
      maybePromise.catch(next).then(next);
    } else {
      next();
    }
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

  if (serviceImpl.authorize) {
    const authorize: RequestHandler = (req, res, next) => {
      const maybePromise = serviceImpl.authorize?.(
        req as RequestWithApp<SLocals>,
        res as Response<any, RLocals>,
      );
      if (maybePromise) {
        maybePromise.catch(next).then(next);
      } else {
        next();
      }
    };
    app.use(authorize);
  }

  if (routing?.freezeQuery) {
    app.use((req, res, next) => {
      // Express 5 re-parses the query string every time. This causes problems with
      // various libraries, namely the express OpenAPI parser. So we "freeze it" in place
      // here, which runs right before the routing validation logic does. Note that this
      // means the app middleware will see the unfrozen one, which is intentional. If the
      // app wants to modify or freeze the query itself, this shouldn't get in the way.
      const { query } = req;
      if (query) {
        Object.defineProperty(req, 'query', {
          configurable: true,
          enumerable: true,
          value: query,
        });
      }
      next();
    });
  }

  if (routing?.routes) {
    await loadRoutes(
      app,
      path.resolve(rootDirectory, codepath, config.get('routing:routes')),
      codepath === 'build' ? '**/*.js' : '**/*.ts',
    );
  }
  if (routing?.openapi) {
    app.use(openApi(app, rootDirectory, codepath, options.openApiOptions));
  }

  // Putting this here allows more flexible middleware insertion
  await serviceImpl.start(app);

  app.use(notFoundMiddleware(logger, routing?.errors?.renderErrors));
  app.use(errorHandlerMiddleware(app, routing?.errors?.unnest, routing?.errors?.renderErrors));

  return app;
}

export async function shutdownApp(app: ServiceExpress) {
  const { logger } = app.locals;
  try {
    await app.locals.service.stop?.(app);
    await endMetrics(app);
    logger.info('App shutdown complete');
  } catch (error) {
    logger.warn(error, 'Shutdown failed');
  }
  (logger as pino.Logger).flush?.();
}

export async function listen<
  SLocals extends ServiceLocals = ServiceLocals,
>(app: ServiceExpress<SLocals>, shutdownHandler?: () => Promise<void>) {
  let port = app.locals.config.get('port');

  if (port === 0) {
    port = await findPort(8001);
  }

  const { service, logger } = app.locals;
  const server = http.createServer(app);
  let shutdownInProgress = false;
  createTerminus(server, {
    timeout: 15000,
    useExit0: true,
    // https://github.com/godaddy/terminus#how-to-set-terminus-up-with-kubernetes
    beforeShutdown() {
      if (shutdownInProgress) {
        return Promise.resolve();
      }
      shutdownInProgress = true;
      if (app.locals.internalApp) {
        app.locals.internalApp.locals.server?.close();
      }
      logger.info('Graceful shutdown beginning');
      return new Promise((accept) => {
        setTimeout(accept, 10000);
      });
    },
    onShutdown() {
      return Promise.resolve()
        .then(() => service.stop?.(app))
        .then(() => endMetrics(app))
        .then(shutdownHandler || (() => {}))
        .then(() => logger.info('Graceful shutdown complete'))
        .catch((error) => logger.error(error, 'Error terminating tracing'))
        .then(() => (logger as pino.Logger).flush?.());
    },
    logger: (msg, e) => {
      logger.error(e, msg);
    },
  });

  server.on('close', () => {
    if (!shutdownInProgress) {
      shutdownInProgress = true;
      app.locals.logger.info('Shutdown requested');
      if (app.locals.internalApp) {
        app.locals.internalApp.locals.server?.close();
      }
      shutdownApp(app);
    }
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
          .then(() => {
            const metricsConfig = app.locals.config.get('metrics');
            if (metricsConfig?.enabled) {
              const finalConfig = {
                ...metricsConfig,
                preventServerStart: true,
              };
              const exporter = new PrometheusExporter(finalConfig);
              locals.internalApp.get('/metrics', exporter.getMetricsRequestHandler.bind(exporter));
              locals.logger.info(
                { endpoint: finalConfig.endpoint, port: finalConfig.port },
                'Metrics exporter started',
              );
              locals.meters.addMetricReader(exporter);
            } else {
              locals.logger.info('No metrics will be exported');
            }
            accept();
          })
          .catch((error) => {
            locals.logger.warn(error, 'Failed to start internal metadata app');
          });
      } else {
        accept();
      }
    });
  });

  await listenPromise;
  return server;
}

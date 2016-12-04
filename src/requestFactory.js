import objectID from 'bson-objectid';
import winston from 'winston';
import expressPromisePatch from '@gasbuddy/express-promise-patch';
import Logger from './Logger';
import { serviceProxy, winstonError } from './util';

/**
 * Middleware to attach the "service" object to the request and add various request-specific
 * features to it such as logging and inter-service correlation
 */
export default function requestFactory(options) {
  const propName = (options ? options.property : 'gb') || 'gb';
  expressPromisePatch((req, e) => {
    const logger = (req[propName] && req[propName].logger) ? req[propName].logger : winston;
    logger.error('express error', winstonError(e));
  });

  let proxy;
  return function requestMiddleware(req, res, next) {
    const app = req.app;

    // This proxy allows you to run OUTSIDE of docker but still call services
    // inside via the nginx gasbuddy/proxy container.
    if (proxy === undefined) {
      const proxyConfig = app.config.get('connections:services:proxy');
      if (proxyConfig && !app.config.get('env:production')) {
        proxy = proxyConfig;
      } else {
        proxy = null;
      }
    }

    if (!req.headers.CorrelationId) {
      // Make up a correlation id if one was not passed
      req.headers.CorrelationId = objectID().toString('base64');
    }

    req[propName] = {
      config: app.config,
      /**
       * A request specific logger that adds the correlation id
       */
      logger: new Logger(req),
      /**
       * A requestInterceptor for swagger calls that adds correlation id
       */
      services: serviceProxy(req, propName, proxy),
    };
    next();
  };
}

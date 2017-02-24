import objectID from 'bson-objectid';
import winston from 'winston';
import expressPromisePatch from '@gasbuddy/express-promise-patch';
import Service from './Service';
import { serviceProxy, winstonError } from './util';

/**
 * Middleware to attach the "service" object to the request and add various request-specific
 * features to it such as logging and inter-service correlation
 */
export default function requestFactory(options) {
  // The name of the property to which we should write the "app local" variables
  const propName = (options ? options.property : 'gb') || 'gb';

  expressPromisePatch((req, e) => {
    const logger = (req[propName] && req[propName].logger) ? req[propName].logger : winston;
    logger.error('express error', winstonError(e));
  });

  return function requestMiddleware(req, res, next) {
    const service = Service.get(req);

    if (!service) {
      // Not a request with our object attached, so we're out.
      return;
    }

    if (!req.headers.correlationid) {
      // Make up a correlation id if one was not passed
      req.headers.correlationid = objectID().toString('base64');
    }

    const logDefaults = { correlationid: req.headers.correlationid };
    if (req.headers.spanid) {
      logDefaults.spanid = req.headers.spanid;
    }

    req[propName] = Object.assign({}, service.hydratedObjects, {
      config: service.config,
      /**
       * A request specific logger that adds the correlation id
       */
      logger: service.logger.loggerWithDefaults(logDefaults),
      /**
       * Wrap different forms of errors into something useful for winston
       */
      wrapError(...args) { return service.wrapError(...args); },
      /**
       * A requestInterceptor for swagger calls that adds correlation id.
       * This means the services property is "special" which is not great.
       * But did I say this was an opinionated library? I did.
       */
      services: serviceProxy(req),
    });
    next();
  };
}

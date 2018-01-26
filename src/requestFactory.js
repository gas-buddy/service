import objectID from 'bson-objectid';
import winston from 'winston';
import request from 'superagent';
import expressPromisePatch from '@gasbuddy/express-promise-patch';
import Service from './Service';
import { serviceProxy, winstonError, throwError } from './util';

let superagentHistogram;

function superagentFunctor(service, logger) {
  return function superagentWithLog(method, url, shouldLogErrors = true) {
    if (!superagentHistogram && service.metrics) {
      superagentHistogram = new service.metrics.Histogram(
        'superagent_http_requests',
        'Outbound SuperAgent requests',
        ['status', 'source', 'endpoint'],
      );
    }

    const startTime = process.hrtime();
    const newRequest = request[method.toLowerCase()](url);
    const existingThen = newRequest.then;
    newRequest.then = function gbThen(resolve, reject) {
      // Take our override out, we're all set now.
      delete newRequest.then;
      return existingThen.call(newRequest, (rz) => {
        if (superagentHistogram) {
          const hrdur = process.hrtime(startTime);
          const dur = hrdur[0] + (hrdur[1] / 1000000000);
          superagentHistogram.observe({
            source: service.name,
            status: rz.status,
            endpoint: `${method}_${url}`,
          }, dur);
        }
        return resolve ? resolve(rz) : rz;
      }, shouldLogErrors ? (e) => {
        const hrdur = process.hrtime(startTime);
        const dur = hrdur[0] + (hrdur[1] / 1000000000);
        if (superagentHistogram) {
          superagentHistogram.observe({
            source: service.name,
            status: e.status,
            endpoint: `${method}_${url}`,
          }, dur);
        }
        logger.error('Http request failed', {
          status: e.status,
          url,
          method,
          dur,
        });
        if (reject) {
          reject(e);
        } else {
          throw e;
        }
      } : reject);
    };
    return newRequest;
  };
}

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
      next();
      return;
    }

    if (!req.headers.correlationid) {
      // Make up a correlation id if one was not passed
      req.headers.correlationid = objectID().toString('base64');
    }

    const logDefaults = { c: req.headers.correlationid };
    let logOpts;
    if (req.headers.span) {
      logDefaults.span = req.headers.span;
      logOpts = { spanId: req.headers.span };
    }
    let logger = service.logger.loggerWithDefaults(logDefaults, logOpts);
    if (!req.headers.span) {
      logger = logger.loggerWithNewSpan();
    }

    req[propName] = Object.assign({}, service.hydratedObjects, {
      config: service.config,
      /**
       * A request specific logger that adds the correlation id
       */
      logger,
      /**
       * Wrap different forms of errors into something useful for winston
       */
      wrapError(...args) { return service.wrapError(...args); },
      /**
       * Throw a well formed error to be caught and sent in finalHandler
       */
      throwError: throwError.bind(this, service.name),
      /**
       * A requestInterceptor for swagger calls that adds correlation id.
       * This means the services property is "special" which is not great.
       * But did I say this was an opinionated library? I did.
       */
      services: serviceProxy(req),
      /**
       * A superagent request with automatic metrics and tracking
       */
      doHttpRequest: superagentFunctor(service, logger),
    });
    next();
  };
}

import objectID from 'bson-objectid';
import expressPromisePatch from '@gasbuddy/express-promise-patch';
import Service from './Service';
import { superagentFunctor } from './superagentHelper';
import { loggableError, throwError, childContextCreator } from './util';

/**
 * Middleware to attach the "service" object to the request and add various request-specific
 * features to it such as logging and inter-service correlation
 */
export default function requestFactory(options) {
  // The name of the property to which we should write the "app local" variables
  const propName = (options ? options.property : 'gb') || 'gb';
  const echoCorrelationId = options && options.echoCorrelationId;

  expressPromisePatch((req, e) => {
    const logger = (req[propName] && req[propName].logger) ? req[propName].logger : console;
    logger.error('express error', loggableError(e));
  });

  return function requestMiddleware(req, res, next) {
    const service = Service.get(req);

    if (!service) {
      // Not a request with our object attached, so we're out.
      next();
      return;
    }

    let corError;
    if (!req.headers.correlationid) {
      if (req.headers['x-request-id']) {
        req.headers.correlationid = req.headers['x-request-id'];
      } else {
        // Make up a correlation id if one was not passed
        req.headers.correlationid = objectID().toString('base64');
      }
      if (!res.headersSent) {
        try {
          res.setHeader('correlationid', req.headers.correlationid);
        } catch (error) {
          corError = error;
        }
      }
    }
    if (echoCorrelationId && !res.headersSent) {
      try {
        res.setHeader('correlationid', req.headers.correlationid);
      } catch (error) {
        corError = error;
      }
    }

    const logDefaults = { c: req.headers.correlationid };
    let logOpts;
    if (req.headers.span) {
      logDefaults.sp = req.headers.span;
      logOpts = { spanId: req.headers.span };
    }
    let logger = service.logger.loggerWithDefaults(logDefaults, logOpts);
    if (!req.headers.span) {
      logger = logger.loggerWithNewSpan();
    }

    if (corError) {
      logger.error('Unable to return correlationId', service.wrapError(corError));
    }

    req[propName] = Object.assign({}, service.hydratedObjects, {
      config: service.config,
      /**
       * A request specific logger that adds the correlation id
       */
      logger,
      /**
       * Wrap different forms of errors into something useful for logging
       */
      wrapError(...args) { return service.wrapError(...args); },
      /**
       * Throw a well formed error to be caught and sent in finalHandler
       */
      throwError: throwError.bind(this, service.name),
      /**
       * A superagent request with automatic metrics and tracking
       */
      requestWithContext: superagentFunctor(service, req, logger),
      /**
       * Create a secondary "request like object" with a correlationid suffix
       */
      childCorrelationContext: childContextCreator(service, req, propName),
    });
    // Let interested parties examine and add to the annotated request
    service.emit('request', req);
    next();
  };
}

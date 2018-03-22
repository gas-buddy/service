import winston from 'winston';
import { servicesWithOptions, OriginalCallPropertyKey } from '@gasbuddy/configured-swagger-client';
import { superagentFunctor } from './superagentHelper';
import Service from './Service';

const objMessage = `

*********************************************
DO NOT USE .obj anymore, as underlying
swagger-client has moved to .body.
*********************************************

`;

/**
 * Turn most inputs into real errors.
 */
function normalizeError(error) {
  const isError = error instanceof Error;

  if (isError) {
    return error;
  }

  const props = {
    message: (typeof error === 'string') ? error : JSON.stringify(error),
    name: 'NormalizedError',
  };

  const newError = Error.call(props);
  Error.captureStackTrace(newError, normalizeError);
  Object.assign(newError, props, (typeof error === 'object' ? error : {}));

  return newError;
}

/**
 * Swagger client returns a wrapped error. Unwrap it.
 * Also avoids non-serializable errors.
 */
export function winstonError(error) {
  const errorData = error;
  if (error.errObj) {
    errorData.message = error.statusText || error.errObj.message;
    errorData.stack = error.errObj.stack;
  }

  return normalizeError(errorData);
}

/**
 * Build and throw a well formed error to be caught and sent in finalHandler
 */
export function throwError(serviceName, codeOrError = 'nocode', message = 'nomessage', status = 500, domain) {
  let error = codeOrError;
  if (!(error instanceof Error)) {
    error = new Error(message);
  }

  error.code = error.code || codeOrError;
  error.status = error.status || status;
  error.domain = error.domain || domain || serviceName;

  throw error;
}

/**
 * Add a request interceptor to outbound swagger that carries the
 * correlationId forward and fires events on the Service
 */
export function serviceProxy(req) {
  const svc = Service.get(req);
  if (!svc) {
    return null;
  }
  const services = svc.services || req.services;
  if (!services) {
    return null;
  }

  const defaultTimeout = svc.config.get('connections:services:defaultTimeout');

  return servicesWithOptions(services, {
    requestInterceptor(request) {
      request.headers.correlationid = request.headers.correlationid || req.headers.correlationid;
      if (req.gb && req.gb.logger && typeof req.gb.logger.loggerWithNewSpan === 'function') {
        const newLogger = req.gb.logger.loggerWithNewSpan();
        request.headers.span = newLogger.spanId;
      }
      if (defaultTimeout) {
        request.timeout = this.timeout || defaultTimeout;
      }
      svc.emit(Service.Event.BeforeServiceCall, request);
      return request;
    },
    responseInterceptor(response) {
      svc.emit(Service.Event.AfterServiceCall, response, this);
      if (response.body) {
        if (['development', 'test', ''].includes(process.env.NODE_ENV || '')) {
          Object.defineProperty(response, 'obj', {
            get() {
              // eslint-disable-next-line no-console
              console.error(objMessage);
              throw new Error('Out of date swagger response handling');
            },
          });
        } else {
          response.obj = response.body;
        }
      }
      // Swagger errObj's are crap. So we change them to not crap.
      if (this.errObj && this[OriginalCallPropertyKey]) {
        Object.assign(this[OriginalCallPropertyKey], {
          message: this.errObj.message,
          status: this.errObj.status,
          response: this.errObj.response,
        });
        this.errObj = this[OriginalCallPropertyKey];
      }
      return response;
    },
  });
}

export function addCorrelationWarning(clientInfo, endpointConfig) {
  if (!endpointConfig || endpointConfig.disableCorrelation !== true) {
    clientInfo.config.requestInterceptor = function requestInterceptor() {
      winston.warn(`
********************************************************************
Service call is missing requestInterceptor for logging. Please call
the service via req.gb.services, or disable logging by setting
disableCorrelation: true in the endpoint configuration.
********************************************************************
`,
        {
          method: this.method,
          url: this.url,
        },
      );
      return this;
    };
  }
}

export function childContextCreator(service, req, propName) {
  return (suffix) => {
    const newId = `${req.headers.correlationid}#${suffix}`;
    const newReq = Object.assign({}, req);
    newReq.headers = Object.assign({}, req.headers, { correlationid: newId });
    const newLogger = req[propName].logger.loggerWithDefaults({ c: newId });
    newReq[propName] = Object.assign({}, req[propName], {
      logger: newLogger,
      services: serviceProxy(newReq),
      requestWithContext: superagentFunctor(service, newReq, newLogger),
      childCorrelationContext: childContextCreator(service, newReq, propName),
    });
    return newReq;
  };
}

export function syntheticRequest(service, correlationid) {
  const req = {
    app: service.app,
    gb: Object.create(Object.getPrototypeOf(service)),
    headers: {
      correlationid,
    },
  };
  const services = serviceProxy(req);
  const logger = service.logger.loggerWithDefaults({ c: req.headers.correlationid });
  Object.assign(req.gb, service, {
    services,
    logger,
    throwError: throwError.bind(this, service.name),
    wrapError(...args) { return service.wrapError(...args); },
    requestWithContext: superagentFunctor(service, req, logger),
    childCorrelationContext: childContextCreator(service, req, 'gb'),
  });
  return req;
}

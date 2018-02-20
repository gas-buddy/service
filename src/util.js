import winston from 'winston';
import { servicesWithOptions, OriginalCallPropertyKey } from '@gasbuddy/configured-swagger-client';
import { superagentFunctor } from './superagentHelper';
import Service from './Service';

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
    requestInterceptor() {
      this.headers.correlationid = this.headers.correlationid || req.headers.correlationid;
      if (req.gb && req.gb.logger && typeof req.gb.logger.loggerWithNewSpan === 'function') {
        const newLogger = req.gb.logger.loggerWithNewSpan();
        this.headers.span = newLogger.spanId;
      }
      if (defaultTimeout) {
        this.timeout = this.timeout || defaultTimeout;
      }
      svc.emit(Service.Event.BeforeServiceCall, this);
      return this;
    },
    responseInterceptor(originalRequest) {
      svc.emit(Service.Event.AfterServiceCall, this, originalRequest);
      // Swagger errObj's are crap. So we change them to not crap.
      if (this.errObj && originalRequest[OriginalCallPropertyKey]) {
        Object.assign(originalRequest[OriginalCallPropertyKey], {
          message: this.errObj.message,
          status: this.errObj.status,
          response: this.errObj.response,
        });
        this.errObj = originalRequest[OriginalCallPropertyKey];
      }
      return this;
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
  });
  return req;
}

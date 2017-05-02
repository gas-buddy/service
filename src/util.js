import { servicesWithOptions } from '@gasbuddy/configured-swagger-client';
import Service from './Service';

/**
 * Error normalization functions
 */
function serialize(error) {
  const type = typeof error;
  const byType = {
    string: e => e,
    object: e => JSON.stringify(e),
  };

  return byType[type] && byType[type](error);
}

function normalizeError(error) {
  const isError = error instanceof Error;

  if (isError) {
    return error;
  }

  let localError = error;
  const props = {
    message: serialize(error),
    name: 'NormalizedError',
  };

  Error.captureStackTrace(props, normalizeError);

  if (typeof error !== 'object') {
    localError = {};
  }

  Object.assign(props, localError);
  Object.setPrototypeOf(props, Error.prototype);
  Error.call(props);

  return props;
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
      if (defaultTimeout) {
        this.timeout = this.timeout || defaultTimeout;
      }
      svc.emit(Service.Event.BeforeServiceCall, this);
      return this;
    },
    responseInterceptor(originalRequest) {
      svc.emit(Service.Event.AfterServiceCall, this, originalRequest);
      return this;
    },
  });
}

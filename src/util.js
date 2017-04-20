import { servicesWithOptions } from '@gasbuddy/configured-swagger-client';
import Service from './Service';

/**
 * Swagger client returns a wrapped error. Unwrap it.
 * Also avoids non-serializable errors.
 */
export function winstonError(error) {
  let message = error.message;
  let stack = error.stack;
  const status = error.status;
  if (error.errObj) {
    message = error.statusText || error.errObj.message;
    stack = error.errObj.stack;
  }
  const wrapped = {
    message,
    stack,
    status,
  };
  if (error.url) {
    wrapped.url = error.url;
  }
  return wrapped;
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

  return servicesWithOptions(services, {
    requestInterceptor() {
      this.headers.correlationid = this.headers.correlationid || req.headers.correlationid;
      svc.emit(Service.Event.BeforeServiceCall, this);
      return this;
    },
    responseInterceptor(originalRequest) {
      svc.emit(Service.Event.AfterServiceCall, this, originalRequest);
      return this;
    },
  });
}

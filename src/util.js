import URL from 'url';
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
  return {
    message,
    stack,
    status,
  };
}

/**
 * Add a request interceptor to outbound swagger that carries the
 * correlationId forward, optionally using a global proxy as well
 */
export function serviceProxy(req, proxy) {
  const svc = Service.get(req);
  if (!svc || !svc.services) {
    return null;
  }

  const useProxy = proxy || svc.configuredProxy;
  return servicesWithOptions(svc.services, {
    requestInterceptor() {
      this.headers.correlationid = this.headers.correlationid || req.headers.correlationid;
      svc.emit(Service.Event.BeforeServiceCall, this);
      if (useProxy) {
        const { protocol, path: pathAndQuery, hostname, port } = URL.parse(this.url);
        if (!hostname.includes('.')) {
          this.headers.Port = port;
          this.headers.Host = hostname;
          this.headers.Protocol = protocol.replace(/:$/, '');
          this.url = `http://${useProxy}${pathAndQuery}`;
        }
      }
      return this;
    },
    responseInterceptor(originalRequest) {
      svc.emit(Service.Event.AfterServiceCall, this, originalRequest);
      return this;
    },
  });
}

import { URL } from 'node:url';
import type {
  FetchConfig,
  FetchRequest,
  RestApiErrorResponse,
  RestApiSuccessResponse,
} from 'rest-api-support';
import EventSource from 'eventsource';

import type { ServiceConfiguration } from '../config/schema';
import {
  RequestLike, ServiceError, ServiceExpress, ServiceLocals,
} from '../types';

class CustomEventSource extends EventSource {
  private activeListeners: Array<{ handler: (data: any) => void; name: string }> = [];

  addEventListener(name: string, handler: (data: any) => void): this {
    super.addEventListener(name, handler);
    this.activeListeners.push({ name, handler });
    return this;
  }

  removeAllListeners() {
    this.activeListeners.forEach(
      (l) => super.removeEventListener(l.name as keyof EventSourceEventMap, l.handler),
    );
  }
}

/**
 * Return a factory that will make instances of an OpenAPI/Swagger client for each request
 */
export function createServiceInterface<ServiceType>(
  service: ServiceExpress,
  name: string,
  Implementation: { new (c: FetchConfig): ServiceType },
): ServiceType {
  const appConfig = service.locals.config;
  const config = {
    ...(appConfig.get('connections:default') || {}),
    ...(appConfig.get(`connections:${name}`) || {}),
  } as ServiceConfiguration;
  const protocol = config?.protocol || 'http';
  const port = config?.port || 8000;
  const host = config?.host || name;
  const baseUrl = `${protocol}${protocol.endsWith(':') ? '//' : '://'}${host}:${port}${
    config?.basePath || ''
  }`;

  const fetchConfig: FetchConfig = {
    fetch,
    AbortController,
    EventSource: CustomEventSource,
    FormData,
    baseUrl,
  };

  // In development, it can be useful to route requests through
  // a centralized local proxy (we use https://github.com/gas-buddy/container-proxy).
  // This allows you to run a subset of services locally and route the rest
  // of the requests to another (typically remote) environment.
  if (config?.proxy) {
    const proxyUrl = new URL(config.proxy);
    const proxyPort = proxyUrl.protocol === 'https:' ? '8443' : '8000';

    fetchConfig.requestInterceptor = (params: FetchRequest) => {
      const parsedUrl = new URL(params.url);
      const proto = parsedUrl.protocol.replace(/:$/, '');
      const defaultPort = proto === 'https' ? 8443 : 8000;
      const headers: FetchRequest['headers'] = {};
      headers.host = `${proto}.${parsedUrl.hostname}.${port || defaultPort}`;
      headers.source = service.locals.name;
      parsedUrl.hostname = proxyUrl.hostname;
      parsedUrl.protocol = proxyUrl.protocol;
      parsedUrl.port = proxyUrl.port || proxyPort;
      // eslint-disable-next-line no-param-reassign
      params.headers = params.headers || {};
      Object.assign(params.headers, headers);
      // eslint-disable-next-line no-param-reassign
      params.url = parsedUrl.href;
    };
  }

  return new Implementation(fetchConfig);
}

/**
 * Require that a service call succeeds or throw a service exception
 * (which narrows the response type information for the normal case)
 */
export async function succeedOrThrow<
  ResponseType,
  SLocals extends ServiceLocals = ServiceLocals,
>(
  req: RequestLike<SLocals, any>,
  callPromise: Promise<RestApiSuccessResponse<ResponseType> | RestApiErrorResponse>,
): Promise<RestApiSuccessResponse<ResponseType>> {
  return callPromise.then((result) => {
    if (result.responseType === 'error') {
      throw new ServiceError(req.app, result.body?.message || 'Service call failed', {
        ...result.body,
        status: result.status,
      });
    }
    return result;
  });
}

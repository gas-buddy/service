// tslint:disable
interface SelfApiPromise<T> extends Promise<T>{
  abort();
  /**
   * Expect certain status codes and accept the promise rather than
   * throwing
   */
  expect(...statusCodes) : SelfApiPromise<T>;
}

interface EventSource {
  constructor(url: string, init?: any);
  removeAllListeners();
  addEventListener(name: string, handler: (data: any) => void);
  close();
}

interface SelfApiErrorResponse {
  code: string;
  message: string;
  domain: string;
  display_message?: string;
}

interface SelfApiRequestOptions {
  /**
   * Run before the request goes out with the parameters that will be used
   */
  requestInterceptor: (parameters: any) => void;
  /**
   * Run after the request comes back
   */
  responseInterceptor: (response: any, parameters: any) => void;
}

export class SelfApiConfiguration {
  /**
   * Will be prepended to the path defined in the Swagger spec
   */
  baseUrl?: string;

  /**
   * For streaming requests
   */
  EventSource: (url: string, init?: any) => EventSource;

  /**
   * For non-streaming requests
   */
  fetch: (url: string, init?: any) => Promise<Response>;

  /**
   * Run before the request goes out with the parameters that will be used
   */
  requestInterceptor: (parameters: any) => void;

  /**
   * Run after the request comes back
   */
  responseInterceptor: (response: any, parameters: any) => void;
}


export default class SelfApi {
  constructor(configOrFunctionGeneratingConfig: SelfApiConfiguration);

  /**
   * Returns a greeting to the user!
   *
   */
  get_hello_world(request?: null | undefined, options?: SelfApiRequestOptions) : SelfApiPromise<string | SelfApiErrorResponse | null>;

  /**
   * Throw an error
   *
   */
  get_throw(request?: null | undefined, options?: SelfApiRequestOptions) : SelfApiPromise<string | SelfApiErrorResponse | null>;
}

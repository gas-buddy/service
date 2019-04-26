// eslint-disable-next-line no-unused-vars
import { parameterBuilder, fetchHelper, eventSourceHelper } from 'rest-api-support';

/**
 *
 * @export
 * @class SelfApi
 */
export default class SelfApi {
  constructor(configOrGenerator) {
    let config = configOrGenerator;
    if (typeof configOrGenerator === 'function') {
      config = configOrGenerator(SelfApi);
    }
    const {
      baseUrl = '',
      fetch,
      EventSource,
      requestInterceptor,
      responseInterceptor,
    } = config || {}
    Object.assign(this, { baseUrl, fetch, requestInterceptor, responseInterceptor, EventSource });
  }

  /**
   * Returns a greeting to the user!
   *
   */
  get_hello_world(hasNoArguments, fetchOptions) {
    // Build parameters, run request interceptors, fetch, and then run response interceptors
    // eslint-disable-next-line prefer-rest-params
    const source = { method: 'get_hello_world', client: '', arguments: arguments[0] };
    const fetchArgs = parameterBuilder('GET', this.baseUrl, '/hello/world')
      .build();
    return fetchHelper(this, fetchArgs, fetchOptions, source);
  }

  /**
   * Throw an error
   *
   */
  get_throw(hasNoArguments, fetchOptions) {
    // Build parameters, run request interceptors, fetch, and then run response interceptors
    // eslint-disable-next-line prefer-rest-params
    const source = { method: 'get_throw', client: '', arguments: arguments[0] };
    const fetchArgs = parameterBuilder('GET', this.baseUrl, '/throw')
      .build();
    return fetchHelper(this, fetchArgs, fetchOptions, source);
  }
}

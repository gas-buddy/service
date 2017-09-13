import path from 'path';
import Service from './Service';

/**
 * Make it easier to write batch jobs by reusing service config without
 * a server. This function manages service startup and shutdown, and runs
 * asyncFn between those two. Supported options:
 *   name: The service name, taken from package.json if not specified
 *   serviceClass: The constructor for your service, defaults to @gasbuddy/service#Service
 *   srcRoot: The root directory of your source files,
 *      defaults to cwd()+/src or cwd()+/build in prod
 */
export async function runWithService(asyncFn, options) {
  const opts = options || {};

  if (!opts.name) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const pkg = require(path.join(process.cwd(), 'package.json'));
    opts.name = pkg.name.replace(/^@[^/]+\//, '');
  }

  if (!opts.srcRoot) {
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
      opts.srcRoot = path.join(process.cwd(), 'build');
    } else {
      opts.srcRoot = path.join(process.cwd(), 'src');
    }
  }

  const ServiceClass = opts.serviceClass || Service;
  const service = new ServiceClass(opts.name);
  if (opts.onConfigurationLoaded) {
    service.onConfigurationLoaded(opts.onConfigurationLoaded);
  }

  return service.configure(opts.srcRoot)
    .then(() => asyncFn(service))
    .then(() => service.destroy())
    .catch((e) => {
      if (service.logger && service.logger.error) {
        service.logger.error('Failed to complete service cleanup', service.wrapError(e));
        service.destroy();
      } else {
        // eslint-disable-next-line
        console.error('Service configuration failed', e);
      }
      process.exitCode = -1;
    });
}

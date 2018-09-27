#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import util from 'util';
import repl from 'repl';
import minimist from 'minimist';
import 'source-map-support/register';
import Log from '@gasbuddy/configured-pino';
import Service from './Service';
import Server from './Server';
import { syntheticRequest } from './util';

const argv = minimist(process.argv.slice(2), {
  boolean: ['built', 'repl', 'nobind'],
});

let ServiceClass = Service;

if (argv.module) {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const serviceModule = require(argv.module);
  if (argv.className && serviceModule[argv.className]) {
    ServiceClass = serviceModule[argv.className];
  } else {
    ServiceClass = serviceModule;
  }
}

const prettyPrint = !process.env.NO_PRETTY_LOGS ||
  ((process.env.NODE_ENV || 'development') === 'development');
const BaseLogger = new Log({}, {
  prettyPrint,
  useLevelLabels: true,
  meta: { },
});
const logger = BaseLogger.start();

const ServerClass = ServiceClass.Server || Server;

// eslint-disable-next-line import/no-dynamic-require
const pkg = require(path.join(process.cwd(), 'package.json'));
const name = pkg.name.replace(/^@[^/]+\//, '');

// ES6 native promises are kinda slow, missing convenience methods,
// and don't get long stack traces (mainly used in tests). This decision has
// to be made early, thus we make it here in our opinionated launcher
global.Promise = require('bluebird');

// More opinion... Your src should be in src pre-transpile and build after
let dirname = path.join(process.cwd(), 'src');

if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging' || argv.built) {
  dirname = path.join(process.cwd(), 'build');
} else {
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  const ignore = require('babel-preset-gasbuddy/ignore');
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  require('babel-register')({ ignore });
}

try {
  const env = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
  if (env) {
    for (const envVar of env.split('\n')) {
      const match = envVar.match(/(?:\S+\s+)?\s*([^=]+)\s*=(.*)\s*/);
      if (match) {
        if (!process.env[match[1]]) {
          logger.info(`Read ${match[1]} environment variable from .env`);
          process.env[match[1]] = match[2];
        }
      }
    }
  }
} catch (error) {
  // Nothing to do
}

logger.info(`Starting ${name} from ${dirname}`);

let service;
let server;

process.on('unhandledRejection', (err) => {
  try {
    if (service && service.wrapError) {
      logger.error('Unhandled Rejection', service.wrapError(err));
    } else {
      logger.error('Unhandled Rejection', JSON.stringify(err));
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Unhandled Rejection', JSON.stringify(err));
  }
});

if (argv.nobind) {
  service = new ServiceClass(name);
  service.configure(dirname).catch((err) => {
    logger.error('Configuration failed', service.wrapError(err));
  }).then(() => {
    // Done with this disconnected logger
    BaseLogger.stop();
  });
} else {
  // Done with this disconnected logger
  BaseLogger.stop();
  server = new ServerClass(name);
  service = server.service;

  server
    .create(dirname)
    .catch(() => {
      if (!argv.repl) {
        process.exit(-1);
      }
    });
}

if (argv.repl) {
  let promiseCounter = 1;
  const rl = repl.start({
    prompt: '> ',
    writer(v) {
      if (v && typeof v.then === 'function' && typeof v.catch === 'function') {
        const me = promiseCounter;
        promiseCounter += 1;
        v
          // eslint-disable-next-line no-console
          .then(r => console.log(`\nPromise #${me} returns`, util.inspect(r)))
          // eslint-disable-next-line no-console
          .catch(e => console.error(`\nPromise #${me} error`, util.inspect(e)));
        return `{ Returned Promise #${me} }`;
      }
      return util.inspect(v);
    },
  });
  rl.on('exit', () => {
    service.destroy();
  });

  service.on('configured', () => {
    // Build a synthetic req to make calls easier
    const correlationid = argv.correlationid || `${service.name}-repl-${Date.now()}`;
    const req = syntheticRequest(service, correlationid);
    rl.context.req = req;
  });

  rl.context.server = server;
  rl.context.service = service;
  rl.context.repl = rl;
}

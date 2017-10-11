#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import util from 'util';
import repl from 'repl';
import winston from 'winston';
import minimist from 'minimist';
import 'source-map-support/register';
import Service from './Service';
import { serviceProxy } from './util';

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
  require('babel-register');
}

try {
  const env = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
  if (env) {
    for (const envVar of env.split('\n')) {
      const match = envVar.match(/(?:\S+\s+)?\s*([^=]+)\s*=(.*)\s*/);
      if (match) {
        if (!process.env[match[1]]) {
          winston.info(`Read ${match[1]} environment variable from .env`);
          process.env[match[1]] = match[2];
        }
      }
    }
  }
} catch (error) {
  // Nothing to do
}

winston.info(`Starting ${name} from ${dirname}`);

let service;
let server;

if (argv.nobind) {
  service = new ServiceClass(name);
  service.configure(dirname).catch((err) => {
    winston.error('Configuration failed', service.wrapError(err));
  });
} else {
  server = new ServiceClass.Server(name);
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

  // Build a synthetic req to make calls easier
  const req = {
    app: service.app,
    gb: Object.create(Object.getPrototypeOf(service)),
    headers: {
      correlationid: argv.correlationid || `${service.name}-repl-${Date.now()}`,
    },
  };
  const services = serviceProxy(req);
  const logger = service.logger.loggerWithDefaults({ c: req.headers.correlationid });
  Object.assign(req.gb, service, { services, logger });

  rl.context.server = server;
  rl.context.service = service;
  rl.context.req = req;
  rl.context.repl = rl;
}

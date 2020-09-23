#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import util from 'util';
import repl from 'repl';
import minimist from 'minimist';
import 'source-map-support/register';
import Log from '@gasbuddy/configured-pino';
import dotenv from 'dotenv';
import Service from './Service';
import Server from './Server';
import { syntheticRequest } from './util';

const HISTORY_FILE = '.node_repl_history.log';

const argv = minimist(process.argv.slice(2), {
  boolean: ['built', 'repl', 'nobind', 'babel', 'nosubs'],
});

if (argv.nosubs) {
  // A little helper for a common issue which is wanting to run a service
  // without any queue processing
  process.env.DISABLE_RABBITMQ_SUBSCRIPTIONS = 'true';
  process.env.DISABLE_SQS_SUBSCRIPTIONS = 'true';
}

if (argv.repl) {
  // REPL shouldn't buffer logs
  process.env.NO_LOG_BUFFERING = 'true';
}

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

const prettyPrint = !process.env.NO_PRETTY_LOGS
  || ((process.env.NODE_ENV || 'development') === 'development');
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

if (!argv.babel && (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging' || argv.built)) {
  dirname = path.join(process.cwd(), 'build');
} else {
  // eslint-disable-next-line global-require
  require('@babel/register')();
}

dotenv.config();

logger.info(`Starting ${name} from ${dirname}`);

let service;
let server;

process.on('unhandledRejection', (err) => {
  try {
    if (service && service.wrapError) {
      (service.baseLogger || service.logger || logger).error('Unhandled Rejection', service.wrapError(err));
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
  ({ service } = server);

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
  let displayedHistoryError = false;
  const rl = repl.start({
    prompt: '> ',
    writer(v) {
      try {
        fs.appendFileSync(HISTORY_FILE, `${rl.lines.join('\n')}\n`);
      } catch (e) {
        if (!displayedHistoryError) {
          displayedHistoryError = true;
          // eslint-disable-next-line no-console
          console.error('History could not be saved', e);
        }
      }
      if (v && typeof v.then === 'function' && typeof v.catch === 'function') {
        const me = promiseCounter;
        promiseCounter += 1;
        v
          .then((r) => {
            // eslint-disable-next-line no-console
            console.log(`\nPromise #${me} returns`, util.inspect(r));
            rl.context.$ = r;
          })
          .catch((e) => {
            // eslint-disable-next-line no-console
            console.error(`\nPromise #${me} error`, util.inspect(e));
            rl.context.$error = e;
          });
        return `{ Returned Promise #${me} }`;
      }
      return util.inspect(v);
    },
  });
  try {
    // load command history from a file
    fs.readFileSync(HISTORY_FILE, 'utf8')
      .split('\n')
      .reverse()
      .filter(line => line.trim())
      .forEach(line => rl.history.push(line));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      // eslint-disable-next-line no-console
      console.error('History unavailable', e);
    }
  }
  rl.on('exit', async () => {
    (server || service).destroy();
  });

  service.on('configured', () => {
    // Build a synthetic req to make calls easier
    const correlationid = argv.correlationid || `${service.name}-repl-${Date.now()}`;
    const req = syntheticRequest(service, correlationid);
    rl.context.req = req;
    if (typeof service.prepareRepl === 'function') {
      service.prepareRepl(rl);
    }
  });

  rl.context.server = server;
  rl.context.service = service;
  rl.context.repl = rl;
  // eslint-disable-next-line no-console
  rl.context.dump = o => console.log(JSON.stringify(o, null, '\t'));
}

#!/usr/bin/env node
import dotenv from 'dotenv';
import minimist from 'minimist';
import path from 'path';
import readPackageUp from 'read-pkg-up';

import type { NormalizedPackageJson } from 'read-pkg-up';
import serviceRepl from '../development/repl';
import { isDev } from '../env';
import { startWithTelemetry } from '../telemetry';
import { ServiceStartOptions } from '../types';

/**
 * built - forces the use of the build directory. Defaults to true in stage/prod, not in dev
 * repl - launch the REPL (defaults to disabling telemetry)
 * telemetry - whether to use OpenTelemetry. Defaults to false in dev or with repl
 * nobind - do not listen on http port or expose metrics
 */
const argv = minimist(process.argv.slice(2), {
  boolean: ['built', 'repl', 'telemetry', 'nobind'],
});

function resolveMain(packageJson: NormalizedPackageJson) {
  if (typeof packageJson.main === 'string') {
    return packageJson.main;
  }
  return undefined;
}

async function getServiceDetails() {
  if (argv.name && argv.root) {
    return {
      rootDirectory: argv.root,
      name: argv.name,
      main: argv.main || (isDev() && !argv.built ? 'src/index.ts' : 'build/index.js'),
    };
  }
  const cwd = argv.packageDir ? path.resolve(argv.packageDir) : process.cwd();
  const pkg = await readPackageUp({ cwd });
  if (!pkg) {
    throw new Error(
      `Unable to find package.json in ${cwd} to get main module. Make sure you are running from the package root directory.`,
    );
  }
  const main = resolveMain(pkg.packageJson);
  const parts = pkg.packageJson.name.split('/');
  return {
    main,
    rootDirectory: path.dirname(pkg.path),
    name: parts[parts.length - 1],
  };
}

getServiceDetails().then(async ({ main, rootDirectory, name }) => {
  let entrypoint: string;
  let codepath: 'build' | 'src' = 'build';
  if (isDev() && !argv.built) {
    // eslint-disable-next-line import/no-extraneous-dependencies
    const { register } = await import('ts-node');
    register();
    if (main) {
      entrypoint = main.replace(/^(\.?\/?)build\//, '$1src/').replace(/\.js$/, '.ts');
    } else {
      entrypoint = './src/index.ts';
    }
    codepath = 'src';
  } else if (main) {
    entrypoint = main;
  } else {
    entrypoint = './build/index.js';
  }

  dotenv.config();

  const absoluteEntrypoint = path.resolve(rootDirectory, entrypoint);
  if ((argv.repl || isDev()) && !argv.telemetry) {
    const { startApp, listen } = await import('../express-app/app.js');
    // This needs to be required for TS on-the-fly to work
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const impl = require(absoluteEntrypoint);
    const opts: ServiceStartOptions = {
      name,
      rootDirectory,
      service: impl.default,
      codepath,
    };
    const app = await startApp(opts);
    const server = argv.nobind ? undefined : await listen(app);
    if (argv.repl) {
      serviceRepl(app, () => {
        server?.close();
      });
    }
  } else {
    const { server, app } = await startWithTelemetry({
      name,
      rootDirectory,
      service: absoluteEntrypoint,
    });
    if (argv.repl) {
      serviceRepl(app, () => server.close());
    }
  }
});

#!/usr/bin/env node
import dotenv from 'dotenv';
import minimist from 'minimist';
import path from 'path';
import readPackageUp from 'read-pkg-up';

import type { NormalizedPackageJson } from 'read-pkg-up';
import serviceRepl from '../development/repl';
import { isDev } from '../env';
import startWithTelemetry from '../telemetry/telemetry';
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

async function getPackage() {
  const cwd = argv.packageDir ? path.resolve(argv.packageDir) : process.cwd();
  const pkg = await readPackageUp({ cwd });
  if (!pkg) {
    throw new Error(
      `Unable to find package.json in ${cwd} to get main module. Make sure you are running from the package root directory.`,
    );
  }
  return pkg;
}

function resolveMain(packageJson: NormalizedPackageJson) {
  if (typeof packageJson.main === 'string') {
    return packageJson.main;
  }
  return undefined;
}

getPackage().then(async (pkg) => {
  const main = resolveMain(pkg.packageJson);
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
  const rootDirectory = path.dirname(pkg.path);
  const parts = pkg.packageJson.name.split('/');
  const name = parts[parts.length - 1];

  dotenv.config();

  const absoluteEntrypoint = path.resolve(rootDirectory, entrypoint);
  if ((argv.repl || isDev()) && !argv.telemetry) {
    const { startApp, listen } = await import('../express/app.js');
    // This needs to be required for TS on-the-fly to work
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const impl = require(absoluteEntrypoint);
    const opts: ServiceStartOptions = {
      name,
      rootDirectory,
      service: impl.default,
      codepath,
    };
    if (typeof impl.configure === 'function') {
      // Give the service a chance to modify the startup options (mostly for config dirs)
      impl.configure(opts);
    }
    const app = await startApp(opts);
    const server = argv.nobind ? undefined : await listen(app);
    if (argv.repl) {
      serviceRepl(app, () => {
        server?.close();
        app.locals.service?.stop?.();
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

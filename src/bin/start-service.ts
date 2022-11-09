#!/usr/bin/env node
import minimist from 'minimist';

import serviceRepl from '../development/repl';
import { isDev } from '../env';
import { bootstrap } from '../start';

/**
 * built - forces the use of the build directory. Defaults to true in stage/prod, not in dev
 * repl - launch the REPL (defaults to disabling telemetry)
 * telemetry - whether to use OpenTelemetry. Defaults to false in dev or with repl
 * nobind - do not listen on http port or expose metrics
 */
const argv = minimist(process.argv.slice(2), {
  boolean: ['built', 'repl', 'telemetry', 'nobind'],
});

const noTelemetry = (argv.repl || isDev()) && !argv.telemetry;
bootstrap({
  ...argv,
  telemetry: !noTelemetry,
}).then(({ app, server }) => {
  if (argv.repl) {
    serviceRepl(app, () => {
      server?.close();
    });
  }
});

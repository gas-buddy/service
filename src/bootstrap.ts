import path from 'path';
import dotenv from 'dotenv';
import readPackageUp from 'read-pkg-up';
import type { NormalizedPackageJson } from 'read-pkg-up';
import type { RequestLocals, ServiceLocals, ServiceStartOptions } from './types';
import { isDev } from './env';
import { startWithTelemetry } from './telemetry/index';

interface BootstrapArguments {
  // The name of the service, else discovered via read-pkg-up
  name?: string;
  // The name of the file with the service function, relative to root
  main?: string;
  // Root directory of the app, else discovered via read-pkg-up
  root?: string;
  // Use built directory. Omitting lets us determine a sensible default
  built?: boolean;
  // The location of the package.json used for discovery (defaults to cwd)
  packageDir?: string;
  // Whether to engage telemetry
  telemetry?: boolean;
  // Don't bind to http port or expose metrics
  nobind?: boolean;
  // Specify whether the app wants to use a src/index.js as entrypoint instead of a src/index.ts
  useJsEntrypoint?: boolean;
}

function resolveMain(packageJson: NormalizedPackageJson) {
  if (typeof packageJson.main === 'string') {
    return packageJson.main;
  }
  return undefined;
}

async function getServiceDetails(argv: BootstrapArguments = {}) {
  const useJsEntrypoint = !!argv.useJsEntrypoint;

  if (argv.name && argv.root) {
    return {
      rootDirectory: argv.root,
      name: argv.name,
      main: argv.main || (isDev() && !argv.built ? `src/index.${useJsEntrypoint ? 'j' : 't'}s` : 'build/index.js'),
      useJsEntrypoint,
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
    useJsEntrypoint,
  };
}

// Automagically start your app by using common patterns
// to find your implementation and settings. This is most useful
// for jobs or other scripts that need service infra but are
// not simply the service
export async function bootstrap<
  SLocals extends ServiceLocals = ServiceLocals,
  RLocals extends RequestLocals = RequestLocals,
>(argv?: BootstrapArguments) {
  const {
    main,
    rootDirectory,
    name,
    useJsEntrypoint,
  } = await getServiceDetails(argv);

  let entrypoint: string;
  let codepath: 'build' | 'src' = 'build';
  if (isDev() && argv?.built !== true) {
    const targetExtension = useJsEntrypoint ? 'js' : 'ts';
    if (useJsEntrypoint) {
      /* eslint-disable global-require */
      /* eslint-disable import/no-extraneous-dependencies */
      (require('@babel/register'))({
        root: rootDirectory,
        ignore: [/node_modules/],
        only: [rootDirectory],
      });
      /* eslint-enable import/no-extraneous-dependencies */
      /* eslint-enable global-require */
    } else {
      // eslint-disable-next-line import/no-extraneous-dependencies
      const { register } = await import('ts-node');
      register();
    }
    if (main) {
      const targetDir = main.replace(/^(\.?\/?)build\//, '$1src/');
      entrypoint = useJsEntrypoint ? targetDir : targetDir.replace(/\.js$/, '.ts');
    } else {
      entrypoint = `src/index.${targetExtension}`;
    }
    codepath = 'src';
  } else if (main) {
    entrypoint = main;
  } else {
    entrypoint = './build/index.js';
  }

  dotenv.config();

  const absoluteEntrypoint = path.resolve(rootDirectory, entrypoint);
  if (argv?.telemetry) {
    return startWithTelemetry<SLocals, RLocals>({
      name,
      rootDirectory,
      service: absoluteEntrypoint,
    });
  }

  // This needs to be required for TS on-the-fly to work
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const impl = require(absoluteEntrypoint);
  const opts: ServiceStartOptions<SLocals, RLocals> = {
    name,
    rootDirectory,
    service: impl.default || impl.service,
    codepath,
  };
  const { startApp, listen } = await import('./express-app/app.js');
  const app = await startApp<SLocals, RLocals>(opts);
  const server = argv?.nobind ? undefined : await listen(app);
  return { server, app };
}

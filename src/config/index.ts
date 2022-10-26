import confit from 'confit';
import fs from 'fs';
import path from 'path';
import { getKmsWrapper } from './kmsWrapper';

import shortstops from './shortstops';

import type { ConfigStore } from './types';

// Order matters here.
const ENVIRONMENTS = ['production', 'staging', 'test', 'development'];

async function pathExists(f: string) {
  return new Promise((accept, reject) => {
    fs.stat(f, (err) => {
      if (!err) {
        accept(true);
      } else if (err.code === 'ENOENT') {
        accept(false);
      } else {
        reject(err);
      }
    });
  });
}

async function addDefaultConfiguration(
  configFactory: ReturnType<typeof confit>,
  directory: string,
  envConfit: ConfigStore,
) {
  const addIfEnv = async (e: string) => {
    const c = path.join(directory, `${e}.json`);
    if (envConfit.get(`env:${e}`) && (await pathExists(c))) {
      configFactory.addDefault(c);
      return true;
    }
    return false;
  };

  await ENVIRONMENTS.reduce(
    (runningPromise, environment) => runningPromise.then((prev) => prev || addIfEnv(environment)),
    Promise.resolve(false),
  );

  const baseConfig = path.join(directory, 'config.json');
  if (await pathExists(baseConfig)) {
    configFactory.addDefault(baseConfig);
  }
}

export interface ServiceConfigurationSpec {
  // Used for "sourcerequire" and other source-relative paths and for the package name
  rootDirectory: string;
  // The LAST configuration is the most "specific" - if a configuration value
  // exists in all directories, the last one wins
  configurationDirectories: string[];
  name: string;
}

export async function loadConfiguration({
  name,
  configurationDirectories: dirs,
  rootDirectory,
}: ServiceConfigurationSpec): Promise<ConfigStore> {
  // We need to fake the KMS implementation because we need the configuration to load first.
  // So if it is used, we will reload the configuration.
  const kms = await getKmsWrapper();
  const defaultProtocols = shortstops({ name, kms }, rootDirectory);
  const specificConfig = dirs[dirs.length - 1];

  // This confit version just gets us environment info
  const envConfit: ConfigStore = await new Promise((accept, reject) => {
    confit(specificConfig).create((err, config) => (err ? reject(err) : accept(config)));
  });
  const configFactory = confit({
    basedir: specificConfig,
    protocols: defaultProtocols,
  });

  /**
   * Note that in confit, when using addDefault,
   * the FIRST addDefault takes precendence over the next (and so on), so
   * if you override this method, you should register your defaults first.
   */
  const defaultOrder = dirs.slice(0, dirs.length - 1).reverse();
  defaultOrder.push(path.join(__dirname, '../..', 'config'));
  await defaultOrder.reduce(
    (promise, dir) => promise.then(() => addDefaultConfiguration(configFactory, dir, envConfit)),
    Promise.resolve(),
  );

  let loaded: ConfigStore = await new Promise((accept, reject) => {
    configFactory.create((err, config) => (err ? reject(err) : accept(config)));
  });

  if (await kms.configureIfNecessary(loaded)) {
    loaded = await new Promise((accept, reject) => {
      configFactory.create((err, config) => (err ? reject(err) : accept(config)));
    });
  }

  return loaded;
}

export function insertConfigurationBefore(
  configDirs: string[] | undefined,
  insert: string,
  before: string,
) {
  const copy = [...(configDirs || [])];
  const index = copy.indexOf(before);
  if (index === -1) {
    copy.push(insert);
  } else {
    copy.splice(index, 0, insert);
  }
  return copy;
}

export * from './schema';
export * from './types';

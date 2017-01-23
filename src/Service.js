import fs from 'fs';
import path from 'path';
import assert from 'assert';
import confit from 'confit';
import express from 'express';
import winston from 'winston';
import { EventEmitter } from 'events';
import meddleware from '@gasbuddy/meddleware';
import { hydrate, dehydrate } from '@gasbuddy/hydration';
import shortstops from './shortstops';
import { winstonError } from './util';

async function pathExists(f) {
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

const CONNECTIONS = Symbol('Property key for objects that need shutdown');
const CONNECTIONS_TREE = Symbol('Structured values for the result of hydration');
const SERVICE = Symbol('The Service class attached to an app');
const environments = ['production', 'staging', 'test', 'development'];

export default class Service extends EventEmitter {
  constructor(options) {
    super();
    if (typeof options === 'string') {
      this.options = { name: options };
    } else {
      assert(options,
        'You must pass either a name for the service or options for configuring the service');
      this.options = Object.assign({}, options);
    }

    // You can pass in an express app or we'll make it
    if (this.options.app) {
      this.app = this.options.app;
      delete this.options.app;
    } else {
      this.app = express();
    }
    this.app[SERVICE] = this;
  }

  get configurationDirectory() {
    return this.options.configDir;
  }

  get name() {
    return this.options.name;
  }

  get hydratedObjects() {
    return this[CONNECTIONS_TREE];
  }

  // eslint-disable-next-line class-methods-use-this
  wrapError(error) {
    return winstonError(error);
  }

  /**
   * Load the confit environment-aware configuration
   * @param sourcedir {string} The directory of your SOURCE files,
   * which may or may not be transpiled. Configuration must be at
   * (sourcedir)/../config or options.configDir
   */
  async configure(sourcedir) {
    if (!this.options.configDir) {
      this.options.configDir = path.join(sourcedir, '..', 'config');
    }

    // Load shortstop handlers
    const defaultProtocols = shortstops(this, sourcedir);
    this.options.protocols = Object.assign(defaultProtocols, this.options.protocols);

    // This confit version just gets us environment info
    const envConfit = await new Promise((accept, reject) => {
      confit().create((err, config) => (err ? reject(err) : accept(config)));
    });
    const confOptions = {
      basedir: this.options.configDir,
      protocols: this.options.protocols,
    };

    const configFactory = confit(confOptions);
    await this.loadDefaultConfiguration(configFactory, envConfit);

    this.config = this.app.config = await (new Promise(async (accept, reject) => {
      configFactory.create((err, config) => (err ? reject(err) : accept(config)));
    }));

    // Ok, now hydrate the "connections" key
    const appObjects = await hydrate({
      logger: winston,
      service: this,
      name: this.name,
    }, this.config.get('connections'));
    this[CONNECTIONS] = appObjects.allObjects;
    this[CONNECTIONS_TREE] = Object.assign({}, this[CONNECTIONS_TREE], appObjects.tree);

    // I realize that this can clobber properties. But it's just too verbose
    // otherwise. Typically we have connections like "db" or "elastic", so
    // this results in service.db or service.elastic, which is more better.
    Object.assign(this, appObjects.tree);

    // And add meddleware to express. The GasBuddy version of this
    // originally-PayPal module handles promises. Maybe the PayPal one
    // will someday.
    const middlewareFunction = await meddleware(this.config.get('meddleware'));
    this.app.use(middlewareFunction);
    this.configured = true;
    this.emit('configured');
  }

  async waitForConfiguration() {
    if (!this.configured) {
      await new Promise((accept) => {
        this.once('configured', accept);
      });
    }
  }

  /**
   * Close down all connections
   */
  async destroy() {
    winston.info('Beginning application shutdown');
    await dehydrate({ logger: winston }, this[CONNECTIONS]);
    delete this[CONNECTIONS];
    delete this[CONNECTIONS_TREE];
    this.emit('shutdown');
  }

  /**
   * Load the default configuration for the current environment.
   * We have four environments:
   *  development
   *  test
   *  staging
   *  production
   *
   * If you are specializing Service with your own default configs
   * (like we do internally), you should override this method.
   * Typically you will call addDefaultConfiguration FIRST, and then
   * super() so we can add ours (because first one in wins).
   * Don't forget to either await super() or return super().
   */
  // eslint-disable-next-line class-methods-use-this
  async loadDefaultConfiguration(configFactory, envConfit) {
    const defaults = path.join(__dirname, '..', 'config');
    await Service.addDefaultConfiguration(configFactory, defaults, envConfit);
  }

  /**
   * This module has default configuration files, and your specialized
   * version may have its own overlays to that. You may call this method
   * to add your own defaults. Note that in confit, when using addDefault,
   * the FIRST addDefault takes precendence over the next (and so on), so
   * if you override this method, you should register your defaults first.
   */
  static async addDefaultConfiguration(configFactory, defaultsDir, envConfit) {
    const addIfEnv = async (e) => {
      const c = path.join(defaultsDir, `${e}.json`);
      if (envConfit.get(`env:${e}`) && (await pathExists(c))) {
        configFactory.addDefault(c);
        return true;
      }
      return false;
    };

    for (const e of environments) {
      if (await addIfEnv(e)) {
        break;
      }
    }
    const baseConfig = path.join(defaultsDir, 'config.json');
    if (pathExists(baseConfig)) {
      configFactory.addDefault(baseConfig);
    }
  }

  static get(req) {
    if (req instanceof Service) {
      return req;
    }

    let app = req.app;
    while (app && !app[SERVICE]) {
      app = app.parent;
    }
    return app ? app[SERVICE] : null;
  }
}

Service.Event = {
  BeforeServiceCall: 'service.request.before',
  AfterServiceCall: 'service.request.after',
};

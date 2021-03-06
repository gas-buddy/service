import fs from 'fs';
import path from 'path';
import assert from 'assert';
import confit from 'confit';
import express from 'express';
import enrouten from 'express-enrouten';
import { EventEmitter } from 'events';
import meddleware from '@gasbuddy/meddleware';
import Logger from '@gasbuddy/configured-pino';
import { hydrate, dehydrate } from '@gasbuddy/hydration';
import { drain } from './drain';
import shortstops from './shortstops';
import { loggableError } from './util';

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

const DISCONNECTED_LOGGER = Symbol('Initial configured logging interface');
const BASE_LOGGER = Symbol('Raw logging interface');
const CONNECTIONS = Symbol('Property key for objects that need shutdown');
const CONNECTIONS_TREE = Symbol('Structured values for the result of hydration');
const SERVICE = Symbol('The Service class attached to an app');
const SERVICE_TIMER = Symbol('Timing service calls');
const DESTROY_CALLED = Symbol('Whether destroy has been called');
const environments = ['production', 'staging', 'test', 'development'];

export default class Service extends EventEmitter {
  static express = express

  static enrouten = enrouten

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

  get baseLogger() {
    return this[BASE_LOGGER];
  }

  // eslint-disable-next-line class-methods-use-this
  wrapError(error, additionalMetadata) {
    const e = loggableError(error);
    if (additionalMetadata) {
      Object.assign(e, additionalMetadata);
    }
    return e;
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

    this.config = await (new Promise(async (accept, reject) => {
      configFactory.create((err, config) => (err ? reject(err) : accept(config)));
    }));
    this.app.config = this.config;
    this.emit('configurationLoaded', this.config);

    // The disconnected logger cannot be in extreme mode because there is nobody to flush it.
    this[DISCONNECTED_LOGGER] = new Logger({}, { ...this.config.get('connections:logger'), extreme: false });
    this[BASE_LOGGER] = this[DISCONNECTED_LOGGER].start();

    // Ok, now hydrate the "connections" key
    try {
      const appObjects = await hydrate({
        logger: this[BASE_LOGGER],
        service: this,
        name: this.name,
      }, this.config.get('connections'), this);
      this[BASE_LOGGER].info('Hydration completed');
      this[CONNECTIONS] = appObjects.allObjects;
      this[CONNECTIONS_TREE] = Object.assign({}, this[CONNECTIONS_TREE], appObjects.tree);

      if (this.config.get('trustProxy') !== undefined) {
        this.app.set('trust proxy', this.config.get('trustProxy'));
      }

      // Setup metrics tracking on Swagger endpoints
      const serviceMetrics = {};
      appObjects.tree.serviceFactory.events.on('start', (req) => {
        if (!this.metrics) {
          return;
        }
        const { client, operationName } = req;
        const keyname = `service_${client.name}_${operationName.replace(/[-.]/g, '_')}`;
        let histo = serviceMetrics[keyname];
        try {
          if (!histo) {
            histo = new this.metrics.Histogram(
              keyname,
              `Calls to the ${client.name} service method ${operationName}`,
              ['status', 'source'],
            );
            serviceMetrics[keyname] = histo;
          }
          req[SERVICE_TIMER] = histo.startTimer({ source: this.name });
        } catch (error) {
          (req.gb.logger || this[BASE_LOGGER]).error('Failed to create service metric', {
            message: error.message,
            stack: error.stack,
          });
        }
      });

      const final = (req) => {
        if (req[SERVICE_TIMER]) {
          req[SERVICE_TIMER]({ status: req.status });
        }
      };

      appObjects.tree.serviceFactory.events.on('finish', final);
      appObjects.tree.serviceFactory.events.on('error', final);

      // And add meddleware to express. The GasBuddy version of this
      // originally-PayPal module handles promises. Maybe the PayPal one
      // will someday.
      const middlewareFunction = await meddleware(this.config.get('meddleware'));
      this[BASE_LOGGER].info('Meddleware loaded');
      this.app.use(middlewareFunction);
      this.configured = true;
      this.emit('configured');
      // Setup for graceful shutdown
      if (this.config.get('gracefulShutdownTimeout')) {
        drain(this, this.config.get('gracefulShutdownTimeout'));
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      this[BASE_LOGGER].error('@gasbuddy/service hydration failed', this.wrapError(error));
      throw error;
    }
  }

  async waitForConfiguration() {
    if (!this.configured) {
      await new Promise((accept) => {
        this.once('configured', accept);
      });
    }
  }

  /**
   * Check the health of your service. By default we just respond with {healthy:true}
   */
  // eslint-disable-next-line no-unused-vars
  async health(req) {
    if (this.shuttingDown) {
      throw new Error('Server is shutting down');
    }
    if (!this.configured) {
      throw new Error('Server is not yet configured');
    }
    return {
      healthy: true,
    };
  }

  /**
   * Begin shutting down existing connections and generally preparing to stop
   */
  drain() {
    this.shuttingDown = true;
    this.emit('drain');
  }

  /**
   * Close down all connections
   */
  async destroy() {
    if (this[DESTROY_CALLED]) {
      return;
    }
    this[DESTROY_CALLED] = true;
    this[BASE_LOGGER].info('Beginning application shutdown');
    await dehydrate({
      service: this,
      name: this.name,
      logger: this[BASE_LOGGER],
    }, this[CONNECTIONS]);
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
   * Add a job that can be executed by submitting requests to the metadata jobs endpoint.
   * The functor will receive a "virtual req" context, the arguments passed during submission
   * and a progress function that can be called with a value between 0 and 100 to update the
   * job runner with progress. Note the synthetic request supports on('close', fn) to be notified
   * of timeouts or other situations in which the job should terminate because it has already failed
   */
  addJob(name, functor, options) {
    this.jobs = this.jobs || {};
    Object.assign(functor, options || {});
    this.jobs[name] = functor;
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
      // eslint-disable-next-line no-await-in-loop
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

    let { app } = req;
    while (app && !app[SERVICE]) {
      app = app.parent;
    }
    return app ? app[SERVICE] : null;
  }
}

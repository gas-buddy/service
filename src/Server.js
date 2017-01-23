import http from 'http';
import https from 'https';
import winston from 'winston';
import Service from './Service';
import { winstonError } from './util';

function portOrNull(v) {
  if (v === 0) {
    return 0;
  }
  return v || null;
}

/**
 * A convenience class to start an HTTP/S server based on
 * a Service.
 *
 * Usually something like:
 *
 *   new Server('foo-serv').create(__dirname).catch(() => process.exit(-1));
 *
 */
export default class Server {
  constructor(nameOrOptions) {
    if (nameOrOptions instanceof Service) {
      this.service = nameOrOptions;
    } else {
      this.service = new Service(nameOrOptions);
    }
  }

  async create(sourcedir) {
    const app = this.service.app;
    const self = this;

    function listenHandler() {
      const { port } = this.address();
      const isTls = this instanceof https.Server;
      winston.info(`${self.service.name} listening over ${isTls ? 'TLS' : 'HTTP'}`, { port });
    }

    this.servers = [];
    let bestServer;

    try {
      await this.service.configure(sourcedir);

      const { key, cert, ca, port } = this.service.config.get('tls') || {};
      const httpPort = portOrNull(this.service.config.get('port'), null);

      // If TLS is configured, run that service
      if (key && cert) {
        const tlsServer = bestServer = https.createServer({
          key,
          cert,
          ca,
        }, app);
        let tlsPort = portOrNull(port);
        if (tlsPort === null) {
          tlsPort = 8443;
        }
        tlsServer.listen(tlsPort, listenHandler);
        this.servers.push(tlsServer);
      }

      // If TLS is not configured, or both are configured, run http
      if (!bestServer || httpPort !== null) {
        const httpServer = http.createServer(app);
        bestServer = bestServer || httpServer;
        httpServer.listen(httpPort === null ? 8000 : httpPort, listenHandler);
        this.servers.push(httpServer);
      }
      this.service.emit('listening', this.servers);
    } catch (error) {
      winston.error(`${this.service.name} failed to start`, winstonError(error));
      throw error;
    }
  }

  async destroy() {
    await this.service.destroy();
    if (this.servers) {
      this.servers.forEach(l => l.close());
      delete this.servers;
    }
  }
}

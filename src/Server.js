import http from 'http';
import https from 'https';
import onFinished from 'on-finished';
import onHeaders from 'on-headers';
import Service from './Service';
import { loggableError } from './util';

function portOrNull(v) {
  if (v === 0) {
    return 0;
  }
  return v || null;
}

function addConnectionClose() {
  this.setHeader('Connection', 'close');
}

function destroySocket(_, { socket }) {
  if (socket && !socket.destroyed) {
    socket.destory();
  }
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
    this.service.once('drain', () => {
      let serverCount = this.servers.length;
      this.servers.forEach((s) => {
        s.on('request', (req, res) => {
          onHeaders(res, addConnectionClose);
          onFinished(res, destroySocket);
        });
        s.close(() => {
          serverCount -= 1;
          if (serverCount === 0) {
            this.service.logger.info('All servers closed, shutting down service.');
            this.service.destroy();
          }
        });
      });
    });
  }

  async create(sourcedir) {
    const { app } = this.service;
    const self = this;

    function listenHandler() {
      const { port } = this.address();
      const isTls = this instanceof https.Server;
      self.service.logger.info(`${self.service.name} listening over ${isTls ? 'TLS' : 'HTTP'}`, { port });
    }

    this.servers = [];
    let bestServer;

    try {
      await this.service.configure(sourcedir);

      const { key, cert, ca, port } = this.service.config.get('tls') || {};
      const httpPort = portOrNull(this.service.config.get('port'), null);

      // If TLS is configured, run that service
      if (key && cert) {
        const tlsServer = https.createServer({
          key,
          cert,
          ca,
        }, app);
        bestServer = tlsServer;
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
      if (this?.service?.logger?.error) {
        this.service.logger.error(`${this.service.name} failed to start`, loggableError(error));
      } else {
        // eslint-disable-next-line no-console
        console.error(`${this.service.name} failed to start, and failed to configure the logger: ${error.message}\n\n${error.stack}`);
      }
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

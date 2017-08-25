const attached = [];
let biggestTimeout = 1;

export function drain(service, timeout) {
  if (attached.indexOf(service) >= 0) {
    return;
  }

  service.once('shutdown', () => {
    const ix = attached.indexOf(service);
    if (ix >= 0) {
      attached.splice(ix, 1);
    }
  });

  if (!attached.length) {
    process.once('SIGTERM', () => {
      Promise.all(attached.map((s) => {
        s.logger.info('Received SIGTERM, draining requests');
        return s.drain();
      }));
      setTimeout(() => {
        Promise.all(
          attached.map((s) => {
            s.logger.info('Server is shutting down after SIGTERM');
            return s.destroy();
          }))
          .then(() => process.exit(0))
          .catch(() => process.exit(-1));
      }, timeout * 1000);
    });
  }
  biggestTimeout = Math.max(biggestTimeout, timeout);
  attached.push(service);
}

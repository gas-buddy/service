import { ServiceRouter } from '../../../../src/index';
import { ServiceError } from '../../../../src/error';

export default function route(router: ServiceRouter) {
  router.get('/sync', (req) => {
    throw new ServiceError(req.app, 'Synchronous error', { code: 'SyncError' });
  });

  router.get('/async', async (req) => {
    await new Promise((accept) => { setTimeout(accept, 100); })
      .then(() => { throw new ServiceError(req.app, 'Async error', { code: 'AsyncError' }); });
  });
}

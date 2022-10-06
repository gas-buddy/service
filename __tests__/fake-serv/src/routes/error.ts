import type { Router } from 'express';
import { ServiceError } from '@pkg/types';

export default function route(router: Router) {
  router.get('/sync', (req) => {
    throw new ServiceError(req, 'Synchronous error', { code: 'SyncError' });
  });

  router.get('/async', async (req) => {
    await new Promise((accept) => { setTimeout(accept, 100); })
      .then(() => { throw new ServiceError(req, 'Async error', { code: 'AsyncError' }); });
  });
}

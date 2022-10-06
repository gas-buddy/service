import type { ServiceRouter } from '@pkg/express-app/types';

export default function route(router: ServiceRouter) {
  router.get('/world', (req, res) => {
    res.json({ hello: 'world' });
  });
}

import type { ServiceRouter } from '../../../../src';

export default function route(router: ServiceRouter) {
  router.get('/world', (req, res) => {
    res.json({ hello: 'world' });
  });
}

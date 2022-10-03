import type { Router } from 'express';

export default function route(router: Router) {
  router.get('/world', (req, res) => {
    res.json({ hello: 'world' });
  });
}

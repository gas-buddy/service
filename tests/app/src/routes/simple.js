import assert from 'assert';
import Service from '../../../../src/Service';

export default function (router) {
  router.post('/', (req, res) => {
    assert(req.rawBody, 'Should have a raw body');
    if (Service.get(req)) {
      res.setHeader('custom-header', req.headers['custom-header'] || 'empty');
      res.json(req.body);
    } else {
      res.status(500).send('fail');
    }
  });
}

import Service from '../../../../src/Service';

export default function (router) {
  router.post('/', (req, res) => {
    if (Service.get(req)) {
      res.setHeader('custom-header', req.headers['custom-header'] || 'empty');
      res.json(req.body);
    } else {
      res.status(500).send('fail');
    }
  });
}

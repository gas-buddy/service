import Service from '../../../../src/Service';

export default function (router) {
  router.post('/', (req, res) => {
    if (Service.get(req)) {
      res.json(req.body);
    } else {
      res.status(500).send('fail');
    }
  });
}

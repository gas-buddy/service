export default function (router) {
  router.post('/', (req, res) => {
    res.json(req.body);
  });
}

export default function (router) {
  router.get('/sync', () => {
    throw new Error('Thrown synchronously');
  });

  router.get('/async', async () => {
    await new Promise((accept, reject) => {
      reject(new Error('Thrown in a promise'));
    });
  });

  router.get('/helper', async (req) => {
    req.gb.throwError('helpererror', 'helper error message', 599);
  });
}

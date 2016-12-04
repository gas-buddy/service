export default function (router) {
  router.get('/sync', (req, res) => {
    throw new Error('Thrown synchronously');
  });

  router.get('/async', async (req, res) => {
    await new Promise((accept, reject) => {
      reject(new Error('Thrown in a promise'));
    });
  });
}
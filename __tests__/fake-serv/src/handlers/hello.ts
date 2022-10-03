import type { Handler } from 'express';

export const get: Handler = (req, res) => {
  res.json({ greeting: req.query.greeting || 'Hello World' });
};

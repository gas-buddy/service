import { ServiceHandler } from '../../../../src/index';
import { FakeServLocals } from '../index';

export const get: ServiceHandler<FakeServLocals> = async (req, res) => {
  res.json({ greeting: req.query.greeting || 'Hello World' });
};

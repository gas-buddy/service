import type { NextFunction, Response } from 'express';
import type { RequestLocals, RequestWithApp, ServiceLocals } from '../types';

export type ServiceHandler<
  SLocals extends ServiceLocals = ServiceLocals,
  RLocals extends RequestLocals = RequestLocals,
> = (
  req: RequestWithApp<SLocals>,
  res: Response<any, RLocals>,
  next: NextFunction,
) => any | Promise<any>;

// Make it easier to declare route files. This is not an exhaustive list
// of supported router methods, but it has the most common ones.
export interface ServiceRouter<
  SLocals extends ServiceLocals = ServiceLocals,
  RLocals extends RequestLocals = RequestLocals,
> {
  all(path: string, ...handlers: ServiceHandler<SLocals, RLocals>[]): void;
  get(path: string, ...handlers: ServiceHandler<SLocals, RLocals>[]): void;
  post(path: string, ...handlers: ServiceHandler<SLocals, RLocals>[]): void;
  put(path: string, ...handlers: ServiceHandler<SLocals, RLocals>[]): void;
  delete(path: string, ...handlers: ServiceHandler<SLocals, RLocals>[]): void;
  patch(path: string, ...handlers: ServiceHandler<SLocals, RLocals>[]): void;
  options(path: string, ...handlers: ServiceHandler<SLocals, RLocals>[]): void;
  head(path: string, ...handlers: ServiceHandler<SLocals, RLocals>[]): void;
  use(...handlers: ServiceHandler<SLocals, RLocals>[]): void;
}

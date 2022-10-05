export interface ConfigStore {
  // Confit supports more things (set, use), but that's not how we
  // intend it to be used.
  get(name: string): any;
}

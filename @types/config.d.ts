declare module 'shortstop-handlers' {
  export function require(module: string): ReturnType<NodeRequire>;
  export function env(): (envVarName: string) => string | undefined;
  export function base64(): (blob: string) => Buffer;
  export function path(baseDir?: string): (relativePath: string) => string;
  export function file(baseDir?: string): (relativePath: string) => Buffer | string;
}

declare module 'shortstop-yaml' {
  export default function yaml(basepath: string):
    (path: string, callback: (error?: Error, result?: {}) => void) => void;
}

declare module 'shortstop-dns' {
  export default function dns(opts?: { family?: number, all?: boolean }):
    (address: string, callback: (error?: Error, result?: string[]) => void) => void;
}

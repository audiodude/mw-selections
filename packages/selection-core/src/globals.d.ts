// Minimal ambient declarations for WHATWG globals that exist in every
// supported runtime (browsers, Node >= 18) but are absent from lib ES2022.
// Keeping lib DOM-free is what enforces this package's zero-DOM guarantee
// at compile time (task 02 acceptance criterion).

declare class TextDecoder {
  constructor(label?: string, options?: { fatal?: boolean });
  decode(input?: Uint8Array | ArrayBuffer): string;
}

declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

declare class URLSearchParams {
  constructor(init?: string);
  get(name: string): string | null;
  set(name: string, value: string): void;
  toString(): string;
}

declare class URL {
  constructor(url: string, base?: string);
  readonly origin: string;
  readonly host: string;
  readonly hostname: string;
  readonly pathname: string;
  search: string;
  readonly searchParams: URLSearchParams;
  toString(): string;
}

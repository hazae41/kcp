import { Lengthed } from "@hazae41/lengthed";
import { Buffers } from "libs/buffers/index.js";

export type Bytes<N extends number = number> = Uint8Array<ArrayBuffer> & Lengthed<N>

export type BytesLike<N extends number = number> = Uint8Array<ArrayBufferLike> & Lengthed<N>

export namespace Bytes {

  export function copy<N extends number>(bytes: BytesLike<N>): Bytes<N> {
    return new Uint8Array(bytes) as Bytes<N>
  }

  export function from<N extends number>(bytes: BytesLike<N>): Bytes<N> {
    if (bytes.buffer instanceof ArrayBuffer)
      return bytes as Bytes<N>
    return new Uint8Array(bytes) as Bytes<N>
  }

  export function equals(a: BytesLike, b: BytesLike): boolean {
    if ("indexedDB" in globalThis)
      return indexedDB.cmp(a, b) === 0
    if ("process" in globalThis)
      return Buffers.fromView(a).equals(b)
    throw new Error(`Could not compare bytes`)
  }


}
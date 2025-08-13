import { Opaque, Writable } from "@hazae41/binary";
import { FullDuplex } from "@hazae41/cascade";
import { Cursor } from "@hazae41/cursor";
import { Future } from "@hazae41/future";
import { Awaitable } from "libs/promises/index.js";
import { SecretKcpReader } from "./reader.js";
import { SecretKcpWriter } from "./writer.js";

export interface KcpDuplexParams {
  /**
   * Conversation ID (Uint32) (random if undefined)
   */
  readonly conversation?: number

  readonly lowDelay?: number
  readonly highDelay?: number

  close?(this: undefined): Awaitable<void>
  error?(this: undefined, reason?: unknown): Awaitable<void>
}

export class KcpDuplex {

  readonly #secret: SecretKcpDuplex

  constructor(
    readonly params: KcpDuplexParams = {}
  ) {
    this.#secret = new SecretKcpDuplex(params)
  }

  [Symbol.dispose]() {
    this.close()
  }

  get conversation() {
    return this.#secret.conversation
  }

  get inner() {
    return this.#secret.inner
  }

  get outer() {
    return this.#secret.outer
  }

  get closing() {
    return this.#secret.closing
  }

  get closed() {
    return this.#secret.closed
  }

  error(reason?: unknown) {
    this.#secret.error(reason)
  }

  close() {
    this.#secret.close()
  }

}

export class SecretKcpDuplex {

  readonly duplex: FullDuplex<Opaque, Writable>

  readonly reader: SecretKcpReader
  readonly writer: SecretKcpWriter

  readonly conversation: number

  readonly resolveOnClose = new Future<void>()
  readonly resolveOnError = new Future<unknown>()

  readonly resolveOnAckBySerial = new Map<number, Future<void>>()

  sendCounter = 0
  recvCounter = 0

  constructor(
    readonly params: KcpDuplexParams = {}
  ) {
    const {
      conversation = new Cursor(crypto.getRandomValues(new Uint8Array(4))).readUint32OrThrow(true)
    } = this.params

    this.conversation = conversation

    this.reader = new SecretKcpReader(this)
    this.writer = new SecretKcpWriter(this)

    this.duplex = new FullDuplex<Opaque, Writable>({
      input: {
        write: m => this.reader.onWrite(m)
      },
      output: {
        write: m => this.writer.onWrite(m)
      },
      close: () => this.#onDuplexClose(),
      error: e => this.#onDuplexError(e)
    })
  }

  [Symbol.dispose]() {
    this.close()
  }

  get inner() {
    return this.duplex.inner
  }

  get outer() {
    return this.duplex.outer
  }

  get input() {
    return this.duplex.input
  }

  get output() {
    return this.duplex.output
  }

  get closing() {
    return this.duplex.closing
  }

  get closed() {
    return this.duplex.closed
  }

  async #onDuplexClose() {
    this.resolveOnClose.resolve()
    await this.params.close?.call(undefined)
  }

  async #onDuplexError(cause?: unknown) {
    this.resolveOnError.resolve(cause)
    await this.params.error?.call(undefined, cause)
  }

  error(reason?: unknown) {
    this.duplex.error(reason)
  }

  close() {
    this.duplex.close()
  }

}
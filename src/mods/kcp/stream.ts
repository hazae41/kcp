import { Opaque, Writable } from "@hazae41/binary";
import { Bytes } from "@hazae41/bytes";
import { HalfDuplex, HalfDuplexEvents } from "@hazae41/cascade";
import { Cursor } from "@hazae41/cursor";
import { SecretKcpReader } from "./reader.js";
import { KcpSegment } from "./segment.js";
import { SecretKcpWriter } from "./writer.js";

export interface KcpDuplexParams {
  /**
   * Conversation ID (Uint32) (random if undefined)
   */
  readonly conversation?: number

  readonly lowDelay?: number
  readonly highDelay?: number
}

export type KcpDuplexEvents = HalfDuplexEvents & {
  ack: (segment: KcpSegment<Opaque>) => void
}

export class KcpDuplex {

  readonly #secret: SecretKcpDuplex

  constructor(
    readonly params: KcpDuplexParams = {}
  ) {
    this.#secret = new SecretKcpDuplex(params)
  }

  get events() {
    return this.#secret.events
  }

  get inner() {
    return this.#secret.inner
  }

  get outer() {
    return this.#secret.outer
  }

  get conversation() {
    return this.#secret.conversation
  }

}

export class SecretKcpDuplex extends HalfDuplex<Opaque, Writable, KcpDuplexEvents> {

  readonly reader: SecretKcpReader
  readonly writer: SecretKcpWriter

  readonly conversation: number

  send_counter = 0
  recv_counter = 0

  constructor(
    readonly params: KcpDuplexParams = {}
  ) {
    super()

    const {
      conversation = new Cursor(Bytes.random(4)).readUint32OrThrow(true)
    } = this.params

    this.conversation = conversation

    this.reader = new SecretKcpReader(this)
    this.writer = new SecretKcpWriter(this)
  }

}
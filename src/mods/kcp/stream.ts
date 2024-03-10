import { Opaque, Writable } from "@hazae41/binary";
import { Bytes } from "@hazae41/bytes";
import { HalfDuplex, HalfDuplexEvents } from "@hazae41/cascade";
import { Cursor } from "@hazae41/cursor";
import { SuperEventTarget } from "@hazae41/plume";
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

export class KcpDuplex {

  readonly #secret: SecretKcpDuplex

  readonly events = new SuperEventTarget<HalfDuplexEvents>()

  constructor(
    readonly params: KcpDuplexParams = {}
  ) {
    this.#secret = new SecretKcpDuplex(params)

    this.#secret.events.on("open", () => this.events.emit("open"))
    this.#secret.events.on("close", () => this.events.emit("close"))
    this.#secret.events.on("error", reason => this.events.emit("error", reason))
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

export type SecretKcpDuplexEvents = HalfDuplexEvents & {
  ack: (segment: KcpSegment<Opaque>) => void
}

export class SecretKcpDuplex extends HalfDuplex<Opaque, Writable, SecretKcpDuplexEvents> {

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
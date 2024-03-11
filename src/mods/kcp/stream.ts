import { Opaque, Writable } from "@hazae41/binary";
import { Bytes } from "@hazae41/bytes";
import { CloseEvents, ErrorEvents, FullDuplex, HalfDuplexEvents } from "@hazae41/cascade";
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

    this.#secret.events.on("close", () => this.events.emit("close"))
    this.#secret.events.on("error", e => this.events.emit("error", e))
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

  get closed() {
    return this.#secret.closed
  }

  async error(reason?: unknown) {
    await this.#secret.error(reason)
  }

  async close() {
    await this.#secret.close()
  }

}

export type SecretKcpDuplexEvents =
  & CloseEvents
  & ErrorEvents
  & { ack: (segment: KcpSegment<Opaque>) => void }

export class SecretKcpDuplex {

  readonly kcp = new FullDuplex<Opaque, Writable>()

  readonly events = new SuperEventTarget<SecretKcpDuplexEvents>()

  readonly reader: SecretKcpReader
  readonly writer: SecretKcpWriter

  readonly conversation: number

  send_counter = 0
  recv_counter = 0

  constructor(
    readonly params: KcpDuplexParams = {}
  ) {
    this.kcp.events.on("close", () => this.events.emit("close"))
    this.kcp.events.on("error", e => this.events.emit("error", e))

    const {
      conversation = new Cursor(Bytes.random(4)).readUint32OrThrow(true)
    } = this.params

    this.conversation = conversation

    this.reader = new SecretKcpReader(this)
    this.writer = new SecretKcpWriter(this)
  }

  get inner() {
    return this.kcp.inner
  }

  get outer() {
    return this.kcp.outer
  }

  get input() {
    return this.kcp.input
  }

  get output() {
    return this.kcp.output
  }

  get closed() {
    return this.kcp.closed
  }

  async error(reason?: unknown) {
    await this.kcp.error(reason)
  }

  async close() {
    await this.kcp.close()
  }

}
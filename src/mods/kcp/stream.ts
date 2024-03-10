import { Opaque, Writable } from "@hazae41/binary";
import { Bytes } from "@hazae41/bytes";
import { HalfDuplex } from "@hazae41/cascade";
import { Cursor } from "@hazae41/cursor";
import { None } from "@hazae41/option";
import { CloseEvents, ErrorEvents, SuperEventTarget } from "@hazae41/plume";
import { SecretKcpReader } from "./reader.js";
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

  constructor(
    readonly params: KcpDuplexParams = {}
  ) {
    this.#secret = new SecretKcpDuplex(params)
  }

  get events() {
    return this.#secret.events
  }

  get inner() {
    return this.#secret.subduplex.inner
  }

  get outer() {
    return this.#secret.subduplex.outer
  }

  get conversation() {
    return this.#secret.conversation
  }

}

export class SecretKcpDuplex {
  readonly #class = SecretKcpDuplex

  send_counter = 0
  recv_counter = 0

  readonly subduplex = new HalfDuplex<Opaque, Writable>()

  readonly events = new SuperEventTarget<CloseEvents & ErrorEvents>()

  readonly reader: SecretKcpReader
  readonly writer: SecretKcpWriter

  readonly conversation: number

  constructor(
    readonly params: KcpDuplexParams = {}
  ) {
    const {
      conversation = new Cursor(Bytes.random(4)).readUint32OrThrow(true)
    } = this.params

    this.conversation = conversation

    this.reader = new SecretKcpReader(this)
    this.writer = new SecretKcpWriter(this)

    this.subduplex.events.on("close", async () => {
      await this.events.emit("close", [undefined])
      return new None()
    })

    this.subduplex.events.on("error", async (reason) => {
      await this.events.emit("error", [reason])
      return new None()
    })
  }

}
import { Opaque, Writable } from "@hazae41/binary";
import { Cascade } from "@hazae41/cascade";
import { Cursor } from "@hazae41/cursor";
import { SecretKcpReader } from "./reader.js";
import { SecretKcpWriter } from "./writer.js";

export class KcpDuplex {

  readonly #secret: SecretKcpDuplex

  constructor(
    readonly stream: ReadableWritablePair<Opaque, Writable>
  ) {
    this.#secret = new SecretKcpDuplex(stream)
  }

  get readable(): ReadableStream<Opaque> {
    return this.#secret.readable
  }

  get writable(): WritableStream<Writable> {
    return this.#secret.writable
  }

  get conversation() {
    return this.#secret.conversation
  }

}

export class SecretKcpDuplex {
  readonly #class = SecretKcpDuplex

  send_counter = 0
  recv_counter = 0

  readonly reader: SecretKcpReader
  readonly writer: SecretKcpWriter

  readonly readable: ReadableStream<Opaque>
  readonly writable: WritableStream<Writable>

  readonly conversation = Cursor.random(4).tryGetUint32(true).unwrap()

  constructor(
    readonly stream: ReadableWritablePair<Opaque, Writable>
  ) {
    this.reader = new SecretKcpReader(this)
    this.writer = new SecretKcpWriter(this)

    const read = this.reader.stream.start()
    const write = this.writer.stream.start()

    this.readable = read.readable
    this.writable = write.writable

    stream.readable
      .pipeTo(read.writable)
      .then(this.#onReadClose.bind(this))
      .catch(this.#onReadError.bind(this))

    write.readable
      .pipeTo(stream.writable)
      .then(this.#onWriteClose.bind(this))
      .catch(this.#onWriteError.bind(this))
  }

  async #onReadClose() {
    console.debug(`${this.#class.name}.onReadClose`)

    this.reader.stream.closed = {}

    await this.reader.events.emit("close", undefined)
  }

  async #onWriteClose() {
    console.debug(`${this.#class.name}.onWriteClose`)

    this.writer.stream.closed = {}

    await this.writer.events.emit("close", undefined)
  }

  async #onReadError(reason?: unknown) {
    const error = Cascade.unthrow(reason).get()

    console.debug(`${this.#class.name}.onReadError`, error.cause)

    this.reader.stream.closed = { reason }
    this.writer.stream.error(reason)

    await this.reader.events.emit("error", error.cause)
  }

  async #onWriteError(reason?: unknown) {
    const error = Cascade.unthrow(reason).get()

    console.debug(`${this.#class.name}.onWriteError`, error.cause)

    this.writer.stream.closed = { reason }
    this.reader.stream.error(reason)

    await this.writer.events.emit("error", error.cause)
  }

}
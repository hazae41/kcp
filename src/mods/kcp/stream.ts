import { Opaque, Writable } from "@hazae41/binary";
import { Bytes } from "@hazae41/bytes";
import { Cursor } from "@hazae41/cursor";
import { Catched, Ok } from "@hazae41/result";
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

  readonly conversation = new Cursor(Bytes.tryRandom(4).unwrap()).tryGetUint32(true).unwrap()

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
      .then(r => r.ignore())
      .catch(console.error)

    write.readable
      .pipeTo(stream.writable)
      .then(this.#onWriteClose.bind(this))
      .catch(this.#onWriteError.bind(this))
      .then(r => r.ignore())
      .catch(console.error)
  }

  async #onReadClose() {
    console.debug(`${this.#class.name}.onReadClose`)

    this.reader.stream.closed = {}

    await this.reader.events.emit("close", [undefined])

    return Ok.void()
  }

  async #onWriteClose() {
    console.debug(`${this.#class.name}.onWriteClose`)

    this.writer.stream.closed = {}

    await this.writer.events.emit("close", [undefined])

    return Ok.void()
  }

  async #onReadError(reason?: unknown) {
    console.debug(`${this.#class.name}.onReadError`, { reason })

    this.reader.stream.closed = { reason }
    this.writer.stream.error(reason)

    await this.reader.events.emit("error", [reason])

    return Catched.throwOrErr(reason)
  }

  async #onWriteError(reason?: unknown) {
    console.debug(`${this.#class.name}.onWriteError`, { reason })

    this.writer.stream.closed = { reason }
    this.reader.stream.error(reason)

    await this.writer.events.emit("error", [reason])

    return Catched.throwOrErr(reason)
  }

}
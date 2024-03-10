import { Empty, Opaque, Readable } from "@hazae41/binary";
import { Cursor } from "@hazae41/cursor";
import { None } from "@hazae41/option";
import { SuperEventTarget } from "@hazae41/plume";
import { Console } from "mods/console/index.js";
import { KcpSegment } from "./segment.js";
import { SecretKcpDuplex } from "./stream.js";

export type KcpReadError =
  | ExpectedKcpSegmentError
  | UnknownKcpCommandError

export class ExpectedKcpSegmentError extends Error {
  readonly #class = ExpectedKcpSegmentError
  readonly name = this.#class.name

  constructor() {
    super(`Expected a KCP segment`)
  }

}

export class UnknownKcpCommandError extends Error {
  readonly #class = UnknownKcpCommandError
  readonly name = this.#class.name

  constructor() {
    super(`Unknown KCP command`)
  }

}

export type SecretKcpReaderEvents = {
  ack: (segment: KcpSegment<Opaque>) => void
}

export class SecretKcpReader {

  readonly events = new SuperEventTarget<SecretKcpReaderEvents>()

  readonly #buffer = new Map<number, KcpSegment<Opaque>>()

  constructor(
    readonly parent: SecretKcpDuplex
  ) {
    parent.input.events.on("message", chunk => {
      this.#onBytes(chunk)
      return new None()
    })
  }

  async #onBytes(chunk: Opaque) {
    const cursor = new Cursor(chunk.bytes)

    while (cursor.remaining)
      await this.#onSegment(Readable.readOrRollbackAndThrow(KcpSegment, cursor))

    return
  }

  async #onSegment(segment: KcpSegment<Opaque>) {
    if (segment.conversation !== this.parent.conversation)
      return

    if (segment.command === KcpSegment.commands.push)
      return await this.#onPushSegment(segment)
    if (segment.command === KcpSegment.commands.ack)
      return await this.#onAckSegment(segment)
    if (segment.command === KcpSegment.commands.wask)
      return await this.#onWaskSegment(segment)

    throw new UnknownKcpCommandError()
  }

  async #onPushSegment(segment: KcpSegment<Opaque>) {
    const conversation = this.parent.conversation
    const command = KcpSegment.commands.ack
    const timestamp = segment.timestamp
    const serial = segment.serial
    const unackSerial = this.parent.recv_counter
    const fragment = new Empty()

    const ack = KcpSegment.empty({ conversation, command, timestamp, serial, unackSerial, fragment })

    this.parent.output.enqueue(ack)

    if (segment.serial < this.parent.recv_counter) {
      Console.debug(`Received previous KCP segment`)
      return
    }

    if (segment.serial > this.parent.recv_counter) {
      Console.debug(`Received next KCP segment`)
      this.#buffer.set(segment.serial, segment)
      return
    }

    this.parent.input.enqueue(segment.fragment)
    this.parent.recv_counter++

    let next: KcpSegment<Opaque> | undefined

    while (next = this.#buffer.get(this.parent.recv_counter)) {
      Console.debug(`Unblocked next KCP segment`)
      this.parent.input.enqueue(next.fragment)
      this.#buffer.delete(this.parent.recv_counter)
      this.parent.recv_counter++
    }
  }

  async #onAckSegment(segment: KcpSegment<Opaque>) {
    await this.events.emit("ack", [segment])
  }

  async #onWaskSegment(segment: KcpSegment<Opaque>) {
    const conversation = this.parent.conversation
    const command = KcpSegment.commands.wins
    const serial = 0
    const unackSerial = this.parent.recv_counter
    const fragment = new Empty()

    const wins = KcpSegment.empty({ conversation, command, serial, unackSerial, fragment })

    this.parent.output.enqueue(wins)
  }

}
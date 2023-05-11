import { Empty, Opaque, Readable } from "@hazae41/binary";
import { SuperTransformStream } from "@hazae41/cascade";
import { Cursor } from "@hazae41/cursor";
import { EventError, StreamEvents, SuperEventTarget } from "@hazae41/plume";
import { Ok, Result } from "@hazae41/result";
import { KcpSegment } from "./segment.js";
import { SecretKcpDuplex } from "./stream.js";

export type SecretKcpReaderEvents = StreamEvents & {
  ack: KcpSegment<Opaque>
}

export class SecretKcpReader {

  readonly events = new SuperEventTarget<SecretKcpReaderEvents>()

  readonly stream: SuperTransformStream<Opaque, Opaque>

  readonly #buffer = new Map<number, KcpSegment<Opaque>>()

  constructor(
    readonly parent: SecretKcpDuplex
  ) {
    this.stream = new SuperTransformStream({
      transform: this.#onRead.bind(this)
    })
  }

  async #onRead(chunk: Opaque): Promise<Result<void, EventError>> {
    const cursor = new Cursor(chunk.bytes)

    while (cursor.remaining) {
      const segment = Readable.tryReadOrRollback(KcpSegment, cursor)

      if (segment.isErr()) {
        console.warn(`Not a KCP segment`)
        break
      }

      const result = await this.#onSegment(segment.inner)

      if (result.isErr())
        return result

      continue
    }

    return Ok.void()
  }

  async #onSegment(segment: KcpSegment<Opaque>): Promise<Result<void, EventError>> {
    if (segment.conversation !== this.parent.conversation)
      return Ok.void()

    if (segment.command === KcpSegment.commands.push)
      return await this.#onPushSegment(segment)
    if (segment.command === KcpSegment.commands.ack)
      return await this.#onAckSegment(segment)
    if (segment.command === KcpSegment.commands.wask)
      return await this.#onWaskSegment(segment)

    console.warn(`Unknown KCP command`)
    return Ok.void()
  }

  async #onPushSegment(segment: KcpSegment<Opaque>): Promise<Result<void, never>> {
    const conversation = this.parent.conversation
    const command = KcpSegment.commands.ack
    const timestamp = segment.timestamp
    const serial = segment.serial
    const unackSerial = this.parent.recv_counter
    const fragment = new Empty()

    const ack = KcpSegment.tryNew({ conversation, command, timestamp, serial, unackSerial, fragment }).inner

    this.parent.writer.stream.enqueue(ack)

    if (segment.serial < this.parent.recv_counter) {
      console.warn(`Received previous KCP segment`)
      return Ok.void()
    }

    if (segment.serial > this.parent.recv_counter) {
      console.warn(`Received next KCP segment`)
      this.#buffer.set(segment.serial, segment)
      return Ok.void()
    }

    this.stream.enqueue(segment.fragment)
    this.parent.recv_counter++

    let next: KcpSegment<Opaque> | undefined

    while (next = this.#buffer.get(this.parent.recv_counter)) {
      console.warn(`Unblocked next KCP segment`)
      this.stream.enqueue(next.fragment)
      this.#buffer.delete(this.parent.recv_counter)
      this.parent.recv_counter++
    }

    return Ok.void()
  }

  async #onAckSegment(segment: KcpSegment<Opaque>): Promise<Result<void, EventError>> {
    return await this.events.tryEmit("ack", segment).then(r => r.clear())
  }

  async #onWaskSegment(segment: KcpSegment<Opaque>): Promise<Result<void, never>> {
    const conversation = this.parent.conversation
    const command = KcpSegment.commands.wins
    const serial = 0
    const unackSerial = this.parent.recv_counter
    const fragment = new Empty()

    const wins = KcpSegment.tryNew<Empty>({ conversation, command, serial, unackSerial, fragment }).inner

    this.parent.writer.stream.enqueue(wins)

    return Ok.void()
  }

}
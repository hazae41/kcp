import { Writable } from "@hazae41/binary";
import { SuperTransformStream } from "@hazae41/cascade";
import { Future } from "@hazae41/future";
import { None } from "@hazae41/option";
import { CloseEvents, ErrorEvents, Plume, SuperEventTarget } from "@hazae41/plume";
import { KcpSegment } from "./segment.js";
import { SecretKcpDuplex } from "./stream.js";

export class SecretKcpWriter {

  readonly events = new SuperEventTarget<CloseEvents & ErrorEvents>()

  readonly stream: SuperTransformStream<Writable, Writable>

  constructor(
    readonly parent: SecretKcpDuplex,
  ) {
    this.stream = new SuperTransformStream({
      transform: this.#onTransform.bind(this)
    })
  }

  async #onTransform(fragment: Writable) {
    const conversation = this.parent.conversation
    const command = KcpSegment.commands.push
    const serial = this.parent.send_counter++
    const unackSerial = this.parent.recv_counter

    const segment = KcpSegment.newOrThrow({ conversation, command, serial, unackSerial, fragment })

    this.stream.enqueue(segment)

    const start = Date.now()

    const retry = setInterval(() => {
      if (this.stream.closed) {
        clearInterval(retry)
        return
      }

      const delay = Date.now() - start

      if (delay > 3_000) {
        clearInterval(retry)
        return
      }

      this.stream.enqueue(segment)
    }, 300)

    Plume.waitOrCloseOrError(this.parent.reader.events, "ack", (future: Future<void>, segment) => {
      if (segment.serial !== serial)
        return new None()
      future.resolve()
      return new None()
    }).catch(() => { }).finally(() => clearInterval(retry))
  }

}
import { Writable } from "@hazae41/binary";
import { Future } from "@hazae41/future";
import { None } from "@hazae41/option";
import { Plume } from "@hazae41/plume";
import { KcpSegment } from "./segment.js";
import { SecretKcpDuplex } from "./stream.js";

export class SecretKcpWriter {

  constructor(
    readonly parent: SecretKcpDuplex,
  ) {
    this.parent.output.events.on("message", async chunk => {
      await this.#onMessage(chunk)
      return new None()
    })
  }

  async #onMessage(fragment: Writable) {
    const { lowDelay = 300, highDelay = 3000 } = this.parent.params

    const conversation = this.parent.conversation
    const command = KcpSegment.commands.push
    const serial = this.parent.send_counter++
    const unackSerial = this.parent.recv_counter

    const segment = KcpSegment.newOrThrow({ conversation, command, serial, unackSerial, fragment })

    await this.parent.output.enqueue(segment)

    const start = Date.now()

    const retry = setInterval(async () => {
      if (this.parent.closed) {
        clearInterval(retry)
        return
      }

      const delay = Date.now() - start

      if (delay > highDelay) {
        clearInterval(retry)
        return
      }

      await this.parent.output.enqueue(segment)
    }, lowDelay)

    Plume.waitOrCloseOrError(this.parent.reader.events, "ack", (future: Future<void>, segment) => {
      if (segment.serial !== serial)
        return new None()
      future.resolve()
      return new None()
    }).catch(() => { }).finally(() => clearInterval(retry))
  }

}
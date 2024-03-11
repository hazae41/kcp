import { Writable } from "@hazae41/binary";
import { Future } from "@hazae41/future";
import { KcpSegment } from "./segment.js";
import { SecretKcpDuplex } from "./stream.js";

export class SecretKcpWriter {

  constructor(
    readonly parent: SecretKcpDuplex,
  ) { }

  async onMessage(fragment: Writable) {
    const { lowDelay = 300, highDelay = 3000 } = this.parent.params

    const conversation = this.parent.conversation
    const command = KcpSegment.commands.push
    const serial = this.parent.sendCounter++
    const unackSerial = this.parent.recvCounter

    const segment = KcpSegment.newOrThrow({ conversation, command, serial, unackSerial, fragment })

    this.parent.output.enqueue(segment)

    const start = Date.now()

    const retry = setInterval(() => {
      if (this.parent.closed) {
        clearInterval(retry)
        return
      }

      const delay = Date.now() - start

      if (delay > highDelay) {
        clearInterval(retry)
        return
      }

      this.parent.output.enqueue(segment)
    }, lowDelay)

    const { rejectOnClose, rejectOnError } = this.parent

    const resolveOnAck = new Future<void>()

    Promise
      .race([resolveOnAck.promise, rejectOnClose.promise, rejectOnError.promise])
      .catch(() => { })
      .finally(() => clearInterval(retry))

    this.parent.resolveOnAckBySerial.set(serial, resolveOnAck)
  }

}
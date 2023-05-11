import { Writable } from "@hazae41/binary";
import { SuperTransformStream } from "@hazae41/cascade";
import { None, Some } from "@hazae41/option";
import { AbortError, CloseError, ErrorError, Plume, StreamEvents, SuperEventTarget } from "@hazae41/plume";
import { Ok, Result } from "@hazae41/result";
import { KcpSegment } from "./segment.js";
import { SecretKcpDuplex } from "./stream.js";

export class SecretKcpWriter {

  readonly events = new SuperEventTarget<StreamEvents>()

  readonly stream: SuperTransformStream<Writable, Writable>

  closed = false

  constructor(
    readonly parent: SecretKcpDuplex,
  ) {
    this.stream = new SuperTransformStream({
      transform: this.#onWrite.bind(this)
    })
  }

  async #onWrite(fragment: Writable): Promise<Result<void, AbortError | ErrorError | CloseError>> {
    if (this.stream.closed) return Ok.void()

    const conversation = this.parent.conversation
    const command = KcpSegment.commands.push
    const serial = this.parent.send_counter++
    const unackSerial = this.parent.recv_counter

    const segment = KcpSegment.tryNew({ conversation, command, serial, unackSerial, fragment }).unwrap()

    this.stream.enqueue(segment)

    const start = Date.now()

    const retry = setInterval(() => {
      if (this.stream.closed) {
        clearInterval(retry)
        return
      }

      const delay = Date.now() - start
      console.debug(`Retrying KCP after`, delay, `milliseconds`)
      this.stream.enqueue(segment)
    }, 1000)

    const signal = AbortSignal.timeout(60 * 1000)

    const result = await Plume.tryWaitStream(this.parent.reader.events, "ack", segment => {
      if (segment.serial !== serial)
        return new Ok(new None())
      return new Ok(new Some(Ok.void()))
    }, signal)

    clearInterval(retry)

    return result
  }

}
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

  constructor(
    readonly parent: SecretKcpDuplex,
  ) {
    this.stream = new SuperTransformStream({
      transform: this.#onWrite.bind(this)
    })
  }

  async #onWrite<T extends Writable.Infer<T>>(fragment: T): Promise<Result<void, Writable.SizeError<T> | AbortError | ErrorError | CloseError>> {
    return await Result.unthrow(async t => {
      const conversation = this.parent.conversation
      const command = KcpSegment.commands.push
      const serial = this.parent.send_counter++
      const unackSerial = this.parent.recv_counter

      const segment = KcpSegment.tryNew({ conversation, command, serial, unackSerial, fragment }).throw(t)

      this.stream.enqueue(segment)

      const start = Date.now()

      const retry = setInterval(() => {
        if (this.stream.closed) {
          clearInterval(retry)
          return
        }

        const delay = Date.now() - start
        console.debug(`Retrying KCP after`, delay, `milliseconds`)
        this.stream.tryEnqueue(segment).inspectErrSync(console.debug).ignore()
      }, 1000)

      Plume.tryWaitOrStream(this.parent.reader.events, "ack", segment => {
        if (segment.serial !== serial)
          return new Ok(new None())
        return new Ok(new Some(Ok.void()))
      }).then(r => r.inspectErrSync(console.debug).ignore())
        .catch(console.error)
        .finally(() => clearInterval(retry))

      return Ok.void()
    })
  }

}
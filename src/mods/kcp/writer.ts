import { Writable } from "@hazae41/binary";
import { SuperTransformStream } from "@hazae41/cascade";
import { None, Some } from "@hazae41/option";
import { AbortedError, CloseEvents, ClosedError, ErrorEvents, ErroredError, Plume, SuperEventTarget } from "@hazae41/plume";
import { Catched, Ok, Result } from "@hazae41/result";
import { KcpSegment } from "./segment.js";
import { SecretKcpDuplex } from "./stream.js";

export class SecretKcpWriter {

  readonly events = new SuperEventTarget<CloseEvents & ErrorEvents>()

  readonly stream: SuperTransformStream<Writable, Writable>

  constructor(
    readonly parent: SecretKcpDuplex,
  ) {
    this.stream = new SuperTransformStream({
      transform: this.#onWrite.bind(this)
    })
  }

  async #onWrite<T extends Writable.Infer<T>>(fragment: T): Promise<Result<void, Writable.SizeError<T> | AbortedError | ErroredError | ClosedError>> {
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

        if (delay > 3_000) {
          clearInterval(retry)
          return
        }

        this.stream.tryEnqueue(segment).inspectErrSync(e => console.debug({ e })).ignore()
      }, 300)

      Plume.tryWaitOrCloseOrError(this.parent.reader.events, "ack", (segment) => {
        if (segment.serial !== serial)
          return new None()
        return new Some(Ok.void())
      }).catch(Catched.fromAndThrow)
        .then(r => r.unwrap())
        .catch(e => console.debug("Could not wait ACK", { e }))
        .finally(() => clearInterval(retry))

      return Ok.void()
    })
  }

}
import { Writable } from "@hazae41/binary";
import { SuperTransformStream } from "@hazae41/cascade";
import { Future } from "@hazae41/future";
import { None } from "@hazae41/option";
import { CloseEvents, ErrorEvents, Plume, SuperEventTarget } from "@hazae41/plume";
import { Catched, Ok, Result } from "@hazae41/result";
import { Console } from "mods/console/index.js";
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

  async #onWrite(fragment: Writable): Promise<Result<void, Error>> {
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

        this.stream.tryEnqueue(segment).inspectErrSync(e => Console.debug({ e })).ignore()
      }, 300)

      Plume.tryWaitOrCloseOrError(this.parent.reader.events, "ack", (future: Future<Ok<void>>, segment) => {
        if (segment.serial !== serial)
          return new None()
        future.resolve(Ok.void())
        return new None()
      }).catch(Catched.fromAndThrow)
        .then(r => r.unwrap())
        .catch(e => Console.debug("Could not wait ACK", { e }))
        .finally(() => clearInterval(retry))

      return Ok.void()
    })
  }

}
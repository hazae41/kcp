import { BinaryReadError, BinaryWriteError, Opaque, Writable } from "@hazae41/binary";
import { Cursor } from "@hazae41/cursor";
import { Ok, Result } from "@hazae41/result";

export class KcpSegment<Fragment extends Writable.Infer<Fragment>> {
  readonly #class = KcpSegment

  static readonly commands = {
    push: 81,
    ack: 82,
    wask: 83,
    wins: 84
  } as const

  private constructor(
    /**
     * conv
     */
    readonly conversation: number,
    /**
     * cmd
     */
    readonly command: number,
    /**
     * frg
     */
    readonly count = 0,
    /**
     * wnd
     */
    readonly window = 65535,
    /**
     * ts
     */
    readonly timestamp = Math.ceil(Date.now() / 1000),
    /**
     * sn
     */
    readonly serial: number,
    /**
     * una
     */
    readonly unackSerial: number,
    /**
     * data
     */
    readonly fragment: Fragment,
    /**
     * data size
     */
    readonly fragmentSize: number
  ) { }

  [Symbol.dispose]() { }

  static tryNew<Fragment extends Writable.Infer<Fragment>>(params: {
    conversation: number,
    command: number,
    count?: number,
    window?: number,
    timestamp?: number,
    serial: number,
    unackSerial: number,
    fragment: Fragment
  }): Result<KcpSegment<Fragment>, Writable.SizeError<Fragment>> {
    return Result.unthrowSync(t => {
      const { conversation, command, count, window, timestamp, serial, unackSerial, fragment } = params

      const fragmentSize = fragment.trySize().throw(t)

      return new Ok(new KcpSegment<Fragment>(conversation, command, count, window, timestamp, serial, unackSerial, fragment, fragmentSize))
    })
  }

  trySize(): Result<number, never> {
    return new Ok(0
      + 4
      + 1
      + 1
      + 2
      + 4
      + 4
      + 4
      + 4
      + this.fragmentSize)
  }

  tryWrite(cursor: Cursor): Result<void, Writable.WriteError<Fragment> | BinaryWriteError> {
    return Result.unthrowSync(t => {
      cursor.tryWriteUint32(this.conversation, true).throw(t)
      cursor.tryWriteUint8(this.command).throw(t)
      cursor.tryWriteUint8(this.count).throw(t)
      cursor.tryWriteUint16(this.window, true).throw(t)
      cursor.tryWriteUint32(this.timestamp, true).throw(t)
      cursor.tryWriteUint32(this.serial, true).throw(t)
      cursor.tryWriteUint32(this.unackSerial, true).throw(t)
      cursor.tryWriteUint32(this.fragmentSize, true).throw(t)

      this.fragment.tryWrite(cursor).throw(t)

      return Ok.void()
    })
  }

  static tryRead(cursor: Cursor): Result<KcpSegment<Opaque>, BinaryReadError> {
    return Result.unthrowSync(t => {
      const conversation = cursor.tryReadUint32(true).throw(t)
      const command = cursor.tryReadUint8().throw(t)
      const count = cursor.tryReadUint8().throw(t)
      const window = cursor.tryReadUint16(true).throw(t)
      const timestamp = cursor.tryReadUint32(true).throw(t)
      const serial = cursor.tryReadUint32(true).throw(t)
      const unackSerial = cursor.tryReadUint32(true).throw(t)
      const length = cursor.tryReadUint32(true).throw(t)
      const bytes = cursor.tryRead(length).throw(t)

      const fragment = new Opaque(bytes)

      return KcpSegment.tryNew({ conversation, command, count, window, timestamp, serial, unackSerial, fragment })
    })
  }

}
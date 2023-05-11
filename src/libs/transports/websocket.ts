import { Opaque, Writable } from "@hazae41/binary"
import { ResultableUnderlyingDefaultSource, ResultableUnderlyingSink, SuperReadableStream, SuperWritableStream } from "@hazae41/cascade"
import { Ok, Result } from "@hazae41/result"

export async function createWebSocketStream(url: string) {
  const websocket = new WebSocket(url)

  websocket.binaryType = "arraybuffer"

  await new Promise((ok, err) => {
    websocket.addEventListener("open", ok)
    websocket.addEventListener("error", err)
  })

  return new WebSocketStream(websocket)
}

async function tryClose(websocket: WebSocket) {
  await new Promise<void>((ok, err) => {
    const onClose = (e: CloseEvent) => {
      if (e.wasClean)
        ok()
      else
        err(e)
    }

    websocket.addEventListener("close", onClose, { passive: true, once: true })
  })
}

export type WebSocketStreamParams =
  & WebSocketSourceParams
  & WebSocketSinkParams

export class WebSocketStream {
  readonly reader: SuperReadableStream<Opaque>
  readonly writer: SuperWritableStream<Writable>

  readonly readable: ReadableStream<Opaque>
  readonly writable: WritableStream<Writable>

  /**
   * A WebSocket stream
   * @description https://streams.spec.whatwg.org/#example-both
   */
  constructor(
    readonly websocket: WebSocket,
    readonly params: WebSocketStreamParams = {}
  ) {
    if (websocket.readyState !== WebSocket.OPEN)
      throw new Error(`WebSocket is not open`)
    if (websocket.binaryType !== "arraybuffer")
      throw new Error(`WebSocket binaryType is not arraybuffer`)

    this.reader = new SuperReadableStream(new WebSocketSource(websocket, params))
    this.writer = new SuperWritableStream(new WebSocketSink(websocket, params))

    this.readable = this.reader.start()
    this.writable = this.writer.start()
  }
}

export interface WebSocketSourceParams {
  /**
   * Whether the socket should be closed when the stream is cancelled
   * @description You don't want to reuse the socket
   */
  shouldCloseOnCancel?: boolean
}

export class WebSocketSource implements ResultableUnderlyingDefaultSource<Opaque> {

  constructor(
    readonly websocket: WebSocket,
    readonly params: WebSocketSourceParams = {}
  ) { }

  async start(controller: ReadableStreamDefaultController<Opaque>) {

    const onMessage = (msgEvent: MessageEvent<ArrayBuffer>) => {
      const bytes = new Uint8Array(msgEvent.data)
      // console.debug("ws <-", bytes)
      controller.enqueue(new Opaque(bytes))
    }

    const onError = (event: Event) => {
      const error = new Error(`Errored`, { cause: event })
      controller.error(error)

      this.websocket.removeEventListener("message", onMessage)
      this.websocket.removeEventListener("close", onClose)
      this.websocket.removeEventListener("error", onError)
    }

    const onClose = (event: CloseEvent) => {
      controller.close()

      this.websocket.removeEventListener("message", onMessage)
      this.websocket.removeEventListener("close", onClose)
      this.websocket.removeEventListener("error", onError)
    }

    this.websocket.addEventListener("message", onMessage, { passive: true })
    this.websocket.addEventListener("error", onError, { passive: true })
    this.websocket.addEventListener("close", onClose, { passive: true })

    return Ok.void()
  }

  async cancel() {
    if (!this.params.shouldCloseOnCancel)
      return Ok.void()

    this.websocket.close()
    return Ok.void()
  }

}

export interface WebSocketSinkParams {
  /**
   * Whether the socket should be closed when the stream is closed
   * @description You don't want to reuse the socket
   * @description You're not using request-response
   */
  shouldCloseOnClose?: boolean

  /**
   * Whether the socket should be closed when the stream is aborted
   * @description You don't want to reuse the socket
   */
  shouldCloseOnAbort?: boolean
}

export class WebSocketSink implements ResultableUnderlyingSink<Writable> {

  constructor(
    readonly websocket: WebSocket,
    readonly params: WebSocketSinkParams = {}
  ) { }

  async start(controller: WritableStreamDefaultController) {

    const onClose = (closeEvent: CloseEvent) => {
      const error = new Error(`Closed`, { cause: closeEvent })
      controller.error(error)

      this.websocket.removeEventListener("close", onClose)
      this.websocket.removeEventListener("error", onError)
    }

    const onError = (event: Event) => {
      const error = new Error(`Errored`, { cause: event })
      controller.error(error)

      this.websocket.removeEventListener("close", onClose)
      this.websocket.removeEventListener("error", onError)
    }

    this.websocket.addEventListener("error", onError, { passive: true })
    this.websocket.addEventListener("close", onClose, { passive: true })

    return Ok.void()
  }

  async write(chunk: Writable): Promise<Result<void, unknown>> {
    const bytes = Writable.tryWriteToBytes(chunk)

    if (bytes.isErr())
      return bytes

    // console.debug("ws ->", bytes)
    this.websocket.send(bytes.inner)

    return Ok.void()
  }

  async abort() {
    if (!this.params.shouldCloseOnAbort)
      return Ok.void()

    await tryClose(this.websocket)
    return Ok.void()
  }

  async close() {
    if (!this.params.shouldCloseOnClose)
      return Ok.void()

    await tryClose(this.websocket)
    return Ok.void()
  }
}
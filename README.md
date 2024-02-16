# KCP

Zero-copy KCP protocol for the web

```bash
npm i @hazae41/kcp
```

[**Node Package 📦**](https://www.npmjs.com/package/@hazae41/kcp)

## Features

### Current features
- 100% TypeScript and ESM
- Zero-copy reading and writing
- Works in the browser

## Usage

```typescript
import { KcpDuplex } from "@hazae41/kcp"
import { Opaque, Writable } from "@hazae41/binary"
import { SuperTransformStream } from "@hazae41/cascade"

const conversation = 12345

function pipeToKcp(raw: { outer: ReadableWritablePair<Opaque, Writable> }): { outer: ReadableWritablePair<Opaque, Writable> } {
  const kcp = new KcpDuplex({ conversation })

  raw.outer.readable
    .pipeTo(kcp.inner.writable)
    .catch(() => { })

  kcp.inner.readable
    .pipeTo(raw.outer.writable)
    .catch(() => { })

  return kcp
}

function pipeToDummy(kcp: { outer: ReadableWritablePair<Opaque, Writable> }) {
  const dummy = new Dummy()

  kcp.outer.readable
    .pipeTo(dummy.inner.writable)
    .catch(() => { })

  dummy.inner.readable
    .pipeTo(kcp.outer.writable)
    .catch(() => { })

  return dummy
}

class Dummy extends EventTarget {
  readonly inner: ReadableWritablePair<Writable, Opaque>
  readonly outer: ReadableWritablePair<Opaque, Writable>

  readonly input: SuperTransformStream<Opaque, Opaque>
  readonly output: SuperTransformStream<Writable, Writable>

  #started = false
  #closed = false

  constructor() {
    super()

    this.input = new SuperTransformStream({
      start: this.#onInputStart.bind(this),
      transform: this.#onInputWrite.bind(this)
    })

    this.output = new SuperTransformStream({
      start: this.#onOutputStart.bind(this),
    })

    const preInputer = this.input.start()
    const postOutputer = this.output.start()

    const postInputer = new TransformStream<Opaque, Opaque>({})
    const preOutputer = new TransformStream<Writable, Writable>({})

    this.inner = {
      readable: postOutputer.readable,
      writable: preInputer.writable
    }

    this.outer = {
      readable: postInputer.readable,
      writable: preOutputer.writable
    }

    preInputer.readable
      .pipeTo(postInputer.writable)
      .then(() => this.#onInputClose())
      .catch(e => this.#onInputError(e))
      .catch(console.error)

    preOutputer.readable
      .pipeTo(postOutputer.writable)
      .then(() => this.#onOutputClose())
      .catch(e => this.#onOutputError(e))
      .catch(console.error)
  }

  async #onInputStart() {
    if (this.#started)
      return
    this.#started = true

    this.dispatchEvent(new Event("open"))
  }

  async #onOutputStart() {
    if (this.#started)
      return
    this.#started = true

    this.dispatchEvent(new Event("open"))
  }

  async #onInputClose() {
    this.input.closed = {}

    if (this.#closed)
      return
    this.#closed = true

    /**
     * Close the other end
     */
    this.output.terminate()

    this.dispatchEvent(new Event("close"))
  }

  async #onOutputClose() {
    this.output.closed = {}

    if (this.#closed)
      return
    this.#closed = true

    /**
     * Close the other end
     */
    this.input.terminate()

    this.dispatchEvent(new Event("close"))
  }

  async #onInputError(reason?: unknown) {
    this.input.closed = { reason }

    if (this.#closed)
      return
    this.#closed = true

    /**
     * Error the other end
     */
    this.output.error(reason)

    this.dispatchEvent(new ErrorEvent("error", { error: reason }))
  }

  async #onOutputError(reason?: unknown) {
    this.output.closed = { reason }

    if (this.#closed)
      return
    this.#closed = true

    /**
     * Error the other end
     */
    this.input.error(reason)

    this.dispatchEvent(new ErrorEvent("error", { error: reason }))
  }

  async #onInputWrite(data: Opaque) {
    this.dispatchEvent(new MessageEvent("message", { data }))
  }

  send(data: Writable) {
    this.output.enqueue(data)
  }

}

test("kcp", async () => {
  const forward = new TransformStream<Writable, Opaque>({ transform: (chunk, controller) => controller.enqueue(Opaque.writeFromOrThrow(chunk)) })
  const backward = new TransformStream<Writable, Opaque>({ transform: (chunk, controller) => controller.enqueue(Opaque.writeFromOrThrow(chunk)) })

  const rawA = { outer: { readable: forward.readable, writable: backward.writable } }
  const rawB = { outer: { readable: backward.readable, writable: forward.writable } }

  const kcpA = pipeToKcp(rawA)
  const kcpB = pipeToKcp(rawB)

  const dummyA = pipeToDummy(kcpA)
  const dummyB = pipeToDummy(kcpB)

  dummyB.addEventListener("message", (event) => {
    const msgEvent = event as MessageEvent<Opaque>
    console.log("b", msgEvent.data.bytes)
  })

  dummyA.addEventListener("message", (event) => {
    const msgEvent = event as MessageEvent<Opaque>
    console.log("a", msgEvent.data.bytes)
  })

  dummyA.send(new Opaque(new Uint8Array([1, 2, 3])))
  dummyB.send(new Opaque(new Uint8Array([4, 5, 6])))
})

```

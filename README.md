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
import { None } from "@hazae41/kcp"

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

class Dummy extends HalfDuplex<Opaque, Writable> {

  constructor() {
    super()
  }

  send(data: Writable) {
    this.output.enqueue(data)
  }

}

const forward = new TransformStream<Writable, Opaque>({ transform: (chunk, controller) => controller.enqueue(Opaque.writeFromOrThrow(chunk)) })
const backward = new TransformStream<Writable, Opaque>({ transform: (chunk, controller) => controller.enqueue(Opaque.writeFromOrThrow(chunk)) })

const rawA = { outer: { readable: forward.readable, writable: backward.writable } }
const rawB = { outer: { readable: backward.readable, writable: forward.writable } }

const kcpA = pipeToKcp(rawA)
const kcpB = pipeToKcp(rawB)

const dummyA = pipeToDummy(kcpA)
const dummyB = pipeToDummy(kcpB)

dummyB.input.events.on("message", (data) => {
  console.log("b", data.bytes)
  return new None()
})

dummyA.input.events.on("message", (data) => {
  console.log("a", data.bytes)
  return new None()
})

dummyA.send(new Opaque(new Uint8Array([1, 2, 3])))
dummyB.send(new Opaque(new Uint8Array([4, 5, 6])))

```

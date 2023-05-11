import { Opaque, Readable, Writable } from "@hazae41/binary";
import { Bytes } from "@hazae41/bytes";
import { assert, test } from "@hazae41/phobos";
import { webcrypto } from "crypto";
import { relative, resolve } from "path";
import { KcpSegment } from "./segment.js";

const directory = resolve("./dist/test/")
const { pathname } = new URL(import.meta.url)
console.log(relative(directory, pathname.replace(".mjs", ".ts")))

globalThis.crypto = webcrypto as any

test("kcp segment", async ({ test }) => {
  const conversation = 12345
  const command = KcpSegment.commands.push
  const count = 0
  const window = 65_535
  const timestamp = Date.now() / 1000
  const serial = 0
  const unackSerial = 0
  const fragment = Opaque.random(130)

  const segment = KcpSegment.tryNew({ conversation, command, count, window, timestamp, serial, unackSerial, fragment }).unwrap()

  const bytes = Writable.tryWriteToBytes(segment).unwrap()
  const frame2 = Readable.tryReadFromBytes(KcpSegment, bytes).unwrap()

  assert(Bytes.equals2(segment.fragment.bytes, frame2.fragment.bytes))
})
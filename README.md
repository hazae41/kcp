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

const kcp = new KcpDuplex(udp)
```
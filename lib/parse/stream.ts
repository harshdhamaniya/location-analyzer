/**
 * Streaming JSON array-element extractor.
 *
 * Google Takeout Records.json can be multiple gigabytes — far beyond what
 * JSON.parse can hold as a single string. This parser is fed text chunks and
 * emits each element of top-level arrays whose key matches `keys`
 * (e.g. "locations", "timelineObjects", "semanticSegments") as an individually
 * parsed object. Memory use stays bounded by the largest single element.
 */
export class StreamingArrayParser {
  private buf = "";
  private inString = false;
  private escape = false;
  private depth = 0;
  /** Depth at which matched-array elements live, or -1 when not capturing. */
  private captureDepth = -1;
  private elementStart = -1;
  private lastKey = "";
  private keyBuf = "";
  private collectingKey = false;
  private expectValueForKey = false;

  constructor(
    private keys: Set<string>,
    private onItem: (item: unknown, key: string) => void,
    private captureKey = ""
  ) {}

  push(chunk: string): void {
    this.buf += chunk;
    let i = this.elementStart >= 0 ? this.scanFrom : 0;
    const buf = this.buf;
    const n = buf.length;

    for (; i < n; i++) {
      const c = buf[i];

      if (this.inString) {
        if (this.escape) this.escape = false;
        else if (c === "\\") this.escape = true;
        else if (c === '"') {
          this.inString = false;
          if (this.collectingKey) {
            this.lastKey = this.keyBuf;
            this.collectingKey = false;
            this.expectValueForKey = true;
          }
        } else if (this.collectingKey) this.keyBuf += c;
        continue;
      }

      switch (c) {
        case '"':
          this.inString = true;
          // A string right after { or , at object level is a key.
          if (this.captureDepth === -1 || this.depth !== this.captureDepth) {
            this.keyBuf = "";
            this.collectingKey = true;
          }
          break;
        case ":":
          break; // expectValueForKey already set when key string closed
        case "{":
        case "[":
          if (
            c === "[" &&
            this.expectValueForKey &&
            this.captureDepth === -1 &&
            this.keys.has(this.lastKey)
          ) {
            // entering a matched array — the bracket itself is not an element
            this.captureDepth = this.depth + 1;
            this.captureKey = this.lastKey;
            this.depth++;
            this.expectValueForKey = false;
            break;
          }
          if (
            this.captureDepth !== -1 &&
            this.depth === this.captureDepth &&
            this.elementStart === -1
          ) {
            this.elementStart = i; // an element of the captured array opens here
          }
          this.depth++;
          this.expectValueForKey = false;
          break;
        case "}":
        case "]":
          this.depth--;
          if (this.captureDepth !== -1) {
            if (this.depth === this.captureDepth && this.elementStart !== -1) {
              // closed one element of the captured array
              const raw = buf.slice(this.elementStart, i + 1);
              try {
                this.onItem(JSON.parse(raw), this.captureKey);
              } catch {
                /* skip malformed element */
              }
              this.elementStart = -1;
            } else if (this.depth < this.captureDepth) {
              // the captured array itself closed
              this.captureDepth = -1;
              this.elementStart = -1;
            }
          }
          break;
        default:
          if (this.expectValueForKey && c !== " " && c !== "\n" && c !== "\r" && c !== "\t")
            this.expectValueForKey = false;
      }
    }

    // Trim consumed text; keep any partial element still being captured.
    if (this.elementStart >= 0) {
      this.buf = buf.slice(this.elementStart);
      this.scanFrom = this.buf.length;
      this.elementStart = 0;
    } else {
      this.buf = "";
      this.scanFrom = 0;
    }
  }

  private scanFrom = 0;
}

/** Read a Blob/File as streamed UTF-8 chunks through a callback. */
export async function streamText(
  blob: Blob,
  onChunk: (text: string, bytesRead: number) => void
): Promise<void> {
  const reader = blob.stream().getReader();
  const decoder = new TextDecoder();
  let read = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    read += value.byteLength;
    onChunk(decoder.decode(value, { stream: true }), read);
    // Yield to the event loop so progress messages flush.
    if (read % (1 << 24) < value.byteLength) await new Promise((r) => setTimeout(r));
  }
  const tail = decoder.decode();
  if (tail) onChunk(tail, read);
}

/**
 * RingBuffer — Fixed-capacity circular buffer for telemetry signal data.
 *
 * Uses Float64Array for performance. When capacity is reached, oldest
 * values are overwritten. The buffer maintains insertion order via
 * head/size tracking.
 */
export class RingBuffer {
  constructor(capacity) {
    this.capacity = capacity;
    this.data = new Float64Array(capacity);
    this.head = 0;   // index where NEXT write goes
    this.size = 0;   // current number of valid entries
  }

  push(value) {
    this.data[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  /**
   * Returns a plain Float64Array of current values in insertion order.
   * Allocates a new array each call — use sparingly (e.g., on chart update).
   */
  toArray() {
    if (this.size === 0) return new Float64Array(0);
    if (this.size < this.capacity) {
      // Buffer not yet full — data starts at index 0
      return this.data.slice(0, this.size);
    }
    // Buffer full — oldest value is at this.head
    const result = new Float64Array(this.capacity);
    const tail = this.capacity - this.head;
    result.set(this.data.subarray(this.head), 0);
    result.set(this.data.subarray(0, this.head), tail);
    return result;
  }

  /**
   * Returns last `n` values (or all if size < n) in insertion order.
   */
  lastN(n) {
    const take = Math.min(n, this.size);
    if (take === 0) return new Float64Array(0);
    const all = this.toArray();
    return all.subarray(all.length - take);
  }

  /** Most recently pushed value. */
  get latest() {
    if (this.size === 0) return null;
    const idx = (this.head - 1 + this.capacity) % this.capacity;
    return this.data[idx];
  }

  /** Min value in the buffer. */
  get min() {
    let m = Infinity;
    for (let i = 0; i < this.size; i++) {
      const idx = (this.head - this.size + i + this.capacity) % this.capacity;
      if (this.data[idx] < m) m = this.data[idx];
    }
    return m;
  }

  /** Max value in the buffer. */
  get max() {
    let m = -Infinity;
    for (let i = 0; i < this.size; i++) {
      const idx = (this.head - this.size + i + this.capacity) % this.capacity;
      if (this.data[idx] > m) m = this.data[idx];
    }
    return m;
  }

  clear() {
    this.head = 0;
    this.size = 0;
  }
}

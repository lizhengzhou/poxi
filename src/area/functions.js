import { SELECTION_COLOR } from "../cfg";

import {
  createCanvasBuffer
} from "../utils";

import {
  bytesToRgba,
  colorToRgbaString
} from "../color";

import CommandKind from "../stack/kind";

/**
 * @param {Object} selection
 */
export function copy(selection) {
  this.clipboard.copy = null;
  // shape based selection
  if (selection.shape !== null) {
    this.copyByShape(selection);
  } else {
    this.copyBySelection(selection);
  }
};

/**
 * Shape-based copying
 * @param {Object} selection
 */
export function copyByShape(selection) {
  const shape = selection.shape;
  const data = shape.data;
  const bx = shape.bounds.x; const by = shape.bounds.y;
  const bw = shape.bounds.w; const bh = shape.bounds.h;
  let pixels = [];
  for (let ii = 0; ii < data.length; ii += 4) {
    const idx = ii / 4;
    const xx = idx % bw;
    const yy = (idx / bw) | 0;
    const px = (yy * bw + xx) * 4;
    const alpha = data[px + 3];
    // ignore shape pixels that aren't used
    if (alpha <= 0) continue;
    const pixel = this.getPixelAt(bx + xx, by + yy);
    if (pixel === null) continue;
    pixels.push({
      x: xx, y: yy, color: pixel
    });
  };
  this.clipboard.copy = {
    pixels: pixels,
    selection: selection
  };
};

/**
 * Rectangle-based copying
 * @param {Object} selection
 */
export function copyBySelection(selection) {
  const x = selection.x; const y = selection.y;
  const w = selection.w; const h = selection.h;
  let pixels = [];
  for (let ii = 0; ii < w * h; ++ii) {
    const xx = ii % w;
    const yy = (ii / w) | 0;
    const pixel = this.getPixelAt(x + xx, y + yy);
    if (pixel === null) continue;
    pixels.push({
      x: xx, y: yy, color: pixel
    });
  };
  this.clipboard.copy = {
    pixels: pixels,
    selection: selection
  };
};

/**
 * @param {Number} x
 * @param {Number} y
 * @param {Object} board
 * @return {Void}
 */
export function paste(x, y, board) {
  const pixels = board.pixels;
  const selection = board.selection;
  if (pixels === null || !pixels.length) return;
  const batch = this.createDynamicBatch(x, y);
  const layer = this.getCurrentLayer();
  batch.resizeByRect(
    x, y,
    selection.w - 1, selection.h - 1
  );
  for (let ii = 0; ii < pixels.length; ++ii) {
    const pixel = pixels[ii];
    const color = pixel.color;
    batch.drawPixelFast(x + pixel.x, y + pixel.y, color);
  };
  batch.refreshTexture(false);
  layer.addBatch(batch);
  this.enqueue(CommandKind.PASTE, batch);
  return;
};

/**
 * @param {Object} selection
 * @return {Void}
 */
export function cut(selection) {
  this.copy(selection);
  const pixels = this.clipboard.copy.pixels;
  if (pixels === null || !pixels.length) return;
  this.clearRect(selection);
  return;
};

/**
 * @param {Object} selection
 * @return {Void}
 */
export function clearRect(selection) {
  const x = selection.x; const y = selection.y;
  const w = selection.w; const h = selection.h;
  const batch = this.createDynamicBatch(x, y);
  const layer = this.getCurrentLayer();
  batch.isEraser = true;
  // clear by shape
  if (selection.shape !== null) {
    this.clearByShape(selection);
    return;
  }
  // clear by rectangle
  batch.resizeByRect(
    x, y,
    w - 1, h - 1
  );
  for (let ii = 0; ii < w * h; ++ii) {
    const xx = (ii % w);
    const yy = (ii / w) | 0;
    const pixel = this.getPixelAt(x + xx, y + yy);
    if (pixel === null) continue;
    batch.erasePixelFast(x + xx, y + yy, pixel);
  };
  batch.refreshTexture(false);
  // empty batch, got no tiles to delete
  if (batch.isEmpty()) return;
  layer.addBatch(batch);
  this.enqueue(CommandKind.CLEAR, batch);
  return;
};

/**
 * Shape-based clearing
 * @param {Object} selection
 * @return {Void}
 */
export function clearByShape(selection) {
  const shape = selection.shape;
  const bounds = shape.bounds;
  const data = shape.data;
  const x = selection.x; const y = selection.y;
  const w = selection.w; const h = selection.h;
  const batch = this.createDynamicBatch(x, y);
  const layer = this.getCurrentLayer();
  batch.isEraser = true;
  const bw = bounds.w; const bh = bounds.h;
  batch.resizeByRect(
    x, y,
    w - 1, h - 1
  );
  let count = 0;
  for (let ii = 0; ii < data.length; ii += 4) {
    const idx = (ii / 4) | 0;
    const xx = (idx % bw) | 0;
    const yy = (idx / bw) | 0;
    const px = (yy * bw + xx) * 4;
    if (data[px + 3] <= 0) continue;
    const pixel = this.getPixelAt(x + xx, y + yy);
    // only erase if we have sth to erase
    if (pixel === null) continue;
    batch.erasePixelFast(x + xx, y + yy, pixel);
    count++;
  };
  // nothing to change
  if (count <= 0) return;
  batch.refreshTexture(false);
  layer.addBatch(batch);
  this.enqueue(CommandKind.CLEAR, batch);
  return;
};

/**
 * @param {Number} x
 * @param {Number} y
 * @return {Batch}
 */
export function getShapeByOffset(x, y) {
  const color = this.getPixelAt(x, y);
  if (color === null) return (null);
  const shape = this.getBinaryShape(x, y, color);
  if (shape === null) return (null);
  const batch = this.createDynamicBatch(x, y);
  const bounds = this.bounds;
  const bx = bounds.x;
  const by = bounds.y;
  const bw = bounds.w;
  const bh = bounds.h;
  // create buffer to draw a fake shape into
  const buffer = createCanvasBuffer(bw, bh);
  const rgba = bytesToRgba(SELECTION_COLOR);
  rgba[3] = 0.45;
  buffer.fillStyle = colorToRgbaString(rgba);
  for (let ii = 0; ii < shape.length; ++ii) {
    const xx = (ii % bw);
    const yy = (ii / bw) | 0;
    if (shape[yy * bw + xx] !== 2) continue;
    buffer.fillRect(
      xx, yy,
      1, 1
    );
  };
  batch.buffer = buffer;
  batch.data = new Uint8Array(buffer.getImageData(0, 0, bw, bh).data);
  batch.bounds.update(bx, by, bw, bh);
  batch.resizeByMatrixData();
  batch.refreshTexture(true);
  return (batch);
};

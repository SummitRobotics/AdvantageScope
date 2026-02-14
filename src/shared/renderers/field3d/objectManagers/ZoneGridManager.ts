// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import * as THREE from "three";
import { Field3dRendererCommand_ZoneGridObj } from "../../Field3dRenderer";
import { disposeObject } from "../../Field3dRendererImpl";
import ObjectManager from "../ObjectManager";

const ZONE_COLORS: { [key: number]: [number, number, number] } = {
  1: [255, 255, 0], // HoodDown = yellow
  2: [0, 255, 0], // Hub = green
  3: [0, 255, 255], // SnowBlowLeft = cyan
  4: [255, 0, 255] // SnowBlowRight = magenta
};

const FILL_ALPHA = 0.3;
const BORDER_ALPHA = 0.6;
const PIXELS_PER_CELL = 8;

export default class ZoneGridManager extends ObjectManager<Field3dRendererCommand_ZoneGridObj> {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private mesh: THREE.Mesh | null = null;
  private texture: THREE.CanvasTexture | null = null;
  private lastDataHash: number = -1;

  constructor(
    root: THREE.Object3D,
    materialSpecular: THREE.Color,
    materialShininess: number,
    mode: "low-power" | "standard" | "cinematic",
    isXR: boolean,
    requestRender: () => void
  ) {
    super(root, materialSpecular, materialShininess, mode, isXR, requestRender);
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d")!;
  }

  dispose(): void {
    if (this.mesh !== null) {
      this.root.remove(this.mesh);
      disposeObject(this.mesh);
      this.mesh = null;
    }
    if (this.texture !== null) {
      this.texture.dispose();
      this.texture = null;
    }
  }

  setObjectData(object: Field3dRendererCommand_ZoneGridObj): void {
    const { cols, rows, cellSize, data } = object;
    if (data.length !== cols * rows) return;

    // Cache check — zones are static, skip redraw if unchanged
    // Use a cheap numeric hash instead of joining the entire array into a string
    let hash = cols * 100003 + rows * 1009 + Math.round(cellSize * 1e6);
    for (let i = 0; i < data.length; i += 37) {
      hash = (hash * 31 + data[i]) | 0;
    }
    if (hash === this.lastDataHash && this.mesh !== null) return;
    this.lastDataHash = hash;

    const fieldWidth = cols * cellSize;
    const fieldHeight = rows * cellSize;

    // Resize canvas
    this.canvas.width = cols * PIXELS_PER_CELL;
    this.canvas.height = rows * PIXELS_PER_CELL;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Paint zone cells
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const zoneType = data[row * cols + col];
        if (zoneType === 0) continue;
        const color = ZONE_COLORS[zoneType];
        if (color === undefined) continue;

        const px = col * PIXELS_PER_CELL;
        // Canvas Y is top-down, field Y increases upward — flip rows
        const py = (rows - 1 - row) * PIXELS_PER_CELL;

        this.ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${FILL_ALPHA})`;
        this.ctx.fillRect(px, py, PIXELS_PER_CELL, PIXELS_PER_CELL);

        this.ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},${BORDER_ALPHA})`;
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(px + 0.5, py + 0.5, PIXELS_PER_CELL - 1, PIXELS_PER_CELL - 1);
      }
    }

    // Create or update texture
    if (this.texture === null) {
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.minFilter = THREE.NearestFilter;
      this.texture.magFilter = THREE.NearestFilter;
    } else {
      this.texture.needsUpdate = true;
    }

    // Recreate mesh (dimensions may have changed)
    if (this.mesh !== null) {
      this.root.remove(this.mesh);
      disposeObject(this.mesh);
    }
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(fieldWidth, fieldHeight),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    this.mesh.position.set(0, 0, 0.001);
    this.root.add(this.mesh);
  }
}

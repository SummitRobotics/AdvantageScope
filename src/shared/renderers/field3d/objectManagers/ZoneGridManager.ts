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

// Zone type → [R, G, B, A] (0-255). Type 0 = None (fully transparent).
const ZONE_RGBA: { [key: number]: [number, number, number, number] } = {
  1: [255, 255, 0, 77], // HoodDown = yellow
  2: [0, 255, 0, 77], // Hub = green
  3: [0, 255, 255, 77], // SnowBlowLeft = cyan
  4: [255, 0, 255, 77] // SnowBlowRight = magenta
};

export default class ZoneGridManager extends ObjectManager<Field3dRendererCommand_ZoneGridObj> {
  private mesh: THREE.Mesh | null = null;
  private texture: THREE.DataTexture | null = null;
  private lastDataHash: number = -1;

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
    let hash = cols * 100003 + rows * 1009 + Math.round(cellSize * 1e6);
    for (let i = 0; i < data.length; i += 37) {
      hash = (hash * 31 + data[i]) | 0;
    }
    if (hash === this.lastDataHash && this.mesh !== null) return;
    this.lastDataHash = hash;

    // Build RGBA pixel data — 1:1 pixel per cell (tiny texture, NearestFilter gives crisp edges)
    const pixels = new Uint8Array(cols * rows * 4);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const zoneType = data[row * cols + col];
        // DataTexture row 0 = bottom of image = bottom of field (low Y), so no Y flip needed
        const pixelIdx = (row * cols + col) * 4;
        const rgba = ZONE_RGBA[zoneType];
        if (rgba !== undefined) {
          pixels[pixelIdx] = rgba[0];
          pixels[pixelIdx + 1] = rgba[1];
          pixels[pixelIdx + 2] = rgba[2];
          pixels[pixelIdx + 3] = rgba[3];
        }
        // else: stays 0,0,0,0 (fully transparent)
      }
    }

    // Create or update texture
    if (this.texture !== null) {
      this.texture.dispose();
    }
    this.texture = new THREE.DataTexture(pixels, cols, rows, THREE.RGBAFormat);
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.needsUpdate = true;

    // Recreate mesh
    const fieldWidth = cols * cellSize;
    const fieldHeight = rows * cellSize;
    if (this.mesh !== null) {
      this.root.remove(this.mesh);
      disposeObject(this.mesh);
    }
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(fieldWidth, fieldHeight),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        alphaTest: 0.01,
        depthWrite: false
      })
    );
    this.mesh.renderOrder = -1;
    this.mesh.position.set(0, 0, 0.001);
    this.root.add(this.mesh);
  }
}

// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { Field3dRendererCommand_LineListObj } from "../../Field3dRenderer";
import ObjectManager from "../ObjectManager";

export default class LineListManager extends ObjectManager<Field3dRendererCommand_LineListObj> {
  private lineSegments: Line2[] = [];
  private segmentCount = 0;

  constructor(
    root: THREE.Object3D,
    materialSpecular: THREE.Color,
    materialShininess: number,
    mode: "low-power" | "standard" | "cinematic",
    isXR: boolean,
    requestRender: () => void
  ) {
    super(root, materialSpecular, materialShininess, mode, isXR, requestRender);
  }

  dispose(): void {
    this.lineSegments.forEach((line) => {
      this.root.remove(line);
      line.geometry.dispose();
      line.material.dispose();
    });
    this.lineSegments = [];
  }

  setResolution(resolution: THREE.Vector2) {
    super.setResolution(resolution);
    this.lineSegments.forEach((line) => {
      line.material.resolution = resolution;
    });
  }

  setObjectData(object: Field3dRendererCommand_LineListObj): void {
    // Each pair of poses represents one line segment
    const newSegmentCount = Math.floor(object.poses.length / 2);

    if (newSegmentCount === 0) {
      // No segments to draw, hide all
      this.lineSegments.forEach((line) => (line.visible = false));
      return;
    }

    // Adjust the number of line segments if needed
    if (newSegmentCount !== this.segmentCount) {
      // Dispose excess segments
      while (this.lineSegments.length > newSegmentCount) {
        const line = this.lineSegments.pop()!;
        this.root.remove(line);
        line.geometry.dispose();
        line.material.dispose();
      }

      // Create new segments as needed
      while (this.lineSegments.length < newSegmentCount) {
        const line = new Line2(
          new LineGeometry(),
          new LineMaterial({ color: 0xff8c00, linewidth: 2, resolution: this.resolution })
        );
        this.lineSegments.push(line);
        this.root.add(line);
      }

      this.segmentCount = newSegmentCount;
    }

    // Update each line segment
    const linewidth = object.size === "bold" ? 6 : 2;
    const color = new THREE.Color(object.color);

    for (let i = 0; i < newSegmentCount; i++) {
      const line = this.lineSegments[i];
      const pose1 = object.poses[i * 2];
      const pose2 = object.poses[i * 2 + 1];

      line.visible = true;
      line.material.color = color;
      line.material.linewidth = linewidth;

      // Extract translations
      let translation1 = pose1.pose.translation;
      let translation2 = pose2.pose.translation;

      // If both poses are from 2D sources, move them slightly above the carpet
      if (pose1.annotation.is2DSource && pose2.annotation.is2DSource) {
        translation1 = [translation1[0], translation1[1], 0.02];
        translation2 = [translation2[0], translation2[1], 0.02];
      }

      // Update the line segment geometry in place
      const positionData = [...translation1, ...translation2];
      line.geometry.setPositions(positionData);
      line.geometry.attributes.position.needsUpdate = true;
    }
  }
}

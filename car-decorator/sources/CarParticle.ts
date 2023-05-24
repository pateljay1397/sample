/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ParticleProps } from "@itwin/core-frontend";
import { Matrix3d, Vector2d } from "@itwin/core-geometry";

export interface CarParticle extends ParticleProps {
  x: number;
  y: number;
  z: number;
  speed: number;
  street: number; // index of street the car is on.  if intersection is not -1 then is index of current intersection inOutPath
  segment: number; // segment of current street/path the car is on
  segmentDist: number; // distance along current segment
  waiting: number; // time left to wait until travelling
  intersection: number; // index of intersection the car is traversing; -1 if not in an intersection
  type: number; // index of which texture to use for the car
  direction?: Vector2d; // direction car is travelling
  rotationMatrix?: Matrix3d;
}

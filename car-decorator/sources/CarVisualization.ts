/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  Matrix3d,
  Point2d,
  Point3d,
  Range2d,
  Vector2d
} from "@itwin/core-geometry";
import { CarParticle } from "./CarParticle";
import { carSizeDefaultX, carSizeDefaultY, Intersection, Street, StreetsAndIntersections } from "./common/open-street-map/OverpassApi";

/** Generate integer in [min, max]. */
function randomInteger(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Generate random floating-point number in [min, max). */
function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/** Type to represent different levels of density */
export type Density = "Low" | "Medium" | "High";

/** This decorator functions as a particle emitter at the given a XYZ source
 * Note: Assumes up is Z
 */
export class CarVisualization {
  public readonly carParticles: CarParticle[] = [];
  public readonly corners: Point3d[] = [];

  /** Constant values */
  private readonly _carSpacingDefault = 1.25;
  private readonly _accelerationDefault = 10;
  private readonly _waitTime = 1;

  /** Data used to create the graphics */
  private _streets: Street[] = [];
  private _intersections: Map<number, Intersection>;
  private _startStreetIndices: number[] = [];
  private _startStreetProbabilities: number[] = [];

  /** Decorator settings */
  private _numCars = 1;
  private _packingRatio = 10;
  private _maxCars = 1;
  private _carSize: Point2d = new Point2d();
  private _numTypes = 1;

  constructor(
    maxCars: number,
    density: Density,
    size: number,
    numTypes: number,
    streetsAndIntersections: StreetsAndIntersections
  ) {
    this._maxCars = maxCars;
    this._numTypes = numTypes;

    this._streets = streetsAndIntersections.streets;
    this._intersections = streetsAndIntersections.intersections;
    this._startStreetIndices = streetsAndIntersections.startStreetIndices;
    this._startStreetProbabilities = streetsAndIntersections.startStreetProbabilities;

    // Set size an density. Note that changeDensity relies on street data, so it needs to be called after streets are set
    this.setSize(size);
    this.changeDensity(density);

    // Find the corners
    if (this._streets[0] && this._streets[0].points[0]) {
      const initPoint = this._streets[0].points[0];

      let xLow = initPoint.x;
      let yLow = initPoint.y;
      let xHigh = initPoint.x;
      let yHigh = initPoint.y;
      this._streets.forEach((street) => {
        street.points.forEach((point) => {
          if (point.x < xLow) xLow = point.x;
          if (point.x > xHigh) xHigh = point.x;
          if (point.y < yLow) yLow = point.y;
          if (point.y > yHigh) yHigh = point.y;
        });
      });

      this.corners = Range2d.createXYXY(xLow, yLow, xHigh, yHigh).corners3d(true);
    }
  }

  /** Changes the number of cars based on the density passed in and the packing ratio and max number of cars specified in the constructor */
  public changeDensity(density: Density): void {
    const totalCars = this.computeMaxCars(
      this._carSize.y,
      this._packingRatio,
      this._maxCars
    );
    this._numCars = this.getNumberOfCars(totalCars, density);
  }

  /** Sets the size factor */
  public setSize(size: number): void {
    this._carSize = Point2d.create(carSizeDefaultX * size, carSizeDefaultY * size);
  }

  /** Gets the size */
  public getSize(): Point2d {
    return this._carSize;
  }

  /** Destroys then recreates all of the car particles */
  public reset(numCars: number) {
    this.carParticles.length = 0;
    this._numCars = numCars;
    this.initializeCars();
  }

  /** Creates car particles and places them on streets based off of the number of total cars and the spacing between cars */
  public initializeCars() {
    const spacing = this._carSize.x * this._carSpacingDefault;
    const packRatio = 1.0;

    // Place the initial cars starting at the end of each street & working back form the intersections
    let c = 0; // # of cars away from intersection (end of street) to place the next car
    let carsAdded = 1;
    while (carsAdded > 0 && this.carParticles.length < this._numCars) {
      carsAdded = 0;
      const distanceBack = c * spacing * packRatio;
      for (
        let i = 0;
        this.carParticles.length < this._numCars && i < this._streets.length;
        ++i
      ) {
        // Iterate through the streets
        let seg = this._streets[i].distance.length - 1;
        let d = distanceBack;
        while (seg >= 0 && d > this._streets[i].distance[seg]) {
          // Find segment onto which the car will be placed
          d -= this._streets[i].distance[seg];
          seg--;
        }
        if (seg >= 0) {
          this.carParticles.push(
            this.emitCar(i, seg, this._streets[i].distance[seg] - d)
          );
          carsAdded++;
        }
      }
      c++;
    }
  }

  /** Returns the current particle array */
  public getParticles(): CarParticle[] {
    return this.carParticles;
  }

  /** Update the positions and velocities of all the particles based on the amount of time that has passed since the last update. */
  public updateParticles(elapsedSeconds: number): CarParticle[] {
    if (this._streets.length === 0) return [];

    let numCars = this._numCars - this.carParticles.length;

    // Add cars until the number of cars is the same as the max number of cars
    while (numCars > 0) {
      const s = randomInteger(0, this._streets.length - 1);
      const seg = randomInteger(0, this._streets[s].distance.length - 1);
      this.carParticles.push(
        this.emitCar(s, seg, randomFloat(0, this._streets[s].distance[seg]))
      );
      --numCars;
    }

    // Remove excess cars
    while (numCars < 0) {
      this.carParticles.pop();
      ++numCars;
    }

    // Move each car
    for (const car of this.carParticles) {
      this.moveCar(car, elapsedSeconds);
      CarVisualization.setRotationMatrix(car);
    }

    return this.carParticles;
  }

  /** Returns the maximum number of cars that can fit on the available streets and intersections
   *  with a given packingRatio and a hard cap of `maxCars` */
  private computeMaxCars(
    carSize: number,
    packingRatio: number,
    maxCars: number
  ): number {
    let carsThatCanFit = 0;
    const d = 1.0 / (carSize * this._carSpacingDefault * packingRatio);
    for (const street of this._streets) {
      carsThatCanFit += Math.floor(street.totalDistance * d) + 1;
    }

    // Return the number of computed cars that can fit unless this number is greater than the maxCars, otherwise return maxCars
    return carsThatCanFit > maxCars ? maxCars : carsThatCanFit;
  }

  /** Returns a number representing a portion of cars based on density and number of allotted cars */
  private getNumberOfCars(maxCars: number, density: Density): number {
    return density === "Low"
      ? maxCars / 5
      : density === "Medium"
        ? maxCars / 3
        : maxCars;
  }

  /** Creating reusable points to help with performance and garbage collection because setPositionOnStreet is called often during decorate */
  private static _tmpPntA = Point3d.createZero();
  private static _tmpPntB = Point3d.createZero();

  /** Sets the x, y, and z position of a car based on the car's current segment and the street it's on */
  private static setPositionOnStreet(car: CarParticle, street: Street) {
    const ratio = car.segmentDist / street.distance[car.segment];
    // Get the difference between the points that start the next segment and the current segment
    street.points[car.segment + 1].minus(
      street.points[car.segment],
      this._tmpPntA
    );
    // Use the difference and the ratio to find the point along the segment the car is located on
    street.points[car.segment].plusScaled(this._tmpPntA, ratio, this._tmpPntB);
    car.x = this._tmpPntB.x;
    car.y = this._tmpPntB.y;
    car.z = this._tmpPntB.z;
  }

  /** Sets the direction vector of a car based on the car's current segment and the street it's on */
  private static setDirectionOnStreet(car: CarParticle, street: Street) {
    let dir: Point3d;
    if (car.segment >= street.points.length - 1) {
      // We're at the end of the street, so set the direction based on the last two points on the street
      dir = street.points[street.points.length - 1].minus(
        street.points[street.points.length - 2]
      );
    } else {
      // We're not at the end of the street yet, so set the direction based on the current segment
      dir = street.points[car.segment + 1].minus(street.points[car.segment]);
    }
    car.direction = Vector2d.create(dir.x, -dir.y);
  }

  // Sets the rotation of a given car particle
  private static setRotationMatrix(car: CarParticle) {
    if (undefined !== car.direction) {
      const d = car.direction.normalize();
      if (undefined !== d)
        car.rotationMatrix = Matrix3d.createRowValues(
          d.x,
          d.y,
          0,
          -d.y,
          d.x,
          0,
          0,
          0,
          0
        );
    }
  }

  // Returns a new car particle at a distance on a street - if not provided, these values are randomized
  private emitCar(
    street?: number,
    segment?: number,
    distance?: number
  ): CarParticle {
    // Choose a random street if not already defined
    if (undefined === street) {
      street = this._startStreetIndices[randomInteger(0, this._startStreetIndices.length - 1)];
      const probability = randomFloat(0, 1);
      for (let p = 0; p < this._startStreetProbabilities.length; ++p) {
        if (this._startStreetProbabilities[p] > probability)
          street = this._startStreetIndices[p];
      }
    }

    // Choose street segment with a default of 0 (start of the street)
    const seg = segment ?? 0;

    // Create car
    const car: CarParticle = {
      x: this._streets[street].points[seg].x,
      y: this._streets[street].points[seg].y,
      z: this._streets[street].points[seg].z,
      speed: 0,
      street,
      segment: seg,
      segmentDist: 0,
      waiting: 0,
      intersection: -1,
      type: randomInteger(0, this._numTypes - 1),
    };

    // Make sure the provided segment is a valid segment for the street
    if (undefined !== segment) {
      if (segment >= this._streets[street].distance.length) {
        car.segment = this._streets[street].distance.length - 1;
        car.x = this._streets[street].points[seg + 1].x;
        car.y = this._streets[street].points[seg + 1].y;
        car.z = this._streets[street].points[seg + 1].z;
        car.segmentDist = this._streets[street].points[seg + 1].distance(
          this._streets[street].points[seg]
        );
      } else if (undefined !== distance) {
        car.segmentDist = distance;
        CarVisualization.setPositionOnStreet(car, this._streets[car.street]);
      }
    }

    CarVisualization.setDirectionOnStreet(car, this._streets[car.street]);
    return car;
  }

  /** Places car on random street with a random texture*/
  private restartCar(car: CarParticle) {
    const street = this._startStreetIndices[randomInteger(0, this._startStreetIndices.length - 1)];
    const seg = 0;
    car.x = this._streets[street].points[seg].x;
    car.y = this._streets[street].points[seg].y;
    car.z = this._streets[street].points[seg].z;
    car.speed = 0;
    car.street = street;
    car.segment = seg;
    car.segmentDist = 0;
    car.waiting = 0;
    car.intersection = -1;
    car.type = randomInteger(0, this._numTypes - 1);
    CarVisualization.setDirectionOnStreet(car, this._streets[car.street]);
  }

  /** Returns the remaining time a car has to move after moving down a road's segments
   *  Returns -1 if car is done moving - ex. out of time */
  private moveCarOnStreet(
    car: CarParticle,
    street: Street,
    elapsedSeconds: number
  ): number {
    // Set the speed of the car
    if (car.speed < street.speed) {
      car.speed += this._accelerationDefault * elapsedSeconds;
      if (car.speed > street.speed) car.speed = street.speed;
    } else if (car.speed > street.speed) {
      car.speed -= this._accelerationDefault * elapsedSeconds;
      if (car.speed < street.speed) car.speed = street.speed;
    }

    // Compute how far the car has traveled along the current segment
    car.segmentDist += elapsedSeconds * car.speed;

    // If still on same segment then just return that car is done moving
    if (car.segmentDist < street.distance[car.segment]) {
      CarVisualization.setPositionOnStreet(car, street);
      return -1;
    }

    // See if we transitioned to another (or more than one) segment
    do {
      car.segmentDist -= street.distance[car.segment];
      car.segment++;
    } while (
      car.segment < street.distance.length &&
      car.segmentDist >= street.distance[car.segment]
    );

    // If still somewhere on this street, update the car's position and return with no time left
    if (car.segment < street.distance.length) {
      CarVisualization.setPositionOnStreet(car, street);
      CarVisualization.setDirectionOnStreet(car, street);
      return -1;
    }

    // We traveled further than the end of this street, so position car at end of street and return time remaining
    car.x = street.points[car.segment].x;
    car.y = street.points[car.segment].y;
    car.z = street.points[car.segment].z;
    const timeLeft = car.segmentDist / car.speed;
    car.segmentDist = street.distance[car.segment - 1];
    CarVisualization.setDirectionOnStreet(car, street);
    return timeLeft;
  }

  /** Uses probability to pick the next street to travel on */
  private getNextStreet(intersection: Intersection, streetIn: number) {
    const probabilities = intersection.inOutProbabilities.get(streetIn);
    if (undefined === probabilities) return -1;
    const r = randomFloat(0.0, 1.0);
    for (let index = 0; index < probabilities.length; ++index) {
      if (r < probabilities[index]) return intersection.streetsOut[index];
    }
    return -1;
  }

  /** Update a given car's speed and position */
  private moveCar(car: CarParticle, elapsedSeconds: number): void {
    let timeLeft = elapsedSeconds;
    while (timeLeft > 0) {
      // Check if the car is waiting at an intersection
      if (car.waiting > 0) {
        if (elapsedSeconds <= car.waiting) {
          // Spent all of our time waiting
          car.waiting -= elapsedSeconds;
          return;
        }

        // Finished waiting
        elapsedSeconds -= car.waiting;
        car.waiting = 0;
      }

      // Find the street that the car is traveling on and move it along that street.
      // Intersection ids of -1 signify a non intersection
      const curStreet =
        car.intersection === -1
          ? this._streets[car.street]
          : this._intersections.get(car.intersection)?.inOutPaths[car.street];

      if (!curStreet) return;

      // Set car direction and move car
      if (0 === car.speed) CarVisualization.setDirectionOnStreet(car, curStreet); // just got done waiting
      timeLeft = this.moveCarOnStreet(car, curStreet, timeLeft);
      if (timeLeft < 0) {
        // Still on same street, no need to check for intersections
        return;
      }

      // Check for intersection
      if (car.intersection >= 0) {
        // Came to the end of an intersection path, so transition to the street.
        car.street =
          this._intersections.get(car.intersection)?.inOutPaths[car.street]
            .inTo || car.street;

        // Reset segment and intersection info
        car.segment = 0;
        car.segmentDist = 0;
        car.intersection = -1;

        // Set direction of car
        CarVisualization.setDirectionOnStreet(car, this._streets[car.street]);
      } else {
        // Came to end of a street and are now at an intersection
        const curIntersectionId = this._streets[car.street].inTo;
        const curIntersection = this._intersections.get(curIntersectionId);
        const intersection = curIntersection?.streetsOut.length || 0;

        if (curIntersectionId < 0 || intersection === 0) {
          // The car has gone off of the map so restart it somewhere else
          this.restartCar(car);
          return;
        }

        // Choose which street/intersection path to go onto next.
        if (curIntersection) {
          const outStreetIndex = this.getNextStreet(
            curIntersection,
            car.street
          );
          car.street = curIntersection.findPath(car.street, outStreetIndex);

          // Reset segment info
          car.segment = 0;
          car.segmentDist = 0;

          if (-1 === car.street) {
            // Couldn't find the path so just jump to the beginning of the street
            car.street = outStreetIndex;
            CarVisualization.setDirectionOnStreet(car, this._streets[car.street]);
          } else {
            // Found the in-out path, move though intersection
            car.intersection = curIntersectionId;
            if (curIntersection.stop) {
              // Stop at intersection
              car.speed = 0;
              if (timeLeft < this._waitTime) {
                // Used up the rest of the time waiting at intersection
                car.waiting = this._waitTime - timeLeft;
                return;
              }
              timeLeft -= this._waitTime;
            } else {
              CarVisualization.setDirectionOnStreet(
                car,
                curIntersection.inOutPaths[car.street]
              );
            }
          }
        }
      }
    }
  }
}

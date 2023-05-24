/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { dispose } from "@itwin/core-bentley";
import {
  Point3d,
  Transform
} from "@itwin/core-geometry";
import {
  ColorDef,
  RenderTexture,
  TextureTransparency
} from "@itwin/core-common";
import {
  DecorateContext,
  Decorator,
  GraphicType,
  imageElementFromUrl,
  IModelApp,
  ParticleCollectionBuilder,
  TextureImage
} from "@itwin/core-frontend";
import { CarParticle } from "./CarParticle";
import { CarVisualization, Density } from "./CarVisualization";

/** This decorator functions as a particle emitter at the given a XYZ source
 * Note: Assumes up is Z
 */
export class CarDecorator implements Decorator {
  public readonly carParticles: CarParticle[] = [];

  /** Textures to be used by for the car particles */
  private _carTextures: (RenderTexture | undefined)[] = [];

  /** Data used to create the graphics */
  private _lastUpdateTime: number;
  private _visualization: CarVisualization;

  /** Decorator settings */
  private _speedMultiplier = 1;
  private _numTypes = 1;
  private _pause = false;

  constructor(
    visualization: CarVisualization,
    imageUrls: string[]
  ) {
    this._numTypes = imageUrls.length;
    this._lastUpdateTime = Date.now();
    this._visualization = visualization;

    // Place the car particles at their initial locations
    this._visualization.initializeCars();
    void this.tryTextures(imageUrls);
  }

  /** Invoked when this decorator is to be destroyed. */
  public dispose() {
    this._carTextures.forEach((texture) => {
      dispose(texture);
    });
    this._carTextures = [];
  }

  /** Sets pause, if true the decorator will not redraw the cars and won't move */
  public pause(pause: boolean): void {
    this._pause = pause;
  }

  /** Changes the number of cars based on the density passed in and the packing ratio and max number of cars specified in the constructor */
  public changeDensity(density: Density): void {
    this._visualization.changeDensity(density);
  }

  /** Sets the size factor */
  public setSize(size: number): void {
    this._visualization.setSize(size);
    IModelApp.viewManager.selectedView?.onRender.addOnce((vp) => vp.invalidateDecorations());
  }

  /** Called by the render loop and adds the car particle graphics to the context. */
  public decorate(context: DecorateContext): void {
    if (!this._carTextures[0]) return;

    // Update the particles
    const now = Date.now();
    const deltaMillis = (now - this._lastUpdateTime) * this._speedMultiplier;
    this._lastUpdateTime = now;

    const particles = this._pause ?
      this._visualization.getParticles() :
      this._visualization.updateParticles(deltaMillis / 1000);

    // Create particle builder
    const carBuilders: ParticleCollectionBuilder[] = [];
    for (let i = 0; i < this._numTypes; ++i) {
      carBuilders[i] = ParticleCollectionBuilder.create({
        viewport: context.viewport,
        texture: this._carTextures[i]!,
        origin: Point3d.create(0, 0, 2),
        size: this._visualization.getSize(),
        transparency: 0,
      });
    }

    // Process Particles
    for (const car of particles) carBuilders[car.type].addParticle(car);

    // Add graphics to context
    for (const cb of carBuilders) {
      const graphic = cb.finish();
      if (graphic) context.addDecoration(GraphicType.WorldDecoration, graphic);
    }

    // Draw a box around the decorations
    const lineBuilder = IModelApp.renderSystem.createGraphicBuilder(
      Transform.createIdentity(),
      GraphicType.WorldDecoration,
      IModelApp.viewManager.selectedView!
    );

    lineBuilder.setSymbology(ColorDef.red, ColorDef.black, 2);
    lineBuilder.addLineString(this._visualization.corners);
    context.addDecorationFromBuilder(lineBuilder);
  }

  /** Allocates memory and creates a RenderTexture from a given URL. */
  private static async allocateTextureFromUrl(
    url: string
  ): Promise<RenderTexture | undefined> {
    // Note: the caller takes ownership of the textures, and disposes of those resources when they are no longer needed.
    const textureImage = await imageElementFromUrl(url);
    const image: TextureImage = {
      source: textureImage,
      transparency: TextureTransparency.Translucent,
    };
    return IModelApp.renderSystem.createTexture({
      type: RenderTexture.Type.Normal,
      image,
      ownership: "external",
    });
  }

  /** If the textures are not created yet, will attempt to create them.  Returns true if successful. */
  private async tryTextures(imageUrls: string[]): Promise<boolean> {
    if (0 === this._carTextures.length) {
      for (const imageUrl of imageUrls) {
        try {
          const image = await CarDecorator.allocateTextureFromUrl(imageUrl);
          if (image) this._carTextures.push(image);
        } catch {
          // eslint-disable-next-line no-console
          console.error("unable to create ", imageUrl);
        }
      }
    }
    for (const ct of this._carTextures) {
      if (undefined === ct) return false;
    }
    return this._carTextures.length > 0;
  }
}

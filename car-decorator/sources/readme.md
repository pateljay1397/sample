# Particle Effect - Car

Copyright © Bentley Systems, Incorporated, © OpenStreetMap contributors. All rights reserved.

This sample shows how to create a particle effect using OpenStreetMaps to populate a network of roads and streets with moving cars.

## Copyright Disclaimer

This sample uses the [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) distributed and created by [OpenStreetMap](https://www.openstreetmap.org/) (OSM). The data retrieved from this API is made available under the Open Database License.

For more information about OSM and licensing, see their [licensing page](https://www.openstreetmap.org/copyright).

Map tiles are also pulled from OpenStreetMap. Find more information about OSM map tiles [here](https://wiki.openstreetmap.org/wiki/Tiles).

Additionally, the car images in this sample come from [OpenClipArt](https://openclipart.org/share) and are in the public domain.

## Purpose

The purpose of this sample is to demonstrate the following:

* Working with an external API to generate particles for a decorator
* Creating a decorator and rendering it in the active view.
* Visualizing cars moving along a network of roads.

## Description

In this sample, particles move along a complex road network created from OpenStreetMap data. This road network is generated using two methods from the [OverpassApi](./open-street-map/OverpassApi.ts) class. The first method requests OSM street data within the bounds of the viewport and constructs streets and intersections. The second rebuilds the existing network with a new driving direction. Note: there should only be one instance of OverpassApi data in the app.

These particles are built and rendered using the [Decorator](https://www.itwinjs.org/reference/core-frontend/views/decorator/) and [ParticleCollectionBuilder](https://www.itwinjs.org/reference/core-frontend/rendering/particlecollectionbuilder/) interfaces. The `decorate` method in the decorator updates the location and directions of existing particles and adds them to a new `ParticleCollectionBuilder`. Then it uses a [GraphicBuilder](https://www.itwinjs.org/reference/core-frontend/rendering/graphicbuilder/) to draw a rectangle around the area that may contain particles. Lastly, this method adds the [RenderGraphics](https://www.itwinjs.org/reference/core-frontend/rendering/rendergraphic/) produced by these builders to the [DecorateContext](https://www.itwinjs.org/reference/core-frontend/rendering/decoratecontext) so that they are rendered.

To help with memory management, particle textures are owned by the decorator, which contains a `dispose()` method that needs to be called before a decorator is destroyed.

The `createDecorator` method in [CarDecorationApi.ts]("./CarDecorationApi.ts") is responsible for disposing the existing car decorator and creating a new decorator. It adds an event listener to the [Viewport.onRender](https://www.itwinjs.org/reference/core-frontend/views/viewport/?term=onrender#onrender) method to re-render the decorator on every frame and passes the new decorator to the [ViewManager.addDecorator](https://www.itwinjs.org/reference/core-frontend/views/viewmanager/adddecorator/) method to have it rendered in all active views. Note that this method updates `CarDecorationApi.dispose()` to be tied to the new decorator.

## Additional Resources

For more examples of decorators, see these samples:

* [Heatmap Decorator Sample](../Heatmap%20Decorator/readme.md)
* [Particle Effect (Snow & Rain)](../Snow%20and%20Rain%20Particle%20Effect/readme.md)
* [Fire Particle Effect](../Fire%20Particle%20Effect/readme.md)
* [Street Network Decorator](../Street%20Network%20Decorator/readme.md)

## Notes

* This is not a true traffic simulation. Cars can run over each other, and this is not a bug.
* Updating street data re-queries OSM with the current extents of the viewport and creates a new decorator with the results. A red box is drawn around the new area that contains street data.
* Changing car density provides a way to modify the number of particles. This number comes from the total distance available on each street and the density value. To mitigate performance issues, the number of cars maxes out at 9000.
* Switching between the left side and right side determines which side of the street cars drive on. Note that OSM will return some major streets (like highways and interstates) as two separate streets instead of a single street. This toggle won't change the driving direction of such streets
* When in `streets only` mode, the background map is set to the OpenStreetMap street view map, otherwise it's set to Bing's hybrid map.

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import React, { useEffect, useRef, useState } from "react";
import {
  AbstractWidgetProps,
  SpecialKey,
  StagePanelLocation,
  StagePanelSection,
  UiItemsProvider,
  WidgetState
} from "@itwin/appui-abstract";
import {
  Alert,
  Button,
  IconButton,
  Input,
  Label,
  LabeledSelect,
  SelectOption,
  Text,
  toaster,
  ToggleSwitch,
  Tooltip
} from "@itwin/itwinui-react";
import CarDecorationApi from "./CarDecorationApi";
import { useActiveViewport } from "@itwin/appui-react";
import { LoadingSpinner } from "@itwin/core-react";
import "./CarDecoration.scss";
import { SvgHelpCircularHollow } from "@itwin/itwinui-icons-react";
import { Viewport } from "@itwin/core-frontend";
import { Density } from "./CarVisualization";
import { OverpassApi } from "./common/open-street-map/OverpassApi";

const densityStates: SelectOption<Density>[] = [
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
];

const CarDecorationWidget = () => {
  const viewport = useActiveViewport();

  /** True when performing API query */
  const [isLoading, setIsLoading] = useState<boolean>(false);

  /** Place name to which to travel. */
  const [destination, setDestination] = useState<string>("");
  const [allowQuery, setAllowQuery] = useState<boolean>(true);

  /** True when creating streets and intersections without performing an API query  */
  const [isCreatingRoads, setIsCreatingRoads] = useState<boolean>(false);

  /** Decorator settings */
  const [densityState, setDensityState] = useState<Density>("Medium");
  const [leftSide, setLeftSide] = useState<boolean>(false);
  const [paused, setPaused] = useState<boolean>(false);
  const [streetsOnlyMap, setStreetsOnlyMap] = useState<boolean>(true);
  const [carSize, setCarSize] = useState<number>(3);

  /** Initialize OSM data and decorators on viewport change */
  useEffect(() => {
    handleSetViewBounds();

    const updateSizeAndBounds = (vp: Viewport) => {
      const extents = CarDecorationApi.getExtents(vp);
      const inBounds = extents <= CarDecorationApi.maxQueryDistance;
      setAllowQuery(inBounds);

      if (inBounds)
        setCarSize(extents >= 500 ? 3 : 1);
    };

    if (viewport)
      updateSizeAndBounds(viewport);

    const disposeViewChangedListener = viewport?.onViewChanged.addListener((vp: Viewport) => updateSizeAndBounds(vp));

    return () => {
      CarDecorationApi.dispose();
      if (disposeViewChangedListener) disposeViewChangedListener();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport]);

  useEffect(() => {
    CarDecorationApi.getCarDecorators().forEach((decorator) => {
      decorator.changeDensity(densityState);
    });
  }, [densityState]);

  useEffect(() => {
    CarDecorationApi.getCarDecorators().forEach((decorator) => {
      decorator.pause(paused);
    });
  }, [paused]);

  useEffect(() => {
    CarDecorationApi.getCarDecorators().forEach((decorator) => {
      decorator.setSize(carSize);
    });
  }, [carSize]);

  useEffect(() => {
    if (viewport) CarDecorationApi.setMap(viewport, streetsOnlyMap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streetsOnlyMap]);

  /** Recreate the streets using existing data whenever leftSide changes */
  useEffect(() => {
    setIsCreatingRoads(true);
    OverpassApi.updateStreetsAndIntersections(leftSide)
      .then((data) => {
        if (data)
          CarDecorationApi.createDecorator(data, 9000, densityState, carSize);
      })
      .finally(() => setIsCreatingRoads(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftSide]);

  /** Creates new CarDecorator with data from a new OSM query */
  const handleSetViewBounds = () => {
    if (undefined === viewport) return;

    const viewportExtents = CarDecorationApi.getExtents(viewport);
    if (viewportExtents > CarDecorationApi.maxQueryDistance) {
      toaster.informational(`Zoom in to view data`, {
        hasCloseButton: true,
        type: "temporary",
      });
      return;
    }

    setIsLoading(true);
    OverpassApi.createStreetsAndIntersections(leftSide, viewport)
      .then((data) => {
        if (data)
          CarDecorationApi.createDecorator(data, 9000, densityState, carSize);
      })
      .catch((error: any) => {
        toaster.warning(`Error fetching data: ${error}`, {
          hasCloseButton: true,
          type: "temporary",
        });
      })
      .finally(() => setIsLoading(false));
  };

  /** Uses the CarDecorationApi to move the viewport to a specific location depending on the value of 'destination' */
  const handleTravel = async () => {
    if (!viewport) return;
    viewport.turnCameraOn();
    const locationFound = await CarDecorationApi.travelTo(
      viewport,
      destination
    );
    if (locationFound) {
      handleSetViewBounds();
    } else {
      const message = `Sorry, "${destination}" isn't recognized as a location.`;
      toaster.warning(message, {
        hasCloseButton: true,
        type: "temporary",
      });
    }
    viewport.turnCameraOff();
  };

  /** Handles enter/return key button presses in destination input boxes */
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === SpecialKey.Enter || e.key === SpecialKey.Return) {
      void handleTravel();
    }
  };

  const widgetRef = useRef(null);
  const updateButtonRef = useRef(null);

  return (
    <div className="sample-options">
      <div className="sample-grid" ref={widgetRef}>
        <div ref={updateButtonRef}>
          <Button
            onClick={handleSetViewBounds}
            disabled={isLoading || isCreatingRoads || !allowQuery}
          >
            {isLoading || isCreatingRoads ? (
              <LoadingSpinner />
            ) : (
              "Update Street Data"
            )}
          </Button>
        </div>
        {(!allowQuery) && <Tooltip content={"Zoom in to enable"} reference={updateButtonRef} />}
        <LabeledSelect
          label="Car density"
          displayStyle="inline"
          className="span-2"
          options={densityStates}
          value={densityState}
          onChange={(value: Density) => setDensityState(value)}
          disabled={isLoading || isCreatingRoads}
        />
        <ToggleSwitch
          label="Left side"
          checked={leftSide}
          onChange={(event) => setLeftSide(event.target.checked)}
          disabled={isLoading || isCreatingRoads}
        />
        <ToggleSwitch
          label="Pause"
          checked={paused}
          onChange={(event) => setPaused(event.target.checked)}
          disabled={isLoading || isCreatingRoads}
        />
        <ToggleSwitch
          label="Streets only"
          checked={streetsOnlyMap}
          onChange={(event) => setStreetsOnlyMap(event.target.checked)}
          disabled={isLoading || isCreatingRoads}
        />
        <div className="travel-destination">
          <Label htmlFor="destination">
            <span className="toggle-label">
              <Text>Destination</Text>
              <Tooltip content="Type a place name and press enter to travel there">
                <IconButton
                  size="small"
                  styleType="borderless"
                >
                  <SvgHelpCircularHollow />
                </IconButton>
              </Tooltip>
            </span>
          </Label>
          <Input
            id="destination"
            size="small"
            className="travel-destination-input"
            onChange={(e) => setDestination(e.currentTarget.value)}
            onKeyPress={handleKeyPress}
          />
          <Button
            size="small"
            className="travel-destination-btn"
            styleType="cta"
            disabled={!destination.length}
            onClick={handleTravel}
          >
            Travel
          </Button>
        </div>
        {(isLoading || isCreatingRoads) && <Tooltip content={"Loading data"} reference={widgetRef} />}
        <Alert type="informational" className="instructions">
          Zoom in to view cars and use the controls above to change the traffic
          simulation settings. Clicking the update button resets the OSM data
          according to the view extents. A red box is drawn around the area that
          contains street data and cars. The number of cars is determined by the
          length of available streets and car density with a max of 9000 cars.
        </Alert>
      </div>
    </div>
  );
};

export class CarDecorationWidgetProvider implements UiItemsProvider {
  public readonly id: string = "CarDecorationWidgetProvider";

  public provideWidgets(
    _stageId: string,
    _stageUsage: string,
    location: StagePanelLocation,
    _section?: StagePanelSection
  ): ReadonlyArray<AbstractWidgetProps> {
    const widgets: AbstractWidgetProps[] = [];
    if (location === StagePanelLocation.Bottom) {
      widgets.push({
        id: "CarDecorationWidget",
        label: "Car Decoration Selector",
        defaultState: WidgetState.Open,
        // eslint-disable-next-line react/display-name
        getWidgetContent: () => <CarDecorationWidget />,
      });
    }
    return widgets;
  }
}

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import React, { useEffect } from "react";
import { Viewer, ViewerViewportControlOptions } from "@itwin/web-viewer-react";
import { FrontstageManager } from "@itwin/appui-react";
import { UiItemsProvider } from "@itwin/appui-abstract";
import { CarDecorationWidgetProvider } from "./CarDecorationWidget";
import CarDecorationApi from "./CarDecorationApi";
import { IModelApp } from "@itwin/core-frontend";
import { authClient } from "./common/AuthorizationClient";
import { mapLayerOptions } from "./common/MapLayerOptions";

const uiProviders: UiItemsProvider[] = [new CarDecorationWidgetProvider()];

const viewportOptions: ViewerViewportControlOptions = {
  viewState: async (iModelConnection) => {
    const notice = `
      <div class="logo-card-notice">
      <span>
        This sample uses data from <a target="_blank" href="https://www.openstreetmap.org/">OpenStreetMap</a>.
        The data retrieved from this API is made available under the <a target="_blank" href="https://www.openstreetmap.org/copyright">Open Database License</a>.
      </span>
      </br>
      <span>
        © OpenStreetMap contributors
      </span>
      </div>
    `;
    IModelApp.applicationLogoCard = () => IModelApp.makeLogoCard({ heading: "Car Particle Effect", notice });
    return CarDecorationApi.getInitialView(iModelConnection);
  },
};

const iTwinId = process.env.IMJS_ITWIN_ID;
const iModelId = process.env.IMJS_IMODEL_ID;

const CarDecorationApp = () => {
  /** Sign-in */
  useEffect(() => {
    void authClient.signIn();
  }, []);

  /** The sample's render method */
  return (
    <Viewer
      iTwinId={iTwinId ?? ""}
      iModelId={iModelId ?? ""}
      authClient={authClient}
      viewportOptions={viewportOptions}
      mapLayerOptions={mapLayerOptions}
      defaultUiConfig={
        {
          hideNavigationAid: true,
          hideStatusBar: true,
          hideToolSettings: true,
        }
      }
      uiProviders={uiProviders}
      enablePerformanceMonitors={false}
      theme="dark"
    />
  );
};

// Define panel size
FrontstageManager.onFrontstageReadyEvent.addListener((event) => {
  const { bottomPanel } = event.frontstageDef;
  bottomPanel && (bottomPanel.size = 255);
});

export default CarDecorationApp;

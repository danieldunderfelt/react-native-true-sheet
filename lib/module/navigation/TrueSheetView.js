"use strict";

import { TrueSheetScreen } from "./screen/index.js";
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
let ReanimatedTrueSheetScreen = null;
const getReanimatedScreen = () => {
  if (!ReanimatedTrueSheetScreen) {
    ReanimatedTrueSheetScreen = require('./screen/ReanimatedTrueSheetScreen').ReanimatedTrueSheetScreen;
  }
  return ReanimatedTrueSheetScreen;
};
const DEFAULT_DETENTS = ['auto'];
const clampDetentIndex = (index, detentsLength) => Math.min(index, Math.max(detentsLength - 1, 0));
export const TrueSheetView = ({
  state,
  navigation,
  descriptors
}) => {
  // First route is the base screen, rest are sheets
  const [baseRoute, ...sheetRoutes] = state.routes;
  const baseDescriptor = baseRoute ? descriptors[baseRoute.key] : null;
  return /*#__PURE__*/_jsxs(_Fragment, {
    children: [baseDescriptor?.render(), sheetRoutes.map(route => {
      const descriptor = descriptors[route.key];
      if (!descriptor) {
        return null;
      }
      const {
        options,
        navigation: screenNavigation,
        render
      } = descriptor;
      const {
        detentIndex = 0,
        detents = DEFAULT_DETENTS,
        reanimated,
        positionChangeHandler,
        ...sheetProps
      } = options;
      const resolvedIndex = clampDetentIndex(route.resizeIndex ?? detentIndex, detents.length);
      if (reanimated) {
        const ReanimatedScreen = getReanimatedScreen();
        return /*#__PURE__*/_jsx(ReanimatedScreen, {
          routeKey: route.key,
          closing: route.closing,
          detentIndex: resolvedIndex,
          resizeKey: route.resizeKey,
          detents: detents,
          navigation: screenNavigation,
          emit: navigation.emit,
          positionChangeHandler: positionChangeHandler,
          ...sheetProps,
          children: render()
        }, route.key);
      }
      return /*#__PURE__*/_jsx(TrueSheetScreen, {
        routeKey: route.key,
        closing: route.closing,
        detentIndex: resolvedIndex,
        resizeKey: route.resizeKey,
        detents: detents,
        navigation: screenNavigation,
        emit: navigation.emit,
        positionChangeHandler: positionChangeHandler,
        ...sheetProps,
        children: render()
      }, route.key);
    })]
  });
};
//# sourceMappingURL=TrueSheetView.js.map
"use strict";

import { createNavigatorFactory, useNavigationBuilder } from '@react-navigation/core';
import { TrueSheetRouter } from "./TrueSheetRouter.js";
import { TrueSheetView } from "./TrueSheetView.js";
import { jsx as _jsx } from "react/jsx-runtime";
const TrueSheetNavigator = ({
  id,
  initialRouteName,
  children,
  layout,
  screenListeners,
  screenOptions,
  screenLayout
}) => {
  const {
    state,
    descriptors,
    navigation,
    NavigationContent
  } = useNavigationBuilder(TrueSheetRouter, {
    id,
    initialRouteName,
    children,
    layout,
    screenListeners,
    screenOptions,
    screenLayout
  });
  return /*#__PURE__*/_jsx(NavigationContent, {
    children: /*#__PURE__*/_jsx(TrueSheetView, {
      state: state,
      navigation: navigation,
      descriptors: descriptors
    })
  });
};

/**
 * Creates a TrueSheet navigator.
 *
 * @example
 * ```tsx
 * const Sheet = createTrueSheetNavigator();
 *
 * function App() {
 *   return (
 *     <Sheet.Navigator>
 *       <Sheet.Screen name="Home" component={HomeScreen} />
 *       <Sheet.Screen
 *         name="Details"
 *         component={DetailsSheet}
 *         options={{ detents: [0.5, 1] }}
 *       />
 *     </Sheet.Navigator>
 *   );
 * }
 * ```
 */
export const createTrueSheetNavigator = config => {
  return createNavigatorFactory(TrueSheetNavigator)(config);
};
//# sourceMappingURL=createTrueSheetNavigator.js.map
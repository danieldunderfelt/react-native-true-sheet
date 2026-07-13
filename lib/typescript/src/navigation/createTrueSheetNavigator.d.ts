import { type NavigatorTypeBagBase, type ParamListBase, type StaticConfig, type TypedNavigator } from '@react-navigation/core';
import type { TrueSheetNavigationEventMap, TrueSheetNavigationOptions, TrueSheetNavigationProp, TrueSheetNavigationState, TrueSheetNavigatorProps } from './types';
declare const TrueSheetNavigator: ({ id, initialRouteName, children, layout, screenListeners, screenOptions, screenLayout, }: TrueSheetNavigatorProps) => import("react").JSX.Element;
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
export declare const createTrueSheetNavigator: <const ParamList extends ParamListBase, const NavigatorID extends string | undefined = undefined, const TypeBag extends NavigatorTypeBagBase = {
    ParamList: ParamList;
    NavigatorID: NavigatorID;
    State: TrueSheetNavigationState<ParamList>;
    ScreenOptions: TrueSheetNavigationOptions;
    EventMap: TrueSheetNavigationEventMap;
    NavigationList: { [RouteName in keyof ParamList]: TrueSheetNavigationProp<ParamList, RouteName, NavigatorID>; };
    Navigator: typeof TrueSheetNavigator;
}, const Config extends StaticConfig<TypeBag> = StaticConfig<TypeBag>>(config?: Config) => TypedNavigator<TypeBag, Config>;
export {};
//# sourceMappingURL=createTrueSheetNavigator.d.ts.map
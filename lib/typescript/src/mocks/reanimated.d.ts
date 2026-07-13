import React from 'react';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { TrueSheetProps, PositionChangeEventPayload } from '../TrueSheet.types';
interface TrueSheetState {
    shouldRenderNativeView: boolean;
}
interface MockReanimatedTrueSheetContextValue {
    animatedPosition: SharedValue<number>;
    animatedIndex: SharedValue<number>;
    animatedDetent: SharedValue<number>;
}
/**
 * Mock ReanimatedTrueSheet component for testing.
 * Import from '@lodev09/react-native-true-sheet/reanimated/mock' in your test setup.
 */
export declare class ReanimatedTrueSheet extends React.Component<TrueSheetProps, TrueSheetState> {
    static instances: Record<string, ReanimatedTrueSheet>;
    static dismiss: jest.Mock<Promise<void>, [_name: string, _animated?: boolean | undefined], any>;
    static dismissStack: jest.Mock<Promise<void>, [_name: string, _animated?: boolean | undefined], any>;
    static present: jest.Mock<Promise<void>, [_name: string, _index?: number | undefined, _animated?: boolean | undefined], any>;
    static resize: jest.Mock<Promise<void>, [_name: string, _index: number], any>;
    dismiss: jest.Mock<Promise<void>, [_animated?: boolean | undefined], any>;
    dismissStack: jest.Mock<Promise<void>, [_animated?: boolean | undefined], any>;
    present: jest.Mock<Promise<void>, [_index?: number | undefined, _animated?: boolean | undefined], any>;
    resize: jest.Mock<Promise<void>, [_index: number], any>;
    componentDidMount(): void;
    componentWillUnmount(): void;
    private renderHeader;
    private renderFooter;
    render(): React.CElement<import("react-native").ViewProps, View>;
}
/**
 * Mock ReanimatedTrueSheetProvider for testing.
 */
export declare function ReanimatedTrueSheetProvider({ children }: {
    children: React.ReactNode;
}): React.ReactNode;
/**
 * Mock useReanimatedTrueSheet hook for testing.
 */
export declare const useReanimatedTrueSheet: jest.Mock<MockReanimatedTrueSheetContextValue, [], any>;
/**
 * Mock useReanimatedPositionChangeHandler hook for testing.
 */
export declare const useReanimatedPositionChangeHandler: jest.Mock<jest.Mock<any, any, any>, [_handler: (payload: PositionChangeEventPayload) => void, _dependencies?: unknown[] | undefined], any>;
export {};
//# sourceMappingURL=reanimated.d.ts.map
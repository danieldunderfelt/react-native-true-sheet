import React from 'react';
import { View, type ViewProps } from 'react-native';
import type { TrueSheetProps, TrueSheetStaticMethods } from '../TrueSheet.types';
interface TrueSheetState {
    shouldRenderNativeView: boolean;
}
/**
 * Mock TrueSheet component for testing.
 * Import from '@lodev09/react-native-true-sheet/mock' in your test setup.
 */
export declare class TrueSheet extends React.Component<TrueSheetProps, TrueSheetState> {
    static instances: Record<string, TrueSheet>;
    static dismiss: jest.Mock<Promise<void>, [_name: string, _animated?: boolean | undefined], any>;
    static dismissStack: jest.Mock<Promise<void>, [_name: string, _animated?: boolean | undefined], any>;
    static present: jest.Mock<Promise<void>, [_name: string, _index?: number | undefined, _animated?: boolean | undefined], any>;
    static resize: jest.Mock<Promise<void>, [_name: string, _index: number], any>;
    static dismissAll: jest.Mock<Promise<void>, [_animated?: boolean | undefined], any>;
    dismiss: jest.Mock<Promise<void>, [_animated?: boolean | undefined], any>;
    dismissStack: jest.Mock<Promise<void>, [_animated?: boolean | undefined], any>;
    present: jest.Mock<Promise<void>, [_index?: number | undefined, _animated?: boolean | undefined], any>;
    resize: jest.Mock<Promise<void>, [_index: number], any>;
    componentDidMount(): void;
    componentWillUnmount(): void;
    private renderHeader;
    private renderFooter;
    render(): React.CElement<ViewProps, View>;
}
/**
 * Mock TrueSheetPeek component for testing.
 */
export declare function TrueSheetPeek({ children, ...rest }: ViewProps): React.CElement<ViewProps, View>;
/**
 * Mock TrueSheetProvider for testing.
 */
export declare function TrueSheetProvider({ children }: {
    children: React.ReactNode;
}): React.ReactNode;
/**
 * Mock useTrueSheet hook for testing.
 */
export declare function useTrueSheet(): TrueSheetStaticMethods;
export * from '../TrueSheet.types';
//# sourceMappingURL=index.d.ts.map
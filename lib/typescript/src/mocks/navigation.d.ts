import type { ParamListBase } from '@react-navigation/native';
import type { TrueSheetNavigationProp } from '../navigation/types';
/**
 * Mock createTrueSheetNavigator for testing.
 * Import from '@lodev09/react-native-true-sheet/navigation/mock' in your test setup.
 */
export declare const createTrueSheetNavigator: jest.Mock<{
    Navigator: jest.Mock<import("react").ReactNode, [{
        children: React.ReactNode;
    }], any>;
    Screen: jest.Mock<null, [], any>;
    Group: jest.Mock<null, [], any>;
}, [], any>;
/**
 * Mock TrueSheetActions for testing.
 */
export declare const TrueSheetActions: {
    push: jest.Mock<{
        type: string;
        payload: {
            name: string;
            params: object | undefined;
        };
    }, [name: string, params?: object | undefined], any>;
    pop: jest.Mock<{
        type: string;
        payload: {
            count: number | undefined;
        };
    }, [count?: number | undefined], any>;
    popTo: jest.Mock<{
        type: string;
        payload: {
            name: string;
            params: object | undefined;
        };
    }, [name: string, params?: object | undefined], any>;
    popToTop: jest.Mock<{
        type: string;
    }, [], any>;
    replace: jest.Mock<{
        type: string;
        payload: {
            name: string;
            params: object | undefined;
        };
    }, [name: string, params?: object | undefined], any>;
    resize: jest.Mock<{
        type: string;
        index: number;
    }, [index: number], any>;
    dismiss: jest.Mock<{
        type: string;
    }, [], any>;
    remove: jest.Mock<{
        type: string;
    }, [], any>;
};
/**
 * Mock useTrueSheetNavigation hook for testing.
 */
export declare const useTrueSheetNavigation: jest.Mock<TrueSheetNavigationProp<ParamListBase>, [], any>;
export type { TrueSheetActionType } from '../navigation/TrueSheetRouter';
export type { DetentInfoEventPayload, PositionChangeEventPayload } from '../TrueSheet.types';
export type { TrueSheetNavigationEventMap, TrueSheetNavigationHelpers, TrueSheetNavigationOptions, TrueSheetNavigationProp, TrueSheetNavigationState, TrueSheetScreenProps, } from '../navigation/types';
//# sourceMappingURL=navigation.d.ts.map
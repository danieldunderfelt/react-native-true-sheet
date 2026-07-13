import { type CommonActions, type ParamListBase, type Router, type StackActionType, type StackRouterOptions } from '@react-navigation/core';
import type { TrueSheetNavigationState } from './types';
export type TrueSheetRouterOptions = StackRouterOptions;
export type TrueSheetActionType = StackActionType | ReturnType<typeof CommonActions.goBack> | {
    type: 'RESIZE';
    index: number;
    source?: string;
    target?: string;
} | {
    type: 'DISMISS';
    source?: string;
    target?: string;
} | {
    type: 'REMOVE';
    source?: string;
    target?: string;
};
export declare const TrueSheetActions: {
    resize: (index: number) => TrueSheetActionType;
    dismiss: () => TrueSheetActionType;
    remove: () => TrueSheetActionType;
    replace(name: string, params?: object): {
        readonly type: "REPLACE";
        readonly payload: {
            readonly name: string;
            readonly params: object | undefined;
        };
    };
    push(name: string, params?: object): {
        readonly type: "PUSH";
        readonly payload: {
            readonly name: string;
            readonly params: object | undefined;
        };
    };
    pop(count?: number): {
        readonly type: "POP";
        readonly payload: {
            readonly count: number;
        };
    };
    popToTop(): {
        readonly type: "POP_TO_TOP";
    };
    popTo(name: string, params?: object, options?: {
        merge?: boolean;
    }): {
        readonly type: "POP_TO";
        readonly payload: {
            readonly name: string;
            readonly params: object | undefined;
            readonly merge: boolean | undefined;
        };
    };
};
export declare const TrueSheetRouter: (routerOptions: StackRouterOptions) => Router<TrueSheetNavigationState<ParamListBase>, TrueSheetActionType>;
//# sourceMappingURL=TrueSheetRouter.d.ts.map
/**
 * This hook is necessary to prevent buggy behavior on iOS devices (need to test on Android).
 * I won't get into too much detail about what bugs it solves, but so far I've found that setting the body to `position: fixed` is the most reliable way to prevent those bugs.
 * Issues that this hook solves:
 * https://github.com/emilkowalski/vaul/issues/435
 * https://github.com/emilkowalski/vaul/issues/433
 * And more that I discovered, but were just not reported.
 */
export declare function usePositionFixed({ isOpen, modal, nested, hasBeenOpened, preventScrollRestoration, noBodyStyles, }: {
    isOpen: boolean;
    modal: boolean;
    nested: boolean;
    hasBeenOpened: boolean;
    preventScrollRestoration: boolean;
    noBodyStyles: boolean;
}): {
    restorePositionSetting: () => void;
};
//# sourceMappingURL=use-position-fixed.d.ts.map
import {
  PureComponent,
  type RefObject,
  createRef,
  type ReactNode,
  type ComponentRef,
  isValidElement,
  createElement,
} from 'react';

import type {
  TrueSheetProps,
  TrueSheetMethods,
  TrueSheetStaticMethods,
  DragBeginEvent,
  DragChangeEvent,
  DragEndEvent,
  DetentChangeEvent,
  WillPresentEvent,
  DidPresentEvent,
  PositionChangeEvent,
  DidDismissEvent,
  WillDismissEvent,
  MountEvent,
  WillFocusEvent,
  DidFocusEvent,
  WillBlurEvent,
  DidBlurEvent,
} from './TrueSheet.types';
import TrueSheetViewNativeComponent from './fabric/TrueSheetViewNativeComponent';
import TrueSheetContainerViewNativeComponent from './fabric/TrueSheetContainerViewNativeComponent';
import TrueSheetContentViewNativeComponent from './fabric/TrueSheetContentViewNativeComponent';
import TrueSheetHeaderViewNativeComponent from './fabric/TrueSheetHeaderViewNativeComponent';
import TrueSheetFooterViewNativeComponent from './fabric/TrueSheetFooterViewNativeComponent';

import TrueSheetModule from './specs/NativeTrueSheetModule';

import {
  Platform,
  StyleSheet,
  BackHandler,
  findNodeHandle,
  processColor,
  type NativeEventSubscription,
} from 'react-native';

const LINKING_ERROR =
  `The package '@danieldunderfelt/react-native-true-sheet' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n' +
  '- You are using the new architecture (Fabric)\n';

if (!TrueSheetModule) {
  throw new Error(LINKING_ERROR);
}

type NativeRef = ComponentRef<typeof TrueSheetViewNativeComponent>;

interface TrueSheetState {
  shouldRenderNativeView: boolean;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`TrueSheet: ${label} timed out`));
    }, ms);

    p.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export class TrueSheet
  extends PureComponent<TrueSheetProps, TrueSheetState>
  implements TrueSheetMethods
{
  displayName = 'TrueSheet';

  private readonly nativeRef: RefObject<NativeRef | null>;

  private cachedGrabberOptions: TrueSheetProps['grabberOptions'] | undefined;
  private resolvedGrabberOptions: Record<string, unknown> | undefined;
  private backHandlerSubscription: NativeEventSubscription | null = null;
  private isPresented: boolean = false;
  private isSheetVisible: boolean = true;

  /**
   * Map of sheet names against their instances.
   */
  private static readonly instances: { [name: string]: TrueSheet } = {};

  /**
   * Resolvers waiting for the native mount event. A list, not a single slot: concurrent
   * present() calls before the mount commit must all settle — a single overwritten
   * resolver would leave the earlier promise pending forever.
   */
  private presentationResolvers: Array<() => void> = [];

  /**
   * Tracks if a present operation is in progress
   */
  private isPresenting: boolean = false;
  private presentToken = 0;
  private unmounted = false;

  constructor(props: TrueSheetProps) {
    super(props);

    this.nativeRef = createRef<NativeRef>();

    this.validateDetents();

    // Lazy load by default, except when initialDetentIndex is set (for auto-presentation)
    const shouldRenderImmediately =
      props.initialDetentIndex !== undefined && props.initialDetentIndex >= 0;

    this.state = {
      shouldRenderNativeView: shouldRenderImmediately,
    };

    this.onMount = this.onMount.bind(this);
    this.onWillDismiss = this.onWillDismiss.bind(this);
    this.onDidDismiss = this.onDidDismiss.bind(this);
    this.onWillPresent = this.onWillPresent.bind(this);
    this.onDidPresent = this.onDidPresent.bind(this);
    this.onDetentChange = this.onDetentChange.bind(this);
    this.onDragBegin = this.onDragBegin.bind(this);
    this.onDragChange = this.onDragChange.bind(this);
    this.onDragEnd = this.onDragEnd.bind(this);
    this.onPositionChange = this.onPositionChange.bind(this);
    this.onWillFocus = this.onWillFocus.bind(this);
    this.onDidFocus = this.onDidFocus.bind(this);
    this.onWillBlur = this.onWillBlur.bind(this);
    this.onDidBlur = this.onDidBlur.bind(this);
    this.handleBackPress = this.handleBackPress.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);
  }

  private validateDetents(): void {
    const { detents, initialDetentIndex } = this.props;

    // Warn if detents length exceeds 3
    if (detents && detents.length > 3) {
      console.warn(
        `TrueSheet: detents array has ${detents.length} items but maximum is 3. Only the first 3 will be used.`
      );
    }

    // Warn for invalid detent fractions
    if (detents) {
      detents.forEach((detent, index) => {
        if (typeof detent === 'number' && detent !== -1 && detent !== -2) {
          if (detent <= 0 || detent > 1) {
            console.warn(
              `TrueSheet: detent at index ${index} (${detent}) should be between 0 and 1. It will be clamped.`
            );
          }
        }
      });
    }

    // Validate initialDetentIndex bounds
    if (initialDetentIndex !== undefined && initialDetentIndex >= 0) {
      const detentsLength = Math.min(detents?.length ?? 2, 3); // Max 3 detents
      if (initialDetentIndex >= detentsLength) {
        throw new Error(
          `TrueSheet: initialDetentIndex (${initialDetentIndex}) is out of bounds. detents array has ${detentsLength} item(s)`
        );
      }
    }
  }

  private static getInstance(name: string) {
    const instance = TrueSheet.instances[name];
    if (!instance) {
      console.warn(`Could not find TrueSheet instance with name "${name}". Check your name prop.`);
      return;
    }

    return instance;
  }

  /**
   * Native view tag, or null when the native view is unavailable — not yet attached,
   * or already torn down by navigation. Callers treat null as "nothing to do": these
   * are benign races, not errors.
   */
  private get handle(): number | null {
    const nodeHandle = findNodeHandle(this.nativeRef.current);
    if (nodeHandle == null || nodeHandle === -1) {
      return null;
    }

    return nodeHandle;
  }

  /**
   * Present the sheet by given `name` (Promise-based)
   * @param name - Sheet name (must match sheet's name prop)
   * @param index - Detent index (default: 0)
   * @param animated - Whether to animate the presentation (default: true)
   * @returns Promise that resolves when sheet is fully presented
   * @throws Error if sheet not found or presentation fails
   */
  public static async present(
    name: string,
    index: number = 0,
    animated: boolean = true
  ): Promise<void> {
    const instance = TrueSheet.getInstance(name);
    if (!instance) {
      throw new Error(`Sheet with name "${name}" not found`);
    }

    return instance.present(index, animated);
  }

  /**
   * Dismiss the sheet by given `name` (Promise-based)
   * @param name - Sheet name
   * @param animated - Whether to animate the dismissal (default: true)
   * @returns Promise that resolves when sheet is fully dismissed
   * @throws Error if sheet not found or dismissal fails
   */
  public static async dismiss(name: string, animated: boolean = true): Promise<void> {
    const instance = TrueSheet.getInstance(name);
    if (!instance) {
      throw new Error(`Sheet with name "${name}" not found`);
    }

    return instance.dismiss(animated);
  }

  /**
   * Dismiss only the sheets presented on top of a sheet by given `name`
   * @param name - Sheet name
   * @param animated - Whether to animate the dismissal (default: true)
   * @returns Promise that resolves when all child sheets are dismissed
   * @throws Error if sheet not found
   */
  public static async dismissStack(name: string, animated: boolean = true): Promise<void> {
    const instance = TrueSheet.getInstance(name);
    if (!instance) {
      throw new Error(`Sheet with name "${name}" not found`);
    }

    return instance.dismissStack(animated);
  }

  /**
   * Resize the sheet by given `name` (Promise-based)
   * @param name - Sheet name
   * @param index - New detent index
   * @returns Promise that resolves when resize is complete
   * @throws Error if sheet not found
   */
  public static async resize(name: string, index: number): Promise<void> {
    const instance = TrueSheet.getInstance(name);
    if (!instance) {
      throw new Error(`Sheet with name "${name}" not found`);
    }

    return instance.resize(index);
  }

  /**
   * Dismiss all presented sheets by dismissing from the bottom of the stack.
   * This ensures child sheets are dismissed first before their parent.
   * @param animated - Whether to animate the dismissals (default: true)
   * @returns Promise that resolves when all sheets are dismissed
   */
  public static async dismissAll(animated: boolean = true): Promise<void> {
    return TrueSheetModule?.dismissAll(animated);
  }

  /**
   * Suspend all currently open sheets. Each captured sheet steps aside natively —
   * dismissed on iOS, hidden on Android — while staying logically presented: no dismiss
   * events fire, content stays mounted, and the active detent is remembered.
   *
   * Sheets presented *after* this call are unaffected, so a flow (e.g. a modal route)
   * that suspends the sheets beneath it can still open sheets of its own.
   *
   * Restore the captured sheets with `unsuspendAll`.
   * @returns Promise that resolves when suspension has been initiated
   */
  public static async suspendAll(): Promise<void> {
    return TrueSheetModule?.suspendAll();
  }

  /**
   * Re-present the sheets captured by `suspendAll`, restoring each at its remembered
   * detent without re-emitting present events. Safe to call while other transitions
   * (e.g. a closing modal) are still in flight — re-presentation waits for them.
   * @returns Promise that resolves when re-presentation has been initiated
   */
  public static async unsuspendAll(): Promise<void> {
    return TrueSheetModule?.unsuspendAll();
  }

  private registerInstance(): void {
    if (this.props.name) {
      TrueSheet.instances[this.props.name] = this;
    }
  }

  private unregisterInstance(): void {
    if (this.props.name) {
      delete TrueSheet.instances[this.props.name];
    }
  }

  private onDetentChange(event: DetentChangeEvent): void {
    this.props.onDetentChange?.(event);
  }

  private onWillPresent(event: WillPresentEvent): void {
    this.props.onWillPresent?.(event);
  }

  private onDidPresent(event: DidPresentEvent): void {
    this.isPresented = true;

    if (Platform.OS === 'android') {
      this.backHandlerSubscription?.remove();
      this.backHandlerSubscription = BackHandler.addEventListener(
        'hardwareBackPress',
        this.handleBackPress
      );
    }

    this.props.onDidPresent?.(event);
  }

  private onWillDismiss(event: WillDismissEvent): void {
    this.props.onWillDismiss?.(event);
  }

  private onDidDismiss(event: DidDismissEvent): void {
    this.isPresented = false;
    this.isSheetVisible = true;
    this.backHandlerSubscription?.remove();
    this.backHandlerSubscription = null;

    try {
      this.props.onDidDismiss?.(event);
    } finally {
      if (!this.isPresenting) {
        this.setState({ shouldRenderNativeView: false });
      }
    }
  }

  private onMount(event: MountEvent): void {
    // Resolve the mount promise if waiting
    this.presentationResolvers.splice(0).forEach((resolve) => resolve());

    this.props.onMount?.(event);
  }

  private onDragBegin(event: DragBeginEvent): void {
    this.props.onDragBegin?.(event);
  }

  private onDragChange(event: DragChangeEvent): void {
    this.props.onDragChange?.(event);
  }

  private onDragEnd(event: DragEndEvent): void {
    this.props.onDragEnd?.(event);
  }

  private onPositionChange(event: PositionChangeEvent): void {
    this.props.onPositionChange?.(event);
  }

  private onWillFocus(event: WillFocusEvent): void {
    this.props.onWillFocus?.(event);
  }

  private onDidFocus(event: DidFocusEvent): void {
    this.props.onDidFocus?.(event);
  }

  private onWillBlur(event: WillBlurEvent): void {
    this.props.onWillBlur?.(event);
  }

  private onDidBlur(event: DidBlurEvent): void {
    this.props.onDidBlur?.(event);
  }

  private onVisibilityChange(event: { nativeEvent: { visible: boolean } }): void {
    this.isSheetVisible = event.nativeEvent.visible;
  }

  private handleBackPress(): boolean {
    // Synchronous guard: a suspended sheet must let back through even before the
    // native visibility-change event has flipped isSheetVisible.
    if (this.props.suspended) return false;

    if (!this.isPresented || !this.isSheetVisible) return false;

    // When not dismissible, let back propagate (e.g. navigation goes back to the previous screen)
    if (this.props.dismissible === false) {
      return this.props.onBackPress?.() ?? false;
    }

    const handle = findNodeHandle(this.nativeRef.current);
    if (handle == null || handle === -1) return false;

    TrueSheetModule?.handleBackPress(handle);
    return this.props.onBackPress?.() ?? true;
  }

  /**
   * Present the sheet at a given detent index.
   * @param index - The detent index to present at (default: 0)
   * @param animated - Whether to animate the presentation (default: true)
   */
  public async present(index: number = 0, animated: boolean = true): Promise<void> {
    if (this.unmounted) {
      // Presenting a sheet whose component is gone is a no-op, not an error — this
      // happens legitimately when a present races its screen's teardown.
      console.warn('TrueSheet: present() ignored — sheet is unmounted.');
      return;
    }

    const detentsLength = Math.min(this.props.detents?.length ?? 2, 3); // Max 3 detents
    if (index < 0 || index >= detentsLength) {
      throw new Error(
        `TrueSheet: present index (${index}) is out of bounds. detents array has ${detentsLength} item(s)`
      );
    }

    const token = ++this.presentToken;
    this.isPresenting = true;

    try {
      // Lazy load: render native view if not already rendered
      if (!this.state.shouldRenderNativeView) {
        // Settled by onMount, or quietly by componentWillUnmount if the component dies
        // first — never rejected, so fire-and-forget callers can't hit uncaught errors.
        await new Promise<void>((resolve) => {
          this.presentationResolvers.push(resolve);
          this.setState({ shouldRenderNativeView: true });
        });
      }

      if (this.unmounted) {
        // Unmounted while waiting for the native view — nothing left to present.
        return;
      }

      const handle = this.handle;
      if (handle == null) {
        // The native view is unavailable (torn down during navigation) — a present
        // that raced teardown is a no-op, not an error.
        console.warn('TrueSheet: present() ignored — native view is unavailable.');
        return;
      }

      try {
        await withTimeout(
          TrueSheetModule?.presentByRef(handle, index, animated) ?? Promise.resolve(),
          6000,
          'present'
        );
      } catch (error) {
        // A present whose component disappeared mid-flight (screen teardown, view
        // recycle) settles quietly — there is nothing left to present and nothing
        // actionable for the caller. Real failures on live sheets still throw.
        if (this.unmounted) return;
        throw error;
      }
    } finally {
      if (token === this.presentToken) {
        this.isPresenting = false;
      }
    }
  }

  /**
   * Resize the sheet to a given detent index.
   * @param index - The detent index to resize to
   */
  public async resize(index: number): Promise<void> {
    if (this.unmounted) {
      console.warn('TrueSheet: resize() ignored — sheet is unmounted.');
      return;
    }

    const handle = this.handle;
    if (handle == null) {
      console.warn('TrueSheet: resize() ignored — native view is unavailable.');
      return;
    }

    await TrueSheetModule?.resizeByRef(handle, index);
  }

  /**
   * Dismiss this sheet and all sheets presented on top of it in a single animation.
   * @param animated - Whether to animate the dismissal (default: true)
   */
  public async dismiss(animated: boolean = true): Promise<void> {
    if (this.unmounted) {
      // An unmounted sheet is already gone — dismissing it is a successful no-op,
      // matching the native module's idempotent handling of missing tags.
      return;
    }

    const handle = this.handle;
    if (handle == null) {
      // No native view — nothing to dismiss.
      return;
    }

    return withTimeout(
      TrueSheetModule?.dismissByRef(handle, animated) ?? Promise.resolve(),
      6000,
      'dismiss'
    );
  }

  /**
   * Dismiss only the sheets presented on top of this sheet, keeping this sheet presented.
   * If no sheets are presented on top, this method does nothing.
   * @param animated - Whether to animate the dismissal (default: true)
   */
  public async dismissStack(animated: boolean = true): Promise<void> {
    const handle = this.handle;
    if (handle == null) {
      return;
    }

    return TrueSheetModule?.dismissStackByRef(handle, animated);
  }

  componentDidMount(): void {
    this.registerInstance();
  }

  componentDidUpdate(prevProps: TrueSheetProps): void {
    this.registerInstance();

    // Validate when detents prop changes
    if (prevProps.detents !== this.props.detents) {
      this.validateDetents();
    }
  }

  componentWillUnmount(): void {
    this.unregisterInstance();
    this.backHandlerSubscription?.remove();
    this.backHandlerSubscription = null;
    this.unmounted = true;
    // Unmounting while present() waits for the native view is a normal teardown race
    // (e.g. the sheet's screen closes mid-present). Settle the waits quietly — present()
    // re-checks `unmounted` after the await and returns without presenting.
    this.presentationResolvers.splice(0).forEach((resolve) => resolve());
    this.isPresenting = false;
  }

  render(): ReactNode {
    const {
      detents = [0.5, 1],
      backgroundColor,
      dismissible = true,
      draggable = true,
      grabber = true,
      grabberOptions,
      dimmed = true,
      initialDetentIndex = -1,
      initialDetentAnimated = true,
      suspended = false,
      dimmedDetentIndex,
      backgroundBlur,
      blurOptions,
      cornerRadius,
      maxContentHeight,
      maxContentWidth,
      anchor = 'center',
      anchorOffset,
      scrollable = false,
      scrollableOptions,
      footerOptions,
      presentation = 'page',
      children,
      style,
      header,
      headerStyle,
      footer,
      footerStyle,
      insetAdjustment = 'automatic',
      ...rest
    } = this.props;

    // Trim to max 3 detents and clamp fractions
    const resolvedDetents = detents.slice(0, 3).map((detent) => {
      if (detent === 'auto' || detent === -1) return -1;
      if (detent === 'peek' || detent === -2) return -2;

      // Default to 0.1 if zero or below
      if (detent <= 0) return 0.1;

      // Clamp to maximum of 1
      return Math.min(1, detent);
    });

    // Cache grabberOptions to avoid creating a new object every render
    if (grabberOptions !== this.cachedGrabberOptions) {
      this.cachedGrabberOptions = grabberOptions;
      this.resolvedGrabberOptions = {
        ...grabberOptions,
        color: processColor(grabberOptions?.color),
      };
    }

    return (
      <TrueSheetViewNativeComponent
        {...rest}
        ref={this.nativeRef}
        style={styles.sheetView}
        detents={resolvedDetents}
        backgroundBlur={backgroundBlur}
        blurOptions={blurOptions}
        backgroundColor={backgroundColor}
        cornerRadius={cornerRadius}
        grabber={grabber}
        grabberOptions={this.resolvedGrabberOptions}
        dimmed={dimmed}
        dimmedDetentIndex={dimmedDetentIndex}
        initialDetentIndex={initialDetentIndex}
        initialDetentAnimated={initialDetentAnimated}
        suspended={suspended}
        dismissible={dismissible}
        draggable={draggable}
        maxContentHeight={maxContentHeight}
        maxContentWidth={maxContentWidth}
        anchor={anchor}
        anchorOffset={anchorOffset}
        scrollable={scrollable}
        scrollableOptions={scrollableOptions}
        footerOptions={footerOptions}
        presentation={presentation}
        insetAdjustment={insetAdjustment}
        onMount={this.onMount}
        onWillPresent={this.onWillPresent}
        onDidPresent={this.onDidPresent}
        onWillDismiss={this.onWillDismiss}
        onDidDismiss={this.onDidDismiss}
        onDetentChange={this.onDetentChange}
        onDragBegin={this.onDragBegin}
        onDragChange={this.onDragChange}
        onDragEnd={this.onDragEnd}
        onPositionChange={this.onPositionChange}
        onWillFocus={this.onWillFocus}
        onDidFocus={this.onDidFocus}
        onWillBlur={this.onWillBlur}
        onDidBlur={this.onDidBlur}
        onVisibilityChange={this.onVisibilityChange}
      >
        {this.state.shouldRenderNativeView && (
          <TrueSheetContainerViewNativeComponent
            style={scrollable ? styles.scrollableContainer : undefined}
          >
            {header && (
              <TrueSheetHeaderViewNativeComponent style={[styles.header, headerStyle]}>
                {isValidElement(header) ? header : createElement(header)}
              </TrueSheetHeaderViewNativeComponent>
            )}
            <TrueSheetContentViewNativeComponent
              style={scrollable ? [style, styles.scrollableContent] : style}
            >
              {children}
            </TrueSheetContentViewNativeComponent>
            {footer && (
              <TrueSheetFooterViewNativeComponent style={[styles.footer, footerStyle]}>
                {isValidElement(footer) ? footer : createElement(footer)}
              </TrueSheetFooterViewNativeComponent>
            )}
          </TrueSheetContainerViewNativeComponent>
        )}
      </TrueSheetViewNativeComponent>
    );
  }
}

// Compile-time check: `TrueSheet`'s static surface must satisfy `TrueSheetStaticMethods`.
TrueSheet satisfies TrueSheetStaticMethods;

const styles = StyleSheet.create({
  sheetView: {
    ...StyleSheet.absoluteFill,
    zIndex: -9999,
    pointerEvents: 'box-none',
  },
  scrollableContainer: {
    ...StyleSheet.absoluteFill,
  },
  scrollableContent: {
    flex: 1,
  },
  header: {
    pointerEvents: 'box-none',
  },
  footer: {
    pointerEvents: 'box-none',
    position: 'absolute',
    left: 0,
    right: 0,
  },
});

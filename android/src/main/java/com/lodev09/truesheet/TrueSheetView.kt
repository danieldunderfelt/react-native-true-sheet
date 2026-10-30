package com.lodev09.truesheet

import android.annotation.SuppressLint
import android.graphics.Color
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityEvent
import androidx.annotation.UiThread
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.uimanager.PixelUtil.dpToPx
import com.facebook.react.uimanager.PixelUtil.pxToDp
import com.facebook.react.uimanager.StateWrapper
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.EventDispatcher
import com.facebook.react.util.RNLog
import com.facebook.react.views.view.ReactViewGroup
import com.lodev09.truesheet.core.AccessibilityOptions
import com.lodev09.truesheet.core.GrabberOptions
import com.lodev09.truesheet.core.RNScreensEventObserver
import com.lodev09.truesheet.core.RNScreensEventObserverDelegate
import com.lodev09.truesheet.core.TrueSheetDismissThreshold
import com.lodev09.truesheet.core.TrueSheetStackManager
import com.lodev09.truesheet.events.*
import com.lodev09.truesheet.utils.KeyboardUtils
import com.lodev09.truesheet.utils.findRootContainerView

/**
 * Main TrueSheet host view that manages the sheet and dispatches events to JavaScript.
 * This view is hidden (GONE) and delegates all rendering to TrueSheetViewController
 * using a CoordinatorLayout approach (no separate dialog window).
 */
@SuppressLint("ViewConstructor")
class TrueSheetView(private val reactContext: ThemedReactContext) :
  ReactViewGroup(reactContext),
  LifecycleEventListener,
  TrueSheetViewControllerDelegate,
  TrueSheetContainerViewDelegate,
  RNScreensEventObserverDelegate {

  /**
   * A present that can't run yet: waiting on the keyboard to hide (the coordinator is already
   * attached), or parked until this sheet's own dismissal tears down or its content mounts.
   */
  private class PendingPresent(val detentIndex: Int, val animated: Boolean, val callback: () -> Unit, val isParked: Boolean)

  // ==================== Properties ====================

  internal val viewController: TrueSheetViewController = TrueSheetViewController(reactContext)
  override var eventDispatcher: EventDispatcher? = null

  // Initial present configuration (set by ViewManager before mount)
  var initialDetentIndex: Int = -1
  var initialDetentAnimated: Boolean = true
  private var didInitiallyPresent: Boolean = false

  private var lastContainerWidth: Int = 0
  private var lastContainerHeight: Int = 0
  private var hasCommittedContainerSize: Boolean = false

  var stateWrapper: StateWrapper? = null
    set(value) {
      field = value
      if (value == null || hasCommittedContainerSize) return

      // A preallocated view gets its initial state before the node is committed, so the size
      // update is dropped. Resend until a committed state has it, or Yoga sizes the sheet to its parent.
      if ((value.stateData?.getDouble("containerHeight") ?: 0.0) > 0.0) {
        hasCommittedContainerSize = true
        return
      }

      lastContainerWidth = 0
      lastContainerHeight = 0
      updateState(viewController.screenWidth, viewController.screenHeight)
    }

  // Debounce flag to coalesce rapid layout changes into a single sheet update
  private var isSheetUpdatePending: Boolean = false

  // didFocus waiting for the slide-back after a child dismissed
  private var isDidFocusPending: Boolean = false

  // Root container for the coordinator layout (activity or Modal dialog content view)
  internal var rootContainerView: ViewGroup? = null

  // Screen event observer for react-native-screens integration
  internal var screensEventObserver: RNScreensEventObserver? = null

  // A dismiss before the deferred present runs cancels it
  private var pendingPresent: PendingPresent? = null
  private var pendingPresentGeneration = 0

  // Sheet the deferred present will stack on — dismissing it drops the present, like iOS
  internal var pendingPresentParent: TrueSheetView? = null
    private set

  // Suspended while either the `suspended` prop or TrueSheet.suspendAll() holds it
  private var isSuspendedByProp = false
  internal var isSuspendedByModule = false
    private set
  private val isSuspensionRequested: Boolean
    get() = isSuspendedByProp || isSuspendedByModule

  // Last suspension state reconciled; deferred while a present is in flight
  private var isSuspensionApplied = false
  private var isSuspensionDeferred = false

  // Asked to present while suspended without being shown — presents once resumed
  internal var isLogicallyOpenWhileSuspended = false
    private set

  // Detent a suspended sheet comes back at
  private var resumeDetentIndex = -1

  // ==================== Initialization ====================

  init {
    reactContext.addLifecycleEventListener(this)
    viewController.delegate = this

    // Hide the host view - actual content is rendered in the dialog window
    visibility = GONE
  }

  // ==================== ReactViewGroup Overrides ====================

  override fun onLayout(
    changed: Boolean,
    left: Int,
    top: Int,
    right: Int,
    bottom: Int
  ) {
    // No-op: layout is managed by React Native's UIManager
  }

  override fun setId(id: Int) {
    super.setId(id)
    viewController.id = id
    TrueSheetModule.registerView(this, id)
  }

  // ==================== View Hierarchy Management ====================

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    presentInitialIfNeeded()
  }

  /**
   * JS holds initialDetentIndex back one commit so effect-driven content (e.g. a
   * navigation footer set via setOptions) commits together with it. The prop then
   * arrives after attach, so the ViewManager triggers this on prop update too.
   * Posted so sibling mounts from the current transaction land before measuring.
   */
  fun presentInitialIfNeeded() {
    if (initialDetentIndex < 0 || didInitiallyPresent || !isAttachedToWindow) return

    didInitiallyPresent = true
    post {
      // The view may have been dropped (flag reset) or detached before this
      // ran — roll back so a later attach retries instead of presenting a
      // sheet with no live host.
      if (!didInitiallyPresent) return@post
      if (!isAttachedToWindow) {
        didInitiallyPresent = false
        return@post
      }
      if (!viewController.isPresented) {
        present(initialDetentIndex, initialDetentAnimated) { }
      }
    }
  }

  override fun addView(child: View?, index: Int) {
    if (child is TrueSheetContainerView) {
      viewController.removeSheetSnapshot()
    }

    viewController.addView(child, index)

    if (child is TrueSheetContainerView) {
      child.delegate = this
      val surfaceId = UIManagerHelper.getSurfaceId(this)
      eventDispatcher?.dispatchEvent(MountEvent(surfaceId, id))

      // Posted so the content mounting in this transaction lands first
      if (pendingPresent?.isParked == true) post { replayParkedPresent() }
    }
  }

  override fun getChildCount(): Int = viewController.childCount

  override fun getChildAt(index: Int): View? = viewController.getChildAt(index)

  override fun removeViewAt(index: Int) {
    val child = getChildAt(index)
    if (child is TrueSheetContainerView) {
      child.delegate = null

      // Skip if already dismissing - snapshot preserves visuals during dismiss
      if (!viewController.isBeingDismissed) {
        viewController.createSheetSnapshot()
        if (viewController.isPresented) {
          dismiss(true) {}
        }
      }
    }
    viewController.removeView(child)
  }

  // Accessibility: delegate to dialog's host view since this view is hidden
  override fun addChildrenForAccessibility(outChildren: ArrayList<View>) {}
  override fun dispatchPopulateAccessibilityEvent(event: AccessibilityEvent): Boolean = false

  // ==================== Lifecycle ====================

  override fun onHostResume() {
    viewController.reapplyHiddenState()
    finalizeUpdates()
  }

  override fun onHostPause() {}

  override fun onHostDestroy() {
    onDropInstance()
  }

  fun onDropInstance() {
    reactContext.removeLifecycleEventListener(this)

    TrueSheetModule.unregisterView(id)
    TrueSheetStackManager.removeSheet(this)

    cleanupScreenEventObserver()
    didInitiallyPresent = false
    cancelPendingPresent()
    isSuspendedByModule = false
    isSuspensionDeferred = false
    isLogicallyOpenWhileSuspended = false
    resumeDetentIndex = -1

    viewController.dismissPromise = { viewController.delegate = null }

    if (viewController.isPresented && !viewController.isBeingDismissed) {
      viewController.dismiss(animated = false)
    }
  }

  /**
   * Called by the ViewManager after all properties are set.
   * Reconfigures the sheet if it's currently presented.
   */
  fun finalizeUpdates() {
    setupScrollable()

    if (viewController.isPresented) {
      viewController.setupBackground()
      viewController.sheetView?.setupBackground()
      viewController.sheetView?.setupGrabber()
      viewController.sheetView?.updateGravity()
      viewController.updateBehaviorMaxWidth()
      updateSheetIfNeeded()
    }

    reconcileSuspension()
  }

  // ==================== Property Setters ====================

  // Applied in finalizeUpdates so the rest of the transaction's props land first
  fun setSuspended(suspended: Boolean) {
    isSuspendedByProp = suspended
  }

  fun setMaxContentHeight(height: Int?) {
    if (viewController.maxContentHeight == height) return
    viewController.maxContentHeight = height
  }

  fun setMaxContentWidth(width: Int?) {
    if (viewController.maxContentWidth == width) return
    viewController.maxContentWidth = width
  }

  fun setPlacement(placement: String?) {
    val value = TrueSheetPlacement.fromString(placement)
    if (viewController.placement == value) return
    viewController.placement = value
  }

  fun setPlacementOffset(offset: Int) {
    if (viewController.placementOffset == offset) return
    viewController.placementOffset = offset
  }

  fun setDimmed(dimmed: Boolean) {
    if (viewController.dimmed == dimmed) return
    viewController.dimmed = dimmed
    if (viewController.isPresented) {
      viewController.setupDimmedBackground()
      viewController.updateDimAmount()
      TrueSheetStackManager.updateBackgroundAccessibility()
    }
  }

  fun setDimColor(color: Int?) {
    val resolved = color ?: Color.BLACK
    if (viewController.dimColor == resolved) return
    viewController.dimColor = resolved
    if (viewController.isPresented) {
      viewController.updateDimAmount()
    }
  }

  fun setDimOpacity(opacity: Float) {
    val resolved = if (opacity < 0f) TrueSheetViewController.DEFAULT_DIM_OPACITY else opacity.coerceIn(0f, 1f)
    if (viewController.dimOpacity == resolved) return
    viewController.dimOpacity = resolved
    if (viewController.isPresented) {
      viewController.updateDimAmount()
    }
  }

  fun setDimmedDetentIndex(index: Int) {
    if (viewController.dimmedDetentIndex == index) return
    viewController.dimmedDetentIndex = index
    if (viewController.isPresented) {
      viewController.setupDimmedBackground()
      viewController.updateDimAmount()
      TrueSheetStackManager.updateBackgroundAccessibility()
    }
  }

  fun setCornerRadius(radius: Float) {
    if (viewController.sheetCornerRadius == radius) return
    viewController.sheetCornerRadius = radius
  }

  fun setDetentBackgrounds(colors: List<Int?>) {
    viewController.detentBackgrounds = colors
  }

  fun setSheetBackgroundColor(color: Int?) {
    viewController.backgroundColor = color
  }

  fun setDismissible(dismissible: Boolean) {
    viewController.dismissible = dismissible
  }

  fun setDraggable(draggable: Boolean) {
    viewController.draggable = draggable
  }

  fun setDismissThreshold(dismissThreshold: String?) {
    viewController.dismissThreshold = TrueSheetDismissThreshold.fromString(dismissThreshold)
  }

  fun setGrabber(grabber: Boolean) {
    viewController.grabber = grabber
  }

  fun setGrabberOptions(options: GrabberOptions?) {
    viewController.grabberOptions = options
  }

  fun setAccessibilityOptions(options: AccessibilityOptions?) {
    viewController.accessibilityOptions = options
  }

  fun setSheetElevation(elevation: Float) {
    viewController.sheetElevation = elevation
  }

  fun setDetents(newDetents: MutableList<Double>) {
    viewController.detents = newDetents
    setupScrollable()
  }

  fun setInsetAdjustment(insetAdjustment: String) {
    viewController.insetAdjustment = TrueSheetInsetAdjustment.fromString(insetAdjustment)
    setupScrollable()
  }

  fun setScrollableOptions(options: ScrollableOptions?) {
    viewController.scrollableOptions = options
    setupScrollable()
  }

  fun setScrollableHandle(handle: Int) {
    if (viewController.scrollableHandle == handle) return
    viewController.scrollableHandle = handle
    setupScrollable()
  }

  fun setAbsoluteHeader(absolute: Boolean) {
    viewController.absoluteHeader = absolute
  }

  fun setAbsoluteFooter(absolute: Boolean) {
    viewController.absoluteFooter = absolute
  }

  fun setFooterKeyboardOffset(offset: Float) {
    viewController.footerKeyboardOffset = offset.dpToPx().toInt()
    viewController.positionFooter()
  }

  fun setFooterAvoidsKeyboard(avoids: Boolean) {
    viewController.footerAvoidsKeyboard = avoids
    viewController.containerView?.footerAvoidsKeyboard = avoids
    viewController.positionFooter()
  }

  private fun setupScrollable() {
    viewController.containerView?.let {
      it.scrollableOptions = viewController.scrollableOptions
      it.scrollableHandle = viewController.scrollableHandle
      it.scrollableBottomInset = viewController.contentBottomInset
      it.footerBottomInset = viewController.contentBottomInset
      it.absoluteFooter = viewController.absoluteFooter
      it.footerAvoidsKeyboard = viewController.footerAvoidsKeyboard
      it.setupScrollable()
    }

    // Publish the inset so a footer set later (e.g. navigation setOptions) is
    // padded on its very first layout instead of resizing the sheet twice.
    if (viewController.insetAdjustment == TrueSheetInsetAdjustment.AUTOMATIC) {
      TrueSheetStateUpdater.setBottomSafeArea(viewController.contentBottomInset.toFloat().pxToDp())
    }
  }

  // ==================== Screen Event Observer ====================

  private fun setupScreenEventObserver() {
    screensEventObserver = RNScreensEventObserver().apply {
      delegate = this@TrueSheetView

      // For stacked sheets on the same screen, inherit parent's presenter screen tag.
      // If parent was hidden by screen navigation, this sheet is on a different screen.
      val parentObserver = viewController.parentSheetView?.screensEventObserver
      val parentScreenTag = parentObserver?.presenterScreenTag ?: 0
      val parentHiddenByScreen = viewController.parentSheetView?.viewController?.wasHiddenByScreen == true
      if (parentScreenTag != 0 && !parentHiddenByScreen) {
        presenterScreenTag = parentScreenTag
        ancestorScreenTags = parentObserver?.ancestorScreenTags ?: emptySet()
      } else {
        capturePresenterScreenFromView(this@TrueSheetView)
      }
      startObserving(eventDispatcher)
    }
  }

  private fun cleanupScreenEventObserver() {
    screensEventObserver?.stopObserving()
    screensEventObserver = null
  }

  // ==================== State Management ====================

  /**
   * Updates the Fabric state with container dimensions for Yoga layout.
   * Converts pixel values to density-independent pixels (dp).
   */
  fun updateState(width: Int, height: Int) {
    if (width == lastContainerWidth && height == lastContainerHeight) return

    lastContainerWidth = width
    lastContainerHeight = height

    stateWrapper?.let { TrueSheetStateUpdater.updateContainerSize(it, width, height) }
  }

  // ==================== Sheet Actions ====================

  @UiThread
  fun present(detentIndex: Int, animated: Boolean = true, promiseCallback: () -> Unit) {
    // isPresented holds through the dismiss animation — park instead of resolving without a
    // present, and replay once the sheet is torn down
    if (viewController.isBeingDismissed) {
      parkPresent(detentIndex, animated, promiseCallback)
      return
    }

    // Shown on resume instead; an already presented sheet comes back at this detent
    if (isSuspensionRequested) {
      if (!viewController.isPresented) isLogicallyOpenWhileSuspended = true
      resumeDetentIndex = detentIndex
      promiseCallback()
      return
    }

    if (viewController.isPresented || pendingPresent?.isParked == false) {
      RNLog.w(reactContext, "TrueSheet: sheet is already presented. Use resize() to change detent.")
      promiseCallback()
      return
    }

    // Never present without content — wait for the container to mount
    if (viewController.containerView == null) {
      parkPresent(detentIndex, animated, promiseCallback)
      return
    }

    // Supersedes a parked present that hasn't replayed yet
    cancelPendingPresent()

    val rootContainer = findRootContainerView()
    if (rootContainer == null || !rootContainer.isAttachedToWindow) {
      RNLog.w(reactContext, "TrueSheet: Cannot present because the root container is missing or detached.")
      promiseCallback()
      return
    }

    viewController.createSheet()
    setupScrollable()

    // Attach before any keyboard wait so the touches meanwhile don't reach the views below
    rootContainerView = rootContainer
    viewController.coordinatorLayout?.let {
      it.blocksTouches = true
      rootContainer.addView(it)
      // Touches skip a view without a frame — don't wait for the next layout pass
      it.layout(0, 0, rootContainer.width, rootContainer.height)
    }

    // Dismiss keyboard if focused view is within a sheet or if target detent will be dimmed
    val parentSheet = TrueSheetStackManager.getTopmostSheet()
    val isFocusedViewWithinSheet = parentSheet?.viewController?.isFocusedViewWithinSheet() == true
    val shouldDismissKeyboard = isFocusedViewWithinSheet || viewController.isDimmedAtDetentIndex(detentIndex)
    if (shouldDismissKeyboard && KeyboardUtils.isKeyboardVisible(reactContext)) {
      viewController.saveFocusedView()
      pendingPresent = PendingPresent(detentIndex, animated, promiseCallback, isParked = false)
      pendingPresentParent = parentSheet
      // A cancelled request's callback can still land (a timer below API 30) — only the latest may present
      val generation = ++pendingPresentGeneration
      KeyboardUtils.dismiss(this) {
        post {
          if (generation != pendingPresentGeneration) return@post
          val pending = pendingPresent ?: return@post
          pendingPresent = null
          pendingPresentParent = null
          presentSheet(detentIndex, animated, pending.callback)
        }
      }
      // Blur like iOS so JS focus state stays in sync until restoreFocusedView() refocuses it
      rootView.findFocus()?.clearFocus()
      return
    }

    presentSheet(detentIndex, animated, promiseCallback)
  }

  private fun presentSheet(detentIndex: Int, animated: Boolean, promiseCallback: () -> Unit) {
    if (viewController.isPresented) {
      promiseCallback()
      return
    }

    // Register with observer to track sheet stack hierarchy
    viewController.parentSheetView = TrueSheetStackManager.registerSheet(this)

    viewController.presentPromise = promiseCallback
    viewController.present(detentIndex, animated)
  }

  private fun detachCoordinator() {
    viewController.coordinatorLayout?.let { rootContainerView?.removeView(it) }
    rootContainerView = null
  }

  @UiThread
  fun handleBackPress() {
    viewController.handleBackPress()
  }

  /**
   * Drops a present still waiting on the keyboard, a dismissal, or the content, and resolves its
   * caller. Returns whether one was pending.
   * Skip [restoreFocus] when the focused view is going away with its dismissing sheet.
   */
  fun cancelPendingPresent(restoreFocus: Boolean = true): Boolean {
    val pending = pendingPresent ?: return false
    pendingPresent = null
    pendingPresentParent = null
    // A parked present hasn't attached anything — the coordinator may be the dismissing sheet's
    if (!pending.isParked) {
      detachCoordinator()
      if (restoreFocus) {
        viewController.restoreFocusedView()
      } else {
        viewController.clearFocusedView()
      }
    }
    pending.callback()
    return true
  }

  // The latest present wins; a superseded one resolves
  private fun parkPresent(detentIndex: Int, animated: Boolean, promiseCallback: () -> Unit) {
    cancelPendingPresent()
    pendingPresentGeneration++
    pendingPresent = PendingPresent(detentIndex, animated, promiseCallback, isParked = true)
  }

  private fun replayParkedPresent() {
    val pending = pendingPresent?.takeIf { it.isParked } ?: return
    pendingPresent = null
    present(pending.detentIndex, pending.animated, pending.callback)
  }

  @UiThread
  fun dismiss(animated: Boolean = true, promiseCallback: () -> Unit) {
    // Dismissing before a deferred present starts cancels it — nothing was presented
    val didCancelPresent = cancelPendingPresent()

    // A real close: a suspended sheet won't come back on resume
    if (isLogicallyOpenWhileSuspended) {
      isLogicallyOpenWhileSuspended = false
      resumeDetentIndex = -1

      // Never shown natively — report the close JS is waiting on
      if (!viewController.isPresented) {
        val surfaceId = UIManagerHelper.getSurfaceId(this)
        eventDispatcher?.dispatchEvent(WillDismissEvent(surfaceId, id))
        eventDispatcher?.dispatchEvent(DidDismissEvent(surfaceId, id))
        promiseCallback()
        return
      }
    }

    if (didCancelPresent) {
      promiseCallback()
      return
    }

    if (viewController.isBeingDismissed || !viewController.isPresented) {
      RNLog.w(reactContext, "TrueSheet: sheet is already dismissed. No need to dismiss it again.")
      promiseCallback()
      return
    }

    // Dismiss all sheets above first
    dismissStack(animated) {}

    // Then dismiss itself
    viewController.dismissPromise = promiseCallback
    viewController.dismiss(animated)
  }

  @UiThread
  fun dismissStack(animated: Boolean = true, promiseCallback: () -> Unit) {
    if (viewController.isBeingDismissed || !viewController.isPresented) {
      RNLog.w(reactContext, "TrueSheet: sheet is already dismissed. No need to dismiss it again.")
      promiseCallback()
      return
    }

    // A present waiting on the keyboard would stack above this sheet — drop it with the rest
    TrueSheetModule.cancelPendingPresents(parent = this)

    val sheetsAbove = TrueSheetStackManager.getSheetsAbove(this)
    // Create snapshot only for topmost sheet (first in reversed list)
    sheetsAbove.firstOrNull()?.viewController?.createSheetSnapshot()

    for (sheet in sheetsAbove) {
      sheet.viewController.dismiss(animated)
    }

    promiseCallback()
  }

  @UiThread
  fun resize(detentIndex: Int, promiseCallback: () -> Unit) {
    // A suspended sheet comes back at this detent instead
    if (viewController.isSuspended || isLogicallyOpenWhileSuspended) {
      resumeDetentIndex = detentIndex
      promiseCallback()
      return
    }

    if (!viewController.isPresented) {
      RNLog.w(reactContext, "TrueSheet: Cannot resize. Sheet is not presented.")
      promiseCallback()
      return
    }

    viewController.resizePromise = promiseCallback
    viewController.resize(detentIndex)
  }

  /**
   * Debounced sheet update to handle rapid content/header size changes.
   * Uses post() to ensure all layout passes complete before reconfiguring.
   */
  fun updateSheetIfNeeded() {
    if (!viewController.isPresented || isSheetUpdatePending) return

    isSheetUpdatePending = true
    viewController.post {
      isSheetUpdatePending = false
      if (viewController.containerView == null) return@post

      viewController.setupSheetDetentsForSizeChange()
      // While settling, onSlide drives the parent translation in realtime —
      // an animated update here would race it frame-by-frame, staggering the
      // emitted position. Keyboard-driven resizes leave the parent alone (like
      // iOS); keyboardDidHide resizes again once the detents are keyboard-free.
      if (!viewController.isSettling && !viewController.isKeyboardActive) {
        TrueSheetStackManager.updateParentTranslation(this)
      }
    }
  }

  // ==================== Suspension ====================

  /**
   * Applies the combined suspension state. Only the switch between held by any source
   * (prop or suspendAll) and held by none touches the sheet.
   */
  @UiThread
  internal fun reconcileSuspension() {
    val suspended = isSuspensionRequested
    if (suspended == isSuspensionApplied) return
    isSuspensionApplied = suspended

    // Applied once the present lands (viewControllerDidPresent)
    if (viewController.isPresentInFlight) {
      isSuspensionDeferred = true
      return
    }

    if (suspended) applySuspend() else applyResume()
  }

  private fun applyDeferredSuspension() {
    if (!isSuspensionDeferred) return
    isSuspensionDeferred = false
    if (isSuspensionApplied) applySuspend() else applyResume()
  }

  /**
   * Hides the sheet without a close: no dismiss events, it stays presented, and it comes back at
   * its detent. A present that can't run yet is kept for the resume instead.
   */
  private fun applySuspend() {
    // One parked behind this sheet's own dismissal replays into present(), which sees the suspension
    if (!viewController.isBeingDismissed) {
      pendingPresent?.let {
        resumeDetentIndex = it.detentIndex
        cancelPendingPresent(restoreFocus = false)
        isLogicallyOpenWhileSuspended = true
      }
    }

    if (!viewController.isPresented || viewController.isBeingDismissed || viewController.isSuspended) return

    // Sheets stacked above leave with it, like iOS — except ones suspending themselves
    for (sheet in TrueSheetStackManager.getSheetsAbove(this)) {
      if (!sheet.isSuspensionRequested) sheet.viewController.dismiss(animated = false)
    }

    val wasVisible = viewController.isSheetVisible
    viewController.suspend()
    resumeDetentIndex = viewController.currentDetentIndex

    val parent = viewController.parentSheetView ?: return
    // The sheets below stop blending this sheet's dim
    parent.viewController.takeIf { it.isPresented }?.updateDimAmount()
    if (wasVisible) parent.focusAfterResetTranslation()
  }

  private fun applyResume() {
    if (!viewController.isSuspended) {
      presentIfLogicallyOpen()
      return
    }

    // Being closed for real
    if (viewController.isBeingDismissed) return

    viewController.resumeFromSuspend(resumeDetentIndex)
    resumeDetentIndex = -1
    if (viewController.isSheetVisible) {
      TrueSheetStackManager.updateParentTranslation(this)
    }
  }

  // Presents a sheet asked to present while suspended, once nothing holds it back
  private fun presentIfLogicallyOpen() {
    if (!isLogicallyOpenWhileSuspended || isSuspensionRequested || viewController.isPresented) return

    isLogicallyOpenWhileSuspended = false
    val index = resumeDetentIndex.coerceAtLeast(0)
    resumeDetentIndex = -1
    present(index) { }
  }

  /**
   * Captures this sheet for TrueSheet.suspendAll() if it's open in some form, so sheets presented
   * afterwards are unaffected. Returns whether it's captured.
   */
  @UiThread
  internal fun captureForSuspendAll(): Boolean {
    if (isSuspendedByModule) return true

    // A sheet already closing isn't open — unless a present is parked behind the dismissal
    val isOpen = isLogicallyOpenWhileSuspended ||
      pendingPresent != null ||
      (viewController.isPresented && !viewController.isBeingDismissed)
    if (!isOpen) return false

    isSuspendedByModule = true
    return true
  }

  @UiThread
  internal fun releaseFromSuspendAll() {
    if (!isSuspendedByModule) return
    isSuspendedByModule = false
    reconcileSuspension()
  }

  // ==================== Sheet Stack Translation ====================

  /**
   * Updates this sheet's translation and disables dragging when a child sheet is presented.
   * Parent sheets slide down to create a stacked appearance.
   * Propagates additional translation to parent so the entire stack stays visually consistent.
   */
  fun updateTranslationForChild(childSheetTop: Int) {
    // Translating a dismissing sheet would cancel its slide-out
    if (!viewController.isSheetVisible || viewController.isExpanded || viewController.isBeingDismissed) return

    viewController.sheetView?.behavior?.isDraggable = false

    val mySheetTop = viewController.detentCalculator.getSheetTopForDetentIndex(viewController.currentDetentIndex)
    val newTranslation = maxOf(0, childSheetTop - mySheetTop)
    val additionalTranslation = newTranslation - viewController.currentTranslationY

    viewController.translateSheet(newTranslation)

    // Propagate any additional translation up the stack
    if (additionalTranslation > 0) {
      viewController.parentSheetView?.addTranslation(additionalTranslation)
    }
  }

  /**
   * Realtime counterpart of updateTranslationForChild, driven by the child's
   * onSlide frames so stacked sheets move in lockstep instead of on
   * independently-timed animations.
   */
  fun syncTranslationForChild(childSheetTop: Int, childMinSheetTop: Int) {
    if (!viewController.isSheetVisible || viewController.isExpanded || viewController.isBeingDismissed) return

    val mySheetTop = viewController.detentCalculator.getSheetTopForDetentIndex(viewController.currentDetentIndex)
    val targetTranslation = maxOf(0, childMinSheetTop - mySheetTop)
    val actualTranslation = maxOf(0, childSheetTop - mySheetTop)
    val currentTranslation = viewController.currentTranslationY

    // Ride the child's actual position, but only between the current
    // translation and the settled target — tracks the child frame-by-frame
    // when the alignment changes (auto detent resize) while staying put when
    // the child moves between detents above its minimum. Returning early on
    // no-ops avoids cancelling an in-flight realign animation.
    val newTranslation = actualTranslation.coerceIn(
      minOf(currentTranslation, targetTranslation),
      maxOf(currentTranslation, targetTranslation)
    )
    if (newTranslation == currentTranslation) return

    viewController.translateSheet(newTranslation, animated = false)

    val additionalTranslation = newTranslation - currentTranslation
    if (additionalTranslation > 0) {
      viewController.parentSheetView?.addTranslation(additionalTranslation, animated = false)
    }
  }

  /**
   * Recursively adds translation to this sheet and all parent sheets.
   */
  private fun addTranslation(amount: Int, animated: Boolean = true) {
    if (viewController.isExpanded || viewController.isBeingDismissed) return

    viewController.translateSheet(viewController.currentTranslationY + amount, animated)
    viewController.parentSheetView?.addTranslation(amount, animated)
  }

  /**
   * Resets this sheet's translation and restores dragging when it becomes topmost.
   * Parent recalculates its translation based on this sheet's position.
   */
  fun resetTranslation(onTranslateEnd: (() -> Unit)? = null) {
    viewController.sheetView?.behavior?.isDraggable = viewController.draggable
    viewController.translateSheet(0, onEnd = onTranslateEnd)

    // Parent should recalculate its translation based on this sheet's position
    val mySheetTop = viewController.detentCalculator.getSheetTopForDetentIndex(viewController.currentDetentIndex)
    viewController.parentSheetView?.updateTranslationForChild(mySheetTop)
  }

  /**
   * Resets translation after a child dismissed and emits didFocus once the sheet settles.
   * A sheet presented on top before then cancels the slide-back, so the next blur flushes it.
   */
  private fun focusAfterResetTranslation() {
    isDidFocusPending = true
    resetTranslation { emitPendingDidFocus() }
  }

  private fun emitPendingDidFocus() {
    if (!isDidFocusPending) return
    isDidFocusPending = false

    if (viewController.isSheetVisible && !viewController.isBeingDismissed) {
      viewControllerDidFocus()
    }
  }

  // ==================== TrueSheetViewControllerDelegate ====================

  override fun viewControllerWillPresent(index: Int, position: Float, detent: Float) {
    // Observe from the start so navigating away mid-present still hides the sheet
    setupScreenEventObserver()

    // Update parent sheet translation now that content is measured
    TrueSheetStackManager.updateParentTranslation(this)

    val surfaceId = UIManagerHelper.getSurfaceId(this)
    eventDispatcher?.dispatchEvent(WillPresentEvent(surfaceId, id, index, position, detent))
  }

  override fun viewControllerDidPresent(index: Int, position: Float, detent: Float) {
    val surfaceId = UIManagerHelper.getSurfaceId(this)
    eventDispatcher?.dispatchEvent(DidPresentEvent(surfaceId, id, index, position, detent))

    // Posted so the present settles (focus events, promise) before it steps aside
    if (isSuspensionDeferred) post { applyDeferredSuspension() }
  }

  override fun viewControllerWillDismiss() {
    // Covers every dismiss path (swipe, back press, stack); the focused view leaves with this sheet
    TrueSheetModule.cancelPendingPresents(parent = this, restoreFocus = false)

    val surfaceId = UIManagerHelper.getSurfaceId(this)
    eventDispatcher?.dispatchEvent(WillDismissEvent(surfaceId, id))
  }

  override fun viewControllerDidAttemptDismiss() {
    val surfaceId = UIManagerHelper.getSurfaceId(this)
    eventDispatcher?.dispatchEvent(DismissAttemptEvent(surfaceId, id))
  }

  override fun viewControllerDidDismiss(parent: TrueSheetView?) {
    // A slide-back cut short by this sheet's own dismissal never emits; don't carry it over
    isDidFocusPending = false
    isSuspensionDeferred = false

    detachCoordinator()
    cleanupScreenEventObserver()

    val surfaceId = UIManagerHelper.getSurfaceId(this)
    eventDispatcher?.dispatchEvent(DidDismissEvent(surfaceId, id))

    TrueSheetStackManager.unregisterSheet(this)

    // The sheets below stop blending this sheet's dim
    parent?.viewController?.takeIf { it.isPresented }?.updateDimAmount()

    // A suspended sheet already handed focus back when it stepped aside
    if (!viewController.isSuspended) parent?.focusAfterResetTranslation()

    if (!isLogicallyOpenWhileSuspended) resumeDetentIndex = -1

    // Posted so the teardown (cleanupSheet) finishes first: replay a present parked behind this
    // dismissal, or present a sheet left logically open whose suspension was lifted meanwhile
    if (pendingPresent?.isParked == true || isLogicallyOpenWhileSuspended) {
      post {
        replayParkedPresent()
        presentIfLogicallyOpen()
      }
    }
  }

  override fun viewControllerDidChangeDetent(index: Int, position: Float, detent: Float) {
    // Settles while suspended aren't reported
    if (viewController.isSuspended) return

    val surfaceId = UIManagerHelper.getSurfaceId(this)
    eventDispatcher?.dispatchEvent(DetentChangeEvent(surfaceId, id, index, position, detent))
  }

  override fun viewControllerDidDragBegin(index: Int, position: Float, detent: Float) {
    val surfaceId = UIManagerHelper.getSurfaceId(this)
    eventDispatcher?.dispatchEvent(DragBeginEvent(surfaceId, id, index, position, detent))
  }

  override fun viewControllerDidDragChange(index: Int, position: Float, detent: Float) {
    val surfaceId = UIManagerHelper.getSurfaceId(this)
    eventDispatcher?.dispatchEvent(DragChangeEvent(surfaceId, id, index, position, detent))
  }

  override fun viewControllerDidDragEnd(index: Int, position: Float, detent: Float) {
    val surfaceId = UIManagerHelper.getSurfaceId(this)
    eventDispatcher?.dispatchEvent(DragEndEvent(surfaceId, id, index, position, detent))
  }

  override fun viewControllerDidChangePosition(index: Float, position: Float, detent: Float, realtime: Boolean) {
    if (viewController.isSuspended) return

    val surfaceId = UIManagerHelper.getSurfaceId(this)
    eventDispatcher?.dispatchEvent(PositionChangeEvent(surfaceId, id, index, position, detent, realtime))
  }

  override fun viewControllerDidChangeSize(width: Int, height: Int) {
    updateState(width, height)
  }

  override fun viewControllerWillFocus() {
    val surfaceId = UIManagerHelper.getSurfaceId(this)
    eventDispatcher?.dispatchEvent(WillFocusEvent(surfaceId, id))
  }

  override fun viewControllerDidFocus() {
    val surfaceId = UIManagerHelper.getSurfaceId(this)
    eventDispatcher?.dispatchEvent(FocusEvent(surfaceId, id))
  }

  override fun viewControllerWillBlur() {
    emitPendingDidFocus()

    val surfaceId = UIManagerHelper.getSurfaceId(this)
    eventDispatcher?.dispatchEvent(WillBlurEvent(surfaceId, id))
  }

  override fun viewControllerDidBlur() {
    val surfaceId = UIManagerHelper.getSurfaceId(this)
    eventDispatcher?.dispatchEvent(BlurEvent(surfaceId, id))
  }

  override fun viewControllerDidChangeVisibility(visible: Boolean) {
    val surfaceId = UIManagerHelper.getSurfaceId(this)
    eventDispatcher?.dispatchEvent(VisibilityChangeEvent(surfaceId, id, visible))
  }

  // ==================== TrueSheetContainerViewDelegate ====================

  override fun containerViewContentDidChangeSize(width: Int, height: Int) {
    updateSheetIfNeeded()
  }

  override fun containerViewContentDidScroll() {
    viewController.commitKeyboardDetent()
  }

  // When the ScrollView changes (e.g. conditional remount), re-detect the new ScrollView
  // and request layout so BottomSheetBehavior re-discovers the nested scrolling child.
  override fun containerViewScrollViewDidChange() {
    setupScrollable()
    viewController.sheetView?.requestLayout()
  }

  override fun containerViewHeaderDidChangeSize(width: Int, height: Int) {
    updateSheetIfNeeded()
  }

  override fun containerViewFooterDidChangeSize(width: Int, height: Int) {
    // Footer height affects peek detents
    updateSheetIfNeeded()
    viewController.positionFooter()
  }

  override fun containerViewFooterDidLayout() {
    viewController.positionFooter()
  }

  override fun containerViewPeekDidChangeSize(width: Int, height: Int) {
    // Peek content height affects peek detents
    updateSheetIfNeeded()
  }

  // ==================== RNScreensEventObserverDelegate ====================

  override fun presenterScreenWillDisappear() {
    // A suspended sheet is marked too, so resuming it doesn't reveal it over the covering screen
    if (viewController.isPresented && !viewController.wasHiddenByScreen) {
      if (viewController.isSheetVisible) KeyboardUtils.dismiss(this) {}
      viewController.post { viewController.hideForScreen() }
    }
  }

  override fun presenterScreenWillAppear() {
    if (viewController.isPresented && viewController.wasHiddenByScreen) {
      viewController.showAfterScreen()
    }
  }

  // ==================== Private Helpers ====================

  /**
   * Find the root container view for presenting the sheet.
   * This traverses up the view hierarchy to find the content view (android.R.id.content)
   * of whichever window this view is in - whether that's the activity's window or a
   * Modal's dialog window.
   */
  override fun findRootContainerView(): ViewGroup? = findRootContainerView(reactContext)
}

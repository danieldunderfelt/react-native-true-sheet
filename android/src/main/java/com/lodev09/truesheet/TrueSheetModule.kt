package com.lodev09.truesheet

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.turbomodule.core.interfaces.TurboModule
import com.facebook.react.uimanager.IllegalViewOperationException
import com.facebook.react.uimanager.UIManagerHelper
import com.lodev09.truesheet.core.TrueSheetStackManager
import java.util.concurrent.ConcurrentHashMap

/**
 * TurboModule for TrueSheet imperative API
 * Provides promise-based async operations using view references
 */
@ReactModule(name = TrueSheetModule.NAME)
class TrueSheetModule(reactContext: ReactApplicationContext) :
  com.facebook.react.bridge.ReactContextBaseJavaModule(reactContext),
  TurboModule {

  override fun getName(): String = NAME

  override fun invalidate() {
    super.invalidate()
    // Clear all registered views and observer on module invalidation
    synchronized(viewRegistry) {
      viewRegistry.clear()
    }
    TrueSheetStackManager.clear()
  }

  /**
   * Present a sheet by reference
   *
   * @param viewTag Native view tag of the sheet component
   * @param index Detent index to present at
   * @param promise Promise that resolves when sheet is fully presented
   * @throws VIEW_NOT_FOUND if the view with the given tag is not found
   * @throws INVALID_VIEW_TYPE if the view is not a TrueSheetView
   * @throws OPERATION_FAILED if the operation fails for any other reason
   */
  @ReactMethod
  fun presentByRef(viewTag: Double, index: Double, animated: Boolean, promise: Promise) {
    val tag = viewTag.toInt()
    val detentIndex = index.toInt()

    withTrueSheetView(tag, promise) { view ->
      view.present(detentIndex, animated) {
        promise.resolve(null)
      }
    }
  }

  /**
   * Dismiss a sheet and all sheets presented on top of it.
   * Resolves when the view is already gone — there's nothing left to dismiss.
   *
   * @param viewTag Native view tag of the sheet component
   * @param promise Promise that resolves when sheet is fully dismissed
   * @throws INVALID_VIEW_TYPE if the view is not a TrueSheetView
   * @throws OPERATION_FAILED if the operation fails for any other reason
   */
  @ReactMethod
  fun dismissByRef(viewTag: Double, animated: Boolean, promise: Promise) {
    val tag = viewTag.toInt()

    withTrueSheetView(tag, promise, resolveIfMissing = true) { view ->
      view.dismiss(animated) {
        promise.resolve(null)
      }
    }
  }

  /**
   * Dismiss only the sheets presented on top of this sheet, keeping this sheet presented.
   * Resolves when the view is already gone — nothing can be stacked on it.
   *
   * @param viewTag Native view tag of the sheet component
   * @param promise Promise that resolves when all child sheets are fully dismissed
   * @throws INVALID_VIEW_TYPE if the view is not a TrueSheetView
   * @throws OPERATION_FAILED if the operation fails for any other reason
   */
  @ReactMethod
  fun dismissStackByRef(viewTag: Double, animated: Boolean, promise: Promise) {
    val tag = viewTag.toInt()

    withTrueSheetView(tag, promise, resolveIfMissing = true) { view ->
      view.dismissStack(animated) {
        promise.resolve(null)
      }
    }
  }

  /**
   * Resize a sheet to a different index by reference
   *
   * @param viewTag Native view tag of the sheet component
   * @param index New detent index
   * @param promise Promise that resolves when resize is complete
   * @throws VIEW_NOT_FOUND if the view with the given tag is not found
   * @throws INVALID_VIEW_TYPE if the view is not a TrueSheetView
   * @throws OPERATION_FAILED if the operation fails for any other reason
   */
  @ReactMethod
  fun resizeByRef(viewTag: Double, index: Double, promise: Promise) {
    val tag = viewTag.toInt()
    val detentIndex = index.toInt()

    withTrueSheetView(tag, promise) { view ->
      view.resize(detentIndex) {
        promise.resolve(null)
      }
    }
  }

  /**
   * Dismiss all presented sheets by dismissing from the bottom of the stack
   *
   * @param animated Whether to animate the dismissals
   * @param promise Promise that resolves when all sheets are dismissed
   */
  @ReactMethod
  fun dismissAll(animated: Boolean, promise: Promise) {
    Handler(Looper.getMainLooper()).post {
      try {
        // Drop presents still waiting on the keyboard, a dismissal, or the content
        viewRegistry.values.forEach { it.cancelPendingPresent() }

        val rootSheet = TrueSheetStackManager.getRootSheet()
        if (rootSheet == null) {
          dismissSuspendedSheets()
          promise.resolve(null)
          return@post
        }

        rootSheet.dismiss(animated) {
          dismissSuspendedSheets()
          promise.resolve(null)
        }
      } catch (e: Exception) {
        promise.reject("OPERATION_FAILED", "Failed to dismiss all sheets: ${e.message}", e)
      }
    }
  }

  /**
   * Suspend every sheet open at the time of the call: each is hidden while staying logically
   * presented. Sheets presented afterwards are unaffected.
   *
   * @param promise Promise that resolves once the captured sheets are suspended
   */
  @ReactMethod
  fun suspendAll(promise: Promise) {
    Handler(Looper.getMainLooper()).post {
      try {
        // Capture all first so a parent stepping aside keeps the captured sheets above it
        val captured = viewRegistry.values.filter { it.captureForSuspendAll() }
        inStackOrder(captured).asReversed().forEach { it.reconcileSuspension() }
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("OPERATION_FAILED", "Failed to suspend sheets: ${e.message}", e)
      }
    }
  }

  /**
   * Bring back the sheets captured by [suspendAll] at their remembered detents, without
   * present events. A sheet the `suspended` prop still holds stays suspended.
   *
   * @param promise Promise that resolves once the captured sheets are released
   */
  @ReactMethod
  fun unsuspendAll(promise: Promise) {
    Handler(Looper.getMainLooper()).post {
      try {
        val captured = viewRegistry.values.filter { it.isSuspendedByModule }
        inStackOrder(captured).forEach { it.releaseFromSuspendAll() }
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("OPERATION_FAILED", "Failed to unsuspend sheets: ${e.message}", e)
      }
    }
  }

  /**
   * Suspended sheets sit outside the visible stack — close them for real too.
   * The ones still presented are hidden, so there's nothing to animate.
   */
  private fun dismissSuspendedSheets() {
    viewRegistry.values.toList().forEach {
      val controller = it.viewController
      if (it.isLogicallyOpenWhileSuspended || (controller.isSuspended && !controller.isBeingDismissed)) {
        it.dismiss(animated = false) {}
      }
    }
  }

  /**
   * Orders [views] bottom-most first; ones outside the stack (never shown) come last.
   */
  private fun inStackOrder(views: List<TrueSheetView>): List<TrueSheetView> {
    val stack = TrueSheetStackManager.getPresentedSheetsInStackOrder()
    return views.sortedBy { view -> stack.indexOf(view).takeIf { it >= 0 } ?: Int.MAX_VALUE }
  }

  @ReactMethod
  fun handleBackPress(viewTag: Double, promise: Promise) {
    val tag = viewTag.toInt()

    withTrueSheetView(tag, promise) { view ->
      view.handleBackPress()
      promise.resolve(null)
    }
  }

  /**
   * Helper method to get TrueSheetView by tag and execute closure.
   * [resolveIfMissing] resolves instead of rejecting when the view is gone (e.g. torn down by navigation).
   */
  private fun withTrueSheetView(tag: Int, promise: Promise, resolveIfMissing: Boolean = false, closure: (view: TrueSheetView) -> Unit) {
    Handler(Looper.getMainLooper()).post {
      try {
        // First try to get from registry (faster)
        var view = getSheetByTag(tag)

        // Fallback to UIManager resolution, which throws for a view that no longer exists
        if (view == null) {
          val manager = UIManagerHelper.getUIManagerForReactTag(reactApplicationContext, tag)
          val resolvedView = try {
            manager?.resolveView(tag)
          } catch (_: IllegalViewOperationException) {
            null
          }

          if (resolvedView is TrueSheetView) {
            view = resolvedView
          } else if (resolvedView != null) {
            promise.reject(
              "INVALID_VIEW_TYPE",
              "View with tag $tag is not a TrueSheetView (got ${resolvedView::class.simpleName})"
            )
            return@post
          }
        }

        if (view == null) {
          if (resolveIfMissing) {
            promise.resolve(null)
          } else {
            promise.reject("VIEW_NOT_FOUND", "TrueSheetView with tag $tag not found")
          }
          return@post
        }

        closure(view)
      } catch (e: Exception) {
        promise.reject("OPERATION_FAILED", "Failed to execute operation: ${e.message}", e)
      }
    }
  }

  companion object {
    const val NAME = "TrueSheetModule"

    /**
     * Registry to keep track of TrueSheetView instances by their view tag
     * This provides fast lookup for ref-based operations
     */
    private val viewRegistry = ConcurrentHashMap<Int, TrueSheetView>()

    /**
     * Register a TrueSheetView instance
     * Called automatically by TrueSheetView during initialization
     */
    @JvmStatic
    fun registerView(view: TrueSheetView, tag: Int) {
      viewRegistry[tag] = view
    }

    /**
     * Unregister a TrueSheetView instance
     * Called automatically by TrueSheetView during cleanup
     */
    @JvmStatic
    fun unregisterView(tag: Int) {
      viewRegistry.remove(tag)
    }

    /**
     * Get a TrueSheetView by its tag
     * @param tag - The React native tag of the view
     * @return The TrueSheetView instance, or null if not found
     */
    @JvmStatic
    fun getSheetByTag(tag: Int): TrueSheetView? = viewRegistry[tag]

    /**
     * Drop presents still waiting on the keyboard that would stack on [parent]
     */
    @JvmStatic
    fun cancelPendingPresents(parent: TrueSheetView, restoreFocus: Boolean = true) {
      viewRegistry.values.forEach {
        if (it.pendingPresentParent === parent) it.cancelPendingPresent(restoreFocus)
      }
    }
  }
}

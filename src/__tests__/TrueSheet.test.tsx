import { createRef } from 'react';
import { Text } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { TrueSheet, TrueSheetPeek } from '../index';
import NativeTrueSheetModule from '../specs/NativeTrueSheetModule';
import type {
  DidDismissEvent,
  WillFocusEvent,
  DidFocusEvent,
  WillBlurEvent,
  DidBlurEvent,
} from '../TrueSheet.types';

describe('TrueSheet', () => {
  it('should export TrueSheet component', () => {
    expect(TrueSheet).toBeDefined();
    expect(typeof TrueSheet).toBe('function');
  });

  it('should have present static method', () => {
    expect(TrueSheet.present).toBeDefined();
    expect(typeof TrueSheet.present).toBe('function');
  });

  it('should have dismiss static method', () => {
    expect(TrueSheet.dismiss).toBeDefined();
    expect(typeof TrueSheet.dismiss).toBe('function');
  });

  it('should have resize static method', () => {
    expect(TrueSheet.resize).toBeDefined();
    expect(typeof TrueSheet.resize).toBe('function');
  });

  it('should have dismissAll static method', () => {
    expect(TrueSheet.dismissAll).toBeDefined();
    expect(typeof TrueSheet.dismissAll).toBe('function');
  });

  it('should render TrueSheet component without crashing', () => {
    const { getByText } = render(
      <TrueSheet name="test" initialDetentIndex={0}>
        <Text>Test Content</Text>
      </TrueSheet>
    );
    expect(getByText('Test Content')).toBeDefined();
  });

  it('should render with footer prop', () => {
    const { getByText } = render(
      <TrueSheet name="test" initialDetentIndex={0} footer={<Text>Footer Content</Text>}>
        <Text>Content</Text>
      </TrueSheet>
    );
    expect(getByText('Content')).toBeDefined();
    expect(getByText('Footer Content')).toBeDefined();
  });

  it('should render TrueSheetPeek within content', () => {
    const { getByText } = render(
      <TrueSheet name="test" detents={['peek', 1]} initialDetentIndex={0}>
        <TrueSheetPeek>
          <Text>Peek Content</Text>
        </TrueSheetPeek>
        <Text>Content</Text>
      </TrueSheet>
    );
    expect(getByText('Peek Content')).toBeDefined();
    expect(getByText('Content')).toBeDefined();
  });

  it('should render with detents prop', () => {
    const { getByText } = render(
      <TrueSheet name="test" detents={[0.5, 1]} initialDetentIndex={0}>
        <Text>Detent Content</Text>
      </TrueSheet>
    );
    expect(getByText('Detent Content')).toBeDefined();
  });

  it('should render with style prop', () => {
    const { getByText } = render(
      <TrueSheet name="test" initialDetentIndex={0} style={{ padding: 20 }}>
        <Text>Styled Content</Text>
      </TrueSheet>
    );
    expect(getByText('Styled Content')).toBeDefined();
  });

  describe('Lazy Loading', () => {
    it('should not render native view content initially when initialDetentIndex is not set', () => {
      const { queryByText } = render(
        <TrueSheet name="lazy-test">
          <Text>Lazy Content</Text>
        </TrueSheet>
      );
      // Content should not be rendered immediately
      expect(queryByText('Lazy Content')).toBeNull();
    });

    it('should not render native view content when initialDetentIndex is -1', () => {
      const { queryByText } = render(
        <TrueSheet name="lazy-test-negative" initialDetentIndex={-1}>
          <Text>Lazy Content Negative</Text>
        </TrueSheet>
      );
      // Content should not be rendered
      expect(queryByText('Lazy Content Negative')).toBeNull();
    });

    it('should render native view content immediately when initialDetentIndex is set to valid index', () => {
      const { getByText } = render(
        <TrueSheet name="eager-test" initialDetentIndex={0}>
          <Text>Eager Content</Text>
        </TrueSheet>
      );
      // Content should be rendered immediately
      expect(getByText('Eager Content')).toBeDefined();
    });

    it('should render native view content when present is called', async () => {
      const onMountMock = jest.fn();
      const { queryByText } = render(
        <TrueSheet name="present-test" onMount={onMountMock}>
          <Text>Present Content</Text>
        </TrueSheet>
      );

      // Initially content should not be rendered
      expect(queryByText('Present Content')).toBeNull();

      // Get the sheet instance
      const sheetRef = (TrueSheet as any).instances['present-test'];
      expect(sheetRef).toBeDefined();

      // Trigger state change to render native view
      await act(async () => {
        await sheetRef.setState({ shouldRenderNativeView: true });
      });

      // Content should now be rendered after state update
      expect(queryByText('Present Content')).not.toBeNull();
    });

    it('should clean up native view content after dismiss', async () => {
      const onDidDismissMock = jest.fn();
      const { getByText, queryByText } = render(
        <TrueSheet name="dismiss-test" initialDetentIndex={0} onDidDismiss={onDidDismissMock}>
          <Text>Dismiss Content</Text>
        </TrueSheet>
      );

      // Content should be rendered initially
      expect(getByText('Dismiss Content')).toBeDefined();

      // Get the sheet instance and trigger dismiss
      const sheetRef = (TrueSheet as any).instances['dismiss-test'];
      expect(sheetRef).toBeDefined();

      // Simulate dismiss event
      await act(async () => {
        sheetRef.onDidDismiss({} as DidDismissEvent);
      });

      // Content should be cleaned up after dismiss
      expect(queryByText('Dismiss Content')).toBeNull();
      expect(onDidDismissMock).toHaveBeenCalled();
    });

    it('should render footer only when native view is rendered', () => {
      const { queryByText } = render(
        <TrueSheet name="lazy-footer-test" footer={<Text>Lazy Footer</Text>}>
          <Text>Lazy Body</Text>
        </TrueSheet>
      );

      // Neither content nor footer should be rendered initially
      expect(queryByText('Lazy Body')).toBeNull();
      expect(queryByText('Lazy Footer')).toBeNull();
    });

    it('should render footer when sheet is presented with initialDetentIndex', () => {
      const { getByText } = render(
        <TrueSheet
          name="eager-footer-test"
          initialDetentIndex={0}
          footer={<Text>Eager Footer</Text>}
        >
          <Text>Eager Body</Text>
        </TrueSheet>
      );

      // Both content and footer should be rendered
      expect(getByText('Eager Body')).toBeDefined();
      expect(getByText('Eager Footer')).toBeDefined();
    });

    it('should maintain shouldRenderNativeView state correctly through lifecycle', async () => {
      const { queryByText } = render(
        <TrueSheet name="lifecycle-test" initialDetentIndex={-1}>
          <Text>Lifecycle Content</Text>
        </TrueSheet>
      );

      // Initially not rendered (lazy)
      expect(queryByText('Lifecycle Content')).toBeNull();

      // Get the sheet instance
      const sheetRef = (TrueSheet as any).instances['lifecycle-test'];
      expect(sheetRef).toBeDefined();

      // Simulate state change that would happen during present()
      await act(async () => {
        await sheetRef.setState({ shouldRenderNativeView: true });
      });

      // Content should now be rendered after state update
      expect(queryByText('Lifecycle Content')).not.toBeNull();
    });
  });

  describe('Focus/Blur Events', () => {
    it('should call onWillFocus when triggered', async () => {
      const onWillFocusMock = jest.fn();
      render(
        <TrueSheet name="will-focus-test" initialDetentIndex={0} onWillFocus={onWillFocusMock}>
          <Text>Content</Text>
        </TrueSheet>
      );

      const sheetRef = (TrueSheet as any).instances['will-focus-test'];
      expect(sheetRef).toBeDefined();

      await act(async () => {
        sheetRef.onWillFocus({} as WillFocusEvent);
      });

      expect(onWillFocusMock).toHaveBeenCalled();
    });

    it('should call onDidFocus when triggered', async () => {
      const onDidFocusMock = jest.fn();
      render(
        <TrueSheet name="did-focus-test" initialDetentIndex={0} onDidFocus={onDidFocusMock}>
          <Text>Content</Text>
        </TrueSheet>
      );

      const sheetRef = (TrueSheet as any).instances['did-focus-test'];
      expect(sheetRef).toBeDefined();

      await act(async () => {
        sheetRef.onDidFocus({} as DidFocusEvent);
      });

      expect(onDidFocusMock).toHaveBeenCalled();
    });

    it('should call onWillBlur when triggered', async () => {
      const onWillBlurMock = jest.fn();
      render(
        <TrueSheet name="will-blur-test" initialDetentIndex={0} onWillBlur={onWillBlurMock}>
          <Text>Content</Text>
        </TrueSheet>
      );

      const sheetRef = (TrueSheet as any).instances['will-blur-test'];
      expect(sheetRef).toBeDefined();

      await act(async () => {
        sheetRef.onWillBlur({} as WillBlurEvent);
      });

      expect(onWillBlurMock).toHaveBeenCalled();
    });

    it('should call onDidBlur when triggered', async () => {
      const onDidBlurMock = jest.fn();
      render(
        <TrueSheet name="did-blur-test" initialDetentIndex={0} onDidBlur={onDidBlurMock}>
          <Text>Content</Text>
        </TrueSheet>
      );

      const sheetRef = (TrueSheet as any).instances['did-blur-test'];
      expect(sheetRef).toBeDefined();

      await act(async () => {
        sheetRef.onDidBlur({} as DidBlurEvent);
      });

      expect(onDidBlurMock).toHaveBeenCalled();
    });
  });

  describe('Re-entrancy and promise safety', () => {
    it('keeps the native view mounted when present() is called from onDidDismiss', async () => {
      const { getByText, queryByText } = render(
        <TrueSheet
          name="reentrant-dismiss"
          initialDetentIndex={0}
          onDidDismiss={() => {
            (TrueSheet as any).instances['reentrant-dismiss']?.present().catch(() => {});
          }}
        >
          <Text>Reentrant Content</Text>
        </TrueSheet>
      );

      expect(getByText('Reentrant Content')).toBeDefined();

      const sheetRef = (TrueSheet as any).instances['reentrant-dismiss'];
      await act(async () => {
        sheetRef.onDidDismiss({} as DidDismissEvent);
      });

      // present() inside the callback sets isPresenting before the unmount decision,
      // so the container must stay mounted.
      expect(queryByText('Reentrant Content')).not.toBeNull();
    });

    it('rejects a pending present() when the sheet unmounts before it mounts', async () => {
      const ref = createRef<any>();
      const { unmount } = render(
        <TrueSheet ref={ref} name="unmount-pending">
          <Text>Pending Content</Text>
        </TrueSheet>
      );

      const sheet = ref.current;
      let capturedError: unknown = null;

      // Lazy sheet: present() awaits the mount round-trip, which never completes in tests.
      await act(async () => {
        sheet.present().catch((error: unknown) => {
          capturedError = error;
        });
      });

      await act(async () => {
        unmount();
      });

      expect(capturedError).toBeInstanceOf(Error);
      expect(String(capturedError)).toMatch(/unmounted/);
    });

    it('resets isPresenting after a failed native present so a later dismiss can unmount', async () => {
      (NativeTrueSheetModule as any).presentByRef.mockImplementationOnce(() =>
        Promise.reject(new Error('native present failed'))
      );

      const ref = createRef<any>();
      const { getByText, queryByText } = render(
        <TrueSheet ref={ref} name="wedge-test" initialDetentIndex={0}>
          <Text>Wedge Content</Text>
        </TrueSheet>
      );

      const sheet = ref.current;
      expect(getByText('Wedge Content')).toBeDefined();

      await act(async () => {
        await sheet.present().catch(() => {});
      });

      // The finally block resets the guard even though the native call rejected (#590).
      expect(sheet.isPresenting).toBe(false);

      await act(async () => {
        sheet.onDidDismiss({} as DidDismissEvent);
      });

      expect(queryByText('Wedge Content')).toBeNull();
    });

    it('rejects present() outright once the sheet is unmounted', async () => {
      const ref = createRef<any>();
      const { unmount } = render(
        <TrueSheet ref={ref} name="present-after-unmount" initialDetentIndex={0}>
          <Text>Content</Text>
        </TrueSheet>
      );

      const sheet = ref.current;
      await act(async () => {
        unmount();
      });

      await expect(sheet.present()).rejects.toThrow(/unmounted/);
    });

    it('handleBackPress falls through (returns false) when the native tag is gone', () => {
      const ref = createRef<any>();
      render(
        <TrueSheet ref={ref} name="backpress-teardown" initialDetentIndex={0}>
          <Text>Content</Text>
        </TrueSheet>
      );

      const sheet = ref.current;
      sheet.isPresented = true;
      sheet.isSheetVisible = true;
      // Simulate teardown: the native handle is no longer resolvable (#718).
      sheet.nativeRef.current = null;

      expect(() => sheet.handleBackPress()).not.toThrow();
      expect(sheet.handleBackPress()).toBe(false);
    });
  });

  describe('suspended prop', () => {
    it('keeps the native view mounted when suspended is toggled on', () => {
      const { getByText, rerender } = render(
        <TrueSheet name="suspend-mount" initialDetentIndex={0}>
          <Text>Suspend Content</Text>
        </TrueSheet>
      );

      expect(getByText('Suspend Content')).toBeDefined();

      rerender(
        <TrueSheet name="suspend-mount" initialDetentIndex={0} suspended>
          <Text>Suspend Content</Text>
        </TrueSheet>
      );

      // suspension is a native-only concern; the sheet stays logically presented in JS.
      expect(getByText('Suspend Content')).toBeDefined();
    });

    it('handleBackPress returns false while suspended', () => {
      const ref = createRef<any>();
      render(
        <TrueSheet ref={ref} name="backpress-suspended" initialDetentIndex={0} suspended>
          <Text>Content</Text>
        </TrueSheet>
      );

      const sheet = ref.current;
      sheet.isPresented = true;
      sheet.isSheetVisible = true;

      // The synchronous prop guard wins even before the native visibility event lands.
      expect(sheet.handleBackPress()).toBe(false);
    });
  });
});

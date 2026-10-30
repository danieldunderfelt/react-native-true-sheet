import { useTrueSheetNavigation } from '@danieldunderfelt/react-native-true-sheet/navigation/expo-router';

import { PeekSheetContent } from '@example/shared/screens';

export default function PeekSheet() {
  const navigation = useTrueSheetNavigation();

  return <PeekSheetContent onPop={() => navigation.pop()} />;
}

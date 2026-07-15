module.exports = {
  dependency: {
    platforms: {
      ios: {},
      android: {
        componentDescriptors: ['TrueSheetViewComponentDescriptor'],
        cmakeListsPath: '../android/src/main/jni/CMakeLists.txt',
      },
    },
  },
  dependencies: {
    '@danieldunderfelt/react-native-true-sheet': {
      platforms: {
        ios: {
          configurations: ['Debug', 'Release'],
        },
      },
    },
  },
};

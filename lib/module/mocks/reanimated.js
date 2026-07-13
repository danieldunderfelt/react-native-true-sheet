"use strict";

import React, { createElement, isValidElement } from 'react';
import { View } from 'react-native';
const createMockSharedValue = initialValue => ({
  value: initialValue,
  get: () => initialValue,
  set: () => {},
  addListener: () => () => {},
  removeListener: () => {},
  modify: () => {}
});

/**
 * Mock ReanimatedTrueSheet component for testing.
 * Import from '@lodev09/react-native-true-sheet/reanimated/mock' in your test setup.
 */
export class ReanimatedTrueSheet extends React.Component {
  static instances = {};
  static dismiss = jest.fn((_name, _animated) => Promise.resolve());
  static dismissStack = jest.fn((_name, _animated) => Promise.resolve());
  static present = jest.fn((_name, _index, _animated) => Promise.resolve());
  static resize = jest.fn((_name, _index) => Promise.resolve());
  dismiss = jest.fn(_animated => Promise.resolve());
  dismissStack = jest.fn(_animated => Promise.resolve());
  present = jest.fn((_index, _animated) => Promise.resolve());
  resize = jest.fn(_index => Promise.resolve());
  componentDidMount() {
    const {
      name
    } = this.props;
    if (name) {
      ReanimatedTrueSheet.instances[name] = this;
    }
  }
  componentWillUnmount() {
    const {
      name
    } = this.props;
    if (name) {
      delete ReanimatedTrueSheet.instances[name];
    }
  }
  renderHeader() {
    const {
      header
    } = this.props;
    if (!header) return null;
    return /*#__PURE__*/isValidElement(header) ? header : /*#__PURE__*/createElement(header);
  }
  renderFooter() {
    const {
      footer
    } = this.props;
    if (!footer) return null;
    return /*#__PURE__*/isValidElement(footer) ? footer : /*#__PURE__*/createElement(footer);
  }
  render() {
    const {
      children,
      style
    } = this.props;
    return /*#__PURE__*/React.createElement(View, {
      style
    }, this.renderHeader(), children, this.renderFooter());
  }
}

/**
 * Mock ReanimatedTrueSheetProvider for testing.
 */
export function ReanimatedTrueSheetProvider({
  children
}) {
  return children;
}

/**
 * Mock useReanimatedTrueSheet hook for testing.
 */
export const useReanimatedTrueSheet = jest.fn(() => ({
  animatedPosition: createMockSharedValue(0),
  animatedIndex: createMockSharedValue(-1),
  animatedDetent: createMockSharedValue(0)
}));

/**
 * Mock useReanimatedPositionChangeHandler hook for testing.
 */
export const useReanimatedPositionChangeHandler = jest.fn((_handler, _dependencies) => jest.fn());
//# sourceMappingURL=reanimated.js.map
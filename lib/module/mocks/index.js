"use strict";

import React, { createElement, isValidElement } from 'react';
import { View } from 'react-native';
/**
 * Mock TrueSheet component for testing.
 * Import from '@lodev09/react-native-true-sheet/mock' in your test setup.
 */
export class TrueSheet extends React.Component {
  static instances = {};
  static dismiss = jest.fn((_name, _animated) => Promise.resolve());
  static dismissStack = jest.fn((_name, _animated) => Promise.resolve());
  static present = jest.fn((_name, _index, _animated) => Promise.resolve());
  static resize = jest.fn((_name, _index) => Promise.resolve());
  static dismissAll = jest.fn(_animated => Promise.resolve());
  dismiss = jest.fn(_animated => Promise.resolve());
  dismissStack = jest.fn(_animated => Promise.resolve());
  present = jest.fn((_index, _animated) => Promise.resolve());
  resize = jest.fn(_index => Promise.resolve());
  componentDidMount() {
    const {
      name
    } = this.props;
    if (name) {
      TrueSheet.instances[name] = this;
    }
  }
  componentWillUnmount() {
    const {
      name
    } = this.props;
    if (name) {
      delete TrueSheet.instances[name];
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
 * Mock TrueSheetPeek component for testing.
 */
export function TrueSheetPeek({
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement(View, rest, children);
}

/**
 * Mock TrueSheetProvider for testing.
 */
export function TrueSheetProvider({
  children
}) {
  return children;
}

/**
 * Mock useTrueSheet hook for testing.
 */
export function useTrueSheet() {
  return {
    present: TrueSheet.present,
    dismiss: TrueSheet.dismiss,
    dismissStack: TrueSheet.dismissStack,
    resize: TrueSheet.resize,
    dismissAll: TrueSheet.dismissAll
  };
}
export * from "../TrueSheet.types.js";
//# sourceMappingURL=index.js.map
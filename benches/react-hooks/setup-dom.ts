// Provide a DOM for React benchmarks.
// @ts-expect-error jsdom ships no type declarations
import { JSDOM } from 'jsdom';

process.env.NODE_ENV = 'production';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Text: dom.window.Text,
  Event: dom.window.Event,
});
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

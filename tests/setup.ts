class ResizeObserverMock {
  observe(): void { /* JSDOM has no layout engine. */ }
  unobserve(): void { /* JSDOM has no layout engine. */ }
  disconnect(): void { /* JSDOM has no layout engine. */ }
}

if (!globalThis.ResizeObserver) {
  Object.assign(globalThis, { ResizeObserver: ResizeObserverMock });
}

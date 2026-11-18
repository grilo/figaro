// Jest stand-in for @wailsio/runtime. The real module announces itself to a
// native webview on import; adapter tests inject their own call and event fakes.
const unavailable = () => Promise.reject(new Error('Wails runtime is not available in tests'));

export const Call = { ByName: unavailable };
export const Events = { On: () => () => {} };
export const Browser = { OpenURL: unavailable };
export const Flags = { GetFlag: () => undefined };
export const System = { IsWindows: () => false, IsLinux: () => false, invoke: () => {} };

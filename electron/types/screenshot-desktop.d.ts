declare module "screenshot-desktop" {
  interface Options {
    format?: string;
    screen?: string | number;
    filename?: string;
  }
  function screenshot(options?: Options): Promise<Buffer>;
  export = screenshot;
}

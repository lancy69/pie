import { DynamicBorder, keyHint, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Container, Input, Spacer, Text } from "@earendil-works/pi-tui";

export function inputCustomAnswer(ctx: ExtensionContext, title: string, signal?: AbortSignal) {
  // RPC clients render their own dialogs and do not support custom TUI components.
  if (ctx.mode !== "tui") return ctx.ui.input(title, undefined, { signal });

  return ctx.ui.custom<string | undefined>((_tui, theme, keybindings, done) => {
    const input = new Input();
    const container = new Container();
    container.addChild(new DynamicBorder());
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("accent", title), 1, 0));
    container.addChild(new Spacer(1));
    container.addChild(input);
    container.addChild(new Spacer(1));
    container.addChild(new Text(
      `${keyHint("tui.select.confirm", "submit")}  ${keyHint("tui.select.cancel", "return to selection menu")}`, 1, 0,
    ));
    container.addChild(new Spacer(1));
    container.addChild(new DynamicBorder());

    const onAbort = () => finish(undefined);
    function finish(value: string | undefined) {
      signal?.removeEventListener("abort", onAbort);
      done(value);
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();

    return {
      get focused() { return input.focused; },
      set focused(value: boolean) { input.focused = value; },
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput(data: string) {
        if (keybindings.matches(data, "tui.select.confirm") || data === "\n") finish(input.getValue());
        else if (keybindings.matches(data, "tui.select.cancel")) finish(undefined);
        else input.handleInput(data);
      },
      dispose: () => signal?.removeEventListener("abort", onAbort),
    };
  });
}

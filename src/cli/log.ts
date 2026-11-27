import { styleText } from "node:util";

export const log = {
  indent: "",

  info(...args) {
    console.log(
      this.indent + styleText(["bgWhite", "black"], " INFO "),
      args.join(" "),
    );
  },

  error(...args) {
    console.log(
      this.indent + styleText(["bgRed", "white"], " ERROR "),
      args.join(" "),
    );
  },

  warn(...args) {
    console.log(
      this.indent + styleText(["bgYellow", "black"], " WARNING "),
      args.join(" "),
    );
  },

  plain(...args) {
    console.log(this.indent + args.join(" "));
  },

  group(g) {
    const indent = this.indent;
    this.indent += "  ";
    try {
      g();
    } finally {
      this.indent = indent;
    }
  },

  device(device, detailed = false) {
    const mgmt = device.management;

    const types: string[] = Array.from(device.metadata.types);
    const filteredTypes = types.filter((t) => t.indexOf("miio:") === 0);
    const caps = Array.from(device.metadata.capabilities);

    this.plain(
      styleText("bold", "Device ID:"),
      device.id.replace(/^miio:/, ""),
    );
    this.plain(styleText("bold", "Model info:"), mgmt.model || "Unknown");

    if (mgmt.address) {
      this.plain(styleText("bold", "Address:"), mgmt.address);
    } else if (mgmt.parent) {
      this.plain(styleText("bold", "Address:"), "Owned by", mgmt.parent.id);
    }

    if (mgmt.token) {
      this.plain(
        styleText("bold", "Token:"),
        mgmt.token,
        mgmt.autoToken
          ? styleText("green", "via auto-token")
          : styleText("yellow", "via stored token"),
      );
    } else if (!mgmt.parent) {
      this.plain(styleText("bold", "Token:"), "???");
    } else {
      this.plain(
        styleText("bold", "Token:"),
        styleText("green", "Automatic via parent device"),
      );
    }

    this.plain(
      styleText("bold", "Support:"),
      mgmt.model
        ? filteredTypes.length > 0
          ? styleText("green", "At least basic")
          : styleText("yellow", "At least generic")
        : styleText("yellow", "Unknown"),
    );

    if (detailed) {
      this.plain();
      this.plain(styleText("bold", "Type info:"), types.join(", "));
      this.plain(styleText("bold", "Capabilities:"), caps.join(", "));
    }

    this.plain();
  },
};

import { Plugin } from "obsidian";

import { registerTableCommands } from "./table";
import { registerFormatCommands } from "./format";
import { registerUiCommands } from "./ui";
import { registerPrintCommands } from "./print";
import { registerBasicCommands } from "./edit";
import { replacementExtension } from "./replace";

export default class EditorShortcutsPlugin extends Plugin {
	async onload() {
		// Register the arrow symbol replacement extension
		this.registerEditorExtension(replacementExtension);
		registerTableCommands(this);
		registerFormatCommands(this);
		registerPrintCommands(this);
		registerBasicCommands(this);
		registerUiCommands(this);
	}
}

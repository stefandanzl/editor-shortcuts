import { Plugin } from "obsidian";

import { registerTableCommands } from "./table";
import { registerFormatCommands } from "./format";
import { registerUiCommands } from "./ui";
import { registerPrintCommands } from "./print";
import { registerBasicCommands } from "./edit";
import { replacementExtension } from "./replace";
import { DEFAULT_PRINT_SETTINGS, PrintSettingTab, type PrintSettings } from "./settings";

export default class EditorShortcutsPlugin extends Plugin {
	settings: PrintSettings = { ...DEFAULT_PRINT_SETTINGS };

	async onload() {
		// Register the arrow symbol replacement extension
		this.registerEditorExtension(replacementExtension);
		registerTableCommands(this);
		registerFormatCommands(this);
		registerPrintCommands(this);
		registerBasicCommands(this);
		registerUiCommands(this);

		this.settings = {
			...DEFAULT_PRINT_SETTINGS,
			...((await this.loadData()) as Partial<PrintSettings> | null),
		};
		this.addSettingTab(new PrintSettingTab(this.app, this));
	}
}

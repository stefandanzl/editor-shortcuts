import {
	Component,
	MarkdownRenderer,
	MarkdownView,
	Menu,
	TAbstractFile,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import type { App, Editor } from "obsidian";
import type EditorShortcutsPlugin from "./main";

export async function printMarkdown(app: App, view: MarkdownView): Promise<void> {
	const file = view.file;
	if (!file) return;

	let markdown = "";

	// 1. Live Preview / Editing View
	if (view.getMode() === "source" && view.editor) {
		const selection = view.editor.getSelection();
		markdown = selection.length > 0 ? selection : view.editor.getValue();
	} else {
		markdown = await app.vault.read(file);
	}
	const container = document.createElement("div");
	const renderer = new Component();
	const sourcePath = view.file?.path;
	if (!sourcePath) throw new Error("sourcePath undefined");

	renderer.load();
	await MarkdownRenderer.render(app, markdown, container, sourcePath, renderer);
	renderer.unload();

	// Collect all loaded styles
	const headStyles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
		.map((node) => node.outerHTML)
		.join("\n");

	const iframe = document.createElement("iframe");
	iframe.style.display = "none";

	const htmlContent = `
    <!DOCTYPE html>
    <html class="${document.documentElement.className}">
      <head>
        ${headStyles}
      </head>
      <body class="theme-light print"
        style="--zoom-factor: 1; --accent-h: 116; --accent-s: 33%; --accent-l: 41%; --font-monospace-override: &quot;Source Code Pro&quot;; --font-text-size: 16px; --indent-size: 4;">
        <div class="markdown-reading-view print" style="width: 100%; height: 100%;">
          <div class="markdown-preview-view markdown-rendered is-readable-line-width">
            <div class="mod-header mod-ui"></div>
              <div class="markdown-preview-sizer markdown-preview-section">
                ${container.innerHTML}
              </div>
            <div class="mod-footer mod-ui"></div>
          </div>
        </div>
      </body>
    </html>
  `;
	console.log(htmlContent);
	iframe.srcdoc = htmlContent;
	iframe.onload = function () {
		const win = (this as HTMLIFrameElement).contentWindow!;
		win.onafterprint = () => document.body.removeChild(iframe);
		win.print();
	};

	document.body.appendChild(iframe);
}

export async function registerPrintCommands(plugin: EditorShortcutsPlugin) {
	plugin.addCommand({
		id: "print-selection-or-document",
		name: "Print selection or document",
		icon: "printer",

		checkCallback: (checking) => {
			const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (view) {
				if (!checking) {
					printMarkdown(plugin.app, view);
				}
				return true;
			}

			return false;
		},
	});

	plugin.registerEvent(
		plugin.app.workspace.on(
			"file-menu",
			(menu: Menu, file: TAbstractFile, source: string, leaf?: WorkspaceLeaf) => {
				// Only show in 3-dot menu
				if (source === "more-options" && file instanceof TFile) {
					menu.addItem((item) => {
						item.setTitle("Print file…")
							.setIcon("printer")
							.onClick(() => {
								if (leaf && leaf.view instanceof MarkdownView) {
									const markdownView = leaf.view;
									printMarkdown(plugin.app, markdownView);
								}
							});
					});
				}
			},
		),
	);
}

import {
	Component,
	MarkdownRenderer,
	MarkdownView,
	Menu,
	Notice,
	Platform,
	TAbstractFile,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import type { App } from "obsidian";
import { shell } from "@electron/remote";
// import type { Dialog.showSaveDialog } from "@electron/remote";
// import { IpcRenderer } from "electron/renderer";

import type EditorShortcutsPlugin from "./main";
import type { AccentColor, PrintSettings } from "./settings";
import { writeFileSync } from "node:fs";

const pdfOptionsFrom = (s: PrintSettings): Electron.PrintToPDFOptions => ({
	...PDF_DEFAULTS,
	pageSize: s.pageSize,
	landscape: s.landscape,
	scale: s.scale,
	printBackground: s.printBackground,
	generateDocumentOutline: s.generateDocumentOutline,
	generateTaggedPDF: s.generateTaggedPDF,
});

const PDF_DEFAULTS: Electron.PrintToPDFOptions = {
	pageSize: "A4",
	landscape: false,
	margins: { bottom: 0, left: 0, right: 0, top: 0 },
	preferCSSPageSize: true,
	pageRanges: "",
	scale: 1,
	printBackground: true,
	generateDocumentOutline: true,
	generateTaggedPDF: true,
	headerTemplate: "",
	footerTemplate: "",
	displayHeaderFooter: false,
};

// One-shot style copy into the print popup (structure reverse-engineered from
// Obsidian's own PrintModal): clone every <style>/<link> from the main window,
// copy body classes + CSS custom properties + root font-size.
function copyStylesOnce(targetWin: Window, extraHeadNodes: Node[]) {
	const nodes = [...extraHeadNodes];
	for (const node of Array.from(document.head.childNodes)) {
		const isStyle = node instanceof HTMLStyleElement;
		const isCssLink = node instanceof HTMLLinkElement && node.type === "text/css";
		if (!isStyle && !isCssLink) continue;
		// Skip CodeMirror's runtime stylesheet — its generated class names
		// (like "ͼ1") are meaningless outside a live editor.
		if (isStyle && node.textContent?.includes("ͼ1")) continue;
		nodes.push(node.cloneNode(true));
	}
	for (const node of nodes) targetWin.document.head.appendChild(node);

	const targetBody = targetWin.document.body;
	targetBody.className = document.body.className;

	// targetWin.document.documentElement.style.setProperty(
	// 	"font-size",
	// 	getComputedStyle(document.body).fontSize,
	// );

	targetBody.classList.add("is-popout-window");
}

export async function printMarkdown(
	app: App,
	view: MarkdownView,
	mode: "print" | "pdf" = "print",
	pdfOptions: Electron.PrintToPDFOptions = PDF_DEFAULTS,
	fontSize?: string,
	accentColor: AccentColor = "obsidian",
): Promise<void> {
	const file = view.file;
	if (!file) return;

	let markdown = "";
	let includeTitle = false;

	if (view.getMode() === "source" && view.editor) {
		const selection = view.editor.getSelection();
		includeTitle = selection.length === 0;
		markdown = includeTitle ? view.editor.getValue() : selection;
	} else {
		includeTitle = true;
		markdown = await app.vault.read(file);
	}

	const win = window.open("about:blank", "_blank", "popup,hide=true");
	if (!win) {
		new Notice("Print window was blocked");
		return;
	}

	const base = win.document.createElement("base");
	// base.href = location.href;
	base.href = "";
	win.document.head.appendChild(base);
	win.document.title = file.basename;

	// Equip the popup with Obsidian's patched prototypes (createDiv, .find, …)
	// — the same mechanism Obsidian uses to bootstrap its popout windows.
	// MarkdownRenderer needs these on the render container's elements.
	// Undocumented internal: guard it.
	if (typeof (window as any).globalEnhance === "function") {
		(win as any).eval.call(
			win,
			"(" + (window as any).globalEnhance.toString() + ")()\n//# sourceURL=enhance.js",
		);
	}

	copyStylesOnce(win, [base]);

	// Force light theme AFTER the style copy — printed output is always
	// ink-friendly, even when the app is in dark mode.
	win.document.body.classList.remove("theme-dark");
	win.document.body.classList.add("theme-light");

	const printRoot = win.document.createElement("div");
	printRoot.className = "print";
	win.document.body.appendChild(printRoot);

	// settings font size wins over styles.css (inline !important beats a
	// stylesheet !important custom property)
	if (fontSize) {
		printRoot.style.setProperty("--font-text-size", fontSize, "important");
	}
	if (accentColor === "custom") {
		const accentH = document.body.style.getPropertyValue("--accent-h");
		win.document.body.style.setProperty("--accent-h", accentH, "important");

		const accentS = document.body.style.getPropertyValue("--accent-s");
		win.document.body.style.setProperty("--accent-s", accentS, "important");

		const accentL = document.body.style.getPropertyValue("--accent-l");
		win.document.body.style.setProperty("--accent-l", accentL, "important");

		console.log(accentH, accentL, accentS);

		/**
		--accent-h: 116;
		--accent-s: 33%;
		--accent-l: 41%;
		*/
	} else if (accentColor === "mono") {
		win.document.body.style.setProperty("--accent-h", "170", "important");

		win.document.body.style.setProperty("--accent-s", "0%", "important");

		win.document.body.style.setProperty("--accent-l", "40%", "important");
	}
	const renderEl = win.document.createElement("div");
	renderEl.className = "markdown-preview-view markdown-rendered";
	printRoot.appendChild(renderEl);

	const getConfig = (key: string) => (app.vault as any).getConfig?.(key);
	renderEl.classList.toggle("rtl", !!getConfig("rightToLeft"));
	renderEl.classList.toggle("show-properties", getConfig("propertiesInDocument") !== "hidden");

	if (includeTitle) {
		const h1 = win.document.createElement("h1");
		h1.textContent = file.basename;
		renderEl.appendChild(h1);
	}

	// Per-file styling hook: frontmatter cssclasses
	const cssclasses = app.metadataCache.getFileCache(file)?.frontmatter?.cssclasses;
	if (cssclasses) {
		const list = Array.isArray(cssclasses) ? cssclasses : [cssclasses];
		renderEl.classList.add(...list.filter((c) => c && !String(c).includes(" ")));
	}

	const renderer = new Component();
	renderer.load();
	await MarkdownRenderer.render(app, markdown, renderEl, file.path, renderer);
	const anchors = renderEl.getElementsByTagName("a");
	for (const anchor of anchors) {
		const link = anchor?.getAttr("href");
		if (link?.contains("#")) {
			const linkArray = link.split("#");
			// const newLink = "#" + linkArray[linkArray.length - 1];
			const newLink = "+++";
			anchor?.setAttr("href", newLink);
		}
	}
	console.log("[print] document", win.document.documentElement);

	if (mode === "pdf") {
		// ipc route: the popup is a real BrowserWindow, so @electron/remote from
		// INSIDE it gives its own webContents -> printToPDF without a dialog.
		const remote = (win as any).require?.("@electron/remote") as typeof import("@electron/remote");
		// const { dialog } = window.require("electron").remote;
		const { dialog } = remote; // HAS TO BE ORIGINAL ONE!

		const result: Electron.SaveDialogReturnValue = await dialog.showSaveDialog({
			defaultPath: file.basename + ".pdf",
			filters: [{ name: "PDF Files", extensions: ["pdf"] }],
		});
		if (result.canceled || !result.filePath) return;
		if (!remote) {
			new Notice("@electron/remote unavailable — falling back to print dialog");
			win.onafterprint = () => {
				renderer.unload();
				win.close();
			};
			win.print();
			return;
		}
		try {
			// const outPath = file.path.replace(/\.md$/i, "") + ".pdf";
			const outPath = result.filePath;
			const data = await remote.getCurrentWebContents().printToPDF(pdfOptions);
			// await app.vault.adapter.writeBinary(outPath, data as any);
			writeFileSync(outPath, data);
			const errorMessage = await shell.openPath(outPath);
			if (errorMessage) throw new Error("Failed to open generated PDF:" + errorMessage);

			new Notice(`PDF saved: ${outPath}`);
		} catch (e) {
			new Notice("PDF export failed: " + e?.message);
		} finally {
			renderer.unload();
			win.close();
		}
		return;
	}
	win.onafterprint = () => {
		renderer.unload();
		win.close();
	};
	win.print();
}

export async function registerPrintCommands(plugin: EditorShortcutsPlugin) {
	// This is not compatible for mobile
	if (Platform.isMobileApp) return;

	plugin.addCommand({
		id: "print-selection-or-document",
		name: "Print selection or document",
		icon: "printer",
		checkCallback: (checking) => {
			const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (view) {
				if (!checking) {
					const s = plugin.settings;
					printMarkdown(plugin.app, view, "print", pdfOptionsFrom(s), s.fontSize, s.accentColor);
				}
				return true;
			}
			return false;
		},
	});

	plugin.addCommand({
		id: "export-selection-or-document-as-pdf",
		name: "Export selection or document as PDF",
		icon: "file-down",
		checkCallback: (checking) => {
			const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (view) {
				if (!checking) {
					const s = plugin.settings;
					printMarkdown(plugin.app, view, "pdf", pdfOptionsFrom(s), s.fontSize, s.accentColor);
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
									const s = plugin.settings;
									printMarkdown(
										plugin.app,
										markdownView,
										"print",
										pdfOptionsFrom(s),
										s.fontSize,
										s.accentColor,
									);
								}
							});
					});
				}
			},
		),
	);
}

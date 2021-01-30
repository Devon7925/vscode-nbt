import { applyEdit } from "../../src/common/Operations";
import { NbtFile, NbtEdit, EditorMessage, ViewMessage } from "../../src/common/types"
import { RegionEditor } from "./RegionEditor";
import { SnbtEditor } from "./SnbtEditor";
import { StructureEditor } from "./StructureEditor";
import { TreeEditor } from "./TreeEditor";

export type VSCode = {
	postMessage(message: EditorMessage): void
}

declare function acquireVsCodeApi(): VSCode
const vscode = acquireVsCodeApi();

const root = document.querySelector('.nbt-editor')!

const LOCALES = {
	'copy': 'Copy',
	'name': 'Name',
	'value': 'Value',
	'confirm': 'Confirm',
	'addTag': 'Add Tag',
	'editTag': 'Edit',
	'removeTag': 'Remove',
	'grid': 'Show Grid',
  'panel.structure': '3D',
  'panel.region': 'Region',
	'panel.tree': 'Tree',
	'panel.snbt': 'SNBT',
}

function lazy<T>(getter: () => T) {
	let value: T | null = null
	return () => {
		if (value === null) {
			value = getter()
		}
		return value
	}
}

export function locale(key: string) {
  return LOCALES[key] ?? key
}

export interface EditorPanel {
	reveal?(): void
	hide?(): void
	onInit(file: NbtFile): void
	onUpdate(file: NbtFile, edit: NbtEdit): void
	onMessage?(message: ViewMessage): void
	menu?(): Element[]
}

export type EditHandler = (edit: NbtEdit) => void

class Editor {
	private panels: {
		[key: string]: {
			editor: () => EditorPanel
			updated?: boolean
			options?: string[]
		}
	} = {
		'structure': {
			editor: lazy(() => new StructureEditor(root, vscode, e => this.makeEdit(e), this.readOnly)),
			options: ['structure', 'tree', 'snbt']
		},
		'region': {
			editor: lazy(() => new RegionEditor(root, vscode, e => this.makeEdit(e), this.readOnly)),
			options: ['region']
		},
		'tree': {
			editor: lazy(() => new TreeEditor(root, vscode, e => this.makeEdit(e), this.readOnly)),
			options: ['tree', 'snbt']
		},
		'snbt': {
			editor: lazy(() => new SnbtEditor(root, vscode, e => this.makeEdit(e), this.readOnly))
		}
	}

	private type: string
	private nbtFile: NbtFile
	private activePanel: string
	private readOnly: boolean

	constructor() {
		window.addEventListener('message', async e => {
			editor.onMessage(e.data)
		});

		vscode.postMessage({ type: 'ready' })
	}

	onMessage(m: ViewMessage) {
		switch (m.type) {
			case 'init':
				if (m.body.type === 'structure') {
					this.type = 'structure'
				} else if (m.body.type === 'region') {
					this.type = 'region'
				} else {
					this.type = 'tree'
				}
				this.nbtFile = m.body.content
				this.readOnly = m.body.readOnly
				this.setPanel(this.type)
				return;

			case 'update':
				try {
					applyEdit(this.nbtFile, m.body)
					Object.values(this.panels).forEach(p => p.updated = false)
					this.panels[this.activePanel].editor().onUpdate(this.nbtFile, m.body)
					this.panels[this.activePanel].updated = true
				} catch (e) {
					vscode.postMessage({ type: 'error', body: e.message })
				}
				return;

			default:
				this.panels[this.type].editor().onMessage?.(m)
		}
	}

	private setPanel(panel: string) {
		root.innerHTML = `<div class="spinner"></div>`
		this.panels[this.activePanel]?.editor().hide?.()
		this.activePanel = panel
		const editorPanel = this.panels[panel].editor()
		this.setPanelMenu(editorPanel)
		setTimeout(() => {
			if (!this.panels[panel].updated) {
				editorPanel.onInit(this.nbtFile)
				this.panels[panel].updated = true
			}
			root.innerHTML = ''
			editorPanel?.reveal?.()
		})
	}

	private setPanelMenu(panel: EditorPanel) {
		const el = document.querySelector('.panel-menu')!
		el.innerHTML = ''
		const btnGroup = document.createElement('div')
		btnGroup.classList.add('btn-group')
		el.append(btnGroup)
		this.panels[this.type].options?.forEach((p: string) => {
			const button = document.createElement('div')
			btnGroup.append(button)
			button.classList.add('btn')
			button.textContent = locale(`panel.${p}`)
			if (p === this.activePanel) {
				button.classList.add('active')
			} else {
				button.addEventListener('click', () => this.setPanel(p))
			}
		})
		if (panel.menu) {
			el.insertAdjacentHTML('beforeend', '<div class="menu-spacer"></div>')
			panel.menu().forEach(e => el.append(e))
		}
	}

	private makeEdit(edit: NbtEdit) {
		if (this.readOnly) return
		vscode.postMessage({ type: 'edit', body: edit })
	}
}

const editor = new Editor()

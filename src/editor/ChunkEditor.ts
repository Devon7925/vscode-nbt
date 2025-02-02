import type { NamedNbtTag } from 'deepslate'
import { getListTag, getOptional, getTag, Structure } from 'deepslate'
import { vec3 } from 'gl-matrix'
import { StructureEditor } from './StructureEditor'
import { toBigInt } from './Util'

const VERSION_21w43a = 2844

export class ChunkEditor extends StructureEditor {
	
	onInit(data: NamedNbtTag) {
		this.updateStructure(data)
		vec3.copy(this.cPos, this.structure.getSize())
		vec3.mul(this.cPos, this.cPos, [-0.5, -1, -0.5])
		vec3.add(this.cPos, this.cPos, [0, 16, 0])
		this.cDist = 25
		this.showSidePanel()
		this.render()
	}

	protected loadStructure() {
		this.gridActive = false

		const dataVersion = getTag(this.data.value, 'DataVersion', 'int')
		const N = dataVersion >= VERSION_21w43a

		const sections = N
			? getOptional(() => getListTag(this.data.value, 'sections', 'compound'), [])
			: getOptional(() => getListTag(getTag(this.data.value, 'Level', 'compound'), 'Sections', 'compound'), [])

		const filledSections = sections.filter(section => {
			const palette = N
				? section['block_states'] && getListTag(getTag(section, 'block_states', 'compound'), 'palette', 'compound')
				: section['Palette'] && getListTag(section, 'Palette', 'compound')
			return palette
				?.filter(state => getTag(state, 'Name', 'string') !== 'minecraft:air')
				.length > 0
		})
		if (filledSections.length === 0) {
			throw new Error('Empty chunk')
		}
		const minY = 16 * Math.min(...filledSections.map(s => getTag(s, 'Y', 'byte')))
		const maxY = 16 * Math.max(...filledSections.map(s => getTag(s, 'Y', 'byte')))

		const K_palette = N ? 'palette' : 'Palette'
		const K_data = N ? 'data' : 'BlockStates'

		const structure = new Structure([16, maxY - minY + 16, 16])
		for (const section of filledSections) {
			const states = N ? getTag(section, 'block_states', 'compound') : section
			if (!states[K_palette] || !states[K_data]) {
				continue
			}
			const yOffset = getTag(section, 'Y', 'byte') * 16 - minY
			const palette = getListTag(states, K_palette, 'compound')
			const blockStates = getTag(states, K_data, 'longArray')

			const bits = Math.max(4, Math.ceil(Math.log2(palette.length)))
			const bitMask = BigInt(Math.pow(2, bits) - 1)
			const perLong = Math.floor(64 / bits)

			let i = 0
			let data = BigInt(0)
			for (let j = 0; j < 4096; j += 1) {
				if (j % perLong === 0) {
					data = toBigInt(blockStates[i])
					i += 1
				}
				const index = Number((data >> BigInt(bits * (j % perLong))) & bitMask)
				const state = palette[index]
				if (state) {
					const pos: [number, number, number] = [j & 0xF, yOffset + (j >> 8), (j >> 4) & 0xF]
					const name = getTag(state, 'Name', 'string')
					const properties = Object.fromEntries(
						Object.entries(getOptional(() => getTag(state, 'Properties', 'compound'), {}))
							.filter(([_, v]) => v.type === 'string')
							.map(([k, v]) => [k, v.value as string]))
					structure.addBlock(pos, name, properties)
				}
			}
		}
		console.log(structure)
		return structure
	}

	menu() {
		return []
	}

	protected showSidePanel() {
		this.root.querySelector('.side-panel')?.remove()
		const block = this.selectedBlock ? this.structure.getBlock(this.selectedBlock) : null
		if (block) {
			super.showSidePanel()
		}
	}
}

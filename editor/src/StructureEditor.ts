import { Structure } from "@webmc/core";
import { StructureRenderer } from "@webmc/render";
import { EditorPanel, locale } from "./Editor";
import { ResourceManager } from "./ResourceManager";
import { mat4, vec2, vec3 } from "gl-matrix"
import { clamp, clampVec3, negVec3 } from "./Util";

declare const stringifiedAssets: string

export class StructureEditor implements EditorPanel {
  private canvas: HTMLCanvasElement
  private resources: ResourceManager
  private structure: Structure
  private renderer: StructureRenderer
  private canvas2: HTMLCanvasElement
  private gl2: WebGLRenderingContext
  private renderer2: StructureRenderer

  private cPos: vec3
  private cRot: vec2
  private cDist: number

  private gridActive: boolean
  private selectedBlock: vec3 | null

  constructor(private root: Element) {
    const assets = JSON.parse(stringifiedAssets)
    this.resources = new ResourceManager()
    const img = (document.querySelector('.block-atlas') as HTMLImageElement)
    this.resources.loadBlockDefinitions(assets.blockstates)
    this.resources.loadBlockModels(assets.models)
    this.resources.loadBlockAtlas(img, assets.textures)
    const blockAtlas = this.resources.getBlockAtlas()

    this.canvas = document.createElement('canvas')
    this.canvas.className = 'structure-3d'
    const gl = this.canvas.getContext('webgl');
    this.structure = new Structure([0, 0, 0])
    this.renderer = new StructureRenderer(gl, this.resources, this.resources, blockAtlas, this.structure)

    this.canvas2 = document.createElement('canvas')
    this.canvas2.className = 'structure-3d click-detection'
    this.gl2 = this.canvas2.getContext('webgl')
    this.renderer2 = new StructureRenderer(this.gl2, this.resources, this.resources, blockAtlas, this.structure)

    this.cPos = vec3.create()
    this.cRot = vec2.fromValues(0.4, 0.6)
    this.cDist = 10

    this.gridActive = true
    this.selectedBlock = null

    let dragTime: number
    let dragPos: [number, number] | null = null
    let dragButton: number
    this.canvas.addEventListener('mousedown', evt => {
      dragTime = Date.now()
      dragPos = [evt.clientX, evt.clientY]
      dragButton = evt.button
    })
    this.canvas.addEventListener('mousemove', evt => {
      if (dragPos) {
        const dx = (evt.clientX - dragPos[0]) / 100
        const dy = (evt.clientY - dragPos[1]) / 100
        if (dragButton === 0) {
          vec2.add(this.cRot, this.cRot, [dx, dy])
          this.cRot[0] = this.cRot[0] % (Math.PI * 2)
          this.cRot[1] = clamp(this.cRot[1], -Math.PI / 2, Math.PI / 2)
        } else if (dragButton === 2) {
          vec3.rotateY(this.cPos, this.cPos, [0, 0, 0], this.cRot[0])
          vec3.rotateX(this.cPos, this.cPos, [0, 0, 0], this.cRot[1])
          const d = vec3.fromValues(dx, -dy, 0)
          vec3.scale(d, d, 0.25 * this.cDist)
          vec3.add(this.cPos, this.cPos, d)
          vec3.rotateX(this.cPos, this.cPos, [0, 0, 0], -this.cRot[1])
          vec3.rotateY(this.cPos, this.cPos, [0, 0, 0], -this.cRot[0])
          clampVec3(this.cPos, negVec3(this.structure.getSize()), [0, 0, 0])
        } else {
          return
        }
        dragPos = [evt.clientX, evt.clientY]
        this.render();
      }
    })
    this.canvas.addEventListener('mouseup', evt => {
      dragPos = null
      if (Date.now() - dragTime < 200) {
        if (dragButton === 0) {
          this.selectBlock(evt.clientX, evt.clientY)
        }
      }
    })
    this.canvas.addEventListener('wheel', evt => {
      this.cDist += evt.deltaY / 100
      this.cDist = Math.max(1, Math.min(50, this.cDist))
      this.render();
    })

    window.addEventListener('resize', () => {
      if (this.resize()) this.render()
    })

    this.render();
  }

  render() {
    requestAnimationFrame(() => {
      this.resize()

      const viewMatrix = this.getViewMatrix()

      if (this.gridActive) {
        this.renderer.drawGrid(viewMatrix);
      }

      this.renderer.drawStructure(viewMatrix);

      if (this.selectedBlock) {
        this.renderer.drawOutline(viewMatrix, this.selectedBlock)
      }
    })
  }

  resize() {
    const displayWidth2 = this.canvas2.clientWidth;
    const displayHeight2 = this.canvas2.clientHeight;
    if (this.canvas2.width !== displayWidth2 || this.canvas2.height !== displayHeight2) {
      this.canvas2.width = displayWidth2;
      this.canvas2.height = displayHeight2;
      this.renderer2.setViewport(0, 0, this.canvas2.width, this.canvas2.height)
    }

    const displayWidth = this.canvas.clientWidth;
    const displayHeight = this.canvas.clientHeight;
    if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
      this.canvas.width = displayWidth;
      this.canvas.height = displayHeight;
      this.renderer.setViewport(0, 0, this.canvas.width, this.canvas.height)
      return true
    }
    return false
  }

  reveal() {
    this.root.append(this.canvas)
    this.root.append(this.canvas2)
  }

  update(data: any) {
    this.structure = Structure.fromNbt(data.data)
    this.renderer.setStructure(this.structure)
    this.renderer2.setStructure(this.structure)

    vec3.copy(this.cPos, this.structure.getSize())
    vec3.scale(this.cPos, this.cPos, -0.5)
    this.cDist = vec3.dist([0, 0, 0], this.cPos) * 1.5

    this.render()
  }

  menu() {
    const gridToggle = document.createElement('div')
    gridToggle.classList.add('btn')
    gridToggle.textContent = locale('grid')
    gridToggle.classList.toggle('active', this.gridActive)
    gridToggle.addEventListener('click', () => {
      this.gridActive = !this.gridActive
      gridToggle.classList.toggle('active', this.gridActive)
      this.render()
    })

    return [gridToggle]
  }

  private getViewMatrix() {
    const viewMatrix = mat4.create();
    mat4.translate(viewMatrix, viewMatrix, [0, 0, -this.cDist])
    mat4.rotateX(viewMatrix, viewMatrix, this.cRot[1])
    mat4.rotateY(viewMatrix, viewMatrix, this.cRot[0])
    mat4.translate(viewMatrix, viewMatrix, this.cPos);
    return viewMatrix
  }

  private selectBlock(x: number, y: number) {
    const viewMatrix = this.getViewMatrix()
    this.renderer2.drawColoredStructure(viewMatrix)
    const color = new Uint8Array(4)
    this.gl2.readPixels(x, this.canvas2.height - y, 1, 1, this.gl2.RGBA, this.gl2.UNSIGNED_BYTE, color)
    if (color[3] === 255) {
      this.selectedBlock = [color[0], color[1], color[2]]
    } else {
      this.selectedBlock = null
    }
    this.render()
  }
}
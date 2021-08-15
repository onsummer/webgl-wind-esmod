import WindGL from './src/windgl.js'
// import * as gui from 'dat.gui'
import './style.css'
import { drawWorldPolyline } from './src/draw-world-on-canvas-coastline.js'

const main = async () => {
  /**
   * @type {HTMLCanvasElement}
   */
  // @ts-ignore
  const canvas = document.getElementById('canvas')
  /**
   * @type {WebGLRenderingContext}
   */
  // @ts-ignore
  const gl = canvas.getContext('webgl', { antialiasing: false })
  const pixelRatio = Math.max(Math.floor(window.devicePixelRatio) || 1, 2)

  //#region 绘制世界地图边线
  const coastlineCanvas = document.getElementById('coastline')
  // @ts-ignore
  drawWorldPolyline(coastlineCanvas, pixelRatio)
  //#endregion

  //#region 缩放 canvas 的像素尺寸到 dom 尺寸
  canvas.width = canvas.clientWidth
  canvas.height = canvas.clientHeight
  //#endregion

  //#region 创建风场系统对象 并设置粒子数量
  const wind = new WindGL(gl)
  wind.particleCounts = 2 ** 16
  //#endregion

  //#region 获取元数据并获取图像数据
  const frameMetaDataResponse = await fetch('/data/2016112000.json')
  const frameMetaData = await frameMetaDataResponse.json()
  const windImage = new Image()
  frameMetaData.image = windImage
  windImage.src = '/data/2016112000.png'
  windImage.onload = () => {
    wind.setWind(frameMetaData)
  }
  // 下面的代码行不通，因为 png 的 arraybuffer 并不是所需的 uint8clampedarray
  // 用 canvas 同步绘制并取其 data 应该也可以，不过要设置长宽，比较麻烦
  // const textureImageResponse = await fetch('/data/2016112000.png')
  // const buffer = await textureImageResponse.arrayBuffer()
  // frameMetaData['image'] = new Uint8Array(buffer)
  // wind.setWind(frameMetaData)
  //#endregion

  //#region 启动 rAF 渲染
  const frame = () => {
    if (wind.windData) {
      wind.draw()
    }
    requestAnimationFrame(frame)
  }
  frame()
  //#endregion
}

document.addEventListener('DOMContentLoaded', () => {
  main()
})
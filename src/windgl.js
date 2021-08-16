import { createBuffer, createProgram, createTexture, bindTexture, bindAttribute, bindFramebuffer } from "./glutils"
import { vs as DRAW_VS, fs as DRAW_FS } from './shaders/draw.js'
import { vs as QUAD_VS } from './shaders/quad.js'
import { fs as SCREEN_FS } from './shaders/screen.js'
import { fs as UPDATE_FS } from './shaders/update.js'

const defaultRampColors = new Map([
  [0.0, '#3288bd'],
  [0.1, '#66c2a5'],
  [0.2, '#abdda4'],
  [0.3, '#e6f598'],
  [0.4, '#fee08b'],
  [0.5, '#fdae61'],
  [0.6, '#f46d43'],
  [1.0, '#d53e4f']
])

/**
 * 从一条颜色带中绘制一根线性渐变线段
 * @param {Map<number, string>} colors key 从 0.0 到 1.0 的一个 hex 格式颜色色带
 * 
 * @returns {Uint8Array}
 */
const getColorRamp = (colors) => {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  //#region 创建渐变色带，每一条是一条线
  canvas.width = 256
  canvas.height = 1
  const gradient = ctx.createLinearGradient(0, 0, 256, 0)
  colors.forEach((value, key) => {
    gradient.addColorStop(key, value)
  })
  //#endregion

  //#region 绘制
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 256, 1)
  //#endregion

  return new Uint8Array(ctx.getImageData(0, 0, 256, 1).data)
}

class WindGL {

  /**
   * @param {WebGLRenderingContext} gl 
   */
  constructor(gl) {
    this.gl = gl

    this.fadeOpacity = 0.98
    this.speedFactor = 0.15
    this.dropRate = 0.003
    this.dropRateBump = 0.01

    /**
     * @type {number} 粒子状态纹理的分辨率，默认是完全平方后的粒子数的算术平方根
     */
    this.particleStateResolution = 0
    this._particleCounts = 0

    this.particleIndexBuffer = void 0
    this.particleStateTexture0 = void 0
    this.particleStateTexture1 = void 0
    this.windTexture = void 0

    this.drawProgram = createProgram(gl, DRAW_VS, DRAW_FS)
    this.screenProgram = createProgram(gl, QUAD_VS, SCREEN_FS)
    this.updateProgram = createProgram(gl, QUAD_VS, UPDATE_FS)
    
    /**
     * 一个占据整个 viewport 的矩形的二维坐标 vbo，由俩二维三角形构成
     * @type {WebGLBuffer}
     */
    this.quadBuffer = createBuffer(gl, new Float32Array([0,0, 1,0, 0,1, 0,1, 1,0, 1,1]))

    /**
     * @type {WebGLFramebuffer} 离屏渲染用的 fbo
     */
    this.framebuffer = gl.createFramebuffer()

    this.setColorRamp(defaultRampColors)
    this.resize()
  }

  resize() {
    const gl = this.gl
    const w = gl.canvas.width
    const h = gl.canvas.height
    const emptyPixels = new Uint8Array(w * h * 4)
    this.backgroundTexture = createTexture(gl, gl.NEAREST, emptyPixels, w, h)
    this.screenTexture = createTexture(gl, gl.NEAREST, emptyPixels, w, h)
  }

  /**
   * 
   * @param {Map<number, string>} colors 
   */
  setColorRamp(colors) {
    this.colorRampTexture = createTexture(this.gl, this.gl.LINEAR, getColorRamp(colors), 16, 16)
  }

  set particleCounts(value) {
    const gl = this.gl

    //#region 计算一个安全的完全平方数，以确定是 2 的幂，对于纹理来说 2 的幂指数更合适
    this.particleStateResolution = Math.ceil(Math.sqrt(value))
    const particleSize = this.particleStateResolution
    this._particleCounts = particleSize ** 2
    //#endregion

    //#region 创建粒子状态纹理 1 和 2
    const particleState = new Uint8Array(this._particleCounts * 4)
    for (let i = 0; i < particleState.length; i++) {
      particleState[i] = Math.floor(Math.random() * 256)
    }
    this.particleStateTexture0 = createTexture(gl, gl.NEAREST, particleState, particleSize, particleSize)
    this.particleStateTexture1 = createTexture(gl, gl.NEAREST, particleState, particleSize, particleSize)
    //#endregion 

    //#region 创建粒子索引缓冲
    const particleIndices = new Float32Array(this._particleCounts)
    for (let i = 0; i < this._particleCounts; i++) {
      particleIndices[i] = i
    }
    this.particleIndexBuffer = createBuffer(gl, particleIndices)
    //#endregion
  }

  /**
   * @type {number} 粒子计数
   */
  get particleCounts() {
    return this._particleCounts
  }

  /**
   * 
   * @param {{
   *   image: BufferSource,
   *   uMax: number,
   *   uMin: number,
   *   vMax: number,
   *   vMin: number,
   *   width: number,
   *   height: number
   * }} windData 
   */
  setWind(windData) {
    this.windData = windData
    this.windTexture = createTexture(this.gl, this.gl.LINEAR, windData.image, 0, 0)
  }

  /**
   * 在外部主函数内的 rAF 内判断若存在 windData，则调用此方法执行绘制
   * 逻辑是：关闭深度和模板测试 -> 绑定纹理 -> 绘制屏幕 -> 刷新粒子
   */
  draw() {
    const gl = this.gl

    //#region 关闭深度测试和模板测试
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.STENCIL_TEST)
    //#endregion

    //#region 绑定纹理到第 i 个位置上
    bindTexture(gl, this.windTexture, 0)
    bindTexture(gl, this.particleStateTexture0, 1)
    //#endregion

    this.drawScreen()
    this.updateParticles()
  }

  /**
   * 绘制屏幕层到 fbo，即最前面的一层
   */
  drawScreen() {
    const gl = this.gl

    //#region 在 fbo 中绘制背景纹理和粒子
    bindFramebuffer(gl, this.framebuffer, this.screenTexture) // 即将把粒子绘制在屏幕纹理上
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)

    this.drawTexture(this.backgroundTexture, this.fadeOpacity) // 先画一层上一帧绘制好的背景纹理
    this.drawParticles() // 绘制新的粒子到屏幕纹理上

    bindFramebuffer(gl, null) // 绘制到 fbo 的任务完成
    //#endregion

    //#region 启用透明度，绘制最上层纹理，再关闭透明度
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA)
    this.drawTexture(this.screenTexture, 1.0)
    gl.disable(gl.BLEND)
    //#endregion

    //#region 将屏幕纹理往下压一层，再将当前屏幕纹理换成背景纹理，以供下一次重用绘制
    const temp = this.backgroundTexture
    this.backgroundTexture = this.screenTexture
    this.screenTexture = temp
    //#endregion
  }

  /**
   * 使用 quadBuffer 这个 四边形 绘制一张纹理，含指定透明度 opacity
   * @param {WebGLTexture} texture 
   * @param {number} opacity 
   */
  drawTexture(texture, opacity) {
    const gl = this.gl

    //#region 将着色器程序设为屏幕着色器，即绘制到最前面一层
    const program = this.screenProgram
    gl.useProgram(program.program)
    //#endregion

    //#region 设置绘制所需的 vbo、texture 和 uniform
    // @ts-ignore
    bindAttribute(gl, this.quadBuffer, program['a_pos'], 2)
    bindTexture(gl, texture, 2)
    gl.uniform1i(program['u_screen'], 2)
    gl.uniform1f(program['u_opacity'], opacity)
    //#endregion

    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  /**
   * 调用绘制粒子的着色器程序，传递 vbo 和 uniform 到 webgl pipeline，并使用 POINTS 模式 drawArrays
   */
  drawParticles() {
    const gl = this.gl

    //#region 调用绘制粒子的着色器程序
    const program = this.drawProgram
    gl.useProgram(program.program)
    //#endregion

    //#region 绑定粒子所需的 VBO、uniform，并执行 POINTS 模式的 drawArrays 
    // @ts-ignore
    bindAttribute(gl, this.particleIndexBuffer, program['a_index'], 1)
    bindTexture(gl, this.colorRampTexture, 2)

    // 三个 sampler2D 类型的 uniform，需要从 0、1、2 三个纹理单元位置（即 bindTexture 函数激活的纹理）传入 WebGLTexture 对象
    gl.uniform1i(program['u_wind'], 0)
    gl.uniform1i(program['u_particles'], 1)
    gl.uniform1i(program['u_color_ramp'], 2)

    // 传入粒子分辨率
    gl.uniform1f(program['u_particles_res'], this.particleStateResolution)
    // 传入两个方向的最大最小风速
    gl.uniform2f(program['u_wind_min'], this.windData.uMin, this.windData.vMin)
    gl.uniform2f(program['u_wind_max'], this.windData.uMax, this.windData.vMax)

    gl.drawArrays(gl.POINTS, 0, this._particleCounts)
    //#endregion
  }

  updateParticles() {
    const gl = this.gl
    bindFramebuffer(gl, this.framebuffer, this.particleStateTexture1)
    gl.viewport(0, 0, this.particleStateResolution, this.particleStateResolution)

    const program = this.updateProgram
    gl.useProgram(program.program)

    // @ts-ignore
    bindAttribute(gl, this.quadBuffer, program['a_pos'], 2)

    gl.uniform1i(program['u_wind'], 0)
    gl.uniform1i(program['u_particles'], 1)

    gl.uniform1f(program['u_rand_seed'], Math.random())
    gl.uniform2f(program['u_wind_res'], this.windData.width, this.windData.height)
    gl.uniform2f(program['u_wind_min'], this.windData.uMin, this.windData.vMin)
    gl.uniform2f(program['u_wind_max'], this.windData.uMax, this.windData.vMax)
    gl.uniform1f(program['u_speed_factor'], this.speedFactor)
    gl.uniform1f(program['u_drop_rate'], this.dropRate)
    gl.uniform1f(program['u_drop_rate_bump'], this.dropRateBump)

    gl.drawArrays(gl.TRIANGLES, 0, 6)

    const temp = this.particleStateTexture0
    this.particleStateTexture0 = this.particleStateTexture1
    this.particleStateTexture1 = temp
  }
}

export default WindGL
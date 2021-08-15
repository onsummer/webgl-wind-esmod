/**
 * 创建着色器
 * @param {WebGLRenderingContext} gl 
 * @param {number} type 
 * @param {string} source 
 * 
 * @throws {Error}
 * 
 * @returns {WebGLShader}
 */
export const createShader = (gl, type, source) => {
  const _shader = gl.createShader(type)

  gl.shaderSource(_shader, source)
  gl.compileShader(_shader)
  // 检查编译状态，有异常抛出
  if (!gl.getShaderParameter(_shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(_shader))
  }

  return _shader
}

/**
 * 创建着色器并直接编译链接 vs、fs，返回着色器程序和 attribute、uniform 的位置信息
 * @param {WebGLRenderingContext} gl 
 * @param {string} vs 
 * @param {string} fs 
 * 
 * @returns {{
 *   program: WebGLProgram,
 *   [key: string]: number | WebGLUniformLocation
 * }}
 */
export const createProgram = (gl, vs, fs) => {
  const _prog = gl.createProgram()

  const vsShader = createShader(gl, gl.VERTEX_SHADER, vs)
  const fsShader = createShader(gl, gl.FRAGMENT_SHADER, fs)
  gl.attachShader(_prog, vsShader)
  gl.attachShader(_prog, fsShader)
  gl.linkProgram(_prog)

  // 检查参数，有异常抛出
  if (!gl.getProgramParameter(_prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(_prog));
  }

  const wrapper = {
    program: _prog
  }

  // 获取 attribute 和 uniform 的位置，并与 program 绑在一个 obj 内
  const attributeCounts = gl.getProgramParameter(_prog, gl.ACTIVE_ATTRIBUTES)
  const uniformCounts = gl.getProgramParameter(_prog, gl.ACTIVE_UNIFORMS)
  for (let i = 0; i < attributeCounts; i++) {
    const attribute = gl.getActiveAttrib(_prog, i)
    wrapper[attribute.name] = gl.getAttribLocation(_prog, attribute.name)
  }
  for (let i = 0; i < uniformCounts; i++) {
    const uniform = gl.getActiveUniform(_prog, i)
    wrapper[uniform.name] = gl.getUniformLocation(_prog, uniform.name)
  }

  return wrapper
}

/**
 * 根据过滤条件、数据和纹理长宽创建一个 WebGLTexture
 * @param {WebGLRenderingContext} gl 
 * @param {number} filter 
 * @param {BufferSource | TexImageSource} data 
 * @param {number} width 
 * @param {number} height 
 * 
 * @returns {WebGLTexture}
 */
export const createTexture = (gl, filter, data, width, height) => {
  const TEXTURE2D = gl.TEXTURE_2D
  //#region 创建并立即绑定纹理
  const texture = gl.createTexture()
  gl.bindTexture(TEXTURE2D, texture)
  //#endregion

  //#region 设置纹理参数，放缩、采样等
  gl.texParameteri(TEXTURE2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(TEXTURE2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(TEXTURE2D, gl.TEXTURE_MIN_FILTER, filter)
  gl.texParameteri(TEXTURE2D, gl.TEXTURE_MAG_FILTER, filter)
  //#endregion

  //#region 使用 texImage2D 方法传递 TypedArray 数据给 texture（GPU）
  if (data instanceof Uint8Array) {
    gl.texImage2D(TEXTURE2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
  } else {
    // @ts-ignore
    gl.texImage2D(TEXTURE2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data)
  }
  //#endregion

  //#region 一切就绪，解绑
  gl.bindTexture(TEXTURE2D, null)
  //#endregion

  return texture
}

/**
 * 激活基于 TEXTURE0 之后的第 unit 个纹理并绑定
 * @param {WebGLRenderingContext} gl 
 * @param {WebGLTexture} texture 
 * @param {number} unit 
 */
export const bindTexture = (gl, texture, unit) => {
  gl.activeTexture(gl.TEXTURE0 + unit) // 因为有可能会用到两张以上的纹理，所以要激活不同的纹理，基于 TEXTURE0 递进 unit 个纹理用来绑定
  gl.bindTexture(gl.TEXTURE_2D, texture)
}

/**
 * 创建并赋予数据给 WebGLBuffer
 * @param {WebGLRenderingContext} gl
 * @param {BufferSource | null} data
 * 
 * @returns {WebGLBuffer}
 */
export const createBuffer = (gl, data) => {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
  return buffer
}

/**
 * 绑定 vbo，启用 vbo 中的 attribute，并告诉 glsl 如何使用 vbo 中这个 attribute
 * @param {WebGLRenderingContext} gl 
 * @param {WebGLBuffer} buffer 
 * @param {number} attributeLocation 
 * @param {number} howMany 
 */
export const bindAttribute = (gl, buffer, attributeLocation, howMany) => {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.enableVertexAttribArray(attributeLocation)
  gl.vertexAttribPointer(attributeLocation, howMany, gl.FLOAT, false, 0, 0)
}

/**
 * 绑定 fbo，并将 texture 参数绑定到 fbo 的 颜色附件0 上
 * @param {WebGLRenderingContext} gl 
 * @param {WebGLFramebuffer} framebuffer 
 * @param {WebGLTexture} [texture] 
 */
export const bindFramebuffer = (gl, framebuffer, texture) => {
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  if (texture) {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  }
}
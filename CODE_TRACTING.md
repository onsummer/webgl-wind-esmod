# 1 WindGL 成员变量

- 着色器程序（`WebGLProgram`）
  - drawProgram
  - screenProgram
  - updateProgram
- 纹理对象（`WebGLTexture`）
  - windTexture
  - backgroundTexture
  - screenTexture
  - colorRampTexture
  - particleStateTexture0
  - particleStateTexture1
- 帧缓存对象（`WebGLFramebuffer`）
  - framebuffer
- 图形缓存对象（`WebGLBuffer`）
  - quadBuffer
  - particleIndexBuffer
- 风场数据对象（`object`）
  - windData

# 2 渲染流程

main 函数的 rAF 启动后，会判断 `wind（WindGL）` 上的 `windData` 是否存在，存在则调用 `draw` 方法。

## ① draw()

draw 方法：关闭深度和模板测试，绑定两个纹理对象到 0 和 1 号纹理位置上，顺次执行 drawScreen 和 updateParticles 方法。

这个方法控制渲染一帧的全流程。

## ② drawScreen()

1. 绑定 fbo
2. 绘制 backgroundTexture
3. drawParticles()
4. 解绑 fbo
5. 绘制 screenTexture
6. 交换屏幕纹理对象和背景纹理对象，下一次绘制到 screen 纹理上

绑定 fbo 这一步很有意思，它把屏幕纹理附着到 fbo 的颜色附件上了

``` js
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
```

### ②.a - 绘制 backgroundTexture

最起初是一个全部像素值是 0 的纹理。而后这个将作为“下面的一层”再调低点透明度，作为一个底图，而 `screenTexture` 则正当叠在它上面。

**注意，这一步是把 backgroundTexture 绘制到 fbo 的颜色附件上的。**

### ②.b - drawParticles()

这一步用到了 `drawProgram`，用到的 position attribute 的 vbo 是 particleIndexBuffer：

``` js
const particleIndices = new Float32Array(this._particleCounts)
for (let i = 0; i < this._particleCounts; i++) {
  particleIndices[i] = i
}
this.particleIndexBuffer = createBuffer(gl, particleIndices)
```

这个方法绘制的是 `POINTS` 而不是三角形了。

#### drawProgram 的顶点着色器

``` glsl
precision mediump float;

attribute float a_index;

uniform sampler2D u_particles;
uniform float u_particles_res;

varying vec2 v_particle_pos;

void main() {
  vec4 color = texture2D(u_particles, vec2(
    fract(a_index / u_particles_res),
    floor(a_index / u_particles_res) / u_particles_res));

  // decode current particle position from the pixel's RGBA value
  v_particle_pos = vec2(
    color.r / 255.0 + color.b,
    color.g / 255.0 + color.a);

  gl_PointSize = 1.0;
  gl_Position = vec4(2.0 * v_particle_pos.x - 1.0, 1.0 - 2.0 * v_particle_pos.y, 0, 1);
}
```

可以看到，它通过对 `particleStateTexture0` 这个纹理采样得到的颜色，进行解码，进而得到粒子坐标。如何取合适的 uv 坐标（uv坐标一定介于 0~1）呢？

``` glsl
vec2(fract(a_index / u_particles_res), floor(a_index / u_particles_res) / u_particles_res);
```

`a_index` 是从 0 到坐标个数 65536 的整数值，而 `u_particles_res` 则是纹理的长宽分辨率，在这里是 256。

例如 `a_index / u_particles_res` 的结果是 7621 / 256 = 29.76953125，那么 `floor(29.76953125)` 是 29，再除以 256 一定能回到 [0,1]

那么 `fract(29.76953125)` 等价 `29.76953125 - floor(29.76953125)`，即 0.76953125，也能回到 [0,1]。

至于从 rgba 解码到坐标，那是之前的文章写过的了。实际上 `v_particle_pos` 这个坐标的坐标值是介于 [0,1] 的。（texture2D 返回的 vec4 就是 0~1 的）

最后，还是对坐标进行了一定的窗口缩放运算的。

``` glsl
vec4(2.0 * v_particle_pos.x - 1.0, 1.0 - 2.0 * v_particle_pos.y, 0, 1);
```

#### drawProgram 的片元着色器

``` glsl
precision mediump float;

uniform sampler2D u_wind;
uniform vec2 u_wind_min;
uniform vec2 u_wind_max;
uniform sampler2D u_color_ramp;

varying vec2 v_particle_pos;

void main() {
  vec2 velocity = mix(u_wind_min, u_wind_max, texture2D(u_wind, v_particle_pos).rg);
  float speed_t = length(velocity) / length(u_wind_max);

  // color ramp is encoded in a 16x16 texture
  vec2 ramp_pos = vec2(
    fract(16.0 * speed_t),
    floor(16.0 * speed_t) / 16.0);

  gl_FragColor = texture2D(u_color_ramp, ramp_pos);
}
```

此处用到了风力纹理、风力uv方向的最大最小值、给粒子着色的渐变色带纹理以及粒子坐标。

做两件事：计算粒子的速度，进而计算粒子的颜色。

粒子坐标由顶点着色器传来，在风力数据上采样得到的 rg 两个通道值，即 速度值。使用 `mix` 函数混合最大最小值与采样值。

mix 函数的一般定义是：

``` 
mix(x, y, a) = x * (1 - a) + y * a
```

得到风速值向量 `velocity`。然后计算归一化后的速度：

``` glsl
float speed_t = length(velocity) / length(u_wind_max); // speed_t 一定在 0~1
```

确定如何在渐变色带上采样：

``` glsl
vec2(fract(16.0 * speed_t), floor(16.0 * speed_t) / 16.0);
```

考虑到渐变色带的 `u_color_ramp`  已经被编码到 16 x 16 像素的纹理：

``` js
setColorRamp(colors) {
  this.colorRampTexture = createTexture(this.gl, this.gl.LINEAR, getColorRamp(colors), 16, 16)
}
```

所以要使用 16 进行变换纹理坐标。

> 设 `speed_t` 是0.1，渐变色带转换成 16x16 的纹理后，共有 256 个像素格子，要确定第 25.6 个像素格子的纹理坐标，那就得看看它占多少行：
>
> 25.6 / 16 = 1 ... 0.6，所以占1行，还多0.6行，所以这一行就是 1/16 = 0.0625，所以纹理坐标是
>
> (0.6, 0.0625)
>
> 与 `vec2(fract(16.0 * speed_t), floor(16.0 * speed_t) / 16.0)` 计算的一致。

### ②.c - 绘制 screenTexture

到上一步结束后，background纹理已经绘制到 fbo 的颜色附件0，又叠加了一层粒子点，然后解除 fbo 的绑定，离屏渲染完成。

这一步，将 fbo 中颜色附件的 screenTexture 转绘到真正的 canvas 上，启用透明通道绘制原图。

然后关闭透明混合。使用的还是 quadBuffer 这个全区域。

### ②.d - 交换纹理

这一步，由于 backgroundTexture 已经完成使命，而 screenTexture 则需要等待下一帧作为渐隐半透明背景绘制，所以将 screenTexture 的身份转移到 backgroundTexture 上，而方便起见，把这一帧的 backgroundTexture 又还给 screenTexture，供下一帧在此 screenTexture 上继续作画。

> 总结②
>
> 绘制 backgroundTexture（就上一帧的成果，但是要稍微透明一点以显示渐隐的效果），然后绘制粒子，这两次绘制是绘制到 fbo 中的颜色附件，这个颜色附件的目标就是 screenTexture，而不是 canvas。
>
> 离屏绘制完成，将 screenTexture 正式绘制到 canvas。然后进入下一步：移动粒子。

## ③ updateParticles()

画完了，当前状态的粒子就没用了，要更新它们以备下一次 draw() 之前是新的粒子。

这一步完成在 glsl 中移动粒子坐标。



## ④ drawTexture()

使用某个 texture 和某个透明度绘制全窗口范围的矩形。

代码比较简单：

``` js
bindAttribute(gl, this.quadBuffer, program['a_pos'], 2)
bindTexture(gl, texture, 2)
gl.uniform1i(program['u_screen'], 2)
gl.uniform1f(program['u_opacity'], opacity)

gl.drawArrays(gl.TRIANGLES, 0, 6)
```

用到了 quadBuffer 这个矩形 vbo，绑定传入的 texture 到第 2 个坑位上，并传递给 `u_screen` 这个 sampler2d。

其重点是 `this.screenProgram` 这个着色器的代码。

### screenProgram 的顶点着色器

``` glsl
precision mediump float;

attribute vec2 a_pos;

varying vec2 v_tex_pos;

void main() {
  v_tex_pos = a_pos;
  gl_Position = vec4(1.0 - 2.0 * a_pos, 0, 1);
}
```

很简单，把传进来的顶点坐标作为 uv 直接甩给片元着色器，并将矩形拉伸到全绘图区域。

原来的 vbo 是这样的：

``` js
new Float32Array([0,0, 1,0, 0,1, 0,1, 1,0, 1,1])
```

即一个矩形，左下角是原点 `[0,0]`，右上角是 `[1,1]`。

拉伸后，就像是把这个矩形沿着自己的两条对角线分别镜像了一次，然后以右上角为锚点，将新的原点拉伸到 `[-1,-1]`。

实际上就是把 `[0,0]` 到 `[1,1]` 这么简单的四个坐标点，变成了这样一份 position + uv0：

| position | uv0   |
| -------- | ----- |
| [1,1]    | [0,0] |
| [-1,1]   | [1,0] |
| [1,-1]   | [0,1] |
| [-1,-1]  | [1,1] |

就是相当于把一张图放大了长宽的两倍，并上下镜像、左右镜像了一次。

### screenProgram 的片元着色器

``` glsl
precision mediump float;

uniform sampler2D u_screen;
uniform float u_opacity;

varying vec2 v_tex_pos;

void main() {
  vec4 color = texture2D(u_screen, 1.0 - v_tex_pos);
  // a hack to guarantee opacity fade out even with a value close to 1.0
  gl_FragColor = vec4(floor(255.0 * color * u_opacity) / 255.0);
}
```

这又有坑了，传进来的 uv 还得经过一次变换，用 `[1,1]` 减去，那么实际上的 uv 是：

| position | uv0 - 旧 | uv0 - 新 |
| -------- | -------- | -------- |
| [1,1]    | [0,0]    | [1,1]    |
| [-1,1]   | [1,0]    | [0,1]    |
| [1,-1]   | [0,1]    | [1,0]    |
| [-1,-1]  | [1,1]    | [0,0]    |

好家伙，又把图摆正了。这相当于把贴图长宽拉大了两倍而已。

最终算得的像元颜色是带透明度的，使用 `floor(255.0 * color * u_opacity) / 255.0` 是保证数值安全，先用 floor 函数去掉小数，再除以 255 以保证透明度在 1 内。


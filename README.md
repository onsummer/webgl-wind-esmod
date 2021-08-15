使用 vite + vanillajs 模板改写自 https://github.com/mapbox/webgl-wind 项目，原项目使用 rollup 作为打包器、开发服务器，本仓库更合适现代前端封装使用。

# 1 如何启动并查看效果

## 安装依赖

``` bash
npm i
# or
yarn
```

我推荐你使用 yarn，因为我上传了 yarn.lock 到仓库中。

## 启动开发服务器

``` bash
npm run dev
# or
yarn dev
```

随后在 3000 端口即可访问页面 http://localhost:3000/ 查看效果。

## 发布生产模式代码并预览

``` bash
npm run build && npm run serve
# or
yarn build && yarn serve
```

随后在 5000 端口即可访问页面 http://localhost:5000/ 查看发布后的效果。

# 2 项目结构说明

与 vite 默认配置、git默认文件、node包文件夹相同的文件、文件夹忽略说明，例如 `public`、`jsconfig.json`、`node_modules` 等。

```
+ /
  + src
    + shaders
      - draw.js
      - quad.js
      - screen.js
      - update.js
    - draw-world-on-canvas-coastline.js
    - glutils.js
    - windgl.js
  - index.html
  - main.js
  - style.css
```

## src/shaders

其下 4 个 js 文件导出的都是字符串常量，表示不同着色器程序用到的着色器源码。

## src/main.js

index.html 中导入的主入口文件，也是此项目的主入口文件，主要是一个异步函数，在 `window` 的 `DOMContentLoaded` 事件触发后执行。

## src/glutils.js

针对此示例代码封装的一些简易 webgl 函数，创建、绑定一些 webgl 中常用的对象用。

## src/windgl.js

导出 `WindGL` 类，负责接收 main 函数传入的风场数据，并刷新粒子状态、绘制粒子。

## src/draw-world-on-canvas-coastline.js

导出一个异步函数，供 main.js 中的 main 函数调用，作用是在 id 为 coastline 的 canvas 使用 canvas2d 绘制粗糙版的世界地图。（数据项目自带，在 `pulbic/data/world.geojson`）

## src/style.css

控制两个 canvas、html、body 元素的简单样式文件。

# 3 数据简介

## 风场元数据 public/data/2016112000.json

有六个值：

- width：数据宽度
- height：数据高度
- uMin：u方向风力最小值
- uMax：u方向风力最大值
- vMin：v方向风力最小值
- vMax：v方向风力最大值

此例为 360 宽度 × 180 高度，即逐整数经纬度对齐 png 的像元宽高
 
## 风场数据 public/data/2016112000.png
 
png 有 RGBA 四个通道，但是这里只用到了 R 和 G 通道，分别代表两个方向上的风速值。

# 4 其他

WebGLRenderingContext 上 TEXTURE{I} 的顺序：

- TEXTURE0：一直是风场数据，由 png 的像元 rgba 数据而来
- TEXTURE1：一直是 particleStateTexture0 对象指向的数据，粒子状态

# TODO

解析整个 draw 的过程，包含 glsl 代码逻辑（如何取粒子坐标、颜色，如何绘制粒子，如何更新粒子，如何交换 texture）。
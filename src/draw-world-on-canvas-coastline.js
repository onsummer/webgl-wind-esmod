/**
 * 在 canvas 上使用 CanvasRenderingContext2D 绘制世界边界
 * @param {HTMLCanvasElement} canvas
 * @param {number} pixelRatio 像素比例
 */
export const drawWorldPolyline = async (canvas, pixelRatio) => {
  const dataResponse = await fetch('/data/world.geojson')
  const data = await dataResponse.json()

  canvas.width = canvas.clientWidth * pixelRatio;
  canvas.height = canvas.clientHeight * pixelRatio;

  const ctx = canvas.getContext('2d');
  ctx.lineWidth = pixelRatio;
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.strokeStyle = 'white';
  ctx.beginPath();

  for (let i = 0; i < data.features.length; i++) {
    const line = data.features[i].geometry.coordinates;
    for (let j = 0; j < line.length; j++) {
      ctx[j ? 'lineTo' : 'moveTo'](
        (line[j][0] + 180) * canvas.width / 360,
        (-line[j][1] + 90) * canvas.height / 180);
    }
  }
  ctx.stroke();
}
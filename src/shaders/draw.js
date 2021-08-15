export const vs = /* glsl */`
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
`

export const fs = /* glsl */`
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
`
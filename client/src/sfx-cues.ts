// Start frame and frame count in assets/sfx/walnut-club.wav.
export const SFX_SAMPLE_RATE = 44_100;
export const SFX_CLIPS = {
  back: [[0, 5512]],
  blocked: [[5512, 9702]],
  button: [
    [15214, 3396],
    [18610, 3308],
  ],
  chair: [[21918, 16096]],
  chip_stack: [[38014, 13450]],
  chip_tap: [
    [51464, 4807],
    [56271, 4586],
  ],
  clock_tick: [[60857, 3749]],
  confirm: [[64606, 13803]],
  deal: [
    [78409, 5248],
    [83657, 5380],
  ],
  desk_bell: [[89037, 19624]],
  door: [[108661, 18081]],
  flip: [[126742, 7673]],
  gather: [[134415, 15611]],
  jukebox_switch: [[150026, 9393]],
  lift: [
    [159419, 3793],
    [163212, 3925],
  ],
  loss: [[167137, 18434]],
  message: [[185571, 7233]],
  needle: [[192804, 6527]],
  rank: [[199331, 6837]],
  selector: [[206168, 2691]],
  shuffle: [[208859, 54023]],
  slide: [
    [262882, 10408],
    [273290, 10452],
  ],
  step_carpet: [
    [283742, 6791],
    [290533, 7012],
  ],
  step_jade: [
    [297545, 7056],
    [304601, 7100],
  ],
  table_ready: [[311701, 13892]],
  turn: [[325593, 9703]],
  win: [[335296, 23549]],
} as const;

export type SfxCue = keyof typeof SFX_CLIPS;

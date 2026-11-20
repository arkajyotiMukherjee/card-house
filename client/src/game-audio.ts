import { musicUrl } from './game-music';
import { SFX_CLIPS, SFX_SAMPLE_RATE, type SfxCue } from './sfx-cues';

export type VolumeChannel = 'music' | 'sfx';
type MusicScene = 'menu' | 'lobby';
const VOLUME_STORAGE = 'cardhouseAudio';
const DEFAULT_VOLUME = { music: 35, sfx: 70 };

const MIN_INTERVAL: Partial<Record<SfxCue, number>> = {
  blocked: 160,
  deal: 55,
  flip: 140,
  gather: 110,
  lift: 135,
  selector: 100,
  turn: 400,
};
const RESULT_COMPANIONS: readonly SfxCue[] = [
  'chip_stack',
  'chip_tap',
  'clock_tick',
  'rank',
  'turn',
];

function volumePercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

class GameAudio {
  private volumes = { ...DEFAULT_VOLUME };
  private player?: HTMLAudioElement;
  private owner?: MusicScene;
  private file = '';
  private wantsPlayback = false;
  private needlePending = false;
  private context?: AudioContext;
  private musicGain?: GainNode;
  private sfxGain?: GainNode;
  private pack?: Promise<ArrayBuffer>;
  private decoded?: Promise<AudioBuffer>;
  private buffer?: AudioBuffer;
  private pending?: { cue: SfxCue; until: number };
  private readonly lastPlayed = new Map<SfxCue, number>();
  private readonly variants = new Map<SfxCue, number>();
  private readonly playing = new Map<AudioBufferSourceNode, SfxCue>();
  private resultUntil = 0;

  initialize(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(VOLUME_STORAGE) ?? '{}');
      for (const channel of ['music', 'sfx'] as const) {
        const value = saved?.[channel];
        if (Number.isFinite(value))
          this.volumes[channel] = volumePercent(value);
      }
    } catch {
      // Keep the defaults when browser storage is unavailable.
    }
    window.addEventListener('pointerdown', this.onGesture, true);
    window.addEventListener('pointerup', this.onGesture, true);
    window.addEventListener('keydown', this.onGesture, true);
    if (typeof AudioContext !== 'undefined' && this.volumes.sfx > 0)
      this.preload();
  }

  volume(channel: VolumeChannel): number {
    return this.volumes[channel];
  }

  setVolume(channel: VolumeChannel, value: number): void {
    const next = volumePercent(value);
    if (this.volumes[channel] === next) return;
    this.volumes[channel] = next;
    if (channel === 'music') this.applyMusicVolume();
    if (channel === 'sfx' && this.sfxGain) {
      this.sfxGain.gain.value = next / 100;
      if (next > 0) this.loadEffects();
      else this.pending = undefined;
    }
    try {
      localStorage.setItem(VOLUME_STORAGE, JSON.stringify(this.volumes));
    } catch {
      // The setting still applies in this tab.
    }
  }

  get isPlaying(): boolean {
    return this.player?.paused === false;
  }

  select(
    owner: MusicScene,
    file: string,
    playing = true,
    needle = false,
  ): void {
    this.owner = owner;
    this.wantsPlayback = playing;
    this.needlePending = needle && playing;
    if (!this.player) {
      this.player = new Audio();
      this.player.loop = true;
      this.player.preload = 'none';
      this.player.addEventListener('playing', () => {
        if (this.owner === 'lobby' && this.needlePending) {
          this.needlePending = false;
          this.play('needle');
        }
      });
      this.connectMusic();
      this.applyMusicVolume();
    }
    if (this.file !== file) {
      this.file = file;
      this.player.src = musicUrl(file);
    }
    if (playing) this.tryPlay();
    else this.player.pause();
  }

  stop(owner: MusicScene): void {
    if (this.owner !== owner) return;
    this.owner = undefined;
    this.wantsPlayback = false;
    this.needlePending = false;
    this.player?.pause();
  }

  play(cue: SfxCue): void {
    if (!this.context || this.volumes.sfx === 0 || document.hidden) return;
    const now = performance.now();
    if (RESULT_COMPANIONS.includes(cue) && now < this.resultUntil) return;
    if (
      now - (this.lastPlayed.get(cue) ?? -Infinity) <
      (MIN_INTERVAL[cue] ?? 0)
    )
      return;
    if (!this.buffer || this.context.state !== 'running') {
      if (!this.pending || now > this.pending.until)
        this.pending = { cue, until: now + 280 };
      return;
    }
    this.lastPlayed.set(cue, now);
    const takes = SFX_CLIPS[cue];
    const index = this.variants.get(cue) ?? 0;
    const [start, frames] = takes[index]!;
    this.variants.set(cue, (index + 1) % takes.length);
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    const gain = this.context.createGain();
    const repeatable = takes.length > 1;
    source.playbackRate.value = repeatable ? 0.97 + Math.random() * 0.06 : 1;
    gain.gain.value = repeatable ? 10 ** ((Math.random() * 2 - 1) / 20) : 1;
    source.connect(gain).connect(this.sfxGain!);
    this.playing.set(source, cue);
    source.onended = () => {
      this.playing.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    source.start(0, start / SFX_SAMPLE_RATE, frames / SFX_SAMPLE_RATE);
  }

  result(cue: 'win' | 'loss' | 'confirm'): void {
    this.resultUntil = performance.now() + 550;
    if (this.pending) this.pending = undefined;
    for (const [source, playing] of this.playing) {
      if (RESULT_COMPANIONS.includes(playing)) source.stop();
    }
    this.play(cue);
  }

  private connectMusic(): void {
    if (!this.context || !this.player || this.musicGain) return;
    this.musicGain = this.context.createGain();
    this.context.createMediaElementSource(this.player).connect(this.musicGain);
    this.musicGain.connect(this.context.destination);
    this.player.volume = 1;
    this.applyMusicVolume();
  }

  private applyMusicVolume(): void {
    const value = this.volumes.music / 100;
    if (!this.player) return;
    if (this.musicGain) this.musicGain.gain.value = value;
    else this.player.volume = value;
    this.player.muted = value === 0;
  }

  private preload(): void {
    this.pack ??= fetch(
      `${import.meta.env.BASE_URL}assets/sfx/walnut-club.wav`,
    ).then((response) => {
      if (!response.ok) throw new Error('Could not load the sound effects');
      return response.arrayBuffer();
    });
    void this.pack.catch(() => {
      this.pack = undefined;
    });
  }

  private loadEffects(): void {
    const context = this.context;
    if (!context || this.decoded) return;
    this.preload();
    this.decoded = this.pack!.then((data) => context.decodeAudioData(data));
    void this.decoded.then(
      (buffer) => {
        this.buffer = buffer;
        this.flushPending();
      },
      () => {
        this.decoded = undefined;
        this.pack = undefined;
      },
    );
  }

  private flushPending(): void {
    if (!this.buffer || this.context?.state !== 'running') return;
    const pending = this.pending;
    this.pending = undefined;
    if (pending && performance.now() <= pending.until) this.play(pending.cue);
  }

  private readonly onGesture = (event: Event): void => {
    // Touch unlocks audio on release. Mouse can warm it up on press.
    if (
      event.type === 'pointerdown' &&
      (event as PointerEvent).pointerType !== 'mouse'
    )
      return;
    if (!this.context && typeof AudioContext !== 'undefined') {
      this.context = new AudioContext();
      this.sfxGain = this.context.createGain();
      this.sfxGain.gain.value = this.volumes.sfx / 100;
      this.sfxGain.connect(this.context.destination);
      this.connectMusic();
    }
    if (this.volumes.sfx > 0) this.loadEffects();
    if (this.context?.state !== 'running')
      void this.context?.resume().then(
        () => this.flushPending(),
        () => {},
      );
    this.tryPlay();
  };

  private tryPlay(): void {
    if (this.wantsPlayback && this.player?.paused)
      void this.player.play().catch(() => {
        // Browsers can wait for a user gesture before allowing playback.
      });
  }
}

export const gameAudio = new GameAudio();

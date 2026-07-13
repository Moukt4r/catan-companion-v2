export type SoundCue = "roll" | "advance" | "event" | "confirm";

const cueFrequencies: Record<SoundCue, number[]> = {
  advance: [196, 174],
  confirm: [392, 523],
  event: [330, 440, 554],
  roll: [220, 277, 330],
};

export class AudioCues {
  private context: AudioContext | null = null;

  async play(cue: SoundCue): Promise<void> {
    const context = this.getContext();
    if (context.state === "suspended") {
      await context.resume();
    }

    const start = context.currentTime;
    const frequencies = cueFrequencies[cue];

    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const cueStart = start + index * 0.07;
      const cueEnd = cueStart + 0.11;

      oscillator.type = cue === "advance" ? "square" : "sine";
      oscillator.frequency.setValueAtTime(frequency, cueStart);
      gain.gain.setValueAtTime(0.0001, cueStart);
      gain.gain.exponentialRampToValueAtTime(0.08, cueStart + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, cueEnd);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(cueStart);
      oscillator.stop(cueEnd);
    });
  }

  close(): void {
    if (this.context) {
      void this.context.close();
      this.context = null;
    }
  }

  private getContext(): AudioContext {
    this.context ??= new AudioContext();
    return this.context;
  }
}

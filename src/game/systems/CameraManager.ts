export class CameraManager {
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private stream: MediaStream | null = null;
  private isRunning: boolean = false;
  private animFrameId: number | null = null;
  private prevFrameData: Uint8ClampedArray | null = null;
  private onHandXUpdate?: (xRatio: number) => void;

  public async startCamera(
    previewVideoElement: HTMLVideoElement | null,
    onHandXUpdate: (xRatio: number) => void
  ): Promise<boolean> {
    this.onHandXUpdate = onHandXUpdate;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: false,
      });

      if (previewVideoElement) {
        this.video = previewVideoElement;
        this.video.srcObject = this.stream;
        await this.video.play();
      } else {
        this.video = document.createElement('video');
        this.video.width = 320;
        this.video.height = 240;
        this.video.srcObject = this.stream;
        await this.video.play();
      }

      this.canvas = document.createElement('canvas');
      this.canvas.width = 160;
      this.canvas.height = 120;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

      this.isRunning = true;
      this.processLoop();
      return true;
    } catch (err) {
      console.warn('Camera access denied or unavailable:', err);
      this.stopCamera();
      return false;
    }
  }

  private processLoop = () => {
    if (!this.isRunning || !this.video || !this.ctx || !this.canvas) return;

    if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
      this.ctx.drawImage(this.video, 0, 0, 160, 120);
      const frame = this.ctx.getImageData(0, 0, 160, 120);
      const data = frame.data;

      let sumX = 0;
      let count = 0;

      // Motion detection / bright hand region detection
      if (this.prevFrameData) {
        for (let y = 20; y < 100; y += 2) {
          for (let x = 10; x < 150; x += 2) {
            const idx = (y * 160 + x) * 4;
            const diff =
              Math.abs(data[idx] - this.prevFrameData[idx]) +
              Math.abs(data[idx + 1] - this.prevFrameData[idx + 1]) +
              Math.abs(data[idx + 2] - this.prevFrameData[idx + 2]);

            // If pixel changed noticeably (motion of hand/body)
            if (diff > 50) {
              sumX += x;
              count++;
            }
          }
        }
      }

      this.prevFrameData = new Uint8ClampedArray(data);

      if (count > 15) {
        const avgX = sumX / count;
        // Mirror the video input horizontally so moving right moves right
        const mirroredX = 160 - avgX;
        const ratio = mirroredX / 160; // 0.0 to 1.0
        this.onHandXUpdate?.(ratio);
      }
    }

    this.animFrameId = requestAnimationFrame(this.processLoop);
  };

  public stopCamera() {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.video = null;
    this.prevFrameData = null;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }
}

export const cameraManager = new CameraManager();

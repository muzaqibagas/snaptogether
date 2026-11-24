import { onUnmounted, ref } from 'vue';

export interface ZoomCapabilities {
  min: number;
  max: number;
  step: number;
}

type ZoomTrackCapabilities = MediaTrackCapabilities & {
  zoom?: { min?: number; max?: number; step?: number };
};

type ZoomTrackSettings = MediaTrackSettings & {
  zoom?: number;
};

export function useCamera() {
  const stream = ref<MediaStream | null>(null);
  const facingMode = ref<'user' | 'environment'>('user');
  const isMirrored = ref(true);
  const availableDevices = ref<MediaDeviceInfo[]>([]);
  const selectedDeviceId = ref<string>('');
  const isStarting = ref(false);
  const errorMessage = ref<string | null>(null);
  const zoomCapabilities = ref<ZoomCapabilities | null>(null);
  const zoomLevel = ref<number>(1);

  function stopCamera() {
    if (stream.value) {
      stream.value.getTracks().forEach((track) => track.stop());
      stream.value = null;
    }
    zoomCapabilities.value = null;
    zoomLevel.value = 1;
  }

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      availableDevices.value = devices.filter((d) => d.kind === 'videoinput');
    } catch {
      // ignore enumeration errors
    }
  }

  async function setZoom(targetZoom: number): Promise<void> {
    const track = stream.value?.getVideoTracks()[0];
    const caps = zoomCapabilities.value;
    if (!track || !caps) return;

    const clamped = Math.min(caps.max, Math.max(caps.min, Number(targetZoom.toFixed(2))));
    try {
      await track.applyConstraints({
        advanced: [{ zoom: clamped } as MediaTrackConstraintSet],
      });
      zoomLevel.value = clamped;
    } catch {
      // ignore unsupported zoom constraint on specific devices
    }
  }

  async function syncZoomCapabilities(track: MediaStreamTrack | undefined) {
    if (!track || typeof track.getCapabilities !== 'function') {
      zoomCapabilities.value = null;
      return;
    }

    try {
      const caps = track.getCapabilities() as ZoomTrackCapabilities;
      const z = caps.zoom;
      if (!z || typeof z.min !== 'number' || typeof z.max !== 'number' || z.max <= z.min) {
        zoomCapabilities.value = null;
        return;
      }

      const step = typeof z.step === 'number' && z.step > 0 ? z.step : 0.1;
      zoomCapabilities.value = { min: z.min, max: z.max, step };

      const settings = (track.getSettings?.() ?? {}) as ZoomTrackSettings;
      const current = typeof settings.zoom === 'number' ? settings.zoom : 1;
      zoomLevel.value = current;

      // Prevent unintended >1x zoom on mobile camera startup
      if (current > 1 && z.min <= 1) {
        await setZoom(1);
      }
    } catch {
      zoomCapabilities.value = null;
    }
  }

  async function startCamera(explicitDeviceId?: string): Promise<MediaStream | null> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      errorMessage.value =
        'Browser ini tidak mendukung akses kamera atau situs tidak berjalan di HTTPS / localhost.';
      return null;
    }

    isStarting.value = true;
    errorMessage.value = null;
    stopCamera();

    const isMobile =
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (typeof window !== 'undefined' && window.innerWidth < 768);

    // On mobile, avoid forcing portrait width<height or 1080p dimensions so Android/iOS won't apply crop-and-scale or EIS zoom
    const baseConstraints: MediaTrackConstraints = explicitDeviceId
      ? { deviceId: { exact: explicitDeviceId } }
      : { facingMode: { ideal: facingMode.value } };

    const preferredConstraints: MediaTrackConstraints = isMobile
      ? ({
          ...baseConstraints,
          resizeMode: 'none',
        } as MediaTrackConstraints)
      : {
          ...baseConstraints,
          width: { ideal: 1280 },
          height: { ideal: 960 },
        };

    try {
      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: preferredConstraints,
          audio: false,
        });
      } catch {
        // Fallback if browser rejects resizeMode or ideal constraints
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: baseConstraints,
          audio: false,
        });
      }

      stream.value = mediaStream;
      const track = mediaStream.getVideoTracks()[0];
      const settings = track?.getSettings();
      if (settings?.deviceId) {
        selectedDeviceId.value = settings.deviceId;
      }

      await syncZoomCapabilities(track);
      await refreshDevices();
      return mediaStream;
    } catch (err) {
      const e = err as DOMException;
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        errorMessage.value = 'Izin kamera ditolak. Aktifkan izin kamera pada browser Anda lalu coba lagi.';
      } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        errorMessage.value = 'Kamera tidak ditemukan pada perangkat ini.';
      } else {
        errorMessage.value = `Gagal mengakses kamera: ${e.message || 'Unknown error'}`;
      }
      return null;
    } finally {
      isStarting.value = false;
    }
  }

  async function toggleFacingMode() {
    facingMode.value = facingMode.value === 'user' ? 'environment' : 'user';
    isMirrored.value = facingMode.value === 'user';
    selectedDeviceId.value = '';
    await startCamera();
  }

  async function selectDevice(deviceId: string) {
    selectedDeviceId.value = deviceId;
    await startCamera(deviceId);
  }

  function toggleMirror() {
    isMirrored.value = !isMirrored.value;
  }

  onUnmounted(() => {
    stopCamera();
  });

  return {
    stream,
    facingMode,
    isMirrored,
    availableDevices,
    selectedDeviceId,
    isStarting,
    errorMessage,
    zoomCapabilities,
    zoomLevel,
    startCamera,
    stopCamera,
    toggleFacingMode,
    selectDevice,
    toggleMirror,
    setZoom,
  };
}

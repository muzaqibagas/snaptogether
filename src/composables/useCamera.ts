import { onUnmounted, ref } from 'vue';

export function useCamera() {
  const stream = ref<MediaStream | null>(null);
  const facingMode = ref<'user' | 'environment'>('user');
  const isMirrored = ref(true);
  const availableDevices = ref<MediaDeviceInfo[]>([]);
  const selectedDeviceId = ref<string>('');
  const isStarting = ref(false);
  const errorMessage = ref<string | null>(null);

  function stopCamera() {
    if (stream.value) {
      stream.value.getTracks().forEach((track) => track.stop());
      stream.value = null;
    }
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

  async function startCamera(explicitDeviceId?: string): Promise<MediaStream | null> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      errorMessage.value =
        'Browser ini tidak mendukung akses kamera atau situs tidak berjalan di HTTPS / localhost.';
      return null;
    }

    isStarting.value = true;
    errorMessage.value = null;
    stopCamera();

    const videoConstraints: MediaTrackConstraints = explicitDeviceId
      ? {
          deviceId: { exact: explicitDeviceId },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        }
      : {
          facingMode: { ideal: facingMode.value },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        };

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });

      stream.value = mediaStream;
      const track = mediaStream.getVideoTracks()[0];
      const settings = track?.getSettings();
      if (settings?.deviceId) {
        selectedDeviceId.value = settings.deviceId;
      }

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
    startCamera,
    stopCamera,
    toggleFacingMode,
    selectDevice,
    toggleMirror,
  };
}

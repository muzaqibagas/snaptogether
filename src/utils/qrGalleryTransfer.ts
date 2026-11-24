import Peer, { type DataConnection } from 'peerjs';
import type { GeneratedAssets } from '../types/booth';

export interface SerializedGalleryAsset {
  key: 'mainFramedPng' | 'livePhotoVideo' | 'storyVideo' | 'rawPose';
  filename: string;
  mimeType: string;
  poseIndex?: number;
  buffer: ArrayBuffer;
}

export interface GalleryManifest {
  type: 'manifest';
  sessionLabel: string;
  items: Array<{
    id: string;
    key: SerializedGalleryAsset['key'];
    filename: string;
    mimeType: string;
    poseIndex?: number;
    size: number;
  }>;
}

export interface GalleryFilePayload {
  type: 'file';
  id: string;
  key: SerializedGalleryAsset['key'];
  filename: string;
  mimeType: string;
  poseIndex?: number;
  buffer: ArrayBuffer;
}

export interface CloudGalleryLinks {
  mainFramedPngUrl?: string;
  livePhotoVideoUrl?: string;
  storyVideoUrl?: string;
  rawPoseUrls: string[];
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_CLOUDINARY_CLOUD_NAME &&
      import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET,
  );
}

async function uploadBlobToCloudinary(blob: Blob, filename: string, resourceType: 'image' | 'video'): Promise<string> {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !preset) {
    throw new Error('Cloudinary belum dikonfigurasi.');
  }

  const formData = new FormData();
  formData.append('file', blob, filename);
  formData.append('upload_preset', preset);
  formData.append('tags', 'snaptogether_temp');

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Upload gagal (${res.status})`);
  }

  const json = (await res.json()) as { secure_url?: string };
  if (!json.secure_url) {
    throw new Error('URL hasil upload tidak ditemukan.');
  }
  return json.secure_url;
}

export async function uploadAssetsToCloud(assets: GeneratedAssets): Promise<CloudGalleryLinks> {
  const links: CloudGalleryLinks = { rawPoseUrls: [] };

  if (assets.mainFramedPng.blob) {
    links.mainFramedPngUrl = await uploadBlobToCloudinary(
      assets.mainFramedPng.blob,
      assets.mainFramedPng.filename,
      'image',
    );
  }
  if (assets.livePhotoVideo.blob) {
    links.livePhotoVideoUrl = await uploadBlobToCloudinary(
      assets.livePhotoVideo.blob,
      assets.livePhotoVideo.filename,
      'video',
    );
  }
  if (assets.storyVideo.blob) {
    links.storyVideoUrl = await uploadBlobToCloudinary(
      assets.storyVideo.blob,
      assets.storyVideo.filename,
      'video',
    );
  }
  for (const raw of assets.rawPoses) {
    const url = await uploadBlobToCloudinary(raw.blob, raw.filename, 'image');
    links.rawPoseUrls.push(url);
  }

  return links;
}

/**
 * Starts a temporary PeerJS file-serving host so any phone scanning the QR code
 * can receive all 4 generated assets P2P with zero cloud storage required.
 */
export function createQrGallerySender(
  getAssets: () => GeneratedAssets | null,
  onPeerReady: (peerId: string) => void,
  onClientTransfer?: () => void,
): { destroy: () => void } {
  const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const peerId = `st-gal-${randomCode}`;
  const peer = new Peer(peerId, {
    config: {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
    },
  });

  const activeConnections = new Set<DataConnection>();

  peer.on('open', (id) => {
    onPeerReady(id);
  });

  peer.on('connection', (conn) => {
    activeConnections.add(conn);
    conn.on('open', async () => {
      const assets = getAssets();
      if (!assets) {
        conn.send({ type: 'error', message: 'Aset sesi belum siap atau sudah kedaluwarsa.' });
        return;
      }

      onClientTransfer?.();

      const queue: Array<{
        id: string;
        key: SerializedGalleryAsset['key'];
        blob: Blob;
        filename: string;
        mimeType: string;
        poseIndex?: number;
      }> = [];

      if (assets.mainFramedPng.blob) {
        queue.push({
          id: 'main-png',
          key: 'mainFramedPng',
          blob: assets.mainFramedPng.blob,
          filename: assets.mainFramedPng.filename,
          mimeType: assets.mainFramedPng.mimeType,
        });
      }
      if (assets.livePhotoVideo.blob) {
        queue.push({
          id: 'live-video',
          key: 'livePhotoVideo',
          blob: assets.livePhotoVideo.blob,
          filename: assets.livePhotoVideo.filename,
          mimeType: assets.livePhotoVideo.mimeType,
        });
      }
      if (assets.storyVideo.blob) {
        queue.push({
          id: 'story-video',
          key: 'storyVideo',
          blob: assets.storyVideo.blob,
          filename: assets.storyVideo.filename,
          mimeType: assets.storyVideo.mimeType,
        });
      }
      for (const raw of assets.rawPoses) {
        queue.push({
          id: `raw-${raw.poseIndex}`,
          key: 'rawPose',
          blob: raw.blob,
          filename: raw.filename,
          mimeType: 'image/png',
          poseIndex: raw.poseIndex,
        });
      }

      const manifest: GalleryManifest = {
        type: 'manifest',
        sessionLabel: 'SnapTogether Digital Gallery',
        items: queue.map((q) => ({
          id: q.id,
          key: q.key,
          filename: q.filename,
          mimeType: q.mimeType,
          poseIndex: q.poseIndex,
          size: q.blob.size,
        })),
      };

      conn.send(manifest);

      for (const item of queue) {
        const buffer = await item.blob.arrayBuffer();
        const payload: GalleryFilePayload = {
          type: 'file',
          id: item.id,
          key: item.key,
          filename: item.filename,
          mimeType: item.mimeType,
          poseIndex: item.poseIndex,
          buffer,
        };
        conn.send(payload);
      }
    });

    conn.on('close', () => activeConnections.delete(conn));
  });

  return {
    destroy: () => {
      activeConnections.forEach((c) => c.close());
      activeConnections.clear();
      peer.destroy();
    },
  };
}

/**
 * Connects from a phone scanning the QR code to the active photobooth session to receive all 4 assets P2P.
 */
export function connectQrGalleryReceiver(
  hostPeerId: string,
  callbacks: {
    onStatus: (msg: string) => void;
    onProgress: (received: number, total: number) => void;
    onComplete: (assets: GeneratedAssets) => void;
    onError: (msg: string) => void;
  },
): { destroy: () => void } {
  const peer = new Peer({
    config: {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
    },
  });

  let totalItems = 0;
  let receivedCount = 0;
  const result: GeneratedAssets = {
    mainFramedPng: { blob: null, url: null, filename: 'snaptogether-frame.png', mimeType: 'image/png' },
    livePhotoVideo: { blob: null, url: null, filename: 'snaptogether-live.mp4', mimeType: 'video/mp4' },
    storyVideo: { blob: null, url: null, filename: 'snaptogether-story.mp4', mimeType: 'video/mp4' },
    rawPoses: [],
  };

  let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    callbacks.onError('Koneksi ke sesi photobooth habis waktu. Pastikan tab sesi di perangkat utama masih terbuka.');
  }, 15000);

  peer.on('open', () => {
    callbacks.onStatus('Menghubungkan ke sesi photobooth...');
    const conn = peer.connect(hostPeerId, { reliable: true });

    conn.on('open', () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      callbacks.onStatus('Mengunduh foto & video Live Photo...');
    });

    conn.on('data', (rawData) => {
      const msg = rawData as GalleryManifest | GalleryFilePayload | { type: 'error'; message: string };
      if (msg.type === 'error') {
        callbacks.onError(msg.message);
        return;
      }
      if (msg.type === 'manifest') {
        totalItems = msg.items.length;
        callbacks.onProgress(0, totalItems);
        return;
      }
      if (msg.type === 'file') {
        const blob = new Blob([msg.buffer], { type: msg.mimeType });
        const url = URL.createObjectURL(blob);

        if (msg.key === 'mainFramedPng') {
          result.mainFramedPng = { blob, url, filename: msg.filename, mimeType: msg.mimeType };
        } else if (msg.key === 'livePhotoVideo') {
          result.livePhotoVideo = { blob, url, filename: msg.filename, mimeType: msg.mimeType };
        } else if (msg.key === 'storyVideo') {
          result.storyVideo = { blob, url, filename: msg.filename, mimeType: msg.mimeType };
        } else if (msg.key === 'rawPose') {
          result.rawPoses.push({
            poseIndex: msg.poseIndex ?? result.rawPoses.length,
            blob,
            url,
            filename: msg.filename,
          });
        }

        receivedCount++;
        callbacks.onProgress(receivedCount, Math.max(totalItems, receivedCount));

        if (totalItems > 0 && receivedCount >= totalItems) {
          result.rawPoses.sort((a, b) => a.poseIndex - b.poseIndex);
          callbacks.onComplete(result);
        }
      }
    });

    conn.on('error', () => {
      callbacks.onError('Gagal terhubung ke sesi photobooth.');
    });
  });

  peer.on('error', () => {
    callbacks.onError('Sesi photobooth tidak ditemukan atau sudah berakhir (timeout 10 menit).');
  });

  return {
    destroy: () => {
      if (timeoutId) clearTimeout(timeoutId);
      peer.destroy();
    },
  };
}
